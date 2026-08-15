import { isAbsolute, relative, resolve, sep } from "node:path";
import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";

import {
  AgentEventV1Schema,
  AgentRunResultV1Schema,
  AgentRunSpecV1Schema,
  GitObjectIdSchema,
  NamespacedCodeSchema,
  RelativePathSchema,
  Sha256DigestSchema,
  type AgentEventV1,
  type AgentRunResultV1,
  type AgentRunSpecV1,
  type Sha256Digest,
} from "@app-factory/contracts";
import {
  OciRunner,
  OciRunnerBusyError,
  OciRunnerError,
  MAX_OCI_OUTPUT_BYTES,
  digestOciRunIntent,
  openPreparedOciRun,
  parseOciRunIntent,
  prepareOciRun,
  readOciEvidenceClosure,
  readOciLifecycleDisposition,
  sha256Digest,
  type OciEnginePort,
  type OciEvidenceClosureV1,
  type OciImageIdentityV1,
  type OciLifecycleDispositionV1,
  type OciRunIntentV1,
  type OciRunLimitsV1,
  type OciRunReceiptV1,
  type OciRunnerEffectGuards,
  type PreparedOciRun,
  type ReconcileOciRunResult,
} from "@app-factory/oci-runner";

import type {
  LocalAgentAdapter,
  LocalAgentRunContext,
  LocalAgentRunOutcome,
  LocalOciAgentProtocolEvidenceV1,
  TrustedOciAgentIdentityV1,
} from "./verified-local-executor.js";

export const OCI_LOCAL_AGENT_ADAPTER_ID = "app-factory.oci-local-agent" as const;
export const OCI_LOCAL_AGENT_ADAPTER_VERSION = "1.0.0" as const;

const DEFAULT_POLL_MS = 25;
const MAX_POLL_MS = 5_000;
const MAX_SUMMARY_LENGTH = 1_000;

/**
 * OS-generated metadata entries (from Finder, Spotlight, or volume
 * bookkeeping) that a fail-closed directory scan must tolerate rather than
 * reject. This denylist is intentionally narrow and exact: a single Finder
 * visit must not permanently brick OCI startup recovery. Any entry that
 * does not match must still fail closed — do not broaden this to "ignore
 * anything unrecognized".
 */
const IGNORABLE_OS_METADATA_ENTRIES = new Set([
  ".DS_Store",
  ".Spotlight-V100",
  ".Trashes",
  ".fseventsd",
]);

function isIgnorableOsMetadataEntry(name: string): boolean {
  return IGNORABLE_OS_METADATA_ENTRIES.has(name) || name.startsWith("._");
}

export type OciLocalAgentMaterializerInputV1 = Readonly<{
  spec: AgentRunSpecV1;
  receipt: OciRunReceiptV1;
  stdout: Uint8Array;
  stderr: Uint8Array;
  evidenceClosure: OciEvidenceClosureV1;
}>;

export type OciLocalAgentMaterializedRunV1 = Readonly<{
  result: AgentRunResultV1;
  events: readonly AgentEventV1[];
  summary: string;
  changedPaths: readonly string[];
}>;

export type OciLocalAgentProtocolMaterializer = (
  input: OciLocalAgentMaterializerInputV1,
) => OciLocalAgentMaterializedRunV1 | Promise<OciLocalAgentMaterializedRunV1>;

export type OciLocalAgentRunnerPort = Readonly<{
  reconcile(
    prepared: PreparedOciRun,
    guards: OciRunnerEffectGuards,
  ): Promise<ReconcileOciRunResult>;
  cancel(prepared: PreparedOciRun, guards: OciRunnerEffectGuards): Promise<ReconcileOciRunResult>;
}>;

export type OciLocalAgentConfigurationV1 = Readonly<{
  schemaVersion: 1;
  runnerRoot: string;
  engineIdentityDigest: Sha256Digest;
  image: OciImageIdentityV1;
  agentExecutable: string;
  agentArguments: readonly string[];
  environment: readonly Readonly<{ name: string; value: string }>[];
  resources: Readonly<
    Pick<OciRunLimitsV1, "cpuCount" | "memoryBytes" | "pidLimit" | "privateTmpfsBytes">
  >;
  protocolMaterializer: OciLocalAgentProtocolMaterializer;
  pollMs?: number;
}>;

export type OciLocalAgentDependencies = Readonly<{
  engine?: OciEnginePort;
  runner?: OciLocalAgentRunnerPort;
  runnerEngineIdentityDigest?: string;
  runnerFactory?: (engine: OciEnginePort) => OciLocalAgentRunnerPort;
  now?: () => Date;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

export type OciLocalAgentStartupEntryV1 = Readonly<{
  runKey: string;
  intent: OciRunIntentV1;
  disposition: OciLifecycleDispositionV1;
}>;

type ValidatedConfiguration = Readonly<{
  runnerRoot: string;
  engineIdentityDigest: Sha256Digest;
  image: OciImageIdentityV1;
  agentExecutable: string;
  agentArguments: readonly string[];
  environment: readonly Readonly<{ name: string; value: string }>[];
  resources: Readonly<
    Pick<OciRunLimitsV1, "cpuCount" | "memoryBytes" | "pidLimit" | "privateTmpfsBytes">
  >;
  protocolMaterializer: OciLocalAgentProtocolMaterializer;
  pollMs: number;
}>;

export class OciLocalAgentConfigurationError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OciLocalAgentConfigurationError";
  }
}

function configurationError(message: string, cause?: unknown): never {
  throw new OciLocalAgentConfigurationError(message, cause === undefined ? {} : { cause });
}

function normalizeAbsolutePath(value: string, label: string): string {
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    !isAbsolute(value) ||
    resolve(value) !== value
  ) {
    configurationError(`${label} must be a normalized absolute path.`);
  }
  return value;
}

function validateConfiguration(input: OciLocalAgentConfigurationV1): ValidatedConfiguration {
  if (input.schemaVersion !== 1) configurationError("OCI local-agent schema is unsupported.");
  const runnerRoot = normalizeAbsolutePath(input.runnerRoot, "runnerRoot");
  let engineIdentityDigest: Sha256Digest;
  try {
    engineIdentityDigest = Sha256DigestSchema.parse(input.engineIdentityDigest);
  } catch (error) {
    configurationError("engineIdentityDigest must be one SHA-256 digest.", error);
  }
  if (typeof input.protocolMaterializer !== "function") {
    configurationError("protocolMaterializer must be an injected deterministic function.");
  }
  const pollMs = input.pollMs ?? DEFAULT_POLL_MS;
  if (!Number.isSafeInteger(pollMs) || pollMs < 1 || pollMs > MAX_POLL_MS) {
    configurationError(`pollMs must be an integer from 1 through ${String(MAX_POLL_MS)}.`);
  }

  // Parse one inert placeholder intent at composition time so image, command,
  // environment, and resource identity are rejected before any engine call.
  let profile: OciRunIntentV1;
  try {
    profile = parseOciRunIntent({
      schemaVersion: 1,
      runKey: "oci-profile-validation",
      attemptId: "00000000-0000-4000-8000-000000000001",
      runId: "00000000-0000-4000-8000-000000000002",
      fence: 0,
      createdAt: "2000-01-01T00:00:00.000Z",
      taskSpecDigest: `sha256:${"0".repeat(64)}`,
      policyDigest: `sha256:${"1".repeat(64)}`,
      baseCommit: "2".repeat(40),
      baseTree: "3".repeat(40),
      containerName: "app-factory-oci-profile-validation",
      image: input.image,
      worktreeHostPath: "/app-factory-profile-worktree",
      worktreeContainerPath: "/workspace",
      privateTmpfsPath: "/run/app-factory",
      networkMode: "none",
      readOnlyRootFilesystem: true,
      agentExecutable: input.agentExecutable,
      agentArguments: input.agentArguments,
      environment: input.environment,
      limits: {
        ...input.resources,
        outputBytesPerStream: 1_024,
        wallTimeMs: 1_000,
        stopGraceMs: 100,
      },
    });
  } catch (error) {
    configurationError("OCI local-agent intent profile is invalid.", error);
  }

  return {
    runnerRoot,
    engineIdentityDigest,
    image: { ...profile.image },
    agentExecutable: profile.agentExecutable,
    agentArguments: [...profile.agentArguments],
    environment: profile.environment.map((entry) => ({ ...entry })),
    resources: {
      cpuCount: profile.limits.cpuCount,
      memoryBytes: profile.limits.memoryBytes,
      pidLimit: profile.limits.pidLimit,
      privateTmpfsBytes: profile.limits.privateTmpfsBytes,
    },
    protocolMaterializer: input.protocolMaterializer,
    pollMs,
  };
}

function pathsOverlap(left: string, right: string): boolean {
  const leftToRight = relative(left, right);
  const rightToLeft = relative(right, left);
  const within = (value: string): boolean =>
    value === "" || (!value.startsWith(`..${sep}`) && value !== "..");
  return within(leftToRight) || within(rightToLeft);
}

function failedOutcome(code: string, summary: string, retryable = false): LocalAgentRunOutcome {
  return {
    kind: "failed",
    failure: {
      code: NamespacedCodeSchema.parse(code),
      summary: summary.slice(0, MAX_SUMMARY_LENGTH),
      retryable,
      detailArtifactDigest: null,
    },
  };
}

function blockedOutcome(
  code: string,
  summary: string,
  requiredAction: string,
): LocalAgentRunOutcome {
  return {
    kind: "needs-input",
    blocker: {
      kind: "environment",
      code: NamespacedCodeSchema.parse(code),
      summary: summary.slice(0, MAX_SUMMARY_LENGTH),
      requiredAction,
    },
  };
}

/** Stable across scheduler leases so a later fence cannot create a second container. */
export function deriveOciLocalAgentRunKey(specInput: AgentRunSpecV1): string {
  const spec = AgentRunSpecV1Schema.parse(specInput);
  return runKeyForRunId(spec.runId);
}

function runKeyForRunId(runId: string): string {
  return `oci-${runId}`;
}

function containerNameFor(runKey: string): string {
  return `app-factory-${runKey}`;
}

function sameIntent(left: OciRunIntentV1, right: OciRunIntentV1): boolean {
  return digestOciRunIntent(left) === digestOciRunIntent(right);
}

function exactIntent(
  configuration: ValidatedConfiguration,
  context: LocalAgentRunContext,
  spec: AgentRunSpecV1,
  runKey: string,
  createdAt: string,
): OciRunIntentV1 {
  return parseOciRunIntent({
    schemaVersion: 1,
    runKey,
    attemptId: spec.attemptId,
    runId: spec.runId,
    fence: spec.fence,
    createdAt,
    taskSpecDigest: spec.taskSpecDigest,
    policyDigest: Sha256DigestSchema.parse(context.policyDigest),
    baseCommit: GitObjectIdSchema.parse(context.baseCommit),
    baseTree: GitObjectIdSchema.parse(context.baseTree),
    containerName: containerNameFor(runKey),
    image: configuration.image,
    worktreeHostPath: spec.workingDirectory,
    worktreeContainerPath: "/workspace",
    privateTmpfsPath: "/run/app-factory",
    networkMode: "none",
    readOnlyRootFilesystem: true,
    agentExecutable: configuration.agentExecutable,
    agentArguments: configuration.agentArguments,
    environment: configuration.environment,
    limits: {
      ...configuration.resources,
      outputBytesPerStream: spec.limits.maxStdoutBytes,
      wallTimeMs: spec.limits.timeoutMs,
      stopGraceMs: spec.limits.terminationGraceMs,
    },
  });
}

function validateIssuedLimits(
  configuration: ValidatedConfiguration,
  spec: AgentRunSpecV1,
): string | null {
  if (spec.limits.maxTurns !== 1) return "OCI local execution supports exactly one turn.";
  if (spec.limits.maxStdoutBytes !== spec.limits.maxStderrBytes) {
    return "OCI execution requires equal stdout and stderr limits.";
  }
  if (spec.limits.maxStdoutBytes < 1_024 || spec.limits.maxStdoutBytes > MAX_OCI_OUTPUT_BYTES) {
    return "OCI output limit is outside the isolated runner's bounded range.";
  }
  return null;
}

function cloneEvidenceClosure(closure: OciEvidenceClosureV1): OciEvidenceClosureV1 {
  return {
    envelope: {
      ...closure.envelope,
      artifacts: closure.envelope.artifacts.map((artifact) => ({ ...artifact })),
    },
    envelopeBytes: Buffer.from(closure.envelopeBytes),
    envelopeDigest: closure.envelopeDigest,
    artifacts: closure.artifacts.map((artifact) => ({
      ...artifact,
      bytes: Buffer.from(artifact.bytes),
    })),
  };
}

function outputArtifact(closure: OciEvidenceClosureV1, logicalName: string): Buffer {
  const matches = closure.artifacts.filter((artifact) => artifact.logicalName === logicalName);
  if (matches.length !== 1) throw new Error(`OCI closure must contain one ${logicalName}.`);
  const artifact = matches[0] as OciEvidenceClosureV1["artifacts"][number];
  const bytes = Buffer.from(artifact.bytes);
  if (artifact.byteLength !== bytes.byteLength || artifact.digest !== sha256Digest(bytes)) {
    throw new Error(`OCI closure ${logicalName} metadata is invalid.`);
  }
  return bytes;
}

function assertClosureBindings(
  configuration: ValidatedConfiguration,
  context: LocalAgentRunContext,
  spec: AgentRunSpecV1,
  prepared: PreparedOciRun,
  closure: OciEvidenceClosureV1,
): void {
  const envelope = closure.envelope;
  if (
    envelope.runKey !== prepared.intent.runKey ||
    envelope.attemptId !== spec.attemptId ||
    envelope.runId !== spec.runId ||
    envelope.fence !== spec.fence ||
    envelope.taskSpecDigest !== spec.taskSpecDigest ||
    envelope.policyDigest !== context.policyDigest ||
    envelope.baseCommit !== context.baseCommit ||
    envelope.baseTree !== context.baseTree ||
    envelope.intentDigest !== prepared.intentDigest ||
    envelope.engineIdentityDigest !== configuration.engineIdentityDigest ||
    envelope.imageReference !== configuration.image.reference ||
    envelope.imageId !== configuration.image.imageId
  ) {
    throw new Error("OCI evidence closure conflicts with its issued trusted identity.");
  }
}

function canonicalValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateChangedPaths(
  changedPathsInput: readonly string[],
  authorizedWritePaths: readonly string[],
): readonly string[] {
  if (!Array.isArray(changedPathsInput) || changedPathsInput.length > 10_000) {
    throw new Error("OCI materializer changed paths are not a bounded array.");
  }
  const changedPaths = changedPathsInput.map((path) => RelativePathSchema.parse(path));
  if (
    new Set(changedPaths).size !== changedPaths.length ||
    changedPaths.some((path, index) => index > 0 && path <= (changedPaths[index - 1] as string))
  ) {
    throw new Error("OCI materializer changed paths must be unique and sorted.");
  }
  for (const path of changedPaths) {
    if (!authorizedWritePaths.some((root) => path === root || path.startsWith(`${root}/`))) {
      throw new Error("OCI materializer reported a path outside the issued write scope.");
    }
  }
  return changedPaths;
}

function validateMaterializedRun(
  spec: AgentRunSpecV1,
  receipt: OciRunReceiptV1,
  stdout: Buffer,
  stderr: Buffer,
  materializedInput: OciLocalAgentMaterializedRunV1,
): OciLocalAgentMaterializedRunV1 {
  if (
    typeof materializedInput.summary !== "string" ||
    materializedInput.summary.length < 1 ||
    materializedInput.summary.length > MAX_SUMMARY_LENGTH
  ) {
    throw new Error("OCI materializer summary is invalid.");
  }
  const result = AgentRunResultV1Schema.parse(materializedInput.result);
  if (
    result.runId !== spec.runId ||
    result.attemptId !== spec.attemptId ||
    result.stepId !== spec.stepId ||
    result.fence !== spec.fence
  ) {
    throw new Error("OCI materializer result is bound to different execution inputs.");
  }
  if (
    result.startedAt !== receipt.startedAt ||
    result.finishedAt !== receipt.finishedAt ||
    result.process.exitCode !== receipt.exitCode ||
    result.process.signal !== null ||
    result.stdout.digest !== receipt.stdout.digest ||
    result.stdout.digest !== sha256Digest(stdout) ||
    result.stdout.byteLength !== stdout.byteLength ||
    result.stdout.truncated !== receipt.stdout.truncated ||
    result.stderr.digest !== receipt.stderr.digest ||
    result.stderr.digest !== sha256Digest(stderr) ||
    result.stderr.byteLength !== stderr.byteLength ||
    result.stderr.truncated !== receipt.stderr.truncated ||
    stdout.byteLength > spec.limits.maxStdoutBytes ||
    stderr.byteLength > spec.limits.maxStderrBytes
  ) {
    throw new Error("OCI materializer result conflicts with captured process evidence.");
  }
  const compatibleReceiptOutcomes =
    result.status === "succeeded"
      ? ["succeeded"]
      : result.status === "blocked"
        ? ["succeeded", "failed"]
        : result.status === "timed-out"
          ? ["timed-out"]
          : result.status === "cancelled"
            ? ["cancelled"]
            : ["succeeded", "failed", "output-overflow"];
  if (!compatibleReceiptOutcomes.includes(receipt.outcome)) {
    throw new Error("OCI materializer status conflicts with the OCI receipt outcome.");
  }
  if (result.status !== "succeeded" && result.status !== "blocked") {
    if (result.failure.detailArtifactDigest !== null) {
      throw new Error("OCI materializer referenced an unavailable failure artifact.");
    }
  }

  if (!Array.isArray(materializedInput.events)) {
    throw new Error("OCI materializer events must be an array.");
  }
  if (
    materializedInput.events.length < 2 ||
    materializedInput.events.length > spec.limits.maxEventCount
  ) {
    throw new Error("OCI materializer event count violates the issued limit.");
  }
  const events = materializedInput.events.map((event) => AgentEventV1Schema.parse(event));
  const eventIds = new Set<string>();
  for (const [index, event] of events.entries()) {
    if (
      eventIds.has(event.eventId) ||
      event.sequence !== index + 1 ||
      event.runId !== spec.runId ||
      event.attemptId !== spec.attemptId ||
      event.stepId !== spec.stepId ||
      event.fence !== spec.fence ||
      (index > 0 && event.occurredAt < (events[index - 1] as AgentEventV1).occurredAt)
    ) {
      throw new Error("OCI materializer event identity or ordering is invalid.");
    }
    eventIds.add(event.eventId);
  }
  const first = events[0] as AgentEventV1;
  const last = events.at(-1) as AgentEventV1;
  const blockedEvents = events.filter((event) => event.type === "agent.blocked");
  if (
    first.type !== "agent.started" ||
    first.data.adapterId !== spec.adapterId ||
    first.occurredAt !== result.startedAt ||
    last.type !== "agent.finished" ||
    last.data.status !== result.status ||
    last.occurredAt !== result.finishedAt ||
    events.filter((event) => event.type === "agent.started").length !== 1 ||
    events.filter((event) => event.type === "agent.finished").length !== 1 ||
    result.finalEventSequence !== events.length
  ) {
    throw new Error("OCI materializer terminal events do not match the result.");
  }
  if (result.status === "blocked") {
    const blocked = blockedEvents[0];
    if (
      blockedEvents.length !== 1 ||
      blocked?.type !== "agent.blocked" ||
      !canonicalValuesEqual(blocked.data.blocker, result.blocker)
    ) {
      throw new Error("OCI materializer blocker event does not match its result.");
    }
  } else if (blockedEvents.length !== 0) {
    throw new Error("A non-blocked OCI result cannot contain a blocker event.");
  }

  return {
    result,
    events,
    summary: materializedInput.summary,
    changedPaths: validateChangedPaths(materializedInput.changedPaths, spec.authorizedWritePaths),
  };
}

function outcomeFromMaterialized(
  materialized: OciLocalAgentMaterializedRunV1,
  protocolEvidence: LocalOciAgentProtocolEvidenceV1,
): LocalAgentRunOutcome {
  if (materialized.result.status === "succeeded") {
    return {
      kind: "succeeded",
      summary: materialized.summary,
      changedPaths: materialized.changedPaths,
      protocolEvidence,
    };
  }
  if (materialized.result.status === "blocked") {
    return { kind: "needs-input", blocker: materialized.result.blocker, protocolEvidence };
  }
  return { kind: "failed", failure: materialized.result.failure, protocolEvidence };
}

function lifecycleFailure(error: unknown): LocalAgentRunOutcome {
  if (error instanceof OciRunnerBusyError) {
    return failedOutcome(
      "agent.oci-run-busy",
      "The durable OCI run is already being reconciled by another owner.",
      true,
    );
  }
  if (error instanceof OciRunnerError && "retryable" in error && error.retryable === true) {
    return failedOutcome(
      "agent.oci-reconciliation-pending",
      "The durable OCI lifecycle remains pending and must be reconciled again without relaunch.",
      true,
    );
  }
  const detail = error instanceof Error ? error.message : String(error);
  return failedOutcome(
    "agent.oci-lifecycle-error",
    `OCI lifecycle reconciliation failed closed: ${detail}`,
  );
}

async function abortibleSleep(
  milliseconds: number,
  signal: AbortSignal,
  sleep: (milliseconds: number) => Promise<void>,
): Promise<void> {
  if (signal.aborted) return;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<void>((resolvePromise) => {
    onAbort = () => resolvePromise();
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    await Promise.race([sleep(milliseconds), aborted]);
  } finally {
    if (onAbort !== undefined) signal.removeEventListener("abort", onAbort);
  }
}

export class OciLocalAgent implements LocalAgentAdapter {
  public readonly adapterId = OCI_LOCAL_AGENT_ADAPTER_ID;
  public readonly adapterVersion = OCI_LOCAL_AGENT_ADAPTER_VERSION;
  public readonly trustedIdentity: TrustedOciAgentIdentityV1;
  readonly #configuration: ValidatedConfiguration;
  readonly #runner: OciLocalAgentRunnerPort;
  readonly #now: () => Date;
  readonly #sleep: (milliseconds: number) => Promise<void>;

  public constructor(
    configurationInput: OciLocalAgentConfigurationV1,
    dependencies: OciLocalAgentDependencies,
  ) {
    this.#configuration = validateConfiguration(configurationInput);
    const trustedEnvironment = this.#configuration.environment.map((entry) =>
      Object.freeze({ ...entry }),
    );
    this.trustedIdentity = Object.freeze({
      evidenceRoot: this.#configuration.runnerRoot,
      engineIdentityDigest: Sha256DigestSchema.parse(this.#configuration.engineIdentityDigest),
      image: Object.freeze({
        reference: this.#configuration.image.reference,
        imageId: Sha256DigestSchema.parse(this.#configuration.image.imageId),
      }),
      agentExecutable: this.#configuration.agentExecutable,
      agentArguments: Object.freeze([...this.#configuration.agentArguments]),
      environment: Object.freeze(trustedEnvironment),
      worktreeContainerPath: "/workspace",
      privateTmpfsPath: "/run/app-factory",
      ...this.#configuration.resources,
    });
    this.#now = dependencies.now ?? (() => new Date());
    this.#sleep =
      dependencies.sleep ??
      (async (milliseconds) =>
        await new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds)));
    if (dependencies.runner !== undefined) {
      if (dependencies.engine !== undefined || dependencies.runnerFactory !== undefined) {
        configurationError("Inject either an OCI runner or an engine/factory, not both.");
      }
      if (dependencies.runnerEngineIdentityDigest === undefined) {
        configurationError("Injected OCI runner requires its exact engine identity digest.");
      }
      let runnerEngineIdentityDigest: string;
      try {
        runnerEngineIdentityDigest = Sha256DigestSchema.parse(
          dependencies.runnerEngineIdentityDigest,
        );
      } catch (error) {
        configurationError("Injected OCI runner engine identity digest is invalid.", error);
      }
      if (runnerEngineIdentityDigest !== this.#configuration.engineIdentityDigest) {
        configurationError("Injected OCI runner engine identity differs from configuration.");
      }
      this.#runner = dependencies.runner;
      return;
    }
    if (dependencies.runnerEngineIdentityDigest !== undefined) {
      configurationError("runnerEngineIdentityDigest is only valid with an injected runner.");
    }
    if (dependencies.engine === undefined) {
      configurationError("OCI local-agent composition requires an injected engine or runner.");
    }
    if (dependencies.engine.engineIdentityDigest !== this.#configuration.engineIdentityDigest) {
      configurationError("Injected OCI engine identity differs from configuration.");
    }
    this.#runner =
      dependencies.runnerFactory?.(dependencies.engine) ??
      new OciRunner(dependencies.engine, { now: this.#now });
  }

  /** Read-only inventory used by startup recovery and its independent cross-check. */
  public async inspectStartup(): Promise<readonly OciLocalAgentStartupEntryV1[]> {
    if (!existsSync(this.#configuration.runnerRoot)) return [];
    const rootStats = lstatSync(this.#configuration.runnerRoot);
    if (
      !rootStats.isDirectory() ||
      rootStats.isSymbolicLink() ||
      realpathSync.native(this.#configuration.runnerRoot) !== this.#configuration.runnerRoot ||
      (rootStats.mode & 0o077) !== 0 ||
      (typeof process.getuid === "function" &&
        rootStats.uid !== process.getuid() &&
        rootStats.uid !== 0)
    ) {
      throw new Error("OCI startup recovery requires the configured real evidence directory.");
    }
    const candidates = readdirSync(this.#configuration.runnerRoot, { withFileTypes: true })
      .filter((entry) => !isIgnorableOsMetadataEntry(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));
    const entries: OciLocalAgentStartupEntryV1[] = [];
    for (const candidate of candidates) {
      if (
        !/^oci-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
          candidate.name,
        ) ||
        !candidate.isDirectory() ||
        candidate.isSymbolicLink()
      ) {
        throw new Error(`OCI startup recovery found an invalid run entry: ${candidate.name}`);
      }
      const prepared = openPreparedOciRun(this.#configuration.runnerRoot, candidate.name);
      if (prepared === null) {
        throw new Error(`OCI startup recovery found ${candidate.name} without a durable intent.`);
      }
      if (runKeyForRunId(prepared.intent.runId) !== candidate.name) {
        throw new Error(`OCI startup recovery found a conflicting run key: ${candidate.name}`);
      }
      if (
        prepared.intent.image.reference !== this.#configuration.image.reference ||
        prepared.intent.image.imageId !== this.#configuration.image.imageId ||
        prepared.intent.agentExecutable !== this.#configuration.agentExecutable ||
        !canonicalValuesEqual(prepared.intent.agentArguments, this.#configuration.agentArguments) ||
        !canonicalValuesEqual(prepared.intent.environment, this.#configuration.environment) ||
        prepared.intent.limits.cpuCount !== this.#configuration.resources.cpuCount ||
        prepared.intent.limits.memoryBytes !== this.#configuration.resources.memoryBytes ||
        prepared.intent.limits.pidLimit !== this.#configuration.resources.pidLimit ||
        prepared.intent.limits.privateTmpfsBytes !== this.#configuration.resources.privateTmpfsBytes
      ) {
        throw new Error(
          `OCI startup recovery found ${candidate.name} under a different trusted identity.`,
        );
      }
      const disposition = await readOciLifecycleDisposition(prepared);
      if (disposition.phase === "cancelled-before-start") {
        if (disposition.engineIdentityDigest !== this.#configuration.engineIdentityDigest) {
          throw new Error(
            `OCI startup recovery found ${candidate.name} under a different engine identity.`,
          );
        }
      } else if (disposition.phase !== "incomplete") {
        const closure = disposition.evidenceClosure;
        if (closure.envelope.engineIdentityDigest !== this.#configuration.engineIdentityDigest) {
          throw new Error(
            `OCI startup recovery found ${candidate.name} under a different engine identity.`,
          );
        }
        if (
          closure.envelope.imageReference !== this.#configuration.image.reference ||
          closure.envelope.imageId !== this.#configuration.image.imageId
        ) {
          throw new Error(
            `OCI startup recovery found ${candidate.name} under a different image identity.`,
          );
        }
      }
      entries.push({ runKey: candidate.name, intent: prepared.intent, disposition });
    }
    return entries;
  }

  /**
   * Read-only readiness barrier. Startup never launches, cancels, or reaps a
   * container; every unfinished or quarantined adapter run denies readiness.
   */
  public async reconcileStartup(): Promise<void> {
    for (const entry of await this.inspectStartup()) {
      if (entry.disposition.phase === "incomplete") {
        throw new Error(
          `OCI startup recovery found unfinished run ${entry.runKey}; readiness is denied until explicit reconciliation.`,
        );
      }
      if (
        entry.disposition.phase !== "removed" &&
        entry.disposition.phase !== "cancelled-before-start"
      ) {
        throw new Error(
          `OCI startup recovery found ${entry.disposition.phase} run ${entry.runKey}; readiness is denied for operator review.`,
        );
      }
    }
  }

  public async run(context: LocalAgentRunContext): Promise<LocalAgentRunOutcome> {
    const issuedSpec = AgentRunSpecV1Schema.parse(context.spec);
    if (issuedSpec.adapterId !== this.adapterId) {
      return failedOutcome("agent.identity-mismatch", "Daemon issued a run for another adapter.");
    }
    const limitError = validateIssuedLimits(this.#configuration, issuedSpec);
    if (limitError !== null) return failedOutcome("agent.oci-limit-mismatch", limitError);
    if (pathsOverlap(resolve(issuedSpec.workingDirectory), this.#configuration.runnerRoot)) {
      return failedOutcome(
        "agent.oci-runtime-path-overlap",
        "OCI evidence storage overlaps the untrusted worktree.",
      );
    }

    const runKey = deriveOciLocalAgentRunKey(issuedSpec);
    let executionSpec = issuedSpec;
    let prepared: PreparedOciRun;
    try {
      const existing = openPreparedOciRun(this.#configuration.runnerRoot, runKey);
      if (existing === null) {
        if (!context.signal.aborted) await context.assertActive();
        prepared = prepareOciRun(
          this.#configuration.runnerRoot,
          exactIntent(
            this.#configuration,
            context,
            executionSpec,
            runKey,
            this.#now().toISOString(),
          ),
        );
      } else {
        if (existing.intent.fence > issuedSpec.fence) {
          return failedOutcome(
            "agent.oci-future-fence",
            "A durable OCI run exists under a future scheduler fence and cannot be adopted.",
          );
        }
        executionSpec = AgentRunSpecV1Schema.parse({
          ...issuedSpec,
          fence: existing.intent.fence,
        });
        const expected = exactIntent(
          this.#configuration,
          context,
          executionSpec,
          runKey,
          existing.intent.createdAt,
        );
        if (!sameIntent(existing.intent, expected)) {
          return failedOutcome(
            "agent.oci-intent-conflict",
            "A durable OCI run already exists for this logical run with different inputs.",
          );
        }
        prepared = existing;
      }
    } catch (error) {
      return lifecycleFailure(error);
    }

    const effectGuards: OciRunnerEffectGuards = {
      assertExecutionActive: async () => await context.assertActive(),
      assertCleanupActive: async () => await context.assertCleanupActive(),
    };

    for (;;) {
      let reconciled: ReconcileOciRunResult;
      try {
        if (context.signal.aborted) {
          reconciled = await this.#runner.cancel(prepared, effectGuards);
        } else {
          try {
            await context.assertActive();
          } catch (error) {
            try {
              await this.#runner.cancel(prepared, effectGuards);
            } catch {
              // The scheduler error remains authoritative. Durable reconciliation
              // will prove or quarantine any ambiguous cancellation on restart.
            }
            throw error;
          }
          reconciled = await this.#runner.reconcile(prepared, effectGuards);
        }
      } catch (error) {
        if (!(error instanceof OciRunnerError)) throw error;
        return lifecycleFailure(error);
      }

      if (reconciled.phase === "cancelled-before-start") {
        try {
          const closure = await readOciEvidenceClosure(prepared);
          if (closure !== null) throw new Error("Pre-start cancellation exposed a run closure.");
        } catch (error) {
          return lifecycleFailure(error);
        }
        return failedOutcome(
          "agent.oci-cancelled-before-start",
          "OCI execution was cancelled before the isolated process started.",
        );
      }

      if (reconciled.phase === "quarantined" || reconciled.phase === "quarantine-removed") {
        try {
          const closure = await readOciEvidenceClosure(prepared);
          if (closure === null || closure.envelope.phase !== reconciled.phase) {
            throw new Error("OCI quarantine closure is incomplete or changed phase.");
          }
          assertClosureBindings(this.#configuration, context, executionSpec, prepared, closure);
        } catch (error) {
          return lifecycleFailure(error);
        }
        if (reconciled.phase === "quarantined") {
          return blockedOutcome(
            "agent.oci-quarantined",
            "OCI launch became ambiguous and is quarantined without a normal result.",
            "Inspect the immutable OCI quarantine closure and explicitly reap the exact container before replacing the attempt.",
          );
        }
        return failedOutcome(
          "agent.oci-quarantine-removed",
          "The quarantined OCI container was removed, but quarantine evidence can never become a normal result.",
        );
      }

      if (reconciled.phase === "removed") {
        let closure: OciEvidenceClosureV1;
        let stdout: Buffer;
        let stderr: Buffer;
        try {
          const exported = await readOciEvidenceClosure(prepared);
          if (exported === null || exported.envelope.phase !== "removed") {
            throw new Error("OCI removed evidence closure is incomplete or changed identity.");
          }
          assertClosureBindings(this.#configuration, context, executionSpec, prepared, exported);
          closure = exported;
          stdout = outputArtifact(closure, "stdout.bin");
          stderr = outputArtifact(closure, "stderr.bin");
        } catch (error) {
          return lifecycleFailure(error);
        }

        let materialized: OciLocalAgentMaterializedRunV1;
        try {
          materialized = validateMaterializedRun(
            executionSpec,
            reconciled.receipt,
            stdout,
            stderr,
            await this.#configuration.protocolMaterializer({
              spec: AgentRunSpecV1Schema.parse(executionSpec),
              receipt: structuredClone(reconciled.receipt),
              stdout: Buffer.from(stdout),
              stderr: Buffer.from(stderr),
              evidenceClosure: cloneEvidenceClosure(closure),
            }),
          );
        } catch (error) {
          return failedOutcome(
            "agent.oci-protocol-error",
            `OCI protocol materialization failed closed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        const protocolEvidence: LocalOciAgentProtocolEvidenceV1 = {
          schemaVersion: 3,
          runSpec: executionSpec,
          result: materialized.result,
          events: materialized.events,
          stdout,
          stderr,
          ociEvidenceClosure: cloneEvidenceClosure(closure),
        };
        return outcomeFromMaterialized(materialized, protocolEvidence);
      }

      await context.heartbeat();
      await abortibleSleep(this.#configuration.pollMs, context.signal, this.#sleep);
    }
  }
}
