import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { isAbsolute, join, normalize, relative, sep } from "node:path";

import {
  VERIFIED_CODEX_CLI_VERSIONS,
  CODEX_DISABLED_FEATURES,
  CODEX_SAFE_AGENT_ENVIRONMENT_NAMES,
  preflightCodex,
  validateCodexWorkspaceScope,
  type CodexInvocation,
  type CodexPreflightResult,
  type CodexProcessCapture,
  type PreflightCodexOptions,
} from "@app-factory/agent-runner";
import {
  AttemptIdSchema,
  FindingV1Schema,
  ReviewReportV1Schema,
  RunIdSchema,
  Sha256DigestSchema,
  type FindingV1,
  type ReviewReportV1,
  type RunId,
  type Sha256Digest,
  type TaskSpecV1,
} from "@app-factory/contracts";
import { canonicalJsonBytes, sha256Digest } from "@app-factory/execution-engine";
import type { FactoryMirror } from "@app-factory/git-workspace";
import type {
  IndependentReviewAdapter,
  IndependentReviewInput,
} from "@app-factory/independent-review";
import {
  createSupervisedRunIntent,
  launchPreparedSupervisedRun,
  openPreparedSupervisedRun,
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

/**
 * The first real (non-fixture) `IndependentReviewAdapter`: a strictly
 * read-only Codex CLI reviewer.
 *
 * This module deliberately mirrors, rather than imports, the private shape of
 * `apps/daemon/src/codex-local-agent.ts` and `packages/agent-runner/src/codex.ts`
 * (invocation building, structured-output parsing, JSONL classification,
 * supervised-run containment). Those files implement the *coding* agent and
 * are treated as read-only reference material here: the reviewer has a
 * different trust shape (capability gate is all-false except `readCandidate`,
 * it must never be able to write anywhere, and its structured output binds to
 * `ReviewReportV1`, not `CodexReportedResultV1`), so it gets its own small,
 * independently auditable implementation rather than a shared one.
 *
 * Containment discipline mirrored from the coding agent:
 *  - Same pinned executable digest + CLI version + preflight check.
 *  - Same supervised-run primitives (`@app-factory/process-supervisor`):
 *    ephemeral, pinned-executable, process-group-isolated execution.
 *  - Same environment allowlist mechanism (`CODEX_SAFE_AGENT_ENVIRONMENT_NAMES`).
 *  - Same `--output-schema`-driven structured result, parsed fail-closed.
 *
 * What is different, by design:
 *  - `authorizedWritePaths` does not exist as a concept here: the permission
 *    profile marks the entire working directory (and `:tmpdir`/`:slash_tmp`)
 *    "deny" for writes. There is no scope the reviewer may write to.
 *  - The coordinator (`packages/execution-engine/src/coordinator.ts`) creates
 *    and destroys its own read-only verification checkout (via
 *    `GitWorkspaceManager.createTrustedVerificationCheckout`) *before* the
 *    review phase runs, for trusted tests only; it is gone by the time
 *    `runIndependentReview` calls this adapter. `IndependentReviewInput` is
 *    intentionally digest-bound, not path-bound, so this adapter cannot reuse
 *    that checkout. Instead it prepares its *own* ephemeral, read-only
 *    checkout of the exact candidate tree straight from the immutable Factory
 *    mirror (`git archive` from the sealed bare mirror, never the mutable
 *    attempt worktree), chmods it read-only the same way
 *    `createTrustedVerificationCheckout` does, and verifies -- by content
 *    digest, not by trusting the model's transcript -- that nothing in it
 *    changed across the run.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const CODEX_REVIEW_ADAPTER_ID = "openai.codex-review";
export const CODEX_REVIEW_ADAPTER_VERSION = "1.0.0";

export const REVIEW_CAPABILITIES = Object.freeze({
  readCandidate: true,
  writeCandidate: false,
  mutatePolicy: false,
  approveRelease: false,
}) satisfies IndependentReviewAdapter["capabilities"];

export class CodexIndependentReviewerConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CodexIndependentReviewerConfigurationError";
  }
}

export class CodexIndependentReviewerError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CodexIndependentReviewerError";
  }
}

function configurationError(message: string): never {
  throw new CodexIndependentReviewerConfigurationError(message);
}

function reviewerError(message: string): never {
  throw new CodexIndependentReviewerError(message);
}

// ---------------------------------------------------------------------------
// Structured output contract (mirrors CODEX_REPORTED_RESULT_JSON_SCHEMA_V1's
// approach in packages/agent-runner/src/codex.ts: an --output-schema-driven
// JSON report, parsed fail-closed). OpenAI's structured-output API used by
// the pinned Codex CLI versions rejects regex lookaround and `uniqueItems`,
// so neither appears anywhere below; duplicate/format rejection is
// authoritatively enforced afterward by parseCodexReviewReportedResultV1
// via the real `FindingV1Schema`/`ReviewReportV1Schema` (which do use
// lookaround where useful, since they are never sent to the model).
// ---------------------------------------------------------------------------

const NAMESPACED_CODE_JSON_PATTERN = "^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)+$";
// Identical in shape to the lookaround-free relative-path pattern in
// packages/agent-runner/src/codex.ts's CODEX_REPORTED_RESULT_JSON_SCHEMA_V1
// (same underlying constraint: no lookaround permitted in the schema sent to
// the model). Authoritative path validation happens afterward via the real
// `RelativePathSchema` (through `FindingLocationV1Schema`).
const RELATIVE_PATH_JSON_PATTERN =
  "^(?:\\.?[^/\\\\.][^/\\\\]*|\\.\\.[^/\\\\]+)(?:/(?:\\.?[^/\\\\.][^/\\\\]*|\\.\\.[^/\\\\]+))*$";
const SHA256_DIGEST_JSON_PATTERN = "^sha256:[0-9a-f]{64}$";

const MAX_REVIEW_FINDINGS = 50;
const MAX_FINDING_LOCATIONS = 20;
const MAX_FINDING_EVIDENCE_DIGESTS = 10;

export const CODEX_REVIEW_REPORTED_RESULT_JSON_SCHEMA_V1 = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "verdict", "findings"],
  properties: {
    schemaVersion: { type: "integer", const: 1 },
    verdict: {
      type: "string",
      enum: ["pass", "changes-required", "blocked"],
    },
    findings: {
      type: "array",
      maxItems: MAX_REVIEW_FINDINGS,
      // `uniqueItems` intentionally absent, matching
      // CODEX_REPORTED_RESULT_JSON_SCHEMA_V1's precedent.
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "ruleId",
          "category",
          "severity",
          "title",
          "description",
          "locations",
          "supportingArtifactDigests",
        ],
        properties: {
          ruleId: {
            type: "string",
            minLength: 3,
            maxLength: 128,
            pattern: NAMESPACED_CODE_JSON_PATTERN,
          },
          category: {
            type: "string",
            minLength: 3,
            maxLength: 128,
            pattern: NAMESPACED_CODE_JSON_PATTERN,
          },
          severity: { type: "string", enum: ["p0", "p1", "p2", "p3"] },
          title: { type: "string", minLength: 1, maxLength: 200 },
          description: { type: "string", minLength: 1, maxLength: 4_000 },
          locations: {
            type: "array",
            maxItems: MAX_FINDING_LOCATIONS,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["path", "lineStart", "lineEnd"],
              properties: {
                path: {
                  type: "string",
                  minLength: 1,
                  maxLength: 1_024,
                  pattern: RELATIVE_PATH_JSON_PATTERN,
                },
                lineStart: { type: ["integer", "null"], minimum: 1 },
                lineEnd: { type: ["integer", "null"], minimum: 1 },
              },
            },
          },
          supportingArtifactDigests: {
            type: "array",
            maxItems: MAX_FINDING_EVIDENCE_DIGESTS,
            items: { type: "string", pattern: SHA256_DIGEST_JSON_PATTERN },
          },
        },
      },
    },
  },
} as const;

export function serializeCodexReviewReportedResultJsonSchemaV1(): string {
  return `${JSON.stringify(CODEX_REVIEW_REPORTED_RESULT_JSON_SCHEMA_V1, null, 2)}\n`;
}

export type CodexReviewReportedResultV1 = Readonly<{
  verdict: "pass" | "changes-required" | "blocked";
  findings: readonly FindingV1[];
}>;

const MAX_REVIEW_OUTPUT_BYTES = 1_000_000;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains unexpected or missing fields`);
  }
}

function deterministicFindingId(
  reviewInputDigest: Sha256Digest,
  index: number,
  rawFinding: unknown,
): string {
  // Deterministic hash-derived UUIDv5-shaped identifier, the same
  // bit-twiddling convention used throughout this codebase (see
  // `deterministicEventId` in packages/agent-runner/src/codex-result.ts and
  // `deterministicUuid` in apps/daemon/src/verified-local-executor.ts). The
  // model is never asked to invent a `findingId`: it cannot be trusted to
  // produce a valid, non-colliding UUID, so the adapter synthesizes one from
  // content that is itself bound to the exact review input.
  const digest = createHash("sha256")
    .update("app-factory.codex-review-finding.v1\0", "utf8")
    .update(reviewInputDigest, "utf8")
    .update(`\0${String(index)}\0`, "utf8")
    .update(canonicalJsonBytes(rawFinding))
    .digest("hex");
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/**
 * Fail-closed parse of the model's final structured message into validated
 * findings bound to the supplied review input. Throws `TypeError` (mirroring
 * `parseCodexReportedResultV1`'s convention) on any structural violation,
 * and `CodexIndependentReviewerError` on the two review-specific integrity
 * violations the protocol asks this adapter to police itself, in addition to
 * `runIndependentReview`'s own outer enforcement: a finding citing an
 * evidence digest that was not supplied, and a verdict/severity mismatch.
 */
export function parseCodexReviewReportedResultV1(
  contents: string,
  reviewInputDigest: Sha256Digest,
  availableEvidence: ReadonlySet<Sha256Digest>,
): CodexReviewReportedResultV1 {
  if (Buffer.byteLength(contents, "utf8") > MAX_REVIEW_OUTPUT_BYTES) {
    throw new TypeError("Codex review output exceeded its bounded byte limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch (error) {
    throw new TypeError("Codex review output is not valid JSON", { cause: error });
  }
  if (!isRecord(parsed)) {
    throw new TypeError("Codex review output must be an object");
  }
  assertExactKeys(parsed, ["schemaVersion", "verdict", "findings"], "Codex review output");
  if (parsed.schemaVersion !== 1) {
    throw new TypeError("Codex review output has an unsupported schema version");
  }
  if (
    parsed.verdict !== "pass" &&
    parsed.verdict !== "changes-required" &&
    parsed.verdict !== "blocked"
  ) {
    throw new TypeError("Codex review output has an invalid verdict");
  }
  if (!Array.isArray(parsed.findings) || parsed.findings.length > MAX_REVIEW_FINDINGS) {
    throw new TypeError("Codex review output findings must be a bounded array");
  }

  const findings = parsed.findings.map((rawFinding, index) => {
    if (!isRecord(rawFinding)) {
      throw new TypeError(`findings[${String(index)}] must be an object`);
    }
    assertExactKeys(
      rawFinding,
      [
        "ruleId",
        "category",
        "severity",
        "title",
        "description",
        "locations",
        "supportingArtifactDigests",
      ],
      `findings[${String(index)}]`,
    );
    // Authoritative structural validation reuses the real protocol schema
    // (which enforces the same namespaced-code / relative-path / digest
    // shapes as the advisory JSON schema above, plus a couple more that
    // cannot be expressed without lookaround, e.g. RelativePathSchema's
    // "no ../ traversal" rule).
    const finding = FindingV1Schema.parse({
      schemaVersion: 1,
      findingId: deterministicFindingId(reviewInputDigest, index, rawFinding),
      ...rawFinding,
    });
    for (const evidenceDigest of finding.supportingArtifactDigests) {
      if (!availableEvidence.has(evidenceDigest)) {
        reviewerError(
          `Codex review output cited an evidence digest that was not supplied to the reviewer: ${evidenceDigest}`,
        );
      }
    }
    return finding;
  });

  const blockingFinding = findings.some(
    (finding) => finding.severity === "p0" || finding.severity === "p1",
  );
  if (parsed.verdict === "pass" && blockingFinding) {
    reviewerError("Codex review output reported verdict pass alongside a P0 or P1 finding");
  }
  if (parsed.verdict === "changes-required" && !blockingFinding) {
    reviewerError("Codex review output reported changes-required without a P0 or P1 finding");
  }

  return { verdict: parsed.verdict, findings };
}

// ---------------------------------------------------------------------------
// JSONL transcript classification (mirrors classifyCodexProcess in
// packages/agent-runner/src/codex.ts, folding the review-specific parse step
// into the same "one terminal event" walk).
// ---------------------------------------------------------------------------

const AUTHENTICATION_ERROR_PATTERN =
  /(?:401\s+unauthorized|authentication|missing bearer|not logged in)/i;

export type CodexReviewProtocolLimits = Readonly<{
  maxStdoutBytes: number;
  maxLineBytes: number;
  maxEventCount: number;
}>;

export const DEFAULT_CODEX_REVIEW_PROTOCOL_LIMITS: CodexReviewProtocolLimits = {
  maxStdoutBytes: 20_000_000,
  maxLineBytes: 1_000_000,
  maxEventCount: 50_000,
};

export type CodexReviewProcessClassification =
  | Readonly<{ kind: "process-completed"; reported: CodexReviewReportedResultV1 }>
  | Readonly<{ kind: "blocked-auth"; reason: string }>
  | Readonly<{ kind: "process-failed"; reason: string }>
  | Readonly<{ kind: "timed-out"; reason: string }>
  | Readonly<{ kind: "protocol-error"; reason: string }>;

export function classifyCodexReviewProcess(
  capture: CodexProcessCapture,
  reviewInputDigest: Sha256Digest,
  availableEvidence: ReadonlySet<Sha256Digest>,
  limits: CodexReviewProtocolLimits = DEFAULT_CODEX_REVIEW_PROTOCOL_LIMITS,
): CodexReviewProcessClassification {
  if (capture.terminationOrigin === "timed-out") {
    return { kind: "timed-out", reason: "Factory deadline terminated the Codex reviewer" };
  }
  if (capture.terminationOrigin === "cancelled") {
    // A reviewer has no external cancellation source of its own; treat it as
    // a process failure rather than inventing a distinct outcome kind.
    return { kind: "process-failed", reason: "The Codex reviewer run was cancelled" };
  }
  if (capture.terminationOrigin === "output-overflow") {
    return { kind: "protocol-error", reason: "Codex reviewer output exceeded its capture limit" };
  }
  if (Buffer.byteLength(capture.stdout, "utf8") > limits.maxStdoutBytes) {
    return { kind: "protocol-error", reason: "Codex reviewer stdout exceeded its byte limit" };
  }

  const lines = capture.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0 || lines.length > limits.maxEventCount) {
    return {
      kind: "protocol-error",
      reason: "Codex reviewer emitted no events or exceeded its event limit",
    };
  }

  let threadStarted = 0;
  let turnStarted = 0;
  let terminalType: "turn.completed" | "turn.failed" | null = null;
  let terminalIndex = -1;
  let terminalFailureMessage = "";
  let finalAgentMessage: string | null = null;

  for (const [index, line] of lines.entries()) {
    if (Buffer.byteLength(line, "utf8") > limits.maxLineBytes) {
      return { kind: "protocol-error", reason: "Codex reviewer emitted an oversized JSONL line" };
    }
    let event: unknown;
    try {
      event = JSON.parse(line) as unknown;
    } catch {
      return { kind: "protocol-error", reason: "Codex reviewer emitted malformed JSONL" };
    }
    if (!isRecord(event) || typeof event.type !== "string") {
      return { kind: "protocol-error", reason: "Codex reviewer emitted an invalid event envelope" };
    }
    if (event.type === "thread.started") threadStarted += 1;
    if (event.type === "turn.started") turnStarted += 1;
    if (event.type === "turn.completed" || event.type === "turn.failed") {
      if (terminalType !== null) {
        return {
          kind: "protocol-error",
          reason: "Codex reviewer emitted multiple terminal events",
        };
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
      reason: "Codex reviewer did not emit one thread start and at least one turn start",
    };
  }
  if (terminalType === null || terminalIndex !== lines.length - 1) {
    return { kind: "protocol-error", reason: "Codex reviewer did not end with one terminal event" };
  }
  if (terminalType === "turn.failed") {
    if (AUTHENTICATION_ERROR_PATTERN.test(terminalFailureMessage)) {
      return { kind: "blocked-auth", reason: "Codex reviewer reported an authentication failure" };
    }
    return {
      kind: "process-failed",
      reason: terminalFailureMessage || "Codex reviewer turn failed",
    };
  }
  if (capture.exitCode !== 0 || capture.signal !== null) {
    return {
      kind: "process-failed",
      reason: `Codex reviewer process exited with code ${String(capture.exitCode)} and signal ${String(capture.signal)}`,
    };
  }
  if (finalAgentMessage === null) {
    return { kind: "protocol-error", reason: "Codex reviewer completed without a final message" };
  }

  try {
    return {
      kind: "process-completed",
      reported: parseCodexReviewReportedResultV1(
        finalAgentMessage,
        reviewInputDigest,
        availableEvidence,
      ),
    };
  } catch (error) {
    if (error instanceof CodexIndependentReviewerError) throw error;
    return {
      kind: "protocol-error",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Invocation building (mirrors buildCodexInvocation in
// packages/agent-runner/src/codex.ts). There is no `authorizedWritePaths`
// parameter anywhere in this module: the permission profile below denies
// writes everywhere, unconditionally, which is the structural enforcement
// that the reviewer cannot touch the candidate checkout.
// ---------------------------------------------------------------------------

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

const SAFE_PERMISSION_PROFILE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const SAFE_FEATURE_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

function buildReviewControllerEnvironment(
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
      if (value.includes("\0")) {
        throw new TypeError(`Environment variable ${name} contains a null byte`);
      }
      environment[name] = value;
    }
  }
  environment.CODEX_HOME = codexHome;
  environment.NO_COLOR = "1";
  environment.RUST_LOG = "error";
  environment.TERM = "dumb";
  return environment;
}

export type CodexReviewInvocationOptions = Readonly<{
  executable: string;
  model: string;
  codexHome: string;
  outputSchemaPath: string;
  workingDirectory: string;
  instruction: string;
  environmentAllowlist: readonly string[];
  sourceEnvironment?: Readonly<Record<string, string | undefined>>;
  permissionProfileName?: string;
  disabledFeatures?: readonly string[];
}>;

/**
 * Builds a Codex CLI invocation that is read-only everywhere: the permission
 * profile grants "read" on the working directory and denies every write
 * surface Codex knows about (workspace root, `/tmp`, `$TMPDIR`), with
 * networking disabled. There is no scoped write allowance because none is
 * ever granted -- this is the "authorized-write-path set that is EMPTY"
 * design constraint expressed structurally rather than as an empty list that
 * happens to be passed in.
 */
export function buildCodexReviewInvocation(options: CodexReviewInvocationOptions): CodexInvocation {
  assertAbsolutePath(options.executable, "Codex executable");
  assertAbsolutePath(options.codexHome, "Codex home");
  assertAbsolutePath(options.outputSchemaPath, "Codex review output schema path");
  if (
    options.model.length < 1 ||
    options.model.length > 200 ||
    options.model.trim() !== options.model ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/u.test(options.model)
  ) {
    throw new TypeError("Codex model must be an explicit bounded portable identifier");
  }

  const permissionProfileName = options.permissionProfileName ?? "factory_reviewer";
  if (!SAFE_PERMISSION_PROFILE_NAME_PATTERN.test(permissionProfileName)) {
    throw new TypeError(
      `Codex reviewer permission profile name is invalid: ${permissionProfileName}`,
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
    description: "App Factory independent reviewer: read-only everywhere, no write surface",
    extends: ":workspace",
    filesystem: {
      ":minimal": "read",
      ":root": "deny",
      ":slash_tmp": "deny",
      ":tmpdir": "deny",
      ":workspace_roots": { ".": "read" },
    },
    network: { enabled: false },
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
    // Unlike the coding agent's attempt worktree, the reviewer's working
    // directory is a `git archive` extraction with no `.git` (by design: the
    // model is never handed a mutable repository). Without this flag the
    // pinned CLI refuses to start at all -- before any model call -- with
    // "Not inside a trusted directory and --skip-git-repo-check was not
    // specified" (observed on the first live smoke, 2026-08-17). The
    // directory stays `trust_level = "untrusted"` in `projects` above.
    "--skip-git-repo-check",
    "--ephemeral",
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
    environment: buildReviewControllerEnvironment(
      options.sourceEnvironment ?? process.env,
      options.environmentAllowlist,
      options.codexHome,
    ),
    stdin: options.instruction,
    stdoutProtocol: "jsonl",
  };
}

// ---------------------------------------------------------------------------
// Read-only candidate checkout + evidence materialization.
// ---------------------------------------------------------------------------

const TRUSTED_GIT_ENVIRONMENT = {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_OPTIONAL_LOCKS: "0",
  GIT_PAGER: "cat",
  GIT_TERMINAL_PROMPT: "0",
  LANG: "C",
  LC_ALL: "C",
  PATH: "/usr/bin:/bin",
  TZ: "UTC",
} as const satisfies Readonly<Record<string, string>>;

function ensurePrivateDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stats = lstatSync(path);
  if (!stats.isDirectory() || stats.isSymbolicLink() || realpathSync.native(path) !== path) {
    reviewerError(`Reviewer runtime path must be one real directory: ${path}`);
  }
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    reviewerError(`Reviewer runtime path must be owned by the current user: ${path}`);
  }
  if ((stats.mode & 0o077) !== 0) {
    reviewerError(`Reviewer runtime path must be private to the current user: ${path}`);
  }
}

/** Extracts the exact candidate tree from the sealed, immutable Factory
 * mirror -- never the mutable attempt worktree -- via `git archive` piped
 * into `tar`. Git's object model guarantees tree entries cannot contain `..`
 * path components, so the extracted paths cannot escape `destinationDirectory`
 * by construction; no separate path-traversal defense is layered on top of
 * that invariant. */
function materializeCandidateCheckout(
  gitExecutable: string,
  tarExecutable: string,
  mirrorPath: string,
  candidateTree: string,
  destinationDirectory: string,
  maxBytes: number,
): void {
  mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
  const archive = spawnSync(
    gitExecutable,
    ["--git-dir", mirrorPath, "archive", "--format=tar", "--", candidateTree],
    {
      cwd: mirrorPath,
      encoding: null,
      env: TRUSTED_GIT_ENVIRONMENT,
      maxBuffer: maxBytes + 4_096,
      shell: false,
      timeout: 30_000,
    },
  );
  if (archive.error !== undefined || archive.status !== 0 || !Buffer.isBuffer(archive.stdout)) {
    reviewerError("Could not archive the candidate tree from the Factory mirror");
  }
  if (archive.stdout.byteLength > maxBytes) {
    reviewerError("Candidate tree archive exceeded the reviewer's bounded byte budget");
  }
  const extract = spawnSync(tarExecutable, ["-x", "-C", destinationDirectory], {
    encoding: null,
    env: TRUSTED_GIT_ENVIRONMENT,
    input: archive.stdout,
    maxBuffer: maxBytes + 4_096,
    shell: false,
    timeout: 30_000,
  });
  if (extract.error !== undefined || extract.status !== 0) {
    reviewerError("Could not extract the candidate tree into the read-only reviewer checkout");
  }
}

function looksLikeUtf8Text(bytes: Buffer): boolean {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return !text.includes("\0");
  } catch {
    return false;
  }
}

function looksLikeJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

export type EvidenceManifestItemV1 = Readonly<{
  digest: Sha256Digest;
  relativePath: string;
  byteLength: number;
  contentType: "json" | "text" | "binary";
  truncated: boolean;
}>;

/** Materializes exactly the supplied raw evidence digests (never more, never
 * fewer) into a private read-only directory, plus a manifest that gives the
 * model the literal digest strings it is allowed to cite back. */
function materializeEvidence(
  destinationDirectory: string,
  digests: readonly Sha256Digest[],
  readEvidence: (digest: Sha256Digest) => Uint8Array,
  limits: Readonly<{ maxItemBytes: number; maxTotalBytes: number }>,
): readonly EvidenceManifestItemV1[] {
  mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
  const items: EvidenceManifestItemV1[] = [];
  let total = 0;
  for (const digest of digests) {
    let raw: Uint8Array;
    try {
      raw = readEvidence(digest);
    } catch (error) {
      reviewerError(
        `Could not read supplied evidence ${digest}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (sha256Digest(bytes) !== digest) {
      reviewerError(
        `Evidence reader returned bytes that do not match their requested digest: ${digest}`,
      );
    }
    total += bytes.byteLength;
    if (total > limits.maxTotalBytes) {
      reviewerError("Supplied evidence exceeded the reviewer's total byte budget");
    }
    const truncated = bytes.byteLength > limits.maxItemBytes;
    const stored = truncated ? bytes.subarray(0, limits.maxItemBytes) : bytes;
    const isText = looksLikeUtf8Text(stored);
    const text = isText ? stored.toString("utf8") : "";
    const contentType: EvidenceManifestItemV1["contentType"] = !isText
      ? "binary"
      : looksLikeJson(text)
        ? "json"
        : "text";
    const extension = contentType === "binary" ? "bin" : contentType === "json" ? "json" : "txt";
    const fileName = `${digest.slice("sha256:".length)}.${extension}`;
    writeFileSync(join(destinationDirectory, fileName), stored, { mode: 0o600 });
    items.push({
      digest,
      relativePath: `evidence/${fileName}`,
      byteLength: bytes.byteLength,
      contentType,
      truncated,
    });
  }
  const manifest = { schemaVersion: 1, items };
  writeFileSync(
    join(destinationDirectory, "MANIFEST.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );
  return items;
}

/** Content digest of a directory tree (relative path, permission bits, and
 * file content, in deterministic traversal order). Used to prove -- by
 * structural evidence, not by trusting the model's transcript -- that the
 * reviewer's read-only checkout was byte-for-byte unchanged by the run. */
export function digestDirectoryTree(root: string): Sha256Digest {
  const entries: string[] = [];
  const walk = (directory: string, prefix: string): void => {
    const names = readdirSync(directory).sort();
    for (const name of names) {
      const absolute = join(directory, name);
      const relativeName = prefix.length === 0 ? name : `${prefix}/${name}`;
      const stats = lstatSync(absolute);
      if (stats.isSymbolicLink()) {
        reviewerError(`Reviewer checkout contains an unexpected symbolic link: ${relativeName}`);
      } else if (stats.isDirectory()) {
        entries.push(`D\0${relativeName}\0${(stats.mode & 0o777).toString(8)}`);
        walk(absolute, relativeName);
      } else if (stats.isFile()) {
        const contentDigest = createHash("sha256").update(readFileSync(absolute)).digest("hex");
        entries.push(`F\0${relativeName}\0${(stats.mode & 0o777).toString(8)}\0${contentDigest}`);
      } else {
        reviewerError(`Reviewer checkout contains an unsupported file type: ${relativeName}`);
      }
    }
  };
  walk(root, "");
  return sha256Digest(Buffer.from(entries.join("\n"), "utf8"));
}

/** Same bit-masking convention as `removeOwnerWriteRecursively` in
 * packages/git-workspace/src/workspace.ts's `createTrustedVerificationCheckout`
 * path: children are locked before their parent so the walk itself never
 * needs write access it has already revoked. */
function lockReadOnlyRecursive(path: string): void {
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) reviewerError(`Refusing to lock a symbolic link: ${path}`);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) lockReadOnlyRecursive(join(path, entry));
    chmodSync(path, (stats.mode & 0o555) | 0o500);
  } else {
    chmodSync(path, (stats.mode & 0o555) | 0o400);
  }
}

function unlockWritableRecursive(path: string): void {
  let stats: Stats;
  try {
    stats = lstatSync(path);
  } catch {
    return;
  }
  if (stats.isSymbolicLink()) return;
  if (stats.isDirectory()) {
    chmodSync(path, (stats.mode & 0o777) | 0o700);
    for (const entry of readdirSync(path)) unlockWritableRecursive(join(path, entry));
  } else {
    chmodSync(path, (stats.mode & 0o777) | 0o600);
  }
}

function cleanupReviewWorkspace(root: string): void {
  try {
    if (existsSync(root)) {
      unlockWritableRecursive(root);
      rmSync(root, { force: true, recursive: true });
    }
  } catch {
    // Best-effort cleanup: a failure here must never mask the review outcome
    // (pass/changes-required/blocked, or a thrown integrity failure).
  }
}

// ---------------------------------------------------------------------------
// Review instruction (prompt) construction.
// ---------------------------------------------------------------------------

function truncateForPrompt(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}… [truncated]`;
}

function buildReviewInstruction(
  input: Readonly<{
    taskSpec: TaskSpecV1;
    candidateTree: string;
    diffDigest: Sha256Digest;
    evidence: readonly EvidenceManifestItemV1[];
  }>,
): string {
  const acceptanceCriteria = input.taskSpec.acceptanceCriteria
    .map((criterion) => `  - [${criterion.verification}] ${criterion.id}: ${criterion.statement}`)
    .join("\n");
  const scopePaths = input.taskSpec.requestedScope.paths.map((path) => `  - ${path}`).join("\n");
  const evidenceIndex = input.evidence
    .map(
      (item) =>
        `  - ${item.digest} (${item.contentType}${item.truncated ? ", truncated" : ""}) -> ${item.relativePath}`,
    )
    .join("\n");

  return [
    "You are App Factory's independent, strictly read-only code reviewer.",
    "You cannot write anywhere: the sandbox denies every write path, and the",
    "checkout you are given is filesystem-permission read-only. Do not attempt",
    "to edit, create, or delete any file; do not attempt network access.",
    "",
    "Task under review:",
    `  Title: ${truncateForPrompt(input.taskSpec.title, 200)}`,
    `  Objective: ${truncateForPrompt(input.taskSpec.objective, 2_000)}`,
    "  Acceptance criteria:",
    acceptanceCriteria,
    "  Requested (authorized) write scope for the implementer:",
    scopePaths,
    "",
    `Candidate tree: ${input.candidateTree}`,
    `Diff digest (available as evidence below): ${input.diffDigest}`,
    "",
    "Filesystem layout of your working directory:",
    "  ./candidate/  -- exact checkout of the candidate tree above",
    "  ./evidence/   -- every evidence artifact you are allowed to cite, plus",
    "                   ./evidence/MANIFEST.json indexing each by exact digest",
    "Supplied evidence (digest, content type, path):",
    evidenceIndex.length > 0 ? evidenceIndex : "  (none)",
    "",
    "Output contract:",
    "You must respond with exactly one final message: JSON matching the",
    "enforced output schema, and nothing else (no prose, no markdown fences).",
    '  - "verdict": "pass" | "changes-required" | "blocked"',
    '  - "findings": an array (possibly empty) of structured findings',
    "Rules the platform enforces after you respond, so satisfy them exactly:",
    '  - verdict "pass" must not be paired with any p0 or p1 finding.',
    '  - verdict "changes-required" must include at least one p0 or p1 finding.',
    '  - verdict "blocked" has no such constraint: use it if the supplied',
    "    evidence is insufficient to reach a confident pass/changes-required",
    "    determination, and explain why in a finding's description.",
    '  - Every finding\'s "supportingArtifactDigests" entries must be copied',
    "    verbatim from evidence/MANIFEST.json (or omitted). Never invent a",
    "    digest, and never cite a file's path as if it were a digest: citing",
    "    an unsupplied digest fails the review closed.",
    '  - "ruleId" and "category" must be lowercase namespaced codes, e.g.',
    '    "review.missing-test" or "quality.correctness".',
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type CodexIndependentReviewerLimitsV1 = Readonly<{
  timeoutMs: number;
  terminationGraceMs: number;
  maxOutputBytes: number;
}>;

export type CodexIndependentReviewerConfigurationV1 = Readonly<{
  schemaVersion: 1;
  executable: string;
  executableDigest: Sha256Digest;
  expectedCliVersion: string;
  model: string;
  codexHome: string;
  runnerRoot: string;
  checkoutRoot: string;
  outputSchemaPath: string;
  environmentAllowlist: readonly string[];
  environment: Readonly<Record<string, string>>;
  gitExecutable?: string;
  tarExecutable?: string;
  permissionProfileName?: string;
  registrationTimeoutMs?: number;
  pollMs?: number;
  maxCandidateBytes?: number;
  maxEvidenceItemBytes?: number;
  maxEvidenceTotalBytes?: number;
  limits?: Partial<CodexIndependentReviewerLimitsV1>;
}>;

type ValidatedReviewerConfiguration = Readonly<{
  executable: string;
  executableDigest: Sha256Digest;
  expectedCliVersion: string;
  model: string;
  codexHome: string;
  runnerRoot: string;
  checkoutRoot: string;
  outputSchemaPath: string;
  environmentAllowlist: readonly string[];
  environment: Readonly<Record<string, string>>;
  gitExecutable: string;
  tarExecutable: string;
  permissionProfileName: string | undefined;
  registrationTimeoutMs: number;
  pollMs: number;
  maxCandidateBytes: number;
  maxEvidenceItemBytes: number;
  maxEvidenceTotalBytes: number;
  limits: CodexIndependentReviewerLimitsV1;
}>;

function assertNormalizedAbsolutePath(value: string, label: string): string {
  if (!isAbsolute(value) || normalize(value) !== value || value.includes("\0")) {
    configurationError(`${label} must be a normalized absolute path.`);
  }
  return value;
}

function portableIdentifier(value: string, label: string, maximumLength = 200): string {
  if (
    value.length < 1 ||
    value.length > maximumLength ||
    value.trim() !== value ||
    !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/u.test(value)
  ) {
    configurationError(`${label} must be a bounded portable identifier.`);
  }
  return value;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = value ?? fallback;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    configurationError(
      `${label} must be an integer from ${String(minimum)} through ${String(maximum)}.`,
    );
  }
  return parsed;
}

function assertPrivateExistingDirectory(path: string, label: string): void {
  let stats: Stats;
  try {
    stats = lstatSync(path);
  } catch {
    configurationError(`${label} does not exist.`);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink() || realpathSync.native(path) !== path) {
    configurationError(`${label} must be one real directory.`);
  }
  if (typeof process.getuid === "function" && stats.uid !== process.getuid()) {
    configurationError(`${label} must be owned by the current user.`);
  }
  if ((stats.mode & 0o077) !== 0) {
    configurationError(`${label} must be private to the current user.`);
  }
}

function digestExecutableFile(path: string, maxBytes: number): Sha256Digest {
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > maxBytes) {
    configurationError("Codex executable must be one bounded regular file.");
  }
  return sha256Digest(readFileSync(path));
}

function isSameOrDescendantPath(candidate: string, ancestor: string): boolean {
  const relation = relative(ancestor, candidate);
  return (
    relation === "" ||
    (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
  );
}

// Mirrors apps/daemon/src/codex-local-agent.ts's pathsOverlap exactly: overlap
// must be checked in both directions, since `right` nested inside `left` and
// `left` nested inside `right` are both disqualifying and neither implies
// the other.
function pathsOverlap(left: string, right: string): boolean {
  return isSameOrDescendantPath(left, right) || isSameOrDescendantPath(right, left);
}

const MAX_EXECUTABLE_BYTES = 512 * 1024 * 1024;
const DEFAULT_REGISTRATION_TIMEOUT_MS = 5_000;
const DEFAULT_POLL_MS = 25;
const DEFAULT_MAX_CANDIDATE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_EVIDENCE_ITEM_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_EVIDENCE_TOTAL_BYTES = 32 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_TERMINATION_GRACE_MS = 2_000;
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

function validateReviewerConfiguration(
  input: CodexIndependentReviewerConfigurationV1,
): ValidatedReviewerConfiguration {
  const knownKeys = new Set([
    "schemaVersion",
    "executable",
    "executableDigest",
    "expectedCliVersion",
    "model",
    "codexHome",
    "runnerRoot",
    "checkoutRoot",
    "outputSchemaPath",
    "environmentAllowlist",
    "environment",
    "gitExecutable",
    "tarExecutable",
    "permissionProfileName",
    "registrationTimeoutMs",
    "pollMs",
    "maxCandidateBytes",
    "maxEvidenceItemBytes",
    "maxEvidenceTotalBytes",
    "limits",
  ]);
  const unknown = Object.keys(input)
    .filter((key) => !knownKeys.has(key))
    .sort();
  if (unknown.length > 0) {
    configurationError(
      `Codex reviewer configuration contains unknown fields: ${unknown.join(", ")}.`,
    );
  }
  if (input.schemaVersion !== 1) configurationError("Unsupported Codex reviewer configuration.");

  const executable = assertNormalizedAbsolutePath(input.executable, "Codex executable");
  const executableStats = lstatSync(executable);
  if (
    !executableStats.isFile() ||
    executableStats.isSymbolicLink() ||
    (executableStats.mode & 0o111) === 0 ||
    realpathSync.native(executable) !== executable
  ) {
    configurationError("Codex executable must be one real executable regular file.");
  }
  const executableDigest = Sha256DigestSchema.parse(input.executableDigest);
  if (digestExecutableFile(executable, MAX_EXECUTABLE_BYTES) !== executableDigest) {
    configurationError("Codex executable does not match its configured digest.");
  }

  const expectedCliVersion = portableIdentifier(
    input.expectedCliVersion,
    "Expected Codex CLI version",
    100,
  );
  if (
    !VERIFIED_CODEX_CLI_VERSIONS.includes(
      expectedCliVersion as (typeof VERIFIED_CODEX_CLI_VERSIONS)[number],
    )
  ) {
    configurationError("Expected Codex CLI version has not passed Factory conformance.");
  }
  const model = portableIdentifier(input.model, "Codex model");
  const codexHome = assertNormalizedAbsolutePath(input.codexHome, "Dedicated Codex home");
  assertPrivateExistingDirectory(codexHome, "Dedicated Codex home");
  const runnerRoot = assertNormalizedAbsolutePath(input.runnerRoot, "Codex reviewer runner root");
  const checkoutRoot = assertNormalizedAbsolutePath(
    input.checkoutRoot,
    "Codex reviewer checkout root",
  );
  if (
    pathsOverlap(codexHome, runnerRoot) ||
    pathsOverlap(codexHome, checkoutRoot) ||
    pathsOverlap(runnerRoot, checkoutRoot)
  ) {
    configurationError(
      "Codex home, runner root, and checkout root must be separate, non-nested directories.",
    );
  }
  ensurePrivateDirectory(runnerRoot);
  ensurePrivateDirectory(checkoutRoot);

  const outputSchemaPath = assertNormalizedAbsolutePath(
    input.outputSchemaPath,
    "Codex review output schema",
  );
  const schemaBytes = readFileSync(outputSchemaPath);
  if (!schemaBytes.equals(Buffer.from(serializeCodexReviewReportedResultJsonSchemaV1(), "utf8"))) {
    configurationError("Codex review output schema is not the exact adapter-owned schema.");
  }

  if (
    input.environmentAllowlist.length > CODEX_SAFE_AGENT_ENVIRONMENT_NAMES.length ||
    new Set(input.environmentAllowlist).size !== input.environmentAllowlist.length
  ) {
    configurationError("Codex reviewer environment allowlist must be unique and bounded.");
  }
  const safeEnvironmentNames = new Set<string>(CODEX_SAFE_AGENT_ENVIRONMENT_NAMES);
  const environmentAllowlist = [...input.environmentAllowlist].sort();
  for (const name of environmentAllowlist) {
    if (!safeEnvironmentNames.has(name)) {
      configurationError(`Codex reviewer environment name is not adapter-owned and safe: ${name}`);
    }
  }
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.environment).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    if (!environmentAllowlist.includes(name)) {
      configurationError(
        `Codex reviewer environment contains a value outside its exact allowlist: ${name}`,
      );
    }
    if (
      Buffer.byteLength(value, "utf8") > 32_768 ||
      value.includes("\0") ||
      value.includes("\r") ||
      value.includes("\n")
    ) {
      configurationError(`Codex reviewer environment value must be a bounded single line: ${name}`);
    }
    environment[name] = value;
  }

  // Trusted system plumbing tools (not the pinned Codex executable): follow
  // symlinks the same way GitWorkspaceManager's constructor does, since
  // stock macOS ships /usr/bin/tar as a symlink to bsdtar. Both paths are
  // root-owned, SIP-protected system locations, not attacker-influenced.
  const gitExecutable = assertNormalizedAbsolutePath(
    input.gitExecutable ?? "/usr/bin/git",
    "Git executable",
  );
  if (!statSync(gitExecutable).isFile())
    configurationError("Git executable must be a regular file.");
  const tarExecutable = assertNormalizedAbsolutePath(
    input.tarExecutable ?? "/usr/bin/tar",
    "Tar executable",
  );
  if (!statSync(tarExecutable).isFile())
    configurationError("Tar executable must be a regular file.");

  const permissionProfileName =
    input.permissionProfileName === undefined
      ? undefined
      : (() => {
          const value = portableIdentifier(
            input.permissionProfileName,
            "Codex reviewer permission profile",
            100,
          );
          if (!/^[a-z][a-z0-9_]*$/u.test(value)) {
            configurationError(
              "Codex reviewer permission profile must use its safe lowercase format.",
            );
          }
          return value;
        })();

  const limitsInput = input.limits ?? {};
  return {
    executable,
    executableDigest,
    expectedCliVersion,
    model,
    codexHome,
    runnerRoot,
    checkoutRoot,
    outputSchemaPath,
    environmentAllowlist,
    environment,
    gitExecutable,
    tarExecutable,
    permissionProfileName,
    registrationTimeoutMs: boundedInteger(
      input.registrationTimeoutMs,
      DEFAULT_REGISTRATION_TIMEOUT_MS,
      "registrationTimeoutMs",
      1,
      60_000,
    ),
    pollMs: boundedInteger(input.pollMs, DEFAULT_POLL_MS, "pollMs", 1, 1_000),
    maxCandidateBytes: boundedInteger(
      input.maxCandidateBytes,
      DEFAULT_MAX_CANDIDATE_BYTES,
      "maxCandidateBytes",
      1,
      1024 * 1024 * 1024,
    ),
    maxEvidenceItemBytes: boundedInteger(
      input.maxEvidenceItemBytes,
      DEFAULT_MAX_EVIDENCE_ITEM_BYTES,
      "maxEvidenceItemBytes",
      1,
      256 * 1024 * 1024,
    ),
    maxEvidenceTotalBytes: boundedInteger(
      input.maxEvidenceTotalBytes,
      DEFAULT_MAX_EVIDENCE_TOTAL_BYTES,
      "maxEvidenceTotalBytes",
      1,
      1024 * 1024 * 1024,
    ),
    limits: {
      timeoutMs: boundedInteger(
        limitsInput.timeoutMs,
        DEFAULT_TIMEOUT_MS,
        "limits.timeoutMs",
        1_000,
        3_600_000,
      ),
      terminationGraceMs: boundedInteger(
        limitsInput.terminationGraceMs,
        DEFAULT_TERMINATION_GRACE_MS,
        "limits.terminationGraceMs",
        100,
        60_000,
      ),
      maxOutputBytes: boundedInteger(
        limitsInput.maxOutputBytes,
        DEFAULT_MAX_OUTPUT_BYTES,
        "limits.maxOutputBytes",
        1,
        DEFAULT_CODEX_REVIEW_PROTOCOL_LIMITS.maxStdoutBytes,
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/** Maps a supplied evidence digest to its raw bytes. In production this is
 * backed by the daemon's content-addressed evidence store; the returned
 * bytes are re-hashed and checked against `digest` before use, so a buggy or
 * malicious implementation of this port cannot smuggle unrequested content
 * past the digest binding. */
export type EvidenceReader = (digest: Sha256Digest) => Uint8Array;

export type CodexIndependentReviewerPorts = Readonly<{
  /** The project's sealed, immutable Factory mirror. Only `mirrorPath` is
   * read; accepting the full `FactoryMirror` type keeps this wired the same
   * way `swift-greeter-fixture-execution.ts` wires the fixture reviewer. */
  mirror: Pick<FactoryMirror, "mirrorPath">;
  readEvidence: EvidenceReader;
}>;

type ReviewerSupervisorPort = Readonly<{
  open(rootDirectory: string, runKey: string): PreparedSupervisedRun | null;
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

export type CodexIndependentReviewerDependencies = Readonly<{
  preflight?: (options: PreflightCodexOptions) => Promise<CodexPreflightResult>;
  supervisor?: Partial<ReviewerSupervisorPort>;
  monotonicNow?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

const DEFAULT_SUPERVISOR: ReviewerSupervisorPort = {
  open: openPreparedSupervisedRun,
  prepare: prepareSupervisedRun,
  launch: launchPreparedSupervisedRun,
  waitForRegistration: async (prepared, registration, options) =>
    await waitForSupervisedRunRegistration(prepared, registration, options),
  reconcile: reconcileSupervisedRun,
  terminate: async (prepared) => await requestSupervisedRunTermination(prepared),
};

function sameIntentExceptCreatedAt(
  left: ReturnType<typeof createSupervisedRunIntent>,
  right: ReturnType<typeof createSupervisedRunIntent>,
): boolean {
  const withoutCreatedAt = (value: ReturnType<typeof createSupervisedRunIntent>): unknown =>
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== "createdAt"));
  return JSON.stringify(withoutCreatedAt(left)) === JSON.stringify(withoutCreatedAt(right));
}

function strictUtf8(bytes: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

export class CodexIndependentReviewer {
  public readonly reviewerId = CODEX_REVIEW_ADAPTER_ID;
  public readonly reviewerVersion = CODEX_REVIEW_ADAPTER_VERSION;
  /** The exact pinned Codex CLI version this instance preflighted against,
   * exposed for operator observability/audit logging. */
  public readonly cliVersion: string;
  readonly #configuration: ValidatedReviewerConfiguration;
  readonly #ports: CodexIndependentReviewerPorts;
  readonly #supervisor: ReviewerSupervisorPort;
  readonly #monotonicNow: () => number;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  public static async create(
    config: CodexIndependentReviewerConfigurationV1,
    ports: CodexIndependentReviewerPorts,
    dependencies: CodexIndependentReviewerDependencies = {},
  ): Promise<CodexIndependentReviewer> {
    const configuration = validateReviewerConfiguration(config);
    const preflight = dependencies.preflight ?? preflightCodex;
    const result = await preflight({
      executable: configuration.executable,
      cwd: configuration.runnerRoot,
      environment: {
        CODEX_HOME: configuration.codexHome,
        NO_COLOR: "1",
        RUST_LOG: "error",
        TERM: "dumb",
      },
      supportedVersions: [configuration.expectedCliVersion],
    });
    if (!result.ready) {
      configurationError(`Codex reviewer preflight failed (${result.reason}): ${result.summary}`);
    }
    if (
      result.version !== configuration.expectedCliVersion ||
      result.executable !== configuration.executable
    ) {
      configurationError(
        "Codex reviewer preflight returned a different executable or CLI version than configured.",
      );
    }
    return new CodexIndependentReviewer(configuration, ports, result.version, dependencies);
  }

  private constructor(
    configuration: ValidatedReviewerConfiguration,
    ports: CodexIndependentReviewerPorts,
    cliVersion: string,
    dependencies: CodexIndependentReviewerDependencies,
  ) {
    this.#configuration = configuration;
    this.#ports = ports;
    this.cliVersion = cliVersion;
    this.#supervisor = { ...DEFAULT_SUPERVISOR, ...dependencies.supervisor };
    this.#monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
    this.#sleep =
      dependencies.sleep ??
      (async (milliseconds) =>
        await new Promise<void>((resolvePromise) => {
          setTimeout(resolvePromise, milliseconds);
        }));
  }

  /** Binds this reviewer to one attempt's reviewer run identity, mirroring
   * the `reviewerForRun(reviewerRunId)` factory shape every project's
   * `VerifiedLocalExecutionConfiguration` supplies (see
   * apps/daemon/src/swift-greeter-fixture-execution.ts's
   * `exactGreeterReviewer`). */
  public reviewerForRun(reviewerRunId: RunId): IndependentReviewAdapter {
    const boundReviewerRunId = RunIdSchema.parse(reviewerRunId);
    return {
      reviewerId: this.reviewerId,
      reviewerVersion: this.reviewerVersion,
      reviewerRunId: boundReviewerRunId,
      capabilities: REVIEW_CAPABILITIES,
      review: async ({ reviewInputDigest, input }) =>
        await this.#review(boundReviewerRunId, reviewInputDigest, input),
    };
  }

  async #review(
    reviewerRunId: RunId,
    reviewInputDigest: Sha256Digest,
    input: IndependentReviewInput,
  ): Promise<ReviewReportV1> {
    // Defense in depth: `runIndependentReview` (packages/independent-review)
    // and `coordinateVerifiedLocalCommit` (packages/execution-engine) both
    // already refuse self-review and identity mismatches before this method
    // can be reached. Re-check anyway rather than trust the caller.
    if (RunIdSchema.parse(input.reviewerRunId) !== reviewerRunId) {
      reviewerError("Review input reviewer identity does not match this bound reviewer run.");
    }
    if (input.implementingRunId === reviewerRunId) {
      reviewerError("Refusing to let a run review itself.");
    }
    if (
      digestExecutableFile(this.#configuration.executable, MAX_EXECUTABLE_BYTES) !==
      this.#configuration.executableDigest
    ) {
      reviewerError("Codex executable changed after its successful preflight.");
    }
    AttemptIdSchema.parse(input.attemptId);

    const availableEvidence = new Set(input.rawEvidenceDigests);
    const runKey = `review-${reviewInputDigest.slice("sha256:".length, "sha256:".length + 32)}`;
    const workspaceRoot = join(this.#configuration.checkoutRoot, runKey);

    let preDigest: Sha256Digest;
    let evidenceItems: readonly EvidenceManifestItemV1[];
    try {
      cleanupReviewWorkspace(workspaceRoot);
      materializeCandidateCheckout(
        this.#configuration.gitExecutable,
        this.#configuration.tarExecutable,
        this.#ports.mirror.mirrorPath,
        input.candidateTree,
        join(workspaceRoot, "candidate"),
        this.#configuration.maxCandidateBytes,
      );
      evidenceItems = materializeEvidence(
        join(workspaceRoot, "evidence"),
        input.rawEvidenceDigests,
        this.#ports.readEvidence,
        {
          maxItemBytes: this.#configuration.maxEvidenceItemBytes,
          maxTotalBytes: this.#configuration.maxEvidenceTotalBytes,
        },
      );
      lockReadOnlyRecursive(workspaceRoot);
      preDigest = digestDirectoryTree(workspaceRoot);
    } catch (error) {
      cleanupReviewWorkspace(workspaceRoot);
      throw error;
    }

    try {
      const instruction = buildReviewInstruction({
        taskSpec: input.taskSpec,
        candidateTree: input.candidateTree,
        diffDigest: input.diffDigest,
        evidence: evidenceItems,
      });
      const invocation = buildCodexReviewInvocation({
        executable: this.#configuration.executable,
        model: this.#configuration.model,
        codexHome: this.#configuration.codexHome,
        outputSchemaPath: this.#configuration.outputSchemaPath,
        workingDirectory: workspaceRoot,
        instruction,
        environmentAllowlist: this.#configuration.environmentAllowlist,
        sourceEnvironment: this.#configuration.environment,
        ...(this.#configuration.permissionProfileName === undefined
          ? {}
          : { permissionProfileName: this.#configuration.permissionProfileName }),
      });

      const { prepared, receipt } = await this.#runSupervised(runKey, input.attemptId, invocation);
      const stdout = this.#readBoundOutput(
        prepared.paths.stdoutPath,
        receipt.stdout,
        "Codex reviewer stdout",
      );
      const stderr = this.#readBoundOutput(
        prepared.paths.stderrPath,
        receipt.stderr,
        "Codex reviewer stderr",
      );

      // Authoritative write-attempt detection: independent of anything Codex
      // reported about itself, the checkout must be byte-for-byte identical
      // to what was handed to it. This check runs before the transcript is
      // even classified.
      const postDigest = digestDirectoryTree(workspaceRoot);
      if (postDigest !== preDigest) {
        reviewerError(
          "Detected a write to the read-only reviewer checkout; failing the review closed.",
        );
      }

      const stdoutText = strictUtf8(stdout);
      const stderrText = strictUtf8(stderr);
      if (stdoutText === null || stderrText === null) {
        reviewerError("Codex reviewer emitted output that was not valid UTF-8.");
      }
      const capture: CodexProcessCapture = {
        exitCode: receipt.process.exitCode,
        signal: receipt.process.signal as NodeJS.Signals | null,
        terminationOrigin:
          receipt.terminationOrigin === "timeout"
            ? "timed-out"
            : receipt.terminationOrigin === "output-overflow"
              ? "output-overflow"
              : receipt.terminationOrigin === "cancellation"
                ? "cancelled"
                : "none",
        stdout: stdoutText,
        stderr: stderrText,
        stdoutTruncated: receipt.stdout.truncated,
        stderrTruncated: receipt.stderr.truncated,
      };
      if (capture.stdoutTruncated || capture.stderrTruncated) {
        reviewerError("Codex reviewer output exceeded its configured capture limit.");
      }

      const classification = classifyCodexReviewProcess(
        capture,
        reviewInputDigest,
        availableEvidence,
        {
          maxStdoutBytes: this.#configuration.limits.maxOutputBytes,
          maxLineBytes: DEFAULT_CODEX_REVIEW_PROTOCOL_LIMITS.maxLineBytes,
          maxEventCount: DEFAULT_CODEX_REVIEW_PROTOCOL_LIMITS.maxEventCount,
        },
      );
      if (classification.kind !== "process-completed") {
        reviewerError(
          `Codex reviewer did not complete cleanly (${classification.kind}): ${classification.reason}`,
        );
      }

      return ReviewReportV1Schema.parse({
        schemaVersion: 1,
        reviewerId: this.reviewerId,
        reviewerVersion: this.reviewerVersion,
        reviewInputDigest,
        verdict: classification.reported.verdict,
        findings: classification.reported.findings,
      });
    } finally {
      cleanupReviewWorkspace(workspaceRoot);
    }
  }

  /** Reads back exactly what the supervisor captured, verified against the
   * receipt's own recorded digest and length (mirrors `safeReadBoundOutput`
   * in apps/daemon/src/codex-local-agent.ts). A mismatch means the on-disk
   * artifact and the durable receipt disagree, which is always a fail-closed
   * condition -- never a value to silently prefer one side of. */
  #readBoundOutput(
    path: string,
    expected: SupervisedRunReceiptV1["stdout"] | SupervisedRunReceiptV1["stderr"],
    label: string,
  ): Buffer {
    if (expected.capturedByteLength > this.#configuration.limits.maxOutputBytes) {
      reviewerError(`${label} exceeds the reviewer's configured output limit.`);
    }
    const bytes = readFileSync(path);
    if (
      bytes.byteLength !== expected.capturedByteLength ||
      sha256Digest(bytes) !== expected.sha256
    ) {
      reviewerError(`${label} does not match its verified supervisor receipt.`);
    }
    return bytes;
  }

  async #runSupervised(
    runKey: string,
    attemptId: string,
    invocation: CodexInvocation,
  ): Promise<Readonly<{ prepared: PreparedSupervisedRun; receipt: SupervisedRunReceiptV1 }>> {
    const createdAt = new Date().toISOString();
    const intentInput: CreateSupervisedRunIntentInput = {
      runKey,
      attemptId,
      fence: 0,
      createdAt,
      executable: invocation.executable,
      argv: invocation.args,
      cwd: invocation.cwd,
      environment: invocation.environment,
      stdin: Buffer.from(invocation.stdin, "utf8"),
      limits: {
        timeoutMs: this.#configuration.limits.timeoutMs,
        graceMs: this.#configuration.limits.terminationGraceMs,
        forceWaitMs: Math.min(60_000, Math.max(100, this.#configuration.limits.terminationGraceMs)),
        pollMs: this.#configuration.pollMs,
        maxOutputBytesPerStream: this.#configuration.limits.maxOutputBytes,
      },
    };

    let prepared: PreparedSupervisedRun;
    const existing = this.#supervisor.open(this.#configuration.runnerRoot, runKey);
    if (existing === null) {
      prepared = this.#supervisor.prepare(this.#configuration.runnerRoot, intentInput);
    } else {
      const proposed = createSupervisedRunIntent(intentInput);
      if (!sameIntentExceptCreatedAt(existing.intent, proposed)) {
        reviewerError(
          "A durable Codex reviewer run already exists for this review input with different inputs.",
        );
      }
      prepared = existing;
    }

    const launched = this.#supervisor.launch(prepared);
    if (launched.outcome === "blocked")
      reviewerError(`Codex reviewer launch is ambiguous: ${launched.reason}`);
    if (launched.outcome === "already-terminal") return { prepared, receipt: launched.receipt };

    if (launched.outcome === "launch-requested") {
      const registered = await this.#supervisor.waitForRegistration(
        prepared,
        launched.registration,
        {
          timeoutMs: this.#configuration.registrationTimeoutMs,
          pollMs: this.#configuration.pollMs,
        },
      );
      if (registered.outcome === "blocked")
        reviewerError(`Codex reviewer registration is ambiguous: ${registered.reason}`);
      if (registered.outcome === "terminal") return { prepared, receipt: registered.receipt };
    }
    return { prepared, receipt: await this.#waitForTerminal(prepared) };
  }

  async #waitForTerminal(prepared: PreparedSupervisedRun): Promise<SupervisedRunReceiptV1> {
    const deadline =
      this.#monotonicNow() +
      this.#configuration.limits.timeoutMs +
      this.#configuration.limits.terminationGraceMs * 2 +
      10_000;
    while (this.#monotonicNow() <= deadline) {
      const reconciled = this.#supervisor.reconcile(prepared);
      if (reconciled.outcome === "terminal") return reconciled.receipt;
      if (reconciled.outcome === "blocked") {
        if (
          reconciled.reason ===
            "terminal-receipt-exists-but-controller-process-group-is-still-live" ||
          reconciled.reason === "terminal-receipt-exists-but-target-process-group-is-still-live" ||
          reconciled.reason === "target-exited-without-terminal-receipt"
        ) {
          await this.#sleep(this.#configuration.pollMs);
          continue;
        }
        reviewerError(`Codex reviewer run is ambiguous: ${reconciled.reason}`);
      }
      if (reconciled.outcome === "prepared") {
        reviewerError("Codex reviewer launch disappeared after being requested.");
      }
      await this.#sleep(this.#configuration.pollMs);
    }
    reviewerError("Codex reviewer run did not reach a terminal receipt before its deadline.");
  }
}

export async function createCodexIndependentReviewer(
  config: CodexIndependentReviewerConfigurationV1,
  ports: CodexIndependentReviewerPorts,
  dependencies: CodexIndependentReviewerDependencies = {},
): Promise<CodexIndependentReviewer> {
  return await CodexIndependentReviewer.create(config, ports, dependencies);
}
