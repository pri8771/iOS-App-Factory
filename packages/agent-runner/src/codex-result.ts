import { createHash } from "node:crypto";

import {
  AgentEventV1Schema,
  AgentRunResultV1Schema,
  AgentRunSpecV1Schema,
  BlockerV1Schema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  Sha256DigestSchema,
  type AgentEventV1,
  type AgentRunResultV1,
  type AgentRunSpecV1,
  type AgentRunStatusV1,
  type AgentUsageV1,
  type BlockerV1,
  type CapturedOutputV1,
  type FailureV1,
} from "@app-factory/contracts";

import {
  DEFAULT_CODEX_PROTOCOL_LIMITS,
  VERIFIED_CODEX_CLI_VERSIONS,
  classifyCodexProcess,
  type CodexProcessCapture,
  type CodexProcessClassification,
  type CodexReportedResultV1,
} from "./codex.js";

export const CODEX_AGENT_ADAPTER_ID = "openai.codex";
export const CODEX_AGENT_ADAPTER_VERSION = "1.0.0";

const MAX_IDENTITY_COMPONENT_LENGTH = 100;
const MAX_FAILURE_SUMMARY_LENGTH = 1_000;
const PORTABLE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export type CodexAdapterIdentityV1 = Readonly<{
  adapterId: string;
  adapterVersion: string;
  codexCliVersion: string;
}>;

export type MaterializeCodexRunInputV1 = Readonly<{
  spec: AgentRunSpecV1;
  identity: CodexAdapterIdentityV1;
  capture: CodexProcessCapture;
  startedAt: string;
  finishedAt: string;
}>;

export type MaterializedCodexRunV1 = Readonly<{
  result: AgentRunResultV1;
  events: readonly AgentEventV1[];
}>;

type NormalizedIdentity = Readonly<{
  adapterId: string;
  adapterVersion: string;
  codexCliVersion: string;
}>;

type Outcome = Readonly<{
  status: AgentRunStatusV1;
  failure: FailureV1 | null;
  blocker: BlockerV1 | null;
  summary: string;
}>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new TypeError("Canonical JSON cannot encode non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((child) => canonicalJson(child)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
}

function sha256(contents: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(contents, "utf8").digest("hex")}`;
}

function deterministicEventId(value: unknown): string {
  const digest = createHash("sha256")
    .update("app-factory.codex-agent-event.v1\0", "utf8")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function boundedSummary(value: string, fallback: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) return fallback;
  return normalized.slice(0, MAX_FAILURE_SUMMARY_LENGTH);
}

function failure(code: string, summary: string, retryable: boolean): FailureV1 {
  return {
    code: NamespacedCodeSchema.parse(code),
    summary: boundedSummary(summary, "Codex execution failed"),
    retryable,
    detailArtifactDigest: null,
  };
}

function capturedOutput(contents: string): CapturedOutputV1 {
  return {
    digest: Sha256DigestSchema.parse(sha256(contents)),
    byteLength: Buffer.byteLength(contents, "utf8"),
    truncated: false,
  };
}

function parsePortableVersion(value: string, label: string): string {
  if (
    value.length < 1 ||
    value.length > MAX_IDENTITY_COMPONENT_LENGTH ||
    value.trim() !== value ||
    !PORTABLE_VERSION_PATTERN.test(value)
  ) {
    throw new TypeError(`${label} must be a bounded portable version`);
  }
  return value;
}

function normalizeIdentity(identity: CodexAdapterIdentityV1): NormalizedIdentity {
  return {
    adapterId: NamespacedCodeSchema.parse(identity.adapterId),
    adapterVersion: parsePortableVersion(identity.adapterVersion, "Codex adapter version"),
    codexCliVersion: parsePortableVersion(identity.codexCliVersion, "Codex CLI version"),
  };
}

function normalizeCapture(capture: CodexProcessCapture): CodexProcessCapture {
  if (
    capture.exitCode !== null &&
    (!Number.isSafeInteger(capture.exitCode) || capture.exitCode < 0 || capture.exitCode > 255)
  ) {
    throw new TypeError("Codex exit code must be null or an integer from 0 through 255");
  }
  if (capture.signal !== null && !/^SIG[A-Z0-9]+$/.test(capture.signal)) {
    throw new TypeError("Codex signal must be null or a portable signal name");
  }
  if (
    capture.terminationOrigin !== "none" &&
    capture.terminationOrigin !== "cancelled" &&
    capture.terminationOrigin !== "timed-out"
  ) {
    throw new TypeError("Codex termination origin is invalid");
  }
  if (typeof capture.stdout !== "string" || typeof capture.stderr !== "string") {
    throw new TypeError("Codex stdout and stderr must be strings");
  }
  return capture;
}

function parseInstant(
  value: string,
  label: string,
): Readonly<{ instant: string; milliseconds: number }> {
  const instant = IsoInstantSchema.parse(value);
  const milliseconds = Date.parse(instant);
  if (!Number.isFinite(milliseconds)) throw new TypeError(`${label} must be a finite ISO instant`);
  return { instant, milliseconds };
}

function isSameOrDescendant(path: string, authorizedScope: string): boolean {
  return path === authorizedScope || path.startsWith(`${authorizedScope}/`);
}

function findUnauthorizedChangedPath(
  reported: CodexReportedResultV1,
  authorizedWritePaths: readonly string[],
): string | null {
  for (const changedPath of reported.changedPaths) {
    if (!authorizedWritePaths.some((scope) => isSameOrDescendant(changedPath, scope))) {
      return changedPath;
    }
  }
  return null;
}

function parseUsageFromCompletedTurn(stdout: string): AgentUsageV1 | null {
  const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return null;

  let terminal: unknown;
  try {
    terminal = JSON.parse(lines.at(-1) ?? "") as unknown;
  } catch {
    return null;
  }
  if (terminal === null || typeof terminal !== "object" || Array.isArray(terminal)) return null;
  const terminalRecord = terminal as Readonly<Record<string, unknown>>;
  if (terminalRecord.type !== "turn.completed") return null;
  const usage = terminalRecord.usage;
  if (usage === null || typeof usage !== "object" || Array.isArray(usage)) return null;
  const usageRecord = usage as Readonly<Record<string, unknown>>;
  const keys = ["input_tokens", "output_tokens", "cached_input_tokens"] as const;
  if (!keys.some((key) => Object.hasOwn(usageRecord, key))) return null;

  const parsed: Record<(typeof keys)[number], number | null> = {
    input_tokens: null,
    output_tokens: null,
    cached_input_tokens: null,
  };
  for (const key of keys) {
    const value = usageRecord[key];
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || (value as number) < 0) return null;
    parsed[key] = value as number;
  }
  return {
    inputTokens: parsed.input_tokens,
    outputTokens: parsed.output_tokens,
    cachedInputTokens: parsed.cached_input_tokens,
  };
}

function countTurnStarts(stdout: string): number | null {
  let count = 0;
  for (const line of stdout.split(/\r?\n/).filter((candidate) => candidate.length > 0)) {
    let event: unknown;
    try {
      event = JSON.parse(line) as unknown;
    } catch {
      return null;
    }
    if (
      event !== null &&
      typeof event === "object" &&
      !Array.isArray(event) &&
      (event as Readonly<Record<string, unknown>>).type === "turn.started"
    ) {
      count += 1;
    }
  }
  return count;
}

function identityFailure(spec: AgentRunSpecV1, identity: NormalizedIdentity): Outcome | null {
  if (
    spec.adapterId !== CODEX_AGENT_ADAPTER_ID ||
    identity.adapterId !== spec.adapterId ||
    identity.adapterVersion !== CODEX_AGENT_ADAPTER_VERSION ||
    !VERIFIED_CODEX_CLI_VERSIONS.includes(
      identity.codexCliVersion as (typeof VERIFIED_CODEX_CLI_VERSIONS)[number],
    )
  ) {
    return {
      status: "failed",
      failure: failure(
        "agent.identity-mismatch",
        "Codex adapter or CLI identity does not match the verified execution profile",
        false,
      ),
      blocker: null,
      summary: "Codex identity validation failed",
    };
  }
  return null;
}

function outcomeFromClassification(
  classification: CodexProcessClassification,
  spec: AgentRunSpecV1,
): Outcome {
  if (classification.kind === "process-completed") {
    const unauthorizedPath = findUnauthorizedChangedPath(
      classification.reported,
      spec.authorizedWritePaths,
    );
    if (unauthorizedPath !== null) {
      return {
        status: "failed",
        failure: failure(
          "agent.write-scope-violation",
          `Codex reported a changed path outside its authorized write scopes: ${unauthorizedPath}`,
          false,
        ),
        blocker: null,
        summary: "Codex reported an unauthorized changed path",
      };
    }

    if (classification.reported.reportedDisposition === "finished") {
      return {
        status: "succeeded",
        failure: null,
        blocker: null,
        summary: "Codex reported process completion; trusted verification is still required",
      };
    }
    if (classification.reported.reportedDisposition === "blocked") {
      return {
        status: "blocked",
        failure: null,
        blocker: BlockerV1Schema.parse(classification.reported.blocker),
        summary: "Codex reported a structured blocker",
      };
    }
    return {
      status: "failed",
      failure: failure("agent.reported-failure", classification.reported.summary, false),
      blocker: null,
      summary: "Codex reported that it could not complete the requested work",
    };
  }

  if (classification.kind === "blocked-auth") {
    return {
      status: "blocked",
      failure: null,
      blocker: {
        kind: "authentication",
        code: NamespacedCodeSchema.parse("agent.authentication-required"),
        summary: boundedSummary(classification.reason, "Codex authentication is required"),
        requiredAction: "Configure saved Codex authentication, then retry the attempt.",
      },
      summary: "Codex authentication blocked execution",
    };
  }
  if (classification.kind === "cancelled") {
    return {
      status: "cancelled",
      failure: failure("agent.cancelled", classification.reason, false),
      blocker: null,
      summary: "Factory cancellation ended Codex execution",
    };
  }
  if (classification.kind === "timed-out") {
    return {
      status: "timed-out",
      failure: failure("agent.timed-out", classification.reason, true),
      blocker: null,
      summary: "Codex execution reached its Factory deadline",
    };
  }
  if (classification.kind === "protocol-error") {
    return {
      status: "failed",
      failure: failure("agent.protocol-error", classification.reason, false),
      blocker: null,
      summary: "Codex emitted an invalid or incomplete protocol transcript",
    };
  }
  return {
    status: "failed",
    failure: failure("agent.process-failed", classification.reason, true),
    blocker: null,
    summary: "Codex process execution failed",
  };
}

function buildEvents(
  spec: AgentRunSpecV1,
  identity: NormalizedIdentity,
  outcome: Outcome,
  startedAt: string,
  finishedAt: string,
  stdout: CapturedOutputV1,
  stderr: CapturedOutputV1,
): readonly AgentEventV1[] {
  type EventWithoutId = Omit<AgentEventV1, "eventId">;
  const started: EventWithoutId = {
    schemaVersion: 1,
    runId: spec.runId,
    attemptId: spec.attemptId,
    stepId: spec.stepId,
    fence: spec.fence,
    sequence: 1,
    occurredAt: IsoInstantSchema.parse(startedAt),
    type: "agent.started",
    data: { adapterId: NamespacedCodeSchema.parse(identity.adapterId) },
  };
  const identityProgress: EventWithoutId = {
    ...started,
    sequence: 2,
    type: "agent.progress",
    data: {
      phase: NamespacedCodeSchema.parse("codex.identity-verified"),
      level: "debug",
      message: `Using ${identity.adapterId}@${identity.adapterVersion} with Codex CLI ${identity.codexCliVersion}`,
    },
  };
  const outcomeProgress: EventWithoutId = {
    ...started,
    sequence: 3,
    occurredAt: IsoInstantSchema.parse(finishedAt),
    type: "agent.progress",
    data: {
      phase: NamespacedCodeSchema.parse(`codex.${outcome.status}`),
      level: outcome.status === "failed" || outcome.status === "timed-out" ? "warning" : "info",
      message: outcome.summary,
    },
  };
  const blocked: EventWithoutId | null =
    outcome.blocker === null
      ? null
      : {
          ...started,
          sequence: 4,
          occurredAt: IsoInstantSchema.parse(finishedAt),
          type: "agent.blocked",
          data: { blocker: outcome.blocker },
        };
  const finished: EventWithoutId = {
    ...started,
    sequence: 5,
    occurredAt: IsoInstantSchema.parse(finishedAt),
    type: "agent.finished",
    data: { status: outcome.status },
  };

  const optionalEvents =
    blocked === null
      ? [identityProgress, outcomeProgress]
      : [identityProgress, outcomeProgress, blocked];
  const selected: EventWithoutId[] = [];
  if (spec.limits.maxEventCount === 1) {
    selected.push(finished);
  } else {
    selected.push(started);
    const availableIntermediateSlots = Math.max(0, spec.limits.maxEventCount - 2);
    if (availableIntermediateSlots > 0) {
      selected.push(...optionalEvents.slice(-availableIntermediateSlots));
    }
    selected.push(finished);
  }

  const eventIdentity = {
    schemaVersion: 1,
    runId: spec.runId,
    attemptId: spec.attemptId,
    stepId: spec.stepId,
    fence: spec.fence,
    taskSpecDigest: spec.taskSpecDigest,
    adapter: identity,
    stdout,
    stderr,
  } as const;
  return selected.map((candidate, index) => {
    const eventWithoutId = { ...candidate, sequence: index + 1 } as EventWithoutId;
    return AgentEventV1Schema.parse({
      ...eventWithoutId,
      eventId: deterministicEventId({ eventIdentity, event: eventWithoutId }),
    });
  });
}

export function materializeCodexRunV1(
  untrustedInput: MaterializeCodexRunInputV1,
): MaterializedCodexRunV1 {
  const spec = AgentRunSpecV1Schema.parse(untrustedInput.spec);
  const identity = normalizeIdentity(untrustedInput.identity);
  const capture = normalizeCapture(untrustedInput.capture);
  const started = parseInstant(untrustedInput.startedAt, "startedAt");
  const finished = parseInstant(untrustedInput.finishedAt, "finishedAt");
  if (finished.milliseconds < started.milliseconds) {
    throw new TypeError("finishedAt must not precede startedAt");
  }

  const stdout = capturedOutput(capture.stdout);
  const stderr = capturedOutput(capture.stderr);
  let outcome = identityFailure(spec, identity);
  let classification: CodexProcessClassification | null = null;

  if (outcome === null && stderr.byteLength > spec.limits.maxStderrBytes) {
    outcome = {
      status: "failed",
      failure: failure(
        "agent.stderr-limit-exceeded",
        "Codex stderr exceeded its configured byte limit",
        false,
      ),
      blocker: null,
      summary: "Codex stderr exceeded its configured byte limit",
    };
  }
  if (
    outcome === null &&
    capture.terminationOrigin === "none" &&
    finished.milliseconds - started.milliseconds > spec.limits.timeoutMs
  ) {
    outcome = {
      status: "failed",
      failure: failure(
        "agent.deadline-invariant-violated",
        "Codex completed after its deadline without a timed-out termination origin",
        false,
      ),
      blocker: null,
      summary: "Codex process timing violated its execution binding",
    };
  }

  if (outcome === null) {
    classification = classifyCodexProcess(capture, {
      maxStdoutBytes: spec.limits.maxStdoutBytes,
      maxLineBytes: Math.min(
        DEFAULT_CODEX_PROTOCOL_LIMITS.maxLineBytes,
        Math.max(1, spec.limits.maxStdoutBytes),
      ),
      maxEventCount: spec.limits.maxEventCount,
    });
    const observedTurns = countTurnStarts(capture.stdout);
    outcome =
      classification.kind !== "cancelled" &&
      classification.kind !== "timed-out" &&
      observedTurns !== null &&
      observedTurns > spec.limits.maxTurns
        ? {
            status: "failed",
            failure: failure(
              "agent.turn-limit-exceeded",
              "Codex exceeded its configured turn limit",
              false,
            ),
            blocker: null,
            summary: "Codex exceeded its configured turn limit",
          }
        : outcomeFromClassification(classification, spec);
  }

  const events = buildEvents(
    spec,
    identity,
    outcome,
    started.instant,
    finished.instant,
    stdout,
    stderr,
  );
  const usage =
    classification?.kind === "process-completed"
      ? parseUsageFromCompletedTurn(capture.stdout)
      : null;
  const envelope = {
    schemaVersion: 1,
    runId: spec.runId,
    attemptId: spec.attemptId,
    stepId: spec.stepId,
    fence: spec.fence,
    startedAt: started.instant,
    finishedAt: finished.instant,
    finalEventSequence: events.length,
    stdout,
    stderr,
    usage,
    process: { exitCode: capture.exitCode, signal: capture.signal },
    status: outcome.status,
    failure: outcome.failure,
    blocker: outcome.blocker,
  };
  return {
    result: AgentRunResultV1Schema.parse(envelope),
    events,
  };
}
