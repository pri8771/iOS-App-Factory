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
  AscReleaseObservationIdSchema,
  AttemptIdSchema,
  canonicalPortfolioReadModelDigestInputV1,
  canonicalRoomParticipantsCatalogDigestInputV1,
  CommandIdSchema,
  CommandRequestV1Schema,
  CommandResultV1Schema,
  EventIdSchema,
  IsoInstantSchema,
  PortfolioReadModelV1Schema,
  ProjectTimelineV1Schema,
  RoomParticipantsCatalogV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
  COMMAND_PROTOCOL_VERSION_V1,
  type AssistantIntentExecutionOutcomeV1,
  type AscReleaseObservationV1,
  type AttemptId,
  type Sha256Digest,
  type CommandId,
  type CommandRequestV1,
  type CommandResultV1,
  type EffectPumpStatusV1,
  type IsoInstant,
  type PolicyLockV1,
  type PortfolioProjectReadModelV1,
  type PortfolioReadModelV1,
  type ProjectId,
  type ProjectTimelineV1,
  type RoomFactoryBridgeStatusV1,
  type RoomId,
  type RoomParticipantsCatalogV1,
  RoomHumanHandleSchema,
  RoomMessageIdSchema,
  type TaskSpecV1,
} from "@app-factory/contracts";
import {
  FACTORY_CONTROL_PLANE_DATABASE_FILE_NAME,
  ProjectMilestoneUpsertError,
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
import { GitWorkspaceManager } from "@app-factory/git-workspace";
import { EvidenceStore } from "@app-factory/evidence-store";
import { decideTaskPolicyBinding } from "@app-factory/policy-engine";
import {
  DEFAULT_ROOM_DORMANCY_MS,
  RoomError,
  RoomRepository,
  roomAttendanceAt,
} from "@app-factory/studio-rooms";

import type { DaemonRuntimeIdFactory, DaemonRuntimeIdPurpose } from "./daemon-runtime-ids.js";
import { executeEvidenceCommand } from "./evidence-command-runtime.js";
import { executeMirrorPlanCommand } from "./mirror-command-runtime.js";
import {
  executeProjectApplyCommand,
  executeProjectEnrollPlanCommand,
  executeProjectScanCommand,
} from "./project-command-runtime.js";
import { executeProjectDocsSnapshotCommand } from "./project-docs-command-runtime.js";
import { loadProjectDocsSourcesV1 } from "./project-docs-sources.js";
import {
  buildProjectListResultV1,
  buildProjectShowResultV1,
  executeProjectRegisterCommand,
  registerOrReconcileEnrolledProjectV1,
} from "./project-registry-command-runtime.js";
import {
  buildPresetListResultV1,
  loadKnownStandardRuleIdsV1,
  loadStandardRuleStatementsV1,
  seedIosAppStandardPresetV1,
  upsertPhaseDefinitionV1,
  upsertPhasePresetV1,
} from "./phase-command-runtime.js";
import {
  createPhaseInputsReaderPort,
  createPhaseOutputMirrorPort,
  type PhaseOutputMirrorPort,
} from "./phase-output-mirror.js";
import {
  approvePhaseRunV1,
  buildPhaseListResultV1,
  buildPhaseStatusResultV1,
  rejectPhaseRunV1,
  runPhaseV1,
  type PhaseRunCommandDependencies,
} from "./phase-run-command-runtime.js";
import type {
  PhaseInputsReaderPort,
  PhaseParticipantsPort,
  PhaseRoomPort,
} from "./phase-run-executor.js";
import {
  createRunExportMirrorPort,
  executeRunExportCommand,
  type RunExportMirrorPort,
} from "./run-export-command-runtime.js";
import {
  approveGateProjectPlanV1,
  approveProjectPlanV1,
  editProjectPlanV1,
  executeProjectPlanV1,
  proposeProjectPlanV1,
  statusProjectPlanV1,
  tickProjectPlanV1,
  type ProjectPlanExecutionDependencies,
} from "./project-plan-command-runtime.js";
import { createEvidenceBrokerCommitResolverV1 } from "./project-plan-broker-commit-resolver.js";
import { createRegistryBackedProjectPlanMirrorPortV1 } from "./project-plan-mirror-port.js";
import { executeProjectSeedCommand } from "./project-seed-command-runtime.js";
import {
  buildAssistantIntentDispatchRequestV1,
  buildStudioSnapshotV1,
  computeAssistantAnswerV1,
  proposeAssistantIntentV1,
} from "./studio-command-runtime.js";
import { CommandHandlerError, type CommandHandler } from "./unix-command-server.js";
import { resolveVerifiedLocalExecutionPaths } from "./verified-local-executor.js";

export type { DaemonRuntimeIdFactory, DaemonRuntimeIdPurpose } from "./daemon-runtime-ids.js";

const COMMAND_RESULTS_DIRECTORY_NAME = "command-results";
import {
  INERT_RELEASE_OBSERVER_PORT,
  ReleaseObserverNotConfiguredError,
  buildReleaseProjectionV1,
  type ReleaseObserverPort,
} from "./release-command-runtime.js";
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
  "project.seed",
  "project.milestone.upsert",
  "project.register",
  "preset.upsert",
  "phase.upsert",
  "plan.propose",
  "plan.edit",
  "plan.approve",
  "plan.execute",
  "plan.approve-gate",
  "plan.tick",
  "phase.run",
  "phase.approve",
  "phase.reject",
  "room.create",
  "room.post",
  "release.observe",
]);

type FactoryDatabase = ReturnType<typeof openMigratedFactoryDatabase>;

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

/**
 * Live view of the daemon's own room moderator, if one is composed. With no
 * moderator (`enabled: false`, the default), `room.*` commands still work as a
 * durable transcript — humans can create rooms and post — but no agent is
 * ever granted the floor and `room.events` reports `moderator.enabled: false`.
 */
export type RoomsStatusPort = Readonly<{
  enabled: boolean;
  /** Dormancy threshold the moderator applies; reported so clients render attendance the same way. */
  dormancyMs: number;
  wake(roomId: RoomId): void;
  /**
   * Live view of the factory-event bridge (kernel attempt transitions -> `factory-event` room
   * lines): whether one is composed and its durable cursor. Served in `room.events`'
   * `moderator.factoryBridge` so an operator can see the bridge advance.
   */
  factoryBridge(): RoomFactoryBridgeStatusV1;
  /**
   * The wire-safe view of the participants config the moderator was composed from, served by
   * `room.participants.list` (see `RoomParticipantsCatalogSourceV1`). Absent on the inert port and
   * on a hand-composed moderator with no config: the operation then reports no providers/roster.
   */
  participantsCatalog?: RoomParticipantsCatalogSourceV1;
}>;

/**
 * What `room.participants.list` serves, minus the envelope the runtime stamps (`enabled`,
 * `unavailableReason`, `sourcedAt`, `sourceDigest`): providers by key/model/pinned CLI version, and
 * the operator's roster. Built by `room-participants-config.ts`
 * (`buildRoomParticipantsCatalogSourceV1`), which is the one place that decides what does NOT cross
 * the wire (executables, paths, digests, base URLs).
 */
export type RoomParticipantsCatalogSourceV1 = Pick<
  RoomParticipantsCatalogV1,
  "providers" | "roster"
>;

/** Why `room.participants.list` has nothing to list when no moderator is composed. */
export const ROOMS_SUBSYSTEM_DISABLED_REASON_V1 =
  "rooms subsystem disabled: no room moderator is composed (APP_FACTORY_ROOMS_ENABLED unset), so no participants or roster are configured" as const;

const inertRoomsStatusPort: RoomsStatusPort = {
  enabled: false,
  dormancyMs: DEFAULT_ROOM_DORMANCY_MS,
  wake: () => undefined,
  factoryBridge: () => ({ enabled: false, cursor: null }),
};

export type InitializeRoomsContext = Readonly<{
  database: FactoryDatabase;
  /** The exact repository instance the `room.*` commands read and write. */
  rooms: RoomRepository;
  /** The daemon's evidence store, so the factory-event bridge can name a succeeded attempt's broker commit. */
  evidenceStore: EvidenceStore;
}>;

/**
 * Daemon-only composition hook for the room moderator (`@app-factory/studio-rooms`).
 * Returning `undefined` (the default when omitted) keeps the moderator fully
 * inert while the transcript commands keep working.
 */
export type InitializeRooms = (context: InitializeRoomsContext) => RoomsStatusPort | undefined;

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

/**
 * Resolves the enrolled policy lock for one project, or `null` when the
 * project has no enrolled lock. Anything other than a valid lock whose
 * `policyDigest` equals the TaskSpec digest rejects the intake (fail closed).
 */
export type EnrolledPolicyLockResolver = (
  projectId: ProjectId,
) => Promise<PolicyLockV1 | null> | PolicyLockV1 | null;

/**
 * Task-intake policy gate. Default OFF: omit the option or pass
 * `{ enabled: false }` and `task.submit`/`task.run` intake behaves exactly as
 * before. When enabled, every intake first resolves the project's enrolled
 * policy lock and rejects a TaskSpec whose `policyDigest` does not match it,
 * before any durable state is created.
 */
export type TaskPolicyGateOptions = Readonly<{
  enabled: boolean;
  resolvePolicyLock: EnrolledPolicyLockResolver;
}>;

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
  /** Default OFF; see {@link TaskPolicyGateOptions}. */
  taskPolicyGate?: TaskPolicyGateOptions;
  initializeRooms?: InitializeRooms;
  /** Deterministic failpoint after the authoritative mutation and before result journaling. */
  commandResultLedgerBoundary?: (
    entry: Readonly<{ request: CommandRequestV1; result: CommandResultV1 }>,
  ) => Promise<void> | void;
  /**
   * Git executable `run.export` uses to re-derive a run's broker commit from
   * the sealed Factory mirror under this runtime directory. Defaults to the
   * git-workspace default (`/usr/bin/git`); the daemon service passes the
   * enrolled profile's own `gitExecutable` so export and execution agree.
   */
  gitExecutable?: string;
  /** Test seam: replaces the default mirror port `run.export` opens mirrors through. */
  runExportMirrors?: RunExportMirrorPort;
  /**
   * Absolute path to the compiled policy source `preset.upsert`/`phase.upsert` resolve
   * `rules.standard[]` ruleIds against. Defaults to
   * `docs/policy/ios-app-factory-policy-source.v1.json` relative to this repository; override in
   * tests that want a smaller, controlled rule catalog.
   */
  policySourcePath?: string;
  /**
   * `plan.execute`/`plan.tick`'s mirror-advance and broker-commit-resolution ports plus the
   * reviewed policy digest plan-submitted tasks carry (`ProjectPlanExecutionDependencies`, see
   * `project-plan-command-runtime.ts`). Default (Seam (b) of the project-registry task): a REAL,
   * Project-Registry-backed mirror port (`createRegistryBackedProjectPlanMirrorPortV1`) plus an
   * evidence-backed broker-commit resolver (`createEvidenceBrokerCommitResolverV1`) — a plan whose
   * `repositoryId` is not a registered project's mirror binding still fails closed
   * (`plan.mirror-not-registered`), but a registered one now actually chains task items end to end
   * with no extra configuration.
   */
  planExecution?: ProjectPlanExecutionDependencies;
  /**
   * Idempotently self-registers the single project the configured local execution profile prepared
   * a Factory mirror for into the Project Registry at every daemon start (Seam (a) of the
   * project-registry task), so `studio.snapshot`/`plan.execute`/`phase.run` see it as a real
   * registered project with no separate `project.register` call required. `null`/absent when no
   * local execution profile is configured — nothing to self-register.
   */
  selfRegisterProject?: Readonly<{ repositoryId: string; sourceRepositoryPath: string }> | null;
  /**
   * Resolves a real (or fake, in tests) `ParticipantAdapter` per cast provider for `phase.run`.
   * Defaults to a port with no provider configured at all — `phase.run` still works end to end (the
   * run durably fails closed with `participant-unconfigured`) exactly like a `room.*` roster naming
   * an unconfigured provider fails only that provider's turns; wiring real Codex/Claude/Ollama
   * adapters here is the daemon composition layer's job, mirroring `initializeRooms`.
   */
  phaseParticipants?: PhaseParticipantsPort;
  /** Test seam: replaces the default `docs/`-scoped broker-commit port `phase.run` writes outputs through. */
  phaseOutputMirror?: PhaseOutputMirrorPort;
  /** Test seam: replaces the default read-only project-mirror reader `phase.run` folds into context. */
  phaseInputsReader?: PhaseInputsReaderPort;
  /**
   * The composed App Store Connect release observer (`release-command-runtime.ts`), opt-in by
   * `APP_FACTORY_ASC_OBSERVER_CONFIG`. Defaults to the inert port: `release.observe` refuses with
   * `release.observer-not-configured`; `release.projection` still serves persisted observations.
   */
  releaseObserver?: ReleaseObserverPort;
  /**
   * The reviewed policy digest `plan.execute`/`plan.tick` stamp on every task they submit when no
   * explicit `planExecution` is supplied. Planner execution (`planner-project-execution.ts`) sets it
   * to the digest of the exact policy bytes its resolver hands the executor, so plan-submitted
   * tasks and the executor's `policy.digest-mismatch` check bind to the same text. Without it the
   * default stays the all-zeros placeholder (plan tasks then cannot run under a real profile, which
   * is the honest pre-planner-execution state).
   */
  planPolicyDigest?: Sha256Digest;
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

function deterministicUuidFromParts(...parts: readonly string[]): string {
  const digest = createHash("sha256")
    .update(`app-factory.daemon.v1\0${parts.join("\0")}`)
    .digest("hex");
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function deterministicUuid(purpose: DaemonRuntimeIdPurpose, commandId: CommandId): string {
  return deterministicUuidFromParts(purpose, commandId);
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
  purpose: Exclude<DaemonRuntimeIdPurpose, "attempt" | "retry-attempt" | "room-message">,
  commandId: CommandId,
) {
  return EventIdSchema.parse(factory(purpose, commandId));
}

function parseGeneratedRoomMessageId(factory: DaemonRuntimeIdFactory, commandId: CommandId) {
  return RoomMessageIdSchema.parse(factory("room-message", commandId));
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
    case "run.export":
    case "portfolio.snapshot":
    case "project.scan":
    case "project.enroll-plan":
    case "project.apply":
    case "project.milestones.list":
    case "project.milestone.upsert":
    case "project.register":
    case "project.list":
    case "project.show":
    case "preset.list":
    case "preset.upsert":
    case "phase.upsert":
    case "project.docs.snapshot":
    case "mirror.plan":
    case "project.seed":
    case "plan.propose":
    case "plan.edit":
    case "plan.approve":
    case "plan.execute":
    case "plan.approve-gate":
    case "plan.status":
    case "plan.tick":
    case "phase.run":
    case "phase.status":
    case "phase.list":
    case "phase.approve":
    case "phase.reject":
    case "effects.status":
    case "effects.list":
    case "room.create":
    case "room.list":
    case "room.post":
    case "room.events":
    case "room.typing":
    case "room.participants.list":
    case "release.observe":
    case "release.projection":
    case "studio.snapshot":
    case "studio.assistant.query":
    case "studio.assistant.intent.propose":
    case "studio.assistant.intent.execute":
      return null;
  }
}

/** Room-engine refusals are typed; forward them verbatim as protocol errors. */
function roomErrorToHandlerError(error: unknown): never {
  if (error instanceof RoomError) {
    const mapped = new CommandHandlerError(error.code, error.message, error.retryable);
    mapped.cause = error;
    throw mapped;
  }
  throw error;
}

type RoomCommandRequestV1 = Extract<
  CommandRequestV1,
  {
    operation:
      | "room.create"
      | "room.list"
      | "room.post"
      | "room.events"
      | "room.typing"
      | "room.participants.list";
  }
>;

/**
 * `room.participants.list`: the catalog is read straight off the composed moderator's status port,
 * stamped `sourcedAt` and digested over its canonical JSON (everything but `sourcedAt`/`sourceDigest`,
 * `canonicalRoomParticipantsCatalogDigestInputV1`) exactly like `portfolio.snapshot`'s
 * `sourceSnapshotDigest`. With no moderator composed it answers `enabled: false` plus a precise
 * reason rather than erroring -- "no participants configured" is a fact, not a failure.
 */
function buildRoomParticipantsCatalogV1(
  roomsStatus: RoomsStatusPort,
  observedAt: IsoInstant,
): RoomParticipantsCatalogV1 {
  const source = roomsStatus.enabled ? roomsStatus.participantsCatalog : undefined;
  const digestInput = {
    schemaVersion: 1 as const,
    enabled: roomsStatus.enabled,
    unavailableReason: roomsStatus.enabled ? null : ROOMS_SUBSYSTEM_DISABLED_REASON_V1,
    providers: [...(source?.providers ?? [])],
    roster: [...(source?.roster ?? [])],
  };
  const sourceDigest = Sha256DigestSchema.parse(
    `sha256:${createHash("sha256")
      .update(canonicalRoomParticipantsCatalogDigestInputV1(digestInput), "utf8")
      .digest("hex")}`,
  );
  return RoomParticipantsCatalogV1Schema.parse({
    ...digestInput,
    sourcedAt: observedAt,
    sourceDigest,
  });
}

/**
 * `room.*` commands are a durable single-writer transcript over the kernel's
 * room tables. The moderator (if composed) is woken by the caller strictly
 * after the human append is authoritative and journaled.
 */
function executeRoomCommand(
  request: RoomCommandRequestV1,
  dependencies: Readonly<{
    observedAt: IsoInstant;
    idFactory: DaemonRuntimeIdFactory;
    rooms: RoomRepository;
    roomsStatus: RoomsStatusPort;
  }>,
): CommandResultV1 {
  try {
    switch (request.operation) {
      case "room.create": {
        const created = dependencies.rooms.createRoom(request.payload, dependencies.observedAt);
        return { operation: "room.create", room: created.room, duplicate: created.duplicate };
      }
      case "room.list":
        return {
          operation: "room.list",
          rooms: [...dependencies.rooms.listRooms(request.payload.limit)],
        };
      case "room.post": {
        const appended = dependencies.rooms.appendHumanMessage({
          roomId: request.payload.roomId,
          messageId: parseGeneratedRoomMessageId(dependencies.idFactory, request.commandId),
          handle: request.payload.handle,
          body: request.payload.body,
          now: dependencies.observedAt,
        });
        return { operation: "room.post", message: appended.message, room: appended.room };
      }
      case "room.events": {
        const room = dependencies.rooms.requireRoom(request.payload.roomId);
        const messages = dependencies.rooms.listMessages(
          room.roomId,
          request.payload.afterSequence,
          request.payload.limit,
        );
        return {
          operation: "room.events",
          room,
          moderator: {
            enabled: dependencies.roomsStatus.enabled,
            attendance: roomAttendanceAt(
              room,
              dependencies.observedAt,
              dependencies.roomsStatus.dormancyMs,
            ),
            factoryBridge: dependencies.roomsStatus.factoryBridge(),
          },
          messages: [...messages],
          nextAfterSequence: messages.at(-1)?.sequence ?? request.payload.afterSequence,
        };
      }
      case "room.typing": {
        const typingUntil = IsoInstantSchema.parse(
          new Date(Date.parse(dependencies.observedAt) + request.payload.ttlMs).toISOString(),
        );
        const room = dependencies.rooms.setHumanTyping(request.payload.roomId, typingUntil);
        return { operation: "room.typing", roomId: room.roomId, typingUntil };
      }
      case "room.participants.list":
        return {
          operation: "room.participants.list",
          catalog: buildRoomParticipantsCatalogV1(
            dependencies.roomsStatus,
            dependencies.observedAt,
          ),
        };
    }
  } catch (error) {
    roomErrorToHandlerError(error);
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
  if (stored !== null) {
    const expected = expectedKernelCommand(request);
    if (expected === null || canonicalJson(stored) !== canonicalJson(expected)) {
      throw new CommandHandlerError(
        "command.identity-conflict",
        "The command ID is already bound to a different durable kernel command.",
        false,
      );
    }
  }
  // Milestone upserts journal their command in their own ledger; a command ID
  // that already wrote a milestone revision may only be replayed as that same
  // upsert (the repository itself proves content equality on replay).
  if (
    request.operation !== "project.milestone.upsert" &&
    repositories.milestones.findRevisionByCommandId(request.commandId) !== null
  ) {
    throw new CommandHandlerError(
      "command.identity-conflict",
      "The command ID is already bound to a durable milestone upsert.",
      false,
    );
  }
  // Phase definitions and phase presets each journal their command in their own ledger, exactly
  // like milestones above.
  if (
    request.operation !== "phase.upsert" &&
    repositories.phaseDefinitions.findRevisionByCommandId(request.commandId) !== null
  ) {
    throw new CommandHandlerError(
      "command.identity-conflict",
      "The command ID is already bound to a durable phase definition upsert.",
      false,
    );
  }
  if (
    request.operation !== "preset.upsert" &&
    repositories.phasePresets.findRevisionByCommandId(request.commandId) !== null
  ) {
    throw new CommandHandlerError(
      "command.identity-conflict",
      "The command ID is already bound to a durable phase preset upsert.",
      false,
    );
  }
  // Project plans journal every mutation (propose/edit/approve/execute/approve-gate/tick) in their
  // own ledger, exactly like milestones and phase presets above.
  const isPlanOperation =
    request.operation === "plan.propose" ||
    request.operation === "plan.edit" ||
    request.operation === "plan.approve" ||
    request.operation === "plan.execute" ||
    request.operation === "plan.approve-gate" ||
    request.operation === "plan.tick";
  if (
    !isPlanOperation &&
    repositories.projectPlans.findRevisionByCommandId(request.commandId) !== null
  ) {
    throw new CommandHandlerError(
      "command.identity-conflict",
      "The command ID is already bound to a durable project plan mutation.",
      false,
    );
  }
  // Phase runs journal only their creating command (see phase-run-repositories.ts); a commandId
  // already bound to one may only ever be replayed as that same `phase.run`.
  if (
    request.operation !== "phase.run" &&
    repositories.phaseRuns.findByCommandId(request.commandId) !== null
  ) {
    throw new CommandHandlerError(
      "command.identity-conflict",
      "The command ID is already bound to a durable phase run.",
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

async function assertTaskPolicyBinding(
  gate: TaskPolicyGateOptions | undefined,
  taskSpec: TaskSpecV1,
): Promise<void> {
  if (gate?.enabled !== true) return;
  let lock: PolicyLockV1 | null;
  try {
    lock = await gate.resolvePolicyLock(taskSpec.projectId);
  } catch {
    throw new CommandHandlerError(
      "policy.lock-unavailable",
      "The enrolled policy lock for the task's project could not be resolved.",
      false,
    );
  }
  const decision = decideTaskPolicyBinding(lock, taskSpec.policyDigest);
  if (decision.verdict === "rejected") {
    throw new CommandHandlerError(decision.code, decision.message, false);
  }
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

/**
 * The Studio timeline read model: the project's milestone plan next to the
 * actuals its attempts already produced. Lifecycle events have no durable
 * kernel store yet, so that source is reported unavailable and its actuals
 * stay empty rather than being approximated from anything else.
 */
function buildProjectTimeline(
  repositories: FactoryRepositories,
  projectId: ProjectId,
  observedAt: IsoInstant,
): ProjectTimelineV1 {
  const milestones = repositories.milestones.listByProject(projectId);
  const phases = repositories.milestones.listPhaseActuals(projectId);
  const generatedAt = laterInstant(
    observedAt,
    ...milestones.map((milestone) => milestone.updatedAt),
    ...phases.map((actuals) => actuals.lastActivityAt),
  );
  return ProjectTimelineV1Schema.parse({
    schemaVersion: 1,
    projectId,
    generatedAt,
    milestones,
    actuals: { phases, lifecycle: [] },
    sources: { localExecution: "available", lifecycleEvents: "unavailable" },
  });
}

function upsertProjectMilestone(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "project.milestone.upsert" }>,
  observedAt: IsoInstant,
): CommandResultV1 {
  const head = repositories.milestones.findById(request.payload.milestone.milestoneId);
  // A strictly later instant than the head keeps per-milestone history
  // monotonic even under a coarse or fixed daemon clock; the kernel refuses
  // anything else. Creation uses the observed instant as-is.
  const recordedAt = head === null ? observedAt : nextInstant(observedAt, head.updatedAt);
  try {
    const upserted = repositories.milestones.upsert({
      command: {
        schemaVersion: 1,
        commandId: request.commandId,
        issuedAt: request.issuedAt,
        origin: request.origin,
        kind: "project.milestone.upsert",
        upsert: request.payload,
      },
      recordedAt,
    });
    return {
      operation: "project.milestone.upsert",
      milestone: upserted.milestone,
      created: upserted.created,
    };
  } catch (error) {
    if (error instanceof ProjectMilestoneUpsertError) {
      throw new CommandHandlerError(
        error.code === "milestone.identity-conflict" ? "command.identity-conflict" : error.code,
        error.message,
        false,
      );
    }
    throw error;
  }
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
    taskPolicyGate: TaskPolicyGateOptions | undefined;
    runExportMirrors: RunExportMirrorPort;
    rooms: RoomRepository;
    roomsStatus: RoomsStatusPort;
    /** Every ruleId `preset.upsert`/`phase.upsert` accept in `rules.standard[]`. */
    knownStandardRuleIds: ReadonlySet<string>;
    /** Only used by `studio.assistant.intent.execute` to durably ledger the op it dispatches to. */
    paths: DaemonRuntimePaths;
    planExecution: ProjectPlanExecutionDependencies;
    phaseRunCommands: PhaseRunCommandDependencies;
    /** `project.register`'s own `GitWorkspaceManager`/runtime root, used to seal a freshly
     * registered project's Factory mirror. */
    projectRegistryGitWorkspace: GitWorkspaceManager;
    gitRuntimeRoot: string;
    releaseObserver: ReleaseObserverPort;
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
      await assertTaskPolicyBinding(dependencies.taskPolicyGate, request.payload.taskSpec);
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
    case "run.export":
      return executeRunExportCommand(
        {
          repositories,
          evidenceStore: dependencies.evidenceStore,
          mirrors: dependencies.runExportMirrors,
        },
        request,
      );
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
    case "project.milestones.list":
      return {
        operation: "project.milestones.list",
        timeline: buildProjectTimeline(
          repositories,
          request.payload.projectId,
          dependencies.observedAt,
        ),
      };
    case "project.milestone.upsert":
      return upsertProjectMilestone(repositories, request, dependencies.observedAt);
    case "project.register":
      return await executeProjectRegisterCommand(
        {
          repositories,
          evidenceStore: dependencies.evidenceStore,
          gitWorkspace: dependencies.projectRegistryGitWorkspace,
          gitRuntimeRoot: dependencies.gitRuntimeRoot,
        },
        request,
        dependencies.observedAt,
      );
    case "project.list":
      return buildProjectListResultV1(repositories);
    case "project.show":
      return buildProjectShowResultV1(repositories, request);
    case "preset.list":
      return buildPresetListResultV1(repositories);
    case "preset.upsert":
      return upsertPhasePresetV1(
        repositories,
        request,
        dependencies.observedAt,
        dependencies.knownStandardRuleIds,
      );
    case "phase.upsert":
      return upsertPhaseDefinitionV1(
        repositories,
        request,
        dependencies.observedAt,
        dependencies.knownStandardRuleIds,
      );
    case "project.docs.snapshot":
      return await executeProjectDocsSnapshotCommand(request, dependencies.observedAt);
    case "mirror.plan":
      return await executeMirrorPlanCommand(request, dependencies.observedAt);
    case "project.seed":
      return executeProjectSeedCommand(
        {
          repositories,
          evidenceStore: dependencies.evidenceStore,
          gitWorkspace: dependencies.projectRegistryGitWorkspace,
          gitRuntimeRoot: dependencies.gitRuntimeRoot,
        },
        request,
        dependencies.observedAt,
      );
    case "plan.propose":
      return proposeProjectPlanV1(
        repositories,
        request,
        dependencies.observedAt,
        dependencies.idFactory,
      );
    case "plan.edit":
      return editProjectPlanV1(repositories, request, dependencies.observedAt);
    case "plan.approve":
      return approveProjectPlanV1(repositories, request, dependencies.observedAt);
    case "plan.execute":
      return executeProjectPlanV1(
        repositories,
        request,
        dependencies.planExecution,
        dependencies.observedAt,
      );
    case "plan.approve-gate":
      return approveGateProjectPlanV1(repositories, request, dependencies.observedAt);
    case "plan.status":
      return statusProjectPlanV1(repositories, request);
    case "plan.tick":
      return tickProjectPlanV1(
        repositories,
        request,
        dependencies.planExecution,
        dependencies.observedAt,
      );
    case "phase.run":
      return await runPhaseV1(
        repositories,
        request,
        dependencies.observedAt,
        dependencies.idFactory,
        dependencies.phaseRunCommands,
      );
    case "phase.status":
      return buildPhaseStatusResultV1(repositories, request);
    case "phase.list":
      return buildPhaseListResultV1(repositories, request);
    case "phase.approve":
      return approvePhaseRunV1(repositories, request, dependencies.observedAt);
    case "phase.reject":
      return rejectPhaseRunV1(repositories, request, dependencies.observedAt);
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
    case "room.create":
    case "room.list":
    case "room.post":
    case "room.events":
    case "room.typing":
    case "room.participants.list":
      return executeRoomCommand(request, dependencies);
    case "release.observe":
      // Never reached: the handler takes the observation outside the serial executor and persists
      // it itself (see `openDaemonCommandRuntime`). Kept exhaustive so a future dispatch here is a
      // deliberate decision, not an accident.
      throw new CommandHandlerError(
        "release.observe-misrouted",
        "release.observe is handled by the command runtime's observe path, not by executeRequest.",
        false,
      );
    case "release.projection":
      return {
        operation: "release.projection",
        projection: buildReleaseProjectionV1(
          repositories.ascReleaseObservations,
          dependencies.releaseObserver,
          dependencies.observedAt,
        ),
      };
    case "studio.snapshot":
      return {
        operation: "studio.snapshot",
        snapshot: buildStudioSnapshotV1(
          repositories,
          dependencies.observedAt,
          loadProjectDocsSourcesV1(),
        ),
      };
    case "studio.assistant.query":
      return {
        operation: "studio.assistant.query",
        answer: computeAssistantAnswerV1(
          buildStudioSnapshotV1(repositories, dependencies.observedAt, loadProjectDocsSourcesV1()),
          request.payload.query,
        ),
      };
    case "studio.assistant.intent.propose":
      return {
        operation: "studio.assistant.intent.propose",
        intent: proposeAssistantIntentV1(
          request.payload,
          dependencies.observedAt,
          dependencies.idFactory,
          request.commandId,
        ),
      };
    case "studio.assistant.intent.execute": {
      // The inner commandId is derived deterministically from this execute command's own
      // commandId, so a retried execute call (same outer commandId) derives the identical inner
      // commandId and rides the dispatched operation's own existing idempotency below, rather than
      // this handler inventing a second idempotency mechanism.
      const innerCommandId = CommandIdSchema.parse(
        dependencies.idFactory("assistant-intent-dispatch", request.commandId),
      );
      const inner = buildAssistantIntentDispatchRequestV1(
        request.payload.intent,
        { issuedAt: request.issuedAt, origin: request.origin },
        innerCommandId,
      );
      assertPlausibleClientTimestamps(inner, dependencies.observedAt);
      assertKernelCommandIdentity(repositories, inner);

      const innerDurable = DURABLE_COMMAND_RESULT_OPERATIONS.has(inner.operation);
      let innerResult: CommandResultV1;
      if (innerDurable) {
        const existingInner = await readLedgerEntry(dependencies.paths, inner.commandId);
        if (existingInner !== null) {
          assertMatchingRequest(existingInner.request, inner);
          innerResult = existingInner.result;
        } else {
          innerResult = CommandResultV1Schema.parse(
            await executeRequest(repositories, database, inner, dependencies),
          );
          const persistedInner = await persistLedgerEntry(dependencies.paths, {
            ledgerVersion: RESULT_LEDGER_VERSION,
            request: inner,
            result: innerResult,
          });
          assertMatchingRequest(persistedInner.request, inner);
          innerResult = persistedInner.result;
        }
      } else {
        innerResult = CommandResultV1Schema.parse(
          await executeRequest(repositories, database, inner, dependencies),
        );
      }

      let outcome: AssistantIntentExecutionOutcomeV1;
      switch (innerResult.operation) {
        case "task.submit":
          outcome = { kind: "task.submit", result: innerResult };
          break;
        case "task.run":
          outcome = { kind: "task.run", result: innerResult };
          break;
        case "project.scan":
          outcome = { kind: "project.scan", result: innerResult };
          break;
        case "project.apply":
          outcome = { kind: "project.apply", result: innerResult };
          break;
        case "attempt.unblock":
          outcome = { kind: "attempt.unblock", result: innerResult };
          break;
        case "plan.propose":
          outcome = { kind: "plan.propose", result: innerResult };
          break;
        case "plan.execute":
          outcome = { kind: "plan.execute", result: innerResult };
          break;
        default:
          throw new CommandHandlerError(
            "assistant.intent-dispatch-unexpected-operation",
            `Unexpected dispatched operation ${innerResult.operation} for an assistant intent.`,
            false,
          );
      }
      return {
        operation: "studio.assistant.intent.execute",
        intentId: request.payload.intent.intentId,
        outcome,
      };
    }
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
  let roomRepository: RoomRepository;
  let roomsStatusPort: RoomsStatusPort;
  let knownStandardRuleIds: ReadonlySet<string>;
  try {
    await chmod(paths.database, 0o600);
    await assertPrivateRegularFile(paths.database);
    repositories = createFactoryRepositories(database);
    // Seam (a) of the project-registry task: idempotent at every daemon start (a call whose content
    // already matches the registry's head is a complete no-op), so a daemon configured with a local
    // execution profile always sees its one project as a real registered project, with no separate
    // `project.register` call required and nothing that used to work through the pre-registry
    // single-enrolled-project path regressing.
    if (options.selfRegisterProject !== undefined && options.selfRegisterProject !== null) {
      registerOrReconcileEnrolledProjectV1(repositories, options.selfRegisterProject, startedAt);
    }
    knownStandardRuleIds = loadKnownStandardRuleIdsV1(options.policySourcePath);
    // Idempotent by a fixed command ID: a no-op after the first daemon start ever ensures it.
    // Best-effort: a caller-configured `policySourcePath` that does not declare this preset's own
    // standard rule IDs (for example, a scoped-down policy source in a test) legitimately cannot
    // seed it — that is an honest "no default preset today", not a reason to fail daemon startup.
    try {
      seedIosAppStandardPresetV1(repositories, knownStandardRuleIds);
    } catch {
      // Left unseeded; preset.list simply reports none until an operator upserts one that fits
      // the configured policy source.
    }
    evidenceStore = new EvidenceStore(paths.evidence);
    // Always constructed, even with no pump composed: `effects.*` commands
    // are a read-only view over durable kernel state and must work whether
    // or not the daemon's own send/reconcile pump is enabled.
    effectRepository = createEffectRepository(database, {
      verifyObservationAttestation: verifyCanonicalObservationAttestation,
    });
    // Always constructed: `room.*` commands are a durable transcript whether
    // or not a moderator is composed to grant agents the floor.
    roomRepository = new RoomRepository(database);
    options.initializeDatabase?.(database);
    effectsPumpStatusPort =
      options.initializeEffects?.({
        database,
        effects: effectRepository,
        artifacts: repositories.artifacts,
        evidenceStore,
      }) ?? inertEffectPumpStatusPort;
    roomsStatusPort =
      options.initializeRooms?.({ database, rooms: roomRepository, evidenceStore }) ??
      inertRoomsStatusPort;
  } catch (error) {
    database.close();
    throw error;
  }
  const gitRuntimeRoot = resolveVerifiedLocalExecutionPaths(paths.root).gitRuntimeRoot;
  // `project.register` (and every other git-workspace-backed port composed below) must be able to
  // seal a Factory mirror even when no local execution profile is configured at all -- unlike the
  // enrolled-project-execution.ts path, nothing else guarantees this directory chain exists yet.
  await mkdir(gitRuntimeRoot, { recursive: true, mode: 0o700 });
  const runExportMirrors =
    options.runExportMirrors ??
    createRunExportMirrorPort({
      gitRuntimeRoot,
      ...(options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable }),
    });
  // Shared across `project.register`, `plan.execute`'s mirror port, and its broker-commit resolver:
  // `GitWorkspaceManager` is stateless beyond validating its own executable at construction, so one
  // instance is safe to reuse for every git-workspace-backed composition below.
  const projectRegistryGitWorkspace = new GitWorkspaceManager(
    options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable },
  );
  const planExecution: ProjectPlanExecutionDependencies = options.planExecution ?? {
    mirror: createRegistryBackedProjectPlanMirrorPortV1({
      gitWorkspace: projectRegistryGitWorkspace,
      gitRuntimeRoot,
      projectRegistry: repositories.projectRegistry,
    }),
    resolveBrokerCommit: createEvidenceBrokerCommitResolverV1({
      repositories,
      evidenceStore,
      gitRuntimeRoot,
      ...(options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable }),
    }),
    policyDigest: options.planPolicyDigest ?? Sha256DigestSchema.parse(`sha256:${"0".repeat(64)}`),
  };
  const phaseGitPortOptions = {
    gitRuntimeRoot,
    projectRegistry: repositories.projectRegistry,
    ...(options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable }),
  };
  const phaseOutputMirror =
    options.phaseOutputMirror ?? createPhaseOutputMirrorPort(phaseGitPortOptions);
  const phaseInputsReader =
    options.phaseInputsReader ?? createPhaseInputsReaderPort(phaseGitPortOptions);
  // No provider configured by default: see OpenDaemonCommandRuntimeOptions.phaseParticipants's doc
  // comment. `phase.run` still works end to end; it fails closed per-run instead.
  const phaseParticipants: PhaseParticipantsPort = options.phaseParticipants ?? {
    resolve: () => null,
  };
  const standardRuleStatements = loadStandardRuleStatementsV1(options.policySourcePath);
  const phaseRoomPort: PhaseRoomPort = {
    createPhaseRoom(input) {
      roomRepository.createRoom(
        {
          roomId: input.roomId,
          title: input.title,
          projectId: input.projectId,
          unattendedEnabled: false,
          agentCooldownEvents: 3,
          participants: input.participants,
          budget: {
            dailyCeilingTokens: 200_000,
            unattendedDailyCeilingTokens: 0,
            maxTokensPerReply: 4_000,
          },
        },
        input.now,
      );
      // The phase's purpose seeds the transcript as the room's first message, exactly like a human
      // opening the conversation — Phase Runner itself is not a room participant. Derived from the
      // room's own (already commandId-derived) ID, so it stays stable across an idempotent replay.
      const messageId = RoomMessageIdSchema.parse(
        deterministicUuidFromParts("phase-run-room-message", input.roomId),
      );
      roomRepository.appendHumanMessage({
        roomId: input.roomId,
        messageId,
        handle: RoomHumanHandleSchema.parse("phase-runner"),
        body: input.purpose,
        now: input.now,
      });
    },
  };
  const phaseRunCommands: PhaseRunCommandDependencies = {
    outputMirror: phaseOutputMirror,
    executionPorts: {
      participants: phaseParticipants,
      inputs: phaseInputsReader,
      rooms: phaseRoomPort,
      standardRuleStatements,
    },
    createTimeoutSignal: (timeoutSeconds) => AbortSignal.timeout(timeoutSeconds * 1_000),
  };
  const releaseObserver = options.releaseObserver ?? INERT_RELEASE_OBSERVER_PORT;
  const serial = new SerialExecutor();
  let closed = false;

  /**
   * `release.observe`: the one command whose work is a live provider read. The read runs OUTSIDE
   * the serial executor (Apple's answer can take seconds and must not stall every other command);
   * the ledger check before it and the persist + journal after it run inside, so idempotency and
   * durability are exactly the same as every other durable command. The observation ID is derived
   * from the command ID, so a concurrent duplicate that loses the race finds its own observation
   * already recorded (same digest → `inserted: false`) or its own ledger entry.
   */
  const observeRelease = async (
    request: Extract<CommandRequestV1, { operation: "release.observe" }>,
  ): Promise<CommandResultV1> => {
    const original = await serial.run(async () => {
      if (closed) throw closedError();
      const entry = await readLedgerEntry(paths, request.commandId);
      if (entry !== null) assertMatchingRequest(entry.request, request);
      return entry;
    });
    if (original !== null) return original.result;
    const observedAt = IsoInstantSchema.parse(now());
    assertPlausibleClientTimestamps(request, observedAt);
    const observationId = AscReleaseObservationIdSchema.parse(
      idFactory("asc-release-observation", request.commandId),
    );
    let observation: AscReleaseObservationV1;
    try {
      observation = await releaseObserver.observe({
        observationId,
        observedAt,
        buildsLimit: request.payload.buildsLimit,
        signal: AbortSignal.timeout(10 * 60 * 1_000),
      });
    } catch (error) {
      if (error instanceof ReleaseObserverNotConfiguredError) {
        throw new CommandHandlerError("release.observer-not-configured", error.message, false);
      }
      throw new CommandHandlerError(
        "release.observe-failed",
        `App Store Connect observation failed before any result could be recorded: ${
          error instanceof Error ? error.message : String(error)
        }`,
        true,
      );
    }
    return await serial.run(async () => {
      if (closed) throw closedError();
      const raced = await readLedgerEntry(paths, request.commandId);
      if (raced !== null) {
        assertMatchingRequest(raced.request, request);
        return raced.result;
      }
      const recorded = repositories.ascReleaseObservations.record(observation);
      const result = CommandResultV1Schema.parse({
        operation: "release.observe",
        observation: recorded.observation,
      });
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
        throw new CommandHandlerError(
          "command.result-persistence-ambiguous",
          "The command may have completed, but its durable result could not be confirmed. Retry with the same command ID and issuedAt.",
          true,
        );
      }
    });
  };

  const handler: CommandHandler = async (requestInput: CommandRequestV1) => {
    if (closed) throw closedError();
    const request = CommandRequestV1Schema.parse(requestInput);
    if (request.operation === "release.observe") return await observeRelease(request);
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
          taskPolicyGate: options.taskPolicyGate,
          runExportMirrors,
          rooms: roomRepository,
          roomsStatus: roomsStatusPort,
          knownStandardRuleIds,
          paths,
          planExecution,
          phaseRunCommands,
          projectRegistryGitWorkspace,
          gitRuntimeRoot,
          releaseObserver,
        }),
      );
      // A human post is the moderator's cue; the wake happens after the
      // authoritative append (and, for durable results, after journaling).
      if (request.operation === "room.post" && !persistResult) {
        roomsStatusPort.wake(request.payload.roomId);
      }
      if (!persistResult) return result;
      try {
        await options.commandResultLedgerBoundary?.({ request, result });
        const persisted = await persistLedgerEntry(paths, {
          ledgerVersion: RESULT_LEDGER_VERSION,
          request,
          result,
        });
        assertMatchingRequest(persisted.request, request);
        if (request.operation === "room.post") {
          roomsStatusPort.wake(request.payload.roomId);
        }
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
