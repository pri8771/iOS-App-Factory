import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { RoomProviderSchema, type AgentUsageV1, type RoomProvider } from "@app-factory/contracts";

import { boundedText, classifyFailureText } from "./failure-text.js";
import { parseRoomContribution, ROOM_CONTRIBUTION_JSON_SCHEMA_V1 } from "./contribution-schema.js";
import type {
  ParticipantAdapter,
  ParticipantContext,
  ParticipantContributionResult,
  ParticipantUsage,
} from "./participant-adapter.js";
import { renderParticipantInstruction } from "./render-context.js";

/**
 * Environment names this adapter is willing to forward to the `claude` CLI
 * child process. Every one of these is session/plumbing identity, never a
 * credential: the CLI reads its already-authenticated session from macOS
 * Keychain via `HOME`/`USER`/`LOGNAME`, which this codebase verified fails
 * closed ("Not logged in") with a stripped environment missing any of them.
 * No `ANTHROPIC_API_KEY` or token is ever read from or forwarded through
 * `process.env` by this adapter.
 */
export const CLAUDE_SAFE_AGENT_ENVIRONMENT_NAMES = [
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "PATH",
  "SHELL",
  "TMPDIR",
  "TZ",
  "USER",
] as const;

const SENSITIVE_ENVIRONMENT_NAME_PATTERN = /(?:AUTH|COOKIE|CREDENTIAL|KEY|PASSWORD|SECRET|TOKEN)/i;

export type ClaudeParticipantConfigV1 = Readonly<{
  /** Absolute path to the `claude` CLI executable. */
  executable: string;
  /** Model alias or full name, e.g. "sonnet", "claude-sonnet-5". */
  model: string;
  /** Hard wall-clock budget for one contribution. */
  timeoutMs?: number;
  maxOutputBytes?: number;
  /** Defensive per-call cost ceiling forwarded as `--max-budget-usd`. */
  maxBudgetUsd?: number;
  environmentAllowlist?: readonly string[];
  sourceEnvironment?: Readonly<Record<string, string | undefined>>;
}>;

type ValidatedClaudeParticipantConfig = Readonly<{
  executable: string;
  model: string;
  timeoutMs: number;
  maxOutputBytes: number;
  maxBudgetUsd: number;
  environment: Readonly<Record<string, string>>;
}>;

function buildEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  allowlist: readonly string[],
): Readonly<Record<string, string>> {
  const safeNames = new Set<string>(CLAUDE_SAFE_AGENT_ENVIRONMENT_NAMES);
  const environment: Record<string, string> = {};
  for (const name of [...new Set(allowlist)].sort()) {
    if (!safeNames.has(name)) {
      throw new TypeError(
        `Environment variable is not in the adapter-owned safe allowlist: ${name}`,
      );
    }
    if (SENSITIVE_ENVIRONMENT_NAME_PATTERN.test(name)) {
      throw new Error(`Refusing to expose sensitive environment variable: ${name}`);
    }
    const value = source[name];
    if (value !== undefined) {
      if (value.includes("\0"))
        throw new Error(`Environment variable ${name} contains a null byte`);
      environment[name] = value;
    }
  }
  environment.NO_COLOR = "1";
  return environment;
}

function validateConfig(config: ClaudeParticipantConfigV1): ValidatedClaudeParticipantConfig {
  if (!isAbsolute(config.executable)) {
    throw new TypeError("ClaudeParticipant executable must be an absolute path");
  }
  if (config.model.length < 1 || config.model.length > 200) {
    throw new TypeError("ClaudeParticipant model must be a bounded identifier");
  }
  const timeoutMs = config.timeoutMs ?? 90_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 10 * 60_000) {
    throw new TypeError("ClaudeParticipant timeoutMs must be between 1000 and 600000");
  }
  const maxBudgetUsd = config.maxBudgetUsd ?? 1;
  if (!Number.isFinite(maxBudgetUsd) || maxBudgetUsd <= 0 || maxBudgetUsd > 100) {
    throw new TypeError("ClaudeParticipant maxBudgetUsd must be a positive number of at most 100");
  }
  return {
    executable: config.executable,
    model: config.model,
    timeoutMs,
    maxOutputBytes: config.maxOutputBytes ?? 2 * 1024 * 1024,
    maxBudgetUsd,
    environment: buildEnvironment(
      config.sourceEnvironment ?? process.env,
      config.environmentAllowlist ?? CLAUDE_SAFE_AGENT_ENVIRONMENT_NAMES,
    ),
  };
}

type ClaudeResultEnvelope = Readonly<{
  is_error?: boolean;
  api_error_status?: number | null;
  subtype?: string;
  result?: unknown;
  errors?: readonly unknown[];
  usage?: unknown;
  total_cost_usd?: unknown;
}>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseResultEnvelope(stdout: string): ClaudeResultEnvelope | null {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    return isRecord(parsed) ? (parsed as ClaudeResultEnvelope) : null;
  } catch {
    return null;
  }
}

/**
 * Honest token ledger (contracts Architecture decision 6): parses Claude's own `usage` envelope
 * field when present. `null` whenever the envelope carries none of these three keys, never a
 * fabricated zero.
 */
function parseClaudeUsage(envelope: ClaudeResultEnvelope): AgentUsageV1 | null {
  const usage = envelope.usage;
  if (!isRecord(usage)) return null;
  const keys = ["input_tokens", "output_tokens", "cache_read_input_tokens"] as const;
  if (!keys.some((key) => Object.hasOwn(usage, key))) return null;

  const parsed: Record<(typeof keys)[number], number | null> = {
    input_tokens: null,
    output_tokens: null,
    cache_read_input_tokens: null,
  };
  for (const key of keys) {
    const value = usage[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || (value as number) < 0) return null;
    parsed[key] = value as number;
  }
  return {
    inputTokens: parsed.input_tokens,
    outputTokens: parsed.output_tokens,
    cachedInputTokens: parsed.cache_read_input_tokens,
  };
}

/**
 * Claude is the one provider this codebase trusts to self-report a dollar cost
 * (`total_cost_usd`); every other adapter's `costUsdMicros` stays `null` (no invented per-token
 * pricing, per contracts Architecture decision 6).
 */
function parseClaudeCostUsdMicros(envelope: ClaudeResultEnvelope): number | null {
  const cost = envelope.total_cost_usd;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) return null;
  return Math.round(cost * 1_000_000);
}

function classifyErrorEnvelope(envelope: ClaudeResultEnvelope): ParticipantContributionResult {
  const status = envelope.api_error_status ?? null;
  if (status === 429) return { kind: "error", code: "limit", retryAfterMs: null };
  if (status === 503 || status === 529)
    return { kind: "error", code: "capacity", retryAfterMs: null };
  const text = boundedText(
    [
      typeof envelope.result === "string" ? envelope.result : "",
      ...(Array.isArray(envelope.errors) ? envelope.errors.map(String) : []),
      envelope.subtype ?? "",
    ].join(" "),
    2_000,
  );
  const classification = classifyFailureText(text);
  return { kind: "error", code: classification.code, retryAfterMs: classification.retryAfterMs };
}

/**
 * Real Claude Code CLI room participant, invoked headless: `claude -p`,
 * `--output-format json`, `--permission-mode plan`, `--no-session-persistence`,
 * every tool disabled (`--tools ""`), no MCP servers, and no settings files
 * loaded from disk -- flags verified directly against the installed CLI
 * (`claude --version`) before being hard-coded here, per the containment
 * discipline every real-model room adapter follows. The context recipe is
 * sent over stdin, never as an argv element. `cwd` is a fresh, empty,
 * per-contribution scratch directory: combined with no tools and no
 * `--add-dir`, the process has no path back to this repository.
 */
export function createClaudeParticipant(config: ClaudeParticipantConfigV1): ParticipantAdapter {
  const validated = validateConfig(config);
  const provider: RoomProvider = RoomProviderSchema.parse("claude");

  return {
    id: "anthropic.claude-room-participant",
    provider,
    async contribute(context: ParticipantContext): Promise<ParticipantContributionResult> {
      const scratch = realpathSync.native(mkdtempSync(join(tmpdir(), "room-claude-")));
      try {
        return await runOnce(validated, context, scratch);
      } finally {
        rmSync(scratch, { force: true, recursive: true });
      }
    },
  };
}

async function runOnce(
  config: ValidatedClaudeParticipantConfig,
  context: ParticipantContext,
  scratch: string,
): Promise<ParticipantContributionResult> {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--permission-mode",
    "plan",
    "--no-session-persistence",
    "--tools",
    "",
    "--strict-mcp-config",
    "--setting-sources",
    "",
    "--model",
    config.model,
    "--json-schema",
    JSON.stringify(ROOM_CONTRIBUTION_JSON_SCHEMA_V1),
    "--max-budget-usd",
    String(config.maxBudgetUsd),
  ];

  return await new Promise<ParticipantContributionResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let outputLimitExceeded = false;
    let settled = false;
    let child: ChildProcess;
    try {
      child = spawn(config.executable, args, {
        cwd: scratch,
        env: { ...config.environment },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      resolve({ kind: "error", code: "internal", retryAfterMs: null });
      return;
    }

    const finish = (result: ParticipantContributionResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      context.signal.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const onAbort = (): void => {
      child.kill("SIGTERM");
      finish({ kind: "error", code: "timeout", retryAfterMs: null });
    };
    context.signal.addEventListener("abort", onAbort, { once: true });

    const append = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      const current = stream === "stdout" ? stdout : stderr;
      const combined = `${current}${chunk.toString("utf8")}`;
      if (Buffer.byteLength(combined, "utf8") > config.maxOutputBytes) {
        outputLimitExceeded = true;
        child.kill("SIGKILL");
        return;
      }
      if (stream === "stdout") stdout = combined;
      else stderr = combined;
    };
    child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.once("error", () => {
      finish({ kind: "error", code: "internal", retryAfterMs: null });
    });
    child.once("close", (exitCode) => {
      if (settled) return;
      if (outputLimitExceeded) {
        finish({ kind: "error", code: "internal", retryAfterMs: null });
        return;
      }
      const envelope = parseResultEnvelope(stdout);
      if (envelope === null) {
        // No parseable JSON at all: either the CLI crashed before emitting a
        // result envelope, or emitted diagnostics on stderr. Bounded stderr
        // text still gets a best-effort classification rather than an
        // automatic internal.
        const classification = classifyFailureText(boundedText(stderr, 2_000));
        finish({
          kind: "error",
          code: classification.code,
          retryAfterMs: classification.retryAfterMs,
        });
        return;
      }
      if (envelope.is_error === true) {
        finish(classifyErrorEnvelope(envelope));
        return;
      }
      if (exitCode !== 0) {
        finish({ kind: "error", code: "internal", retryAfterMs: null });
        return;
      }
      try {
        const parsed = parseRoomContribution(envelope.result ?? "");
        const reported = parseClaudeUsage(envelope);
        const costUsdMicros = parseClaudeCostUsdMicros(envelope);
        // Claude's own `usage.output_tokens` is the honest per-turn figure when the envelope
        // carries one. The len/4 estimate survives ONLY as the tokensUsed budget fallback when
        // output_tokens is absent -- the conventional bound used elsewhere in this codebase --
        // never as a stand-in for `reported`, which stays null in that case.
        const tokensUsed =
          reported?.outputTokens ??
          (parsed.kind === "message" ? Math.ceil(parsed.text.length / 4) : 0);
        const usage: ParticipantUsage = { tokensUsed, reported, costUsdMicros };
        finish(
          parsed.kind === "pass"
            ? { kind: "pass", usage }
            : { kind: "message", text: parsed.text, usage },
        );
      } catch {
        finish({ kind: "error", code: "internal", retryAfterMs: null });
      }
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ kind: "error", code: "timeout", retryAfterMs: null });
    }, config.timeoutMs);

    if (typeof child.pid === "number" && Number.isSafeInteger(child.pid) && child.pid > 0) {
      context.reportWorkerPid(child.pid);
    }
    child.stdin?.end(renderParticipantInstruction(context), "utf8");
  });
}
