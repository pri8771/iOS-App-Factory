import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";

import {
  CODEX_DISABLED_FEATURES,
  CODEX_SAFE_AGENT_ENVIRONMENT_NAMES,
  VERIFIED_CODEX_CLI_VERSIONS,
  preflightCodex,
  validateCodexWorkspaceScope,
  type CodexInvocation,
} from "@app-factory/agent-runner";
import { RoomProviderSchema, type RoomProvider } from "@app-factory/contracts";
import {
  launchPreparedSupervisedRun,
  prepareSupervisedRun,
  reconcileSupervisedRun,
  requestSupervisedRunTermination,
  waitForSupervisedRunRegistration,
  type CreateSupervisedRunIntentInput,
  type LaunchSupervisedRunResult,
  type LocalSupervisedControllerRegistration,
  type PreparedSupervisedRun,
  type ReconcileSupervisedRunResult,
  type RequestSupervisedRunTerminationResult,
  type SupervisedRunReceiptV1,
  type WaitForSupervisedRunRegistrationResult,
} from "@app-factory/process-supervisor";

import { boundedText, classifyFailureText } from "./failure-text.js";
import {
  parseRoomContribution,
  serializeRoomContributionJsonSchemaV1,
} from "./contribution-schema.js";
import type {
  ParticipantAdapter,
  ParticipantContext,
  ParticipantContributionResult,
} from "./participant-adapter.js";
import { renderParticipantInstruction } from "./render-context.js";

const AUTHENTICATION_ERROR_PATTERN =
  /(?:401\s+unauthorized|authentication|missing bearer|not logged in)/i;
const SAFE_PERMISSION_PROFILE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const SAFE_FEATURE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

interface TomlInlineTable {
  readonly [key: string]: TomlInlineValue;
}
type TomlInlineValue = boolean | number | string | readonly TomlInlineValue[] | TomlInlineTable;

function serializeTomlKey(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key);
}

function serializeTomlInline(value: TomlInlineValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map(serializeTomlInline).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${serializeTomlKey(key)}=${serializeTomlInline(child)}`)
    .join(",")}}`;
}

function assertAbsolutePath(value: string, label: string): void {
  if (!isAbsolute(value)) throw new TypeError(`${label} must be an absolute path: ${value}`);
}

/**
 * `codexHome` holds `auth.json`: the same private-directory discipline
 * `codex-independent-reviewer.ts`'s `ensurePrivateDirectory` applies to its
 * own dedicated Codex home (must already exist -- this adapter never
 * provisions credentials itself -- real directory, not a symlink, owned by
 * the current user, mode 0700 or stricter).
 */
function assertPrivateExistingDirectory(path: string, label: string): void {
  let stats: ReturnType<typeof lstatSync>;
  try {
    stats = lstatSync(path);
  } catch {
    throw new TypeError(`${label} does not exist: ${path}`);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new TypeError(`${label} must be one real directory: ${path}`);
  }
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    throw new TypeError(`${label} must be owned by the current user: ${path}`);
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new TypeError(`${label} must be private to the current user: ${path}`);
  }
}

function buildControllerEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  allowlist: readonly string[],
  codexHome: string,
): Readonly<Record<string, string>> {
  const safeNames = new Set<string>(CODEX_SAFE_AGENT_ENVIRONMENT_NAMES);
  const environment: Record<string, string> = {};
  for (const name of [...new Set(allowlist)].sort()) {
    if (!safeNames.has(name)) {
      throw new TypeError(
        `Environment variable is not in the adapter-owned safe allowlist: ${name}`,
      );
    }
    const value = source[name];
    if (value !== undefined) {
      if (value.includes("\0"))
        throw new Error(`Environment variable ${name} contains a null byte`);
      environment[name] = value;
    }
  }
  environment.CODEX_HOME = codexHome;
  environment.NO_COLOR = "1";
  environment.RUST_LOG = "error";
  environment.TERM = "dumb";
  return environment;
}

/**
 * Builds a strictly read-only Codex invocation for a room contribution:
 * every write surface Codex knows about (workspace root, `/tmp`, `$TMPDIR`)
 * is denied, `cwd` is a fresh empty scratch directory (there is no
 * `authorizedWritePaths` concept here at all -- mirrors
 * `apps/daemon/src/codex-independent-reviewer.ts`'s
 * `buildCodexReviewInvocation`), and network is enabled only for research
 * rooms.
 */
export function buildCodexParticipantInvocation(options: {
  executable: string;
  model: string;
  codexHome: string;
  outputSchemaPath: string;
  workingDirectory: string;
  instruction: string;
  networkEnabled: boolean;
  environmentAllowlist: readonly string[];
  sourceEnvironment?: Readonly<Record<string, string | undefined>>;
  permissionProfileName?: string;
  disabledFeatures?: readonly string[];
}): CodexInvocation {
  assertAbsolutePath(options.executable, "Codex executable");
  assertAbsolutePath(options.codexHome, "Codex home");
  assertAbsolutePath(options.outputSchemaPath, "Codex room-participant output schema path");
  if (
    options.model.length < 1 ||
    options.model.length > 200 ||
    options.model.trim() !== options.model ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/u.test(options.model)
  ) {
    throw new TypeError("Codex model must be an explicit bounded portable identifier");
  }

  const permissionProfileName = options.permissionProfileName ?? "factory_room_participant";
  if (!SAFE_PERMISSION_PROFILE_NAME_PATTERN.test(permissionProfileName)) {
    throw new TypeError(
      `Codex room-participant permission profile name is invalid: ${permissionProfileName}`,
    );
  }
  const disabledFeatures = [...new Set(options.disabledFeatures ?? CODEX_DISABLED_FEATURES)].sort();
  for (const feature of disabledFeatures) {
    if (!SAFE_FEATURE_NAME_PATTERN.test(feature)) {
      throw new TypeError(`Codex feature name is invalid: ${feature}`);
    }
  }

  const workingDirectory = validateCodexWorkspaceScope(options.workingDirectory, [], []);
  const permissionProfile = {
    description: "App Factory studio-rooms participant: read-only, no workspace content, stateless",
    extends: ":workspace",
    filesystem: {
      ":minimal": "read",
      ":root": "deny",
      ":slash_tmp": "deny",
      ":tmpdir": "deny",
      ":workspace_roots": { ".": "read" },
    },
    network: { enabled: options.networkEnabled },
  } as const satisfies Readonly<Record<string, TomlInlineValue>>;
  const shellEnvironmentPolicy = {
    filters: {
      "*_KEY": "exclude",
      "*_SECRET": "exclude",
      "*_TOKEN": "exclude",
      "CODEX_*": "exclude",
      "GH_*": "exclude",
      "GITHUB_*": "exclude",
      "JIRA_*": "exclude",
      "OPENAI_*": "exclude",
    },
    ignore_default_excludes: false,
    inherit: "core",
  } as const satisfies Readonly<Record<string, TomlInlineValue>>;
  const projectTrust = {
    [workingDirectory]: { trust_level: "untrusted" },
  } as const satisfies Readonly<Record<string, TomlInlineValue>>;

  const args: string[] = [
    "--strict-config",
    "--ask-for-approval",
    "never",
    "--cd",
    workingDirectory,
    "--model",
    options.model,
  ];
  for (const feature of disabledFeatures) args.push("--disable", feature);
  args.push(
    "-c",
    `default_permissions=${serializeTomlInline(permissionProfileName)}`,
    "-c",
    `permissions.${permissionProfileName}=${serializeTomlInline(permissionProfile)}`,
    "-c",
    `projects=${serializeTomlInline(projectTrust)}`,
    "-c",
    `shell_environment_policy=${serializeTomlInline(shellEnvironmentPolicy)}`,
    "exec",
    "--ignore-user-config",
    "--ignore-rules",
    "--ephemeral",
    // The scratch `cwd` is a fresh empty directory, never a git checkout (by
    // design: this adapter has no repo/workspace access at all), so Codex's
    // trusted-git-repo heuristic must be bypassed explicitly rather than
    // relying on trust state that will never exist here.
    "--skip-git-repo-check",
    "--json",
    "--color",
    "never",
    "--output-schema",
    options.outputSchemaPath,
    "-",
  );

  return {
    executable: options.executable,
    args,
    cwd: workingDirectory,
    environment: buildControllerEnvironment(
      options.sourceEnvironment ?? process.env,
      options.environmentAllowlist,
      options.codexHome,
    ),
    stdin: options.instruction,
    stdoutProtocol: "jsonl",
  };
}

export type CodexParticipantProcessClassification =
  | Readonly<{ kind: "completed"; contribution: ParticipantContributionResult }>
  | Readonly<{ kind: "blocked-auth"; reason: string }>
  | Readonly<{ kind: "process-failed"; reason: string }>
  | Readonly<{ kind: "protocol-error"; reason: string }>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Walks Codex's JSONL transcript exactly the way
 * `classifyCodexReviewProcess`/`classifyCodexProcess` do (one thread start,
 * at least one turn start, exactly one terminal event as the final line),
 * then feeds the terminal `agent_message` text through the shared
 * {@link parseRoomContribution} parser instead of the coding-agent or
 * reviewer's own result shape.
 */
export function classifyCodexParticipantStdout(
  stdout: string,
): CodexParticipantProcessClassification {
  const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return { kind: "protocol-error", reason: "Codex emitted no events" };

  let threadStarted = 0;
  let turnStarted = 0;
  let terminalType: "turn.completed" | "turn.failed" | null = null;
  let terminalIndex = -1;
  let terminalFailureMessage = "";
  let finalAgentMessage: string | null = null;

  for (const [index, line] of lines.entries()) {
    let event: unknown;
    try {
      event = JSON.parse(line) as unknown;
    } catch {
      return { kind: "protocol-error", reason: "Codex emitted malformed JSONL" };
    }
    if (!isRecord(event) || typeof event.type !== "string") {
      return { kind: "protocol-error", reason: "Codex emitted an invalid event envelope" };
    }
    if (event.type === "thread.started") threadStarted += 1;
    if (event.type === "turn.started") turnStarted += 1;
    if (event.type === "turn.completed" || event.type === "turn.failed") {
      if (terminalType !== null) {
        return { kind: "protocol-error", reason: "Codex emitted multiple terminal events" };
      }
      terminalType = event.type;
      terminalIndex = index;
      if (
        event.type === "turn.failed" &&
        isRecord(event.error) &&
        typeof event.error.message === "string"
      ) {
        terminalFailureMessage = event.error.message;
      }
    }
    if (
      event.type === "item.completed" &&
      isRecord(event.item) &&
      event.item.type === "agent_message" &&
      typeof event.item.text === "string"
    ) {
      finalAgentMessage = event.item.text;
    }
  }

  if (threadStarted !== 1 || turnStarted < 1) {
    return {
      kind: "protocol-error",
      reason: "Codex did not emit one thread start and a turn start",
    };
  }
  if (terminalType === null || terminalIndex !== lines.length - 1) {
    return { kind: "protocol-error", reason: "Codex did not end with exactly one terminal event" };
  }
  if (terminalType === "turn.failed") {
    if (AUTHENTICATION_ERROR_PATTERN.test(terminalFailureMessage)) {
      return { kind: "blocked-auth", reason: "Codex reported an authentication failure" };
    }
    const classification = classifyFailureText(boundedText(terminalFailureMessage, 2_000));
    return {
      kind: "completed",
      contribution: {
        kind: "error",
        code: classification.code,
        retryAfterMs: classification.retryAfterMs,
      },
    };
  }
  if (finalAgentMessage === null) {
    return { kind: "protocol-error", reason: "Codex completed without a final agent message" };
  }
  try {
    const parsed = parseRoomContribution(finalAgentMessage);
    return {
      kind: "completed",
      contribution:
        parsed.kind === "pass"
          ? { kind: "pass", usage: { tokensUsed: 0 } }
          : { kind: "message", text: parsed.text, usage: { tokensUsed: 0 } },
    };
  } catch (error) {
    return {
      kind: "protocol-error",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Injectable seam over `@app-factory/process-supervisor`, mirroring the reviewer's `ReviewerSupervisorPort`. */
export type CodexSupervisorPort = Readonly<{
  prepare(rootDirectory: string, input: CreateSupervisedRunIntentInput): PreparedSupervisedRun;
  launch(prepared: PreparedSupervisedRun): LaunchSupervisedRunResult;
  waitForRegistration(
    prepared: PreparedSupervisedRun,
    registration: LocalSupervisedControllerRegistration,
    options: Readonly<{ timeoutMs: number; pollMs: number }>,
  ): Promise<WaitForSupervisedRunRegistrationResult>;
  reconcile(prepared: PreparedSupervisedRun): ReconcileSupervisedRunResult;
  terminate(prepared: PreparedSupervisedRun): Promise<RequestSupervisedRunTerminationResult>;
}>;

export const DEFAULT_CODEX_SUPERVISOR: CodexSupervisorPort = {
  prepare: prepareSupervisedRun,
  launch: launchPreparedSupervisedRun,
  waitForRegistration: async (prepared, registration, options) =>
    await waitForSupervisedRunRegistration(prepared, registration, options),
  reconcile: reconcileSupervisedRun,
  terminate: async (prepared) => await requestSupervisedRunTermination(prepared),
};

export type CodexParticipantConfigV1 = Readonly<{
  executable: string;
  model: string;
  /** Pre-provisioned private (0700) directory holding `auth.json`; not created or wiped by this adapter. */
  codexHome: string;
  /** Pre-provisioned private (0700) directory for supervised-run bookkeeping; reused, never wiped as a whole. */
  runnerRoot: string;
  /** Pre-provisioned private (0700) directory under which a fresh empty scratch `cwd` is made per contribution. */
  scratchRoot: string;
  expectedCliVersion?: string;
  /** When set, the executable's sha256 must match exactly, verified once at construction. */
  executableDigest?: string;
  environmentAllowlist?: readonly string[];
  sourceEnvironment?: Readonly<Record<string, string | undefined>>;
  timeoutMs?: number;
  terminationGraceMs?: number;
  registrationTimeoutMs?: number;
  pollMs?: number;
  maxOutputBytesPerStream?: number;
  supervisor?: CodexSupervisorPort;
  /** Injectable seam for `preflightCodex`; defaults to the real check against `config.executable`. */
  preflight?: typeof preflightCodex;
}>;

function ensureOutputSchemaFile(runnerRoot: string): string {
  const path = join(runnerRoot, "room-contribution-schema.json");
  const contents = serializeRoomContributionJsonSchemaV1();
  if (!existsSync(path)) {
    writeFileSync(path, contents, { mode: 0o600 });
  }
  return path;
}

function readBoundOutput(
  path: string,
  expected: { capturedByteLength: number; sha256: string },
): string {
  const bytes = readFileSync(path);
  if (bytes.byteLength !== expected.capturedByteLength) {
    throw new Error("Codex supervised-run output length does not match its receipt");
  }
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (digest !== expected.sha256) {
    throw new Error("Codex supervised-run output digest does not match its receipt");
  }
  return bytes.toString("utf8");
}

/**
 * Real Codex CLI room participant: strictly read-only (no `authorizedWritePaths`
 * at all), launched via the exact same `@app-factory/process-supervisor`
 * supervised-run discipline `apps/daemon/src/codex-independent-reviewer.ts`
 * uses for the independent code reviewer -- pinned executable/CLI version
 * (checked once via `preflightCodex`, memoized), process-group-isolated
 * execution, durable receipt verified by byte length and sha256 rather than
 * trusted from memory. Each contribution gets a fresh `runKey`/`attemptId`
 * (no cross-call resumability is needed: a room grant's lease already bounds
 * the call, and the moderator's own orphan sweep handles a daemon crash) and
 * a fresh empty scratch `cwd`, so the process never sees repository content.
 */
export function createCodexParticipant(config: CodexParticipantConfigV1): ParticipantAdapter {
  assertAbsolutePath(config.executable, "Codex executable");
  assertAbsolutePath(config.codexHome, "Codex home");
  assertAbsolutePath(config.runnerRoot, "Codex room-participant runner root");
  assertAbsolutePath(config.scratchRoot, "Codex room-participant scratch root");
  assertPrivateExistingDirectory(config.codexHome, "Codex home");
  mkdirSync(config.runnerRoot, { recursive: true, mode: 0o700 });
  mkdirSync(config.scratchRoot, { recursive: true, mode: 0o700 });
  const expectedCliVersion = config.expectedCliVersion;
  if (
    expectedCliVersion !== undefined &&
    !VERIFIED_CODEX_CLI_VERSIONS.includes(
      expectedCliVersion as (typeof VERIFIED_CODEX_CLI_VERSIONS)[number],
    )
  ) {
    throw new TypeError("Codex expectedCliVersion has not passed Factory conformance");
  }
  if (config.executableDigest !== undefined) {
    const stats = lstatSync(config.executable);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new TypeError("Codex executable must be one real regular file to verify its digest");
    }
    const actualDigest = `sha256:${createHash("sha256").update(readFileSync(config.executable)).digest("hex")}`;
    if (actualDigest !== config.executableDigest) {
      throw new TypeError("Codex executable does not match its configured digest");
    }
  }
  const environmentAllowlist = config.environmentAllowlist ?? CODEX_SAFE_AGENT_ENVIRONMENT_NAMES;
  const timeoutMs = config.timeoutMs ?? 60_000;
  const terminationGraceMs = config.terminationGraceMs ?? 2_000;
  const registrationTimeoutMs = config.registrationTimeoutMs ?? 5_000;
  const pollMs = config.pollMs ?? 25;
  const maxOutputBytesPerStream = config.maxOutputBytesPerStream ?? 4 * 1024 * 1024;
  const supervisor = config.supervisor ?? DEFAULT_CODEX_SUPERVISOR;
  const preflight = config.preflight ?? preflightCodex;
  const outputSchemaPath = ensureOutputSchemaFile(config.runnerRoot);
  const provider: RoomProvider = RoomProviderSchema.parse("codex");

  let preflightPromise: Promise<void> | null = null;
  const ensurePreflight = async (): Promise<CodexParticipantProcessClassification | null> => {
    preflightPromise ??= (async () => {
      const result = await preflight({
        executable: config.executable,
        cwd: config.scratchRoot,
        environment: buildControllerEnvironment(
          config.sourceEnvironment ?? process.env,
          environmentAllowlist,
          config.codexHome,
        ),
        ...(expectedCliVersion === undefined ? {} : { supportedVersions: [expectedCliVersion] }),
      });
      if (!result.ready) {
        throw new Error(`Codex preflight failed (${result.reason}): ${result.summary}`);
      }
    })();
    try {
      await preflightPromise;
      return null;
    } catch (error) {
      preflightPromise = null; // allow a later call to retry once the operator fixes the environment
      return {
        kind: "blocked-auth",
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

  return {
    id: "openai.codex-room-participant",
    provider,
    async contribute(context: ParticipantContext): Promise<ParticipantContributionResult> {
      const preflightFailure = await ensurePreflight();
      if (preflightFailure !== null) {
        return { kind: "error", code: "internal", retryAfterMs: null };
      }

      const scratch = mkdtempSync(join(config.scratchRoot, "run-"));
      try {
        const classification = await runOnce(config, context, {
          scratch,
          outputSchemaPath,
          environmentAllowlist,
          timeoutMs,
          terminationGraceMs,
          registrationTimeoutMs,
          pollMs,
          maxOutputBytesPerStream,
          supervisor,
        });
        if (classification.kind === "completed") return classification.contribution;
        if (classification.kind === "blocked-auth") {
          return { kind: "error", code: "internal", retryAfterMs: null };
        }
        return { kind: "error", code: "internal", retryAfterMs: null };
      } finally {
        rmSync(scratch, { force: true, recursive: true });
      }
    },
  };
}

type RunOnceOptions = Readonly<{
  scratch: string;
  outputSchemaPath: string;
  environmentAllowlist: readonly string[];
  timeoutMs: number;
  terminationGraceMs: number;
  registrationTimeoutMs: number;
  pollMs: number;
  maxOutputBytesPerStream: number;
  supervisor: CodexSupervisorPort;
}>;

async function runOnce(
  config: CodexParticipantConfigV1,
  context: ParticipantContext,
  options: RunOnceOptions,
): Promise<CodexParticipantProcessClassification> {
  const invocation = buildCodexParticipantInvocation({
    executable: config.executable,
    model: config.model,
    codexHome: config.codexHome,
    outputSchemaPath: options.outputSchemaPath,
    workingDirectory: options.scratch,
    instruction: renderParticipantInstruction(context),
    networkEnabled: context.networkEnabled,
    environmentAllowlist: options.environmentAllowlist,
    sourceEnvironment: config.sourceEnvironment ?? process.env,
  });

  const runKey = `room-${randomUUID()}`;
  const attemptId = randomUUID();
  const intentInput: CreateSupervisedRunIntentInput = {
    runKey,
    attemptId,
    fence: 0,
    createdAt: new Date().toISOString(),
    executable: invocation.executable,
    argv: invocation.args,
    cwd: invocation.cwd,
    environment: invocation.environment,
    stdin: Buffer.from(invocation.stdin, "utf8"),
    limits: {
      timeoutMs: options.timeoutMs,
      graceMs: options.terminationGraceMs,
      forceWaitMs: options.terminationGraceMs,
      pollMs: options.pollMs,
      maxOutputBytesPerStream: options.maxOutputBytesPerStream,
    },
  };

  const prepared = options.supervisor.prepare(config.runnerRoot, intentInput);
  const onAbort = (): void => {
    void options.supervisor.terminate(prepared);
  };
  context.signal.addEventListener("abort", onAbort, { once: true });

  try {
    let receipt: SupervisedRunReceiptV1;
    const launched = options.supervisor.launch(prepared);
    if (launched.outcome === "blocked") {
      return {
        kind: "process-failed",
        reason: `Codex supervised launch blocked: ${launched.reason}`,
      };
    }
    if (launched.outcome === "already-terminal") {
      receipt = launched.receipt;
    } else {
      if (launched.outcome === "launch-requested") {
        context.reportWorkerPid(launched.controllerPid);
        const waited = await options.supervisor.waitForRegistration(
          prepared,
          launched.registration,
          {
            timeoutMs: options.registrationTimeoutMs,
            pollMs: options.pollMs,
          },
        );
        if (waited.outcome === "blocked") {
          return { kind: "process-failed", reason: `Codex registration blocked: ${waited.reason}` };
        }
        if (waited.outcome === "terminal") {
          receipt = waited.receipt;
        } else {
          receipt = await pollUntilTerminal(options, prepared);
        }
      } else {
        // "already-live": someone else is running this exact runKey (should
        // not happen -- runKeys are fresh per call -- but poll to terminal
        // rather than assuming).
        receipt = await pollUntilTerminal(options, prepared);
      }
    }

    if (context.signal.aborted) {
      return { kind: "process-failed", reason: "Codex contribution was cancelled by its lease" };
    }
    if (receipt.terminationOrigin === "timeout") {
      return {
        kind: "completed",
        contribution: { kind: "error", code: "timeout", retryAfterMs: null },
      };
    }
    if (receipt.terminationOrigin === "output-overflow") {
      return { kind: "protocol-error", reason: "Codex output exceeded its capture limit" };
    }
    if (receipt.terminationOrigin === "cancellation" || receipt.terminationOrigin === "external") {
      return { kind: "process-failed", reason: "Codex contribution was cancelled" };
    }

    const stdout = readBoundOutput(prepared.paths.stdoutPath, receipt.stdout);
    if (receipt.process.exitCode !== 0 || receipt.process.signal !== null) {
      const stderr = readBoundOutput(prepared.paths.stderrPath, receipt.stderr);
      if (AUTHENTICATION_ERROR_PATTERN.test(stderr)) {
        return { kind: "blocked-auth", reason: "Codex reported an authentication failure" };
      }
      const classification = classifyFailureText(boundedText(stderr, 2_000));
      return {
        kind: "completed",
        contribution: {
          kind: "error",
          code: classification.code,
          retryAfterMs: classification.retryAfterMs,
        },
      };
    }
    return classifyCodexParticipantStdout(stdout);
  } finally {
    context.signal.removeEventListener("abort", onAbort);
  }
}

async function pollUntilTerminal(
  options: RunOnceOptions,
  prepared: PreparedSupervisedRun,
): Promise<SupervisedRunReceiptV1> {
  const deadline = Date.now() + options.timeoutMs + options.terminationGraceMs * 2 + 10_000;
  for (;;) {
    const outcome = options.supervisor.reconcile(prepared);
    if (outcome.outcome === "terminal") return outcome.receipt;
    if (
      outcome.outcome === "blocked" &&
      outcome.reason !== "terminal-receipt-exists-but-target-process-group-is-still-live" &&
      outcome.reason !== "terminal-receipt-exists-but-controller-process-group-is-still-live" &&
      outcome.reason !== "target-exited-without-terminal-receipt"
    ) {
      throw new Error(`Codex supervised run reconciliation blocked: ${outcome.reason}`);
    }
    if (Date.now() >= deadline) {
      throw new Error("Codex supervised run reconciliation exceeded its deadline");
    }
    await new Promise((resolve) => setTimeout(resolve, options.pollMs));
  }
}
