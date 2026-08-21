import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { RoomProviderSchema, type AgentUsageV1, type RoomProvider } from "@app-factory/contracts";

import { boundedText, classifyFailureText } from "./failure-text.js";
import { parseRoomContribution } from "./contribution-schema.js";
import type {
  ParticipantAdapter,
  ParticipantContext,
  ParticipantContributionResult,
  ParticipantUsage,
} from "./participant-adapter.js";
import { renderParticipantInstruction } from "./render-context.js";

/**
 * Environment names this adapter is willing to forward to the `gemini` CLI child process --
 * IDENTICAL to `claude-participant.ts`'s `CLAUDE_SAFE_AGENT_ENVIRONMENT_NAMES` (Architecture
 * decision 10: "safe-env allowlist verbatim"). `HOME` is required because the CLI reads its
 * already-authenticated session from `~/.gemini/oauth_creds.json`, the same "session/plumbing
 * identity only, never a credential" reasoning Claude's own comment documents. Verified live
 * (`gemini --version` 0.49.0, this machine): with `GEMINI_API_KEY`/`GOOGLE_API_KEY` absent from a
 * stripped environment and the CLI's local `~/.gemini/settings.json` selecting API-key auth
 * (`security.auth.selectedType: "gemini-api-key"`), a headless call fails closed with `"When using
 * Gemini API, you must specify the GEMINI_API_KEY environment variable."` -- confirming neither
 * variable is ever read implicitly from some other source when absent from the child's env. This
 * adapter never reads or forwards `GEMINI_API_KEY`/`GOOGLE_API_KEY` from `process.env`; API-key
 * Gemini access goes through an OpenRouter instance instead (Architecture decision 10).
 */
export const GEMINI_SAFE_AGENT_ENVIRONMENT_NAMES = [
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

/**
 * `--allowed-mcp-server-names` naming one server that no real configuration ever defines: the
 * gemini CLI (0.49.0) has no bare "disable every MCP server" flag (unlike Claude's
 * `--strict-mcp-config` + empty `--setting-sources`), but supplying it with a value restricts the
 * session to exactly that allowlist -- a value naming nothing real is verified live to yield zero
 * active MCP servers regardless of what the operator's `~/.gemini/settings.json` otherwise
 * configures, without erroring (an empty/bare invocation of the flag does error: "Not enough
 * arguments following: allowed-mcp-server-names").
 */
const GEMINI_NO_MCP_SERVERS_SENTINEL = "app-factory-room-participant-no-mcp-servers";

export type GeminiParticipantConfigV1 = Readonly<{
  /** Absolute path to the `gemini` CLI executable. */
  executable: string;
  /** Model alias or full name, e.g. "gemini-2.5-flash", "gemini-3-pro-preview". */
  model: string;
  /** Hard wall-clock budget for one contribution. */
  timeoutMs?: number;
  maxOutputBytes?: number;
  environmentAllowlist?: readonly string[];
  sourceEnvironment?: Readonly<Record<string, string | undefined>>;
}>;

type ValidatedGeminiParticipantConfig = Readonly<{
  executable: string;
  model: string;
  timeoutMs: number;
  maxOutputBytes: number;
  environment: Readonly<Record<string, string>>;
}>;

function buildEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  allowlist: readonly string[],
): Readonly<Record<string, string>> {
  const safeNames = new Set<string>(GEMINI_SAFE_AGENT_ENVIRONMENT_NAMES);
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

function validateConfig(config: GeminiParticipantConfigV1): ValidatedGeminiParticipantConfig {
  if (!isAbsolute(config.executable)) {
    throw new TypeError("GeminiParticipant executable must be an absolute path");
  }
  if (config.model.length < 1 || config.model.length > 200) {
    throw new TypeError("GeminiParticipant model must be a bounded identifier");
  }
  const timeoutMs = config.timeoutMs ?? 90_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 10 * 60_000) {
    throw new TypeError("GeminiParticipant timeoutMs must be between 1000 and 600000");
  }
  return {
    executable: config.executable,
    model: config.model,
    timeoutMs,
    maxOutputBytes: config.maxOutputBytes ?? 2 * 1024 * 1024,
    environment: buildEnvironment(
      config.sourceEnvironment ?? process.env,
      config.environmentAllowlist ?? GEMINI_SAFE_AGENT_ENVIRONMENT_NAMES,
    ),
  };
}

/**
 * The gemini CLI's own `-o json`/`--output-format json` envelope shape, reverse-engineered from
 * the installed CLI's bundled source (`packages/core/src/output/json-formatter.ts`'s
 * `JsonFormatter.format`/`formatError`, `packages/core/src/telemetry/uiTelemetry.ts`'s
 * `UiTelemetryService`) and confirmed live (`gemini --version` 0.49.0):
 *   - success: `{ session_id, response: string, stats?: {...}, warnings?: string[] }`
 *   - failure: `{ session_id, error: { type: string, message: string, code?: number } }`
 * `response`/`error` are mutually exclusive in practice (the CLI's formatter only ever supplies
 * one), but both are typed optional here rather than as a discriminated union, matching this
 * package's existing tolerant-envelope style (`ClaudeResultEnvelope`, `CodexParticipantProcess...`
 * classification) for a third-party CLI whose JSON contract is not itself versioned or schema'd.
 */
type GeminiResultEnvelope = Readonly<{
  session_id?: unknown;
  response?: unknown;
  stats?: unknown;
  error?: unknown;
  warnings?: unknown;
}>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseGeminiEnvelope(text: string): GeminiResultEnvelope | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? (parsed as GeminiResultEnvelope) : null;
  } catch {
    return null;
  }
}

/**
 * Honest token ledger (contracts Architecture decision 6): sums `stats.models[*].tokens` across
 * every model the CLI's telemetry recorded for this call (normally exactly one -- the single
 * `--model` this adapter passed) into the shared `AgentUsageV1` shape. `tokens.prompt` /
 * `tokens.candidates` / `tokens.cached` are gemini-cli's own field names for the underlying
 * `GenerateContentResponse.usageMetadata`'s `input_token_count` / `output_token_count` /
 * `cached_content_token_count` (verified against `UiTelemetryService.processApiResponse` in the
 * installed CLI's bundle) -- mapped onto this codebase's `inputTokens`/`outputTokens`/
 * `cachedInputTokens` the same way Claude's and Codex's own usage parsers do. `null` whenever no
 * model in `stats.models` carries any of the three fields, or a value fails basic sanity
 * (non-negative safe integer), never a fabricated zero.
 */
function parseGeminiUsage(envelope: GeminiResultEnvelope): AgentUsageV1 | null {
  const stats = envelope.stats;
  if (!isRecord(stats)) return null;
  const models = stats.models;
  if (!isRecord(models)) return null;
  const modelStatsList = Object.values(models);
  if (modelStatsList.length === 0) return null;

  const keys = ["prompt", "candidates", "cached"] as const;
  let sawAnyKey = false;
  const totals: Record<(typeof keys)[number], number> = { prompt: 0, candidates: 0, cached: 0 };
  for (const modelStats of modelStatsList) {
    if (!isRecord(modelStats)) return null;
    const tokens = modelStats.tokens;
    if (!isRecord(tokens)) continue;
    for (const key of keys) {
      const value = tokens[key];
      if (value === undefined) continue;
      sawAnyKey = true;
      if (!Number.isSafeInteger(value) || (value as number) < 0) return null;
      totals[key] += value as number;
    }
  }
  if (!sawAnyKey) return null;
  return {
    inputTokens: totals.prompt,
    outputTokens: totals.candidates,
    cachedInputTokens: totals.cached,
  };
}

/**
 * Classifies a gemini CLI error envelope through the shared free-text classifier
 * (`classifyFailureText`). Unlike Claude's `api_error_status` (a documented Anthropic API HTTP
 * status this codebase already special-cases for 429/503/529), gemini-cli's `error.code` is an
 * internal CLI exit code (observed live: `41` for a missing `GEMINI_API_KEY`), not a documented
 * machine-readable retryability signal -- so, exactly like Claude's own fallback path for an
 * unrecognized error subtype, this always goes through the shared pattern-based text classifier
 * over `error.type` + `error.message` rather than branching on `code`.
 */
function classifyErrorEnvelope(envelope: GeminiResultEnvelope): ParticipantContributionResult {
  const error = envelope.error;
  const text = boundedText(
    isRecord(error)
      ? [
          typeof error.type === "string" ? error.type : "",
          typeof error.message === "string" ? error.message : "",
        ].join(" ")
      : "",
    2_000,
  );
  const classification = classifyFailureText(text);
  return { kind: "error", code: classification.code, retryAfterMs: classification.retryAfterMs };
}

/**
 * Real Gemini CLI room participant, invoked headless. Flags verified directly against the
 * installed CLI (`gemini --version` 0.49.0) before being hard-coded here, per the containment
 * discipline every real-model room adapter follows (structurally mirrors
 * `claude-participant.ts`):
 *   - `--prompt <instruction>` runs one non-interactive turn and exits; the context recipe is
 *     sent as this argv value (gemini-cli has no stdin-recipe convention the way Claude's `-p`
 *     with no positional prompt does) -- `stdin` is closed (`stdio: ["ignore", ...]`) rather than
 *     fed anything, since `-p`'s own docs say its value is "appended to input on stdin (if any)"
 *     and this adapter never wants stdin content silently prefixed onto the recipe.
 *   - `--output-format json` for the structured `{response|error, stats?}` envelope this file
 *     parses (see {@link GeminiResultEnvelope}).
 *   - `--approval-mode plan`: gemini-cli's own read-only mode, the direct analog of Claude's
 *     `--permission-mode plan`.
 *   - `--skip-trust`: without it, a fresh (never-before-seen) scratch `cwd` is "not trusted" and
 *     gemini-cli silently overrides `--approval-mode plan` back to `default` (verified live) --
 *     `--skip-trust` trusts the folder for this one session only (nothing persisted to
 *     `~/.gemini/trustedFolders.json`) so the requested read-only mode actually takes effect.
 *   - `--allowed-mcp-server-names <sentinel>`: no MCP server the operator's `~/.gemini/settings.json`
 *     might configure is ever loaded for this call (see {@link GEMINI_NO_MCP_SERVERS_SENTINEL}).
 * `cwd` is a fresh, empty, per-contribution scratch directory, same discipline as
 * `claude-participant.ts`/`codex-participant.ts`: combined with plan mode, no MCP servers, and no
 * `--include-directories`, the process has no path back to this repository.
 */
export function createGeminiParticipant(config: GeminiParticipantConfigV1): ParticipantAdapter {
  const validated = validateConfig(config);
  const provider: RoomProvider = RoomProviderSchema.parse("gemini");

  return {
    id: "google.gemini-room-participant",
    provider,
    async contribute(context: ParticipantContext): Promise<ParticipantContributionResult> {
      const scratch = realpathSync.native(mkdtempSync(join(tmpdir(), "room-gemini-")));
      try {
        return await runOnce(validated, context, scratch);
      } finally {
        rmSync(scratch, { force: true, recursive: true });
      }
    },
  };
}

async function runOnce(
  config: ValidatedGeminiParticipantConfig,
  context: ParticipantContext,
  scratch: string,
): Promise<ParticipantContributionResult> {
  const args = [
    "--model",
    config.model,
    "--prompt",
    renderParticipantInstruction(context),
    "--output-format",
    "json",
    "--approval-mode",
    "plan",
    "--skip-trust",
    "--allowed-mcp-server-names",
    GEMINI_NO_MCP_SERVERS_SENTINEL,
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
        stdio: ["ignore", "pipe", "pipe"],
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
      // Verified live: a successful turn's envelope lands on stdout; a fatal CLI-level error
      // (auth failure, bad flags, ...) is ALSO valid `{session_id, error}` JSON, but gemini-cli
      // writes it to stderr even under `--output-format json` -- so both streams are tried before
      // falling back to free-text classification, unlike Claude (whose envelope is always stdout).
      const envelope = parseGeminiEnvelope(stdout) ?? parseGeminiEnvelope(stderr);
      if (envelope === null) {
        const classification = classifyFailureText(boundedText(stderr, 2_000));
        finish({
          kind: "error",
          code: classification.code,
          retryAfterMs: classification.retryAfterMs,
        });
        return;
      }
      if (envelope.error !== undefined) {
        finish(classifyErrorEnvelope(envelope));
        return;
      }
      if (exitCode !== 0) {
        finish({ kind: "error", code: "internal", retryAfterMs: null });
        return;
      }
      try {
        const parsed = parseRoomContribution(
          typeof envelope.response === "string" ? envelope.response : "",
        );
        const reported = parseGeminiUsage(envelope);
        // gemini-cli never self-reports a dollar cost (no field in its JSON envelope); stays null
        // for this provider, same as Codex.
        const tokensUsed =
          reported?.outputTokens ??
          (parsed.kind === "message" ? Math.ceil(parsed.text.length / 4) : 0);
        const usage: ParticipantUsage = { tokensUsed, reported, costUsdMicros: null };
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
  });
}
