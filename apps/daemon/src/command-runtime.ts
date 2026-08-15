import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import {
  AttemptIdSchema,
  canonicalPortfolioReadModelDigestInputV1,
  CommandRequestV1Schema,
  CommandResultV1Schema,
  EventIdSchema,
  IsoInstantSchema,
  PortfolioReadModelV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
  COMMAND_PROTOCOL_VERSION_V1,
  type AttemptId,
  type CommandId,
  type CommandRequestV1,
  type CommandResultV1,
  type EffectPumpStatusV1,
  type IsoInstant,
  type PortfolioProjectReadModelV1,
  type PortfolioReadModelV1,
} from "@app-factory/contracts";
import {
  FACTORY_CONTROL_PLANE_DATABASE_FILE_NAME,
  canonicalJson,
  computeTaskSpecDigest,
  createEffectRepository,
  createFactoryRepositories,
  inspectFactoryDatabase,
  openMigratedFactoryDatabase,
  type ArtifactRepository,
  type EffectRepository,
  type FactoryRepositories,
} from "@app-factory/kernel";
import { verifyCanonicalObservationAttestation } from "@app-factory/effect-worker";
import { EvidenceStore } from "@app-factory/evidence-store";

import { executeEvidenceCommand } from "./evidence-command-runtime.js";
import {
  executeProjectApplyCommand,
  executeProjectEnrollPlanCommand,
  executeProjectScanCommand,
} from "./project-command-runtime.js";
import { CommandHandlerError, type CommandHandler } from "./unix-command-server.js";

const COMMAND_RESULTS_DIRECTORY_NAME = "command-results";
const RESULT_LEDGER_VERSION = 1;
const MAX_LEDGER_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_CLIENT_FUTURE_SKEW_MS = 5 * 60 * 1_000;
/** How long the daemon holds the attempt lease while it applies an unblock. */
const UNBLOCK_LEASE_DURATION_MS = 30_000;
const DURABLE_COMMAND_RESULT_OPERATIONS: ReadonlySet<CommandRequestV1["operation"]> = new Set([
  "task.submit",
  "task.run",
  "attempt.pause",
  "attempt.resume",
  "attempt.cancel",
  "task.retry",
  "attempt.unblock",
  "daemon.reconcile",
  "project.apply",
]);

type FactoryDatabase = ReturnType<typeof openMigratedFactoryDatabase>;

export type DaemonRuntimeIdPurpose =
  | "attempt"
  | "attempt-created-event"
  | "desired-state-event"
  | "retry-attempt"
  | "retry-created-event"
  | "unblock-fence-event"
  | "unblock-answered-event"
  | "unblock-step-event"
  | "unblock-attempt-event";

export type DaemonRuntimeIdFactory = (
  purpose: DaemonRuntimeIdPurpose,
  commandId: CommandId,
) => string;

export type DaemonDatabaseInitializer = (database: FactoryDatabase) => void;

/** Live read-only view of the daemon's own effect pump loop, if any is running. */
export type EffectPumpStatusPort = Readonly<{
  status(): EffectPumpStatusV1;
}>;

const INERT_EFFECT_PUMP_STATUS: EffectPumpStatusV1 = {
  enabled: false,
  lastActivityAt: null,
  lastErrorMessage: null,
};

const inertEffectPumpStatusPort: EffectPumpStatusPort = {
  status: () => INERT_EFFECT_PUMP_STATUS,
};

export type InitializeEffectsContext = Readonly<{
  database: FactoryDatabase;
  /** The exact repository instance the read-only `effects.*` commands query. */
  effects: EffectRepository;
  artifacts: ArtifactRepository;
  evidenceStore: EvidenceStore;
}>;

/**
 * Daemon-only composition hook, the effect-subsystem counterpart of
 * `initializeDatabase`. It lets a daemon composition build its own
 * EffectWorker/AdapterRegistry/pump loop directly against the repository the
 * `effects.status`/`effects.list` commands already read, and report that
 * pump's live activity back into the command boundary. Returning `undefined`
 * (the default when the hook itself is omitted) keeps the effect subsystem
 * fully inert: `effects.*` commands still work as a read-only view over the
 * kernel's durable state, they just report `pump.enabled: false`.
 */
export type InitializeEffectsPump = (
  context: InitializeEffectsContext,
) => EffectPumpStatusPort | undefined;

export type OpenDaemonCommandRuntimeOptions = Readonly<{
  runtimeDirectory: string;
  daemonVersion: string;
  startedAt?: string;
  now?: () => string;
  idFactory?: DaemonRuntimeIdFactory;
  /**
   * Daemon-only composition hook. It lets the scheduler share the runtime's
   * single SQLite handle without exposing that handle through the command
   * protocol or opening a second connection.
   */
  initializeDatabase?: DaemonDatabaseInitializer;
  initializeEffects?: InitializeEffectsPump;
  /** Deterministic failpoint after the authoritative mutation and before result journaling. */
  commandResultLedgerBoundary?: (
    entry: Readonly<{ request: CommandRequestV1; result: CommandResultV1 }>,
  ) => Promise<void> | void;
}>;

export type DaemonRuntimePaths = Readonly<{
  root: string;
  database: string;
  commandResults: string;
  evidence: string;
}>;

export type DaemonCommandRuntime = Readonly<{
  paths: DaemonRuntimePaths;
  startedAt: IsoInstant;
  handler: CommandHandler;
  close: () => void;
}>;

type ResultLedgerEntry = Readonly<{
  ledgerVersion: 1;
  request: CommandRequestV1;
  result: CommandResultV1;
}>;

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}

function currentUserId(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function parseDaemonVersion(value: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > 100
  ) {
    throw new TypeError("daemonVersion must be 1-100 non-whitespace-padded characters");
  }
  return value;
}

export function resolveDaemonRuntimePaths(runtimeDirectory: string): DaemonRuntimePaths {
  if (!isAbsolute(runtimeDirectory) || resolve(runtimeDirectory) !== runtimeDirectory) {
    throw new CommandHandlerError(
      "daemon.unsafe-runtime-path",
      "The daemon runtime directory must be an absolute normalized path.",
      false,
    );
  }
  return {
    root: runtimeDirectory,
    database: join(runtimeDirectory, FACTORY_CONTROL_PLANE_DATABASE_FILE_NAME),
    commandResults: join(runtimeDirectory, COMMAND_RESULTS_DIRECTORY_NAME),
    evidence: join(runtimeDirectory, "evidence"),
  };
}

async function assertPrivateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  const uid = currentUserId();
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (uid !== undefined && stat.uid !== uid) ||
    (stat.mode & 0o077) !== 0
  ) {
    throw new CommandHandlerError(
      "daemon.unsafe-runtime-path",
      "Daemon runtime directories must not be symlinks and must be owned by the current user with mode 0700.",
      false,
    );
  }
}

async function assertPrivateRegularFile(path: string): Promise<void> {
  const stat = await lstat(path);
  const uid = currentUserId();
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (uid !== undefined && stat.uid !== uid) ||
    (stat.mode & 0o077) !== 0
  ) {
    throw new CommandHandlerError(
      "daemon.unsafe-runtime-path",
      "Daemon runtime files must be regular, owned by the current user, and mode 0600.",
      false,
    );
  }
}

async function prepareRuntimePaths(paths: DaemonRuntimePaths): Promise<void> {
  await assertPrivateDirectory(paths.root);
  await assertPrivateDirectory(paths.commandResults);
  try {
    await assertPrivateRegularFile(paths.database);
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }
}

function deterministicUuid(purpose: DaemonRuntimeIdPurpose, commandId: CommandId): string {
  const digest = createHash("sha256")
    .update(`app-factory.daemon.v1\0${purpose}\0${commandId}`)
    .digest("hex");
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function defaultIdFactory(purpose: DaemonRuntimeIdPurpose, commandId: CommandId): string {
  return deterministicUuid(purpose, commandId);
}

function parseGeneratedAttemptId(
  factory: DaemonRuntimeIdFactory,
  purpose: Extract<DaemonRuntimeIdPurpose, "attempt" | "retry-attempt">,
  commandId: CommandId,
): AttemptId {
  return AttemptIdSchema.parse(factory(purpose, commandId));
}

function parseGeneratedEventId(
  factory: DaemonRuntimeIdFactory,
  purpose: Exclude<DaemonRuntimeIdPurpose, "attempt">,
  commandId: CommandId,
) {
  return EventIdSchema.parse(factory(purpose, commandId));
}

function laterInstant(...values: readonly string[]): IsoInstant {
  const milliseconds = Math.max(
    ...values.map((value) => Date.parse(IsoInstantSchema.parse(value))),
  );
  if (!Number.isFinite(milliseconds)) throw new TypeError("Could not compare ISO instants");
  return IsoInstantSchema.parse(new Date(milliseconds).toISOString());
}

function nextInstant(...values: readonly string[]): IsoInstant {
  const milliseconds = Date.parse(laterInstant(...values));
  if (milliseconds >= 8_640_000_000_000_000) {
    throw new RangeError("Cannot advance beyond the maximum supported instant");
  }
  return IsoInstantSchema.parse(new Date(milliseconds + 1).toISOString());
}

function assertPlausibleClientTimestamps(request: CommandRequestV1, observedAt: IsoInstant): void {
  const maximumClientTime = Date.parse(observedAt) + MAX_CLIENT_FUTURE_SKEW_MS;
  const timestamps: readonly Readonly<{ label: string; value: IsoInstant }>[] = [
    { label: "command issuedAt", value: request.issuedAt },
    ...(request.operation === "task.submit" || request.operation === "task.run"
      ? ([{ label: "task createdAt", value: request.payload.taskSpec.createdAt }] as const)
      : []),
  ];
  const future = timestamps.find(({ value }) => Date.parse(value) > maximumClientTime);
  if (future !== undefined) {
    throw new CommandHandlerError(
      "command.future-timestamp",
      `${future.label} exceeds the daemon clock-skew allowance.`,
      false,
    );
  }
}

function parseLedgerEntry(value: unknown): ResultLedgerEntry {
  if (
    value === null ||
    typeof value !== "object" ||
    !("ledgerVersion" in value) ||
    value.ledgerVersion !== RESULT_LEDGER_VERSION ||
    !("request" in value) ||
    !("result" in value)
  ) {
    throw new Error("Command result journal entry has an unsupported shape");
  }
  return {
    ledgerVersion: RESULT_LEDGER_VERSION,
    request: CommandRequestV1Schema.parse(value.request),
    result: CommandResultV1Schema.parse(value.result),
  };
}

function resultPath(paths: DaemonRuntimePaths, commandId: CommandId): string {
  return join(paths.commandResults, `${commandId}.json`);
}

async function readLedgerEntry(
  paths: DaemonRuntimePaths,
  commandId: CommandId,
): Promise<ResultLedgerEntry | null> {
  const path = resultPath(paths, commandId);
  try {
    await assertPrivateRegularFile(path);
    const stat = await lstat(path);
    if (stat.size > MAX_LEDGER_ENTRY_BYTES) {
      throw new Error(
        `Command result journal entry exceeds ${String(MAX_LEDGER_ENTRY_BYTES)} bytes`,
      );
    }
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    return parseLedgerEntry(value);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return null;
    throw error;
  }
}

async function syncDirectory(path: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, "r");
    await handle.sync();
  } finally {
    await handle?.close();
  }
}

async function persistLedgerEntry(
  paths: DaemonRuntimePaths,
  entry: ResultLedgerEntry,
): Promise<ResultLedgerEntry> {
  const commandId = entry.request.commandId;
  const finalPath = resultPath(paths, commandId);
  const temporaryPath = join(
    paths.commandResults,
    `.${commandId}.${String(process.pid)}.${randomUUID()}.tmp`,
  );
  const encoded = Buffer.from(`${JSON.stringify(entry)}\n`, "utf8");
  if (encoded.byteLength > MAX_LEDGER_ENTRY_BYTES) {
    throw new Error(`Command result journal entry exceeds ${String(MAX_LEDGER_ENTRY_BYTES)} bytes`);
  }

  let handle: FileHandle | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(encoded);
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      await link(temporaryPath, finalPath);
      await syncDirectory(paths.commandResults);
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
      const existing = await readLedgerEntry(paths, commandId);
      if (existing === null) throw error;
      return existing;
    }
    return entry;
  } finally {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch((error: unknown) => {
      if (!isNodeError(error, "ENOENT")) throw error;
    });
  }
}

class SerialExecutor {
  #tail: Promise<void> = Promise.resolve();

  public async run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#tail;
    let release: (() => void) | undefined;
    this.#tail = new Promise<void>((resolvePromise) => {
      release = resolvePromise;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release?.();
    }
  }
}

function assertMatchingRequest(original: CommandRequestV1, retry: CommandRequestV1): void {
  if (canonicalJson(original) !== canonicalJson(retry)) {
    throw new CommandHandlerError(
      "command.identity-conflict",
      "The command ID is already bound to a different command or issuedAt value.",
      false,
    );
  }
}

function expectedKernelCommand(request: CommandRequestV1): unknown | null {
  switch (request.operation) {
    case "task.submit":
    case "task.run":
      return {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "task.submit",
        initialDesiredState: request.operation === "task.submit" ? "paused" : "running",
        taskSpec: request.payload.taskSpec,
      };
    case "attempt.pause":
    case "attempt.resume":
    case "attempt.cancel":
      return {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "attempt.set-desired-state",
        attemptId: request.payload.attemptId,
        desiredState:
          request.operation === "attempt.pause"
            ? "paused"
            : request.operation === "attempt.resume"
              ? "running"
              : "cancelled",
        reason: request.payload.reason,
      };
    case "task.retry":
      return {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "task.retry",
        taskId: request.payload.taskId,
        priorAttemptId: request.payload.attemptId,
        initialDesiredState: "running",
      };
    case "attempt.unblock":
      return {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "attempt.unblock",
        attemptId: request.payload.attemptId,
        answer: request.payload.answer,
      };
    case "doctor":
    case "attempt.status":
    case "attempt.events":
    case "attempt.list":
    case "daemon.reconcile":
    case "evidence.list":
    case "evidence.inspect":
    case "evidence.verify":
    case "portfolio.snapshot":
    case "project.scan":
    case "project.enroll-plan":
    case "project.apply":
    case "effects.status":
    case "effects.list":
      return null;
  }
}

function buildLocalPortfolioReadModel(
  repositories: FactoryRepositories,
  observedAt: string,
): PortfolioReadModelV1 {
  const summaries = repositories.portfolio.listProjectSummaries();
  const generatedAt = laterInstant(
    observedAt,
    ...summaries.map((summary) => summary.lastActivityAt),
  );
  const unavailableSources = {
    localExecution: "available",
    jira: "unavailable",
    github: "unavailable",
    quality: "unavailable",
    release: "unavailable",
    analytics: "unavailable",
  } as const;
  const projects: PortfolioProjectReadModelV1[] = summaries
    .map((summary): PortfolioProjectReadModelV1 => ({
      projectId: summary.projectId,
      slug: StableKeySchema.parse(`project-${summary.projectId}`),
      displayName: `Project ${summary.projectId}`,
      metadataSource: "task-derived",
      lifecycleStage: null,
      attemptCount: summary.attemptCount,
      activeAttemptCount: summary.activeAttemptCount,
      blockerCount: summary.blockerCount,
      lastActivityAt: summary.lastActivityAt,
      // A successful coding attempt is not a release or delivery observation.
      lastDeliveryAt: null,
      openPullRequestCount: null,
      jiraTodoCount: null,
      jiraInProgressCount: null,
      unresolvedP0: null,
      unresolvedP1: null,
      releaseStage: null,
      analyticsFreshness: "unavailable",
      sources: unavailableSources,
      health: summary.blockerCount > 0 ? "blocked" : "unknown",
      healthReasons: [
        ...(summary.blockerCount > 0 ? (["delivery-blocker"] as const) : []),
        "jira-unavailable",
        "github-unavailable",
        "quality-unavailable",
        "release-unavailable",
        "analytics-unavailable",
      ],
    }))
    .sort((left, right) => left.slug.localeCompare(right.slug));
  const envelope = {
    schemaVersion: 1 as const,
    generatedAt,
    projects,
    totals: {
      projects: projects.length,
      attempts: projects.reduce((sum, project) => sum + project.attemptCount, 0),
      activeAttempts: projects.reduce((sum, project) => sum + project.activeAttemptCount, 0),
      blockers: projects.reduce((sum, project) => sum + project.blockerCount, 0),
      openPullRequests: null,
      jiraTodo: null,
      jiraInProgress: null,
      unresolvedP0: null,
      unresolvedP1: null,
    },
  };
  const sourceSnapshotDigest = Sha256DigestSchema.parse(
    `sha256:${createHash("sha256")
      .update(canonicalPortfolioReadModelDigestInputV1(envelope))
      .digest("hex")}`,
  );
  return PortfolioReadModelV1Schema.parse({ ...envelope, sourceSnapshotDigest });
}

function assertKernelCommandIdentity(
  repositories: FactoryRepositories,
  request: CommandRequestV1,
): void {
  const stored = repositories.commands.findById(request.commandId);
  if (stored === null) return;
  const expected = expectedKernelCommand(request);
  if (expected === null || canonicalJson(stored) !== canonicalJson(expected)) {
    throw new CommandHandlerError(
      "command.identity-conflict",
      "The command ID is already bound to a different durable kernel command.",
      false,
    );
  }
}

function requireAttempt(repositories: FactoryRepositories, attemptId: AttemptId) {
  const attempt = repositories.attempts.findById(attemptId);
  if (attempt === null) {
    throw new CommandHandlerError(
      "attempt.not-found",
      `No attempt exists for ID ${attemptId}.`,
      false,
    );
  }
  return attempt;
}

function nextEventContext(repositories: FactoryRepositories, attemptId: AttemptId) {
  const events = repositories.events.listByAttempt(attemptId);
  const last = events.at(-1);
  return {
    sequence: (last?.sequence ?? 0) + 1,
    causationEventId: last?.eventId ?? null,
  };
}

function intakeTask(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "task.submit" | "task.run" }>,
  observedAt: IsoInstant,
  idFactory: DaemonRuntimeIdFactory,
): CommandResultV1 {
  const taskSpecDigest = computeTaskSpecDigest(request.payload.taskSpec);
  const attemptId = parseGeneratedAttemptId(idFactory, "attempt", request.commandId);
  const createdAt = observedAt;
  const initialDesiredState = request.operation === "task.submit" ? "paused" : "running";
  const created = repositories.createTaskAttempt({
    command: {
      schemaVersion: 1,
      commandId: request.commandId,
      issuedAt: request.issuedAt,
      origin: request.origin,
      kind: "task.submit",
      initialDesiredState,
      taskSpec: request.payload.taskSpec,
    },
    taskSpecDigest,
    attempt: {
      schemaVersion: 1,
      attemptId,
      taskId: request.payload.taskSpec.taskId,
      taskSpecDigest,
      attemptNumber: 1,
      state: "queued",
      desiredState: initialDesiredState,
      revision: 0,
      fence: 0,
      currentStepId: null,
      blocker: null,
      outcome: null,
      createdAt,
      updatedAt: createdAt,
      terminalAt: null,
    },
    event: {
      schemaVersion: 1,
      eventId: parseGeneratedEventId(idFactory, "attempt-created-event", request.commandId),
      attemptId,
      sequence: 1,
      occurredAt: createdAt,
      commandId: request.commandId,
      causationEventId: null,
      fence: 0,
      type: "attempt.created",
      data: { taskId: request.payload.taskSpec.taskId, taskSpecDigest },
    },
  });
  const authoritative = requireAttempt(repositories, created.attempt.attemptId);
  return {
    operation: request.operation,
    taskId: authoritative.taskId,
    attemptId: authoritative.attemptId,
    state: authoritative.state,
  };
}

function setDesiredState(
  repositories: FactoryRepositories,
  request: Extract<
    CommandRequestV1,
    { operation: "attempt.pause" | "attempt.resume" | "attempt.cancel" }
  >,
  observedAt: IsoInstant,
  idFactory: DaemonRuntimeIdFactory,
): CommandResultV1 {
  const desiredState =
    request.operation === "attempt.pause"
      ? "paused"
      : request.operation === "attempt.resume"
        ? "running"
        : "cancelled";
  const attempt = requireAttempt(repositories, request.payload.attemptId);
  const context = nextEventContext(repositories, attempt.attemptId);
  const occurredAt = nextInstant(observedAt, attempt.updatedAt);
  repositories.desiredStates.apply({
    command: {
      schemaVersion: 1,
      commandId: request.commandId,
      issuedAt: request.issuedAt,
      origin: request.origin,
      kind: "attempt.set-desired-state",
      attemptId: attempt.attemptId,
      desiredState,
      reason: request.payload.reason,
    },
    expectedRevision: attempt.revision,
    event: {
      schemaVersion: 1,
      eventId: parseGeneratedEventId(idFactory, "desired-state-event", request.commandId),
      attemptId: attempt.attemptId,
      sequence: context.sequence,
      occurredAt,
      commandId: request.commandId,
      causationEventId: context.causationEventId,
      fence: attempt.fence,
      type: "attempt.desired-state-changed",
      data: {
        from: attempt.desiredState,
        to: desiredState,
        reason: request.payload.reason,
      },
    },
  });
  return {
    operation: request.operation,
    attemptId: attempt.attemptId,
    desiredState,
    accepted: true,
  };
}

function retryTask(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "task.retry" }>,
  observedAt: IsoInstant,
  idFactory: DaemonRuntimeIdFactory,
): CommandResultV1 {
  const priorAttempt = requireAttempt(repositories, request.payload.attemptId);
  if (priorAttempt.taskId !== request.payload.taskId) {
    throw new CommandHandlerError(
      "task.retry-task-mismatch",
      `Attempt ${priorAttempt.attemptId} does not belong to task ${request.payload.taskId}.`,
      false,
    );
  }
  if (priorAttempt.state !== "failed" && priorAttempt.state !== "cancelled") {
    throw new CommandHandlerError(
      "task.retry-not-eligible",
      `Attempt ${priorAttempt.attemptId} is ${priorAttempt.state}; only a failed or cancelled attempt can be retried.`,
      false,
    );
  }
  const attemptId = parseGeneratedAttemptId(idFactory, "retry-attempt", request.commandId);
  const createdAt = observedAt;
  const created = repositories.retryTaskAttempt({
    command: {
      schemaVersion: 1,
      commandId: request.commandId,
      issuedAt: request.issuedAt,
      origin: request.origin,
      kind: "task.retry",
      taskId: request.payload.taskId,
      priorAttemptId: priorAttempt.attemptId,
      initialDesiredState: "running",
    },
    attempt: {
      schemaVersion: 1,
      attemptId,
      taskId: priorAttempt.taskId,
      taskSpecDigest: priorAttempt.taskSpecDigest,
      attemptNumber: priorAttempt.attemptNumber + 1,
      state: "queued",
      desiredState: "running",
      revision: 0,
      fence: 0,
      currentStepId: null,
      blocker: null,
      outcome: null,
      createdAt,
      updatedAt: createdAt,
      terminalAt: null,
    },
    event: {
      schemaVersion: 1,
      eventId: parseGeneratedEventId(idFactory, "retry-created-event", request.commandId),
      attemptId,
      sequence: 1,
      occurredAt: createdAt,
      commandId: request.commandId,
      causationEventId: null,
      fence: 0,
      type: "attempt.created",
      data: { taskId: priorAttempt.taskId, taskSpecDigest: priorAttempt.taskSpecDigest },
    },
  });
  const authoritative = requireAttempt(repositories, created.attempt.attemptId);
  return {
    operation: "task.retry",
    taskId: authoritative.taskId,
    attemptId: authoritative.attemptId,
    state: authoritative.state,
    priorAttemptId: created.priorAttempt.attemptId,
  };
}

/**
 * Answering a blocker requires the same lease-fenced discipline as any other
 * step or attempt mutation, so this claims a lease exactly as the scheduler
 * would, records the operator's answer as its own durable event, replays the
 * step and attempt out of `blocked`, and releases the lease. See
 * `KernelSchedulerPersistenceAdapter` for the pattern this mirrors.
 */
function unblockAttempt(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "attempt.unblock" }>,
  observedAt: IsoInstant,
  idFactory: DaemonRuntimeIdFactory,
): CommandResultV1 {
  const attempt = requireAttempt(repositories, request.payload.attemptId);
  if (attempt.state !== "blocked") {
    throw new CommandHandlerError(
      "attempt.not-blocked",
      `Attempt ${attempt.attemptId} is ${attempt.state}; only a blocked attempt can be unblocked.`,
      false,
    );
  }
  if (attempt.currentStepId === null) {
    throw new CommandHandlerError(
      "attempt.no-current-step",
      `Blocked attempt ${attempt.attemptId} has no current step to resume.`,
      false,
    );
  }
  const blockedStep = repositories.steps.findById(attempt.currentStepId);
  if (blockedStep === null || blockedStep.state !== "blocked") {
    throw new CommandHandlerError(
      "attempt.step-not-blocked",
      `Attempt ${attempt.attemptId}'s current step is not blocked.`,
      false,
    );
  }

  const leaseKey = `attempt:${attempt.attemptId}`;
  const ownerId = `daemon.unblock.${request.commandId}`;
  const acquiredAt = nextInstant(observedAt, attempt.updatedAt);
  const expiresAt = IsoInstantSchema.parse(
    new Date(Date.parse(acquiredAt) + UNBLOCK_LEASE_DURATION_MS).toISOString(),
  );
  const fence = attempt.fence + 1;
  const claimContext = nextEventContext(repositories, attempt.attemptId);
  const fenceEventId = parseGeneratedEventId(idFactory, "unblock-fence-event", request.commandId);
  const answerEventId = parseGeneratedEventId(
    idFactory,
    "unblock-answered-event",
    request.commandId,
  );
  const stepEventId = parseGeneratedEventId(idFactory, "unblock-step-event", request.commandId);
  const attemptEventId = parseGeneratedEventId(
    idFactory,
    "unblock-attempt-event",
    request.commandId,
  );

  try {
    repositories.leases.claim({
      leaseKey,
      attemptId: attempt.attemptId,
      ownerId,
      expectedAttemptRevision: attempt.revision,
      acquiredAt,
      expiresAt,
      event: {
        schemaVersion: 1,
        eventId: fenceEventId,
        attemptId: attempt.attemptId,
        sequence: claimContext.sequence,
        occurredAt: acquiredAt,
        commandId: null,
        causationEventId: claimContext.causationEventId,
        fence,
        type: "attempt.fence-claimed",
        data: { previousFence: attempt.fence, newFence: fence, ownerId },
      },
    });
  } catch (error) {
    const busy = new CommandHandlerError(
      "attempt.busy",
      "The attempt is currently claimed by the scheduler; retry the unblock shortly.",
      true,
    );
    busy.cause = error;
    throw busy;
  }

  const answered = repositories.unblocks.apply({
    command: {
      schemaVersion: 1,
      commandId: request.commandId,
      issuedAt: request.issuedAt,
      origin: request.origin,
      kind: "attempt.unblock",
      attemptId: attempt.attemptId,
      answer: request.payload.answer,
    },
    leaseKey,
    ownerId,
    observedAt: acquiredAt,
    event: {
      schemaVersion: 1,
      eventId: answerEventId,
      attemptId: attempt.attemptId,
      sequence: claimContext.sequence + 1,
      occurredAt: acquiredAt,
      commandId: request.commandId,
      causationEventId: fenceEventId,
      fence,
      type: "attempt.unblock-answered",
      data: { stepId: blockedStep.stepId, answer: request.payload.answer },
    },
  });

  repositories.steps.transition({
    leaseKey,
    ownerId,
    observedAt: acquiredAt,
    expectedRevision: blockedStep.revision,
    fence,
    step: {
      ...blockedStep,
      state: "running",
      revision: blockedStep.revision + 1,
      lastFence: fence,
      runCount: blockedStep.runCount + 1,
      blocker: null,
    },
    event: {
      schemaVersion: 1,
      eventId: stepEventId,
      attemptId: attempt.attemptId,
      sequence: claimContext.sequence + 2,
      occurredAt: acquiredAt,
      commandId: null,
      causationEventId: answered.event.eventId,
      fence,
      type: "step.state-changed",
      data: {
        stepId: blockedStep.stepId,
        from: "blocked",
        to: "running",
        outputDigest: null,
        failureCode: null,
      },
    },
  });

  const attemptAfterAnswer = requireAttempt(repositories, attempt.attemptId);
  const resumedAt = nextInstant(acquiredAt, attemptAfterAnswer.updatedAt);
  const resumedAttempt = repositories.transitionAttemptState({
    leaseKey,
    ownerId,
    observedAt: resumedAt,
    expectedRevision: attemptAfterAnswer.revision,
    attempt: {
      ...attemptAfterAnswer,
      state: "running",
      revision: attemptAfterAnswer.revision + 1,
      updatedAt: resumedAt,
      blocker: null,
    },
    event: {
      schemaVersion: 1,
      eventId: attemptEventId,
      attemptId: attempt.attemptId,
      sequence: claimContext.sequence + 3,
      occurredAt: resumedAt,
      commandId: null,
      causationEventId: stepEventId,
      fence,
      type: "attempt.state-changed",
      data: { from: "blocked", to: "running", blocker: null, outcome: null },
    },
  });

  repositories.leases.release({ leaseKey, ownerId, fence });

  return {
    operation: "attempt.unblock",
    attemptId: resumedAttempt.attemptId,
    state: resumedAttempt.state,
    accepted: true,
  };
}

async function executeRequest(
  repositories: FactoryRepositories,
  database: ReturnType<typeof openMigratedFactoryDatabase>,
  request: CommandRequestV1,
  dependencies: Readonly<{
    daemonVersion: string;
    startedAt: IsoInstant;
    observedAt: IsoInstant;
    idFactory: DaemonRuntimeIdFactory;
    evidenceStore: EvidenceStore;
    effects: EffectRepository;
    effectsPump: EffectPumpStatusPort;
  }>,
): Promise<CommandResultV1> {
  switch (request.operation) {
    case "doctor": {
      const issues: string[] = [];
      try {
        inspectFactoryDatabase(database);
      } catch {
        issues.push("The control-plane database failed its health check.");
      }
      return {
        operation: "doctor",
        readiness: issues.length === 0 ? "ready" : "degraded",
        daemonVersion: dependencies.daemonVersion,
        protocolVersion: COMMAND_PROTOCOL_VERSION_V1,
        startedAt: dependencies.startedAt,
        issues,
      };
    }
    case "task.submit":
    case "task.run":
      return intakeTask(repositories, request, dependencies.observedAt, dependencies.idFactory);
    case "attempt.status":
      return {
        operation: "attempt.status",
        attempt: requireAttempt(repositories, request.payload.attemptId),
      };
    case "attempt.events": {
      requireAttempt(repositories, request.payload.attemptId);
      const events = repositories.events
        .listByAttempt(request.payload.attemptId)
        .filter((event) => event.sequence > request.payload.afterSequence)
        .slice(0, request.payload.limit);
      return {
        operation: "attempt.events",
        events,
        nextAfterSequence: events.at(-1)?.sequence ?? request.payload.afterSequence,
      };
    }
    case "attempt.list":
      return {
        operation: "attempt.list",
        page: repositories.attempts.list(request.payload),
      };
    case "attempt.pause":
    case "attempt.resume":
    case "attempt.cancel":
      return setDesiredState(
        repositories,
        request,
        dependencies.observedAt,
        dependencies.idFactory,
      );
    case "task.retry":
      return retryTask(repositories, request, dependencies.observedAt, dependencies.idFactory);
    case "attempt.unblock":
      return unblockAttempt(repositories, request, dependencies.observedAt, dependencies.idFactory);
    case "daemon.reconcile": {
      if (request.payload.attemptId !== null) {
        requireAttempt(repositories, request.payload.attemptId);
      }
      // This command is deliberately only a durable wake acknowledgement.
      // Scheduler progress happens in the service-owned background loop after
      // this result has been journaled, so a crash cannot advance work before
      // commandId is durably linked to its response. The legacy result field
      // records synchronous reconciliation; wake-only v1 commands do none.
      return {
        operation: "daemon.reconcile",
        accepted: true,
        reconciledAttemptIds: [],
      };
    }
    case "evidence.list":
    case "evidence.inspect":
    case "evidence.verify":
      return executeEvidenceCommand(dependencies.evidenceStore, request);
    case "portfolio.snapshot":
      return {
        operation: "portfolio.snapshot",
        snapshot: buildLocalPortfolioReadModel(repositories, dependencies.observedAt),
      };
    case "project.scan":
      return await executeProjectScanCommand(dependencies.evidenceStore, request);
    case "project.enroll-plan":
      return executeProjectEnrollPlanCommand(dependencies.evidenceStore, request);
    case "project.apply":
      return executeProjectApplyCommand(dependencies.evidenceStore, request);
    case "effects.status":
      return {
        operation: "effects.status",
        status: {
          counts: dependencies.effects.countEffectsByState(),
          pendingOutbox: dependencies.effects.countPendingOutbox(dependencies.observedAt),
          pump: dependencies.effectsPump.status(),
        },
      };
    case "effects.list":
      return {
        operation: "effects.list",
        page: dependencies.effects.listEffects(request.payload),
      };
  }
}

function closedError(): CommandHandlerError {
  return new CommandHandlerError(
    "daemon.runtime-closed",
    "The daemon command runtime is closed.",
    false,
  );
}

export async function openDaemonCommandRuntime(
  options: OpenDaemonCommandRuntimeOptions,
): Promise<DaemonCommandRuntime> {
  const paths = resolveDaemonRuntimePaths(options.runtimeDirectory);
  const daemonVersion = parseDaemonVersion(options.daemonVersion);
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = IsoInstantSchema.parse(options.startedAt ?? now());
  const idFactory = options.idFactory ?? defaultIdFactory;
  await prepareRuntimePaths(paths);

  const database = openMigratedFactoryDatabase(paths.database);
  let evidenceStore: EvidenceStore;
  let repositories: FactoryRepositories;
  let effectRepository: EffectRepository;
  let effectsPumpStatusPort: EffectPumpStatusPort;
  try {
    await chmod(paths.database, 0o600);
    await assertPrivateRegularFile(paths.database);
    repositories = createFactoryRepositories(database);
    evidenceStore = new EvidenceStore(paths.evidence);
    // Always constructed, even with no pump composed: `effects.*` commands
    // are a read-only view over durable kernel state and must work whether
    // or not the daemon's own send/reconcile pump is enabled.
    effectRepository = createEffectRepository(database, {
      verifyObservationAttestation: verifyCanonicalObservationAttestation,
    });
    options.initializeDatabase?.(database);
    effectsPumpStatusPort =
      options.initializeEffects?.({
        database,
        effects: effectRepository,
        artifacts: repositories.artifacts,
        evidenceStore,
      }) ?? inertEffectPumpStatusPort;
  } catch (error) {
    database.close();
    throw error;
  }
  const serial = new SerialExecutor();
  let closed = false;

  const handler: CommandHandler = async (requestInput: CommandRequestV1) => {
    if (closed) throw closedError();
    const request = CommandRequestV1Schema.parse(requestInput);
    return await serial.run(async () => {
      if (closed) throw closedError();
      const persistResult = DURABLE_COMMAND_RESULT_OPERATIONS.has(request.operation);
      if (persistResult) {
        const original = await readLedgerEntry(paths, request.commandId);
        if (original !== null) {
          assertMatchingRequest(original.request, request);
          return original.result;
        }
      }

      const observedAt = IsoInstantSchema.parse(now());
      assertPlausibleClientTimestamps(request, observedAt);

      assertKernelCommandIdentity(repositories, request);

      const result = CommandResultV1Schema.parse(
        await executeRequest(repositories, database, request, {
          daemonVersion,
          startedAt,
          observedAt,
          idFactory,
          evidenceStore,
          effects: effectRepository,
          effectsPump: effectsPumpStatusPort,
        }),
      );
      if (!persistResult) return result;
      try {
        await options.commandResultLedgerBoundary?.({ request, result });
        const persisted = await persistLedgerEntry(paths, {
          ledgerVersion: RESULT_LEDGER_VERSION,
          request,
          result,
        });
        assertMatchingRequest(persisted.request, request);
        return persisted.result;
      } catch {
        // The kernel mutation may already be authoritative even though its
        // command-result journal is not. The same commandId/issuedAt is safe
        // to retry and lets kernel idempotency reconstruct the exact result.
        throw new CommandHandlerError(
          "command.result-persistence-ambiguous",
          "The command may have completed, but its durable result could not be confirmed. Retry with the same command ID and issuedAt.",
          true,
        );
      }
    });
  };

  return {
    paths,
    startedAt,
    handler,
    close: () => {
      if (closed) return;
      closed = true;
      database.close();
    },
  };
}
