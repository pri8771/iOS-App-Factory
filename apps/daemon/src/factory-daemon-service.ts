import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

import { AdapterRegistry } from "@app-factory/adapter-sdk";
import { AttemptIdSchema, Sha256DigestSchema, type AttemptId } from "@app-factory/contracts";
import { createCredentialBroker, type CredentialBroker } from "@app-factory/credential-broker";
import { GitWorkspaceManager } from "@app-factory/git-workspace";
import { createFactoryRepositories } from "@app-factory/kernel";
import type { EffectCredentialPort, EffectWorkerClockPort } from "@app-factory/effect-worker";
import type {
  SchedulerClockPort,
  SchedulerExecutionContext,
  SchedulerStepExecutorPort,
  SchedulerTickResult,
} from "@app-factory/scheduler";

import {
  CommandHandlerError,
  type CommandHandler,
  type CommandHandlerContext,
  startUnixCommandServer,
} from "./unix-command-server.js";
import {
  openDaemonCommandRuntime,
  resolveDaemonRuntimePaths,
  type DaemonCommandRuntime,
  type InitializeRoomsContext,
  type OpenDaemonCommandRuntimeOptions,
  type ProviderRegistryPort,
} from "./command-runtime.js";
import { defaultWait, interruptibleWait, type DaemonLoopWait } from "./daemon-loop-wait.js";
export { defaultWait, interruptibleWait, type DaemonLoopWait } from "./daemon-loop-wait.js";
import { createEffectSubsystem, type EffectSubsystem } from "./effect-pump.js";
import { createProviderRegistryPort, type VersionProbePort } from "./provider-command-runtime.js";
import { createKernelFactoryEventSource } from "./room-factory-event-source.js";
import {
  buildRoomsCompositionV1,
  type RoomParticipantsConfigV1,
} from "./room-participants-config.js";
import {
  createRoomsSubsystemHandle,
  createRoomSubsystem,
  type RoomSubsystem,
  type RoomsSubsystemHandle,
  type RoomSubsystemConfiguration,
} from "./room-subsystem.js";
export { nodeRoomProcessPort, type RoomSubsystemConfiguration } from "./room-subsystem.js";
import type { SignalScoutParticipantsPort } from "./signal-command-runtime.js";
import {
  createSignalSchedulerSubsystem,
  type SignalSchedulerRepositories,
  type SignalSchedulerSubsystem,
} from "./signal-scheduler.js";
import {
  createKernelSchedulerController,
  type KernelSchedulerController,
} from "./kernel-scheduler-adapter.js";
import type { LocalExecutionProfileDependencies } from "./local-execution-profile.js";
import { loadStandardRuleStatementsV1 } from "./phase-command-runtime.js";
import {
  createPlannerProjectResolver,
  renderPlannerAgentPolicyV1,
  type PlannerExecutionConfigV1,
} from "./planner-project-execution.js";
import {
  VerifiedLocalExecutionExecutor,
  decodeReviewedPolicyPayload,
  resolveVerifiedLocalExecutionPaths,
  type VerifiedLocalExecutionConfiguration,
  type VerifiedLocalExecutionPaths,
} from "./verified-local-executor.js";

const COMMAND_SOCKET_FILE_NAME = "daemon.sock";
const DEFAULT_POLL_INTERVAL_MS = 100;
const MAX_POLL_INTERVAL_MS = 60_000;

export type DeterministicFakeExecutorOptions = Readonly<{
  delayMs?: number;
  wait?: DaemonLoopWait;
}>;

/**
 * Optional effect subsystem: EffectWorker + a bounded-backoff pump loop over
 * the kernel's effect outbox. Disabled (`enabled: false`, the default when
 * this whole option is omitted) leaves `effects.*` commands working as a
 * read-only view over durable kernel state with no pump running at all.
 * Adapter registration is deliberately code-level, not config-level: the
 * registry `createEffectSubsystem` builds always starts empty, and
 * `configureAdapters` is the one typed seam a future task uses to register
 * real provider adapters once their credentials exist.
 */
export type EffectSubsystemConfiguration = Readonly<{
  enabled: boolean;
  configureAdapters?: (registry: AdapterRegistry) => void;
  credentials?: EffectCredentialPort;
  claimDurationMs?: number;
  adapterCallTimeoutMs?: number;
  reconcileDelayMs?: number;
  pollIntervalMs?: number;
  maxBackoffMs?: number;
  wait?: DaemonLoopWait;
  clock?: EffectWorkerClockPort;
  onError?: (error: unknown) => void;
}>;

/**
 * Optional signal scheduler (`signal-scheduler.ts`, Architecture decision 11, Wave 7): checks at
 * most one due signal per pass, entirely outside the serial executor. Disabled (`enabled: false`,
 * the default when this whole option is omitted) leaves `signal.*` working exactly as before --
 * `signal.run-now` still runs a check manually, `checkIntervalMinutes` is simply never acted on
 * unattended. `pollIntervalMs` here is the SCHEDULER's own poll cadence, distinct from the daemon's
 * global `pollIntervalMs` -- the daemon composition (`daemon-entrypoint.ts`) is expected to pass
 * `Math.max(globalPollIntervalMs, 30_000)`, never the raw (potentially sub-second) global value.
 */
export type SignalSchedulerConfiguration = Readonly<{
  enabled: boolean;
  pollIntervalMs?: number;
  maxBackoffMs?: number;
  scoutCallTimeoutMs?: number;
  wait?: DaemonLoopWait;
  clock?: Readonly<{ now(): Date }>;
  onError?: (error: unknown) => void;
}>;

/** See `StartFactoryDaemonServiceOptions.providerRegistry`. */
export type ProviderRegistryConfiguration = Readonly<{
  /** Absolute path to the participants config JSON file (the same one `rooms`/`phaseParticipants`
   *  were built from). */
  configPath: string;
  containmentAttestationPath?: string;
  /** Test seam: overrides the default `createCredentialBroker()`. */
  credentialBroker?: CredentialBroker;
  /** Test seam: overrides the real `child_process.spawn`-based codex/claude `--version` probe. */
  versionProbe?: VersionProbePort;
  /** Test seam: overrides the platform `fetch` the ollama/OpenRouter health probes use. */
  fetchImpl?: typeof fetch;
}>;

export type StartFactoryDaemonServiceOptions = Readonly<{
  runtimeDirectory: string;
  authorization: string;
  daemonVersion: string;
  ownerId?: string;
  startedAt?: string;
  now?: () => string;
  schedulerClock?: SchedulerClockPort;
  executor?: SchedulerStepExecutorPort;
  /**
   * Explicit local-only real execution. Omitted by default; it is mutually
   * exclusive with a directly injected executor.
   */
  localExecution?: VerifiedLocalExecutionConfiguration;
  leaseDurationMs?: number;
  pollIntervalMs?: number;
  wait?: DaemonLoopWait;
  /** Disable event-driven wakeups for polling-only diagnostics and deterministic harnesses. */
  wakeOnCommand?: boolean;
  commandResultLedgerBoundary?: OpenDaemonCommandRuntimeOptions["commandResultLedgerBoundary"];
  /** Default OFF: omit or pass `{ enabled: false }` to keep task intake ungated. */
  taskPolicyGate?: OpenDaemonCommandRuntimeOptions["taskPolicyGate"];
  onSchedulerError?: (error: unknown) => void;
  /** Default OFF: omit or pass `{ enabled: false }` to keep the effect pump fully inert. */
  effects?: EffectSubsystemConfiguration;
  /** Default OFF: omit or pass `{ enabled: false }` to keep the room moderator inert. */
  rooms?: RoomSubsystemConfiguration;
  /** Default OFF: omit or pass `{ enabled: false }` to keep the signal scheduler inert
   *  (`signal.run-now` still works manually). See `SignalSchedulerConfiguration`. */
  signalScheduler?: SignalSchedulerConfiguration;
  /** Seam (b) of the project-registry task: resolves a real `ParticipantAdapter` per cast provider
   * for `phase.run`, built from the SAME room roster config `rooms` (above) uses
   * (`room-participants-config.ts`'s `loadPhaseParticipantsPortV1`). Default: `phase.run` fails
   * closed per-run (`participant-unconfigured`) exactly like `rooms` omitted. */
  phaseParticipants?: OpenDaemonCommandRuntimeOptions["phaseParticipants"];
  /** See `OpenDaemonCommandRuntimeOptions.phaseProviderCatalog`'s doc comment; also feeds the
   *  signal scheduler's (`signalScheduler`, below) `token_usage` attribution when enabled -- the
   *  SAME resolver, never a second one. */
  phaseProviderCatalog?: OpenDaemonCommandRuntimeOptions["phaseProviderCatalog"];
  /** Default inert: see `OpenDaemonCommandRuntimeOptions.releaseObserver`. */
  releaseObserver?: OpenDaemonCommandRuntimeOptions["releaseObserver"];
  /**
   * Default OFF: omit to keep `provider.*` degraded (Architecture decisions 2-3). When set, builds
   * the real `ProviderRegistryPort` (`provider-command-runtime.ts`) over the SAME participants
   * config file `rooms`/`phaseParticipants` (above) were loaded from, and wires its hot-reload
   * callback to `rooms`' own `RoomsSubsystemHandle` -- a successful `provider.upsert`/`remove`/
   * `credential.set` swaps the live rooms subsystem with no daemon restart.
   */
  providerRegistry?: ProviderRegistryConfiguration;
  /**
   * Planner execution (`planner-project-execution.ts`): lets the verified executor run the task
   * items of owner-approved plans against ANY registered project (Project Registry + mirror binding
   * tip), with or without a static `localExecution` profile. Default OFF.
   */
  plannerExecution?: Readonly<{
    config: PlannerExecutionConfigV1;
    /** Test seam for the Codex agent factory (fixture mode never consults it). */
    profileDependencies?: LocalExecutionProfileDependencies;
    /** Absolute path of the compiled policy source the planner policy text is rendered from. */
    policySourcePath?: string;
    onDiagnostic?: (message: string) => void;
    /** Test seam: see `PlannerProjectResolverDependencies.verificationPlansFor`. */
    verificationPlansFor?: (
      moduleName: string,
    ) => VerifiedLocalExecutionConfiguration["projects"][number]["verificationPlans"];
  }>;
}>;

export type FactoryDaemonService = Readonly<{
  runtimeDirectory: string;
  socketPath: string;
  executionPaths: VerifiedLocalExecutionPaths;
  startedAt: string;
  getLastSchedulerError(): unknown | null;
  getLastEffectsPumpError(): unknown | null;
  getLastRoomsError(): unknown | null;
  getLastSignalSchedulerError(): unknown | null;
  close(): Promise<void>;
}>;

type StartupRecoverableExecutor = SchedulerStepExecutorPort &
  Readonly<{
    reconcileStartup?: () => Promise<StartupRecoveryPlanV1 | undefined>;
  }>;

type StartupRecoveryPlanV1 = Readonly<{
  schemaVersion: 1;
  pendingAttemptIds: readonly AttemptId[];
}>;

function parseStartupRecoveryPlan(value: unknown): StartupRecoveryPlanV1 {
  if (value === undefined) return { schemaVersion: 1, pendingAttemptIds: [] };
  if (typeof value !== "object" || value === null) {
    throw new Error("Daemon startup recovery returned an invalid plan");
  }
  const candidate = value as Readonly<Record<string, unknown>>;
  if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.pendingAttemptIds)) {
    throw new Error("Daemon startup recovery returned an unsupported plan");
  }
  const pendingAttemptIds = candidate.pendingAttemptIds.map((attemptId) =>
    AttemptIdSchema.parse(attemptId),
  );
  if (
    new Set(pendingAttemptIds).size !== pendingAttemptIds.length ||
    pendingAttemptIds.some(
      (attemptId, index) => index > 0 && attemptId <= (pendingAttemptIds[index - 1] as string),
    )
  ) {
    throw new Error("Daemon startup recovery attempts must be unique and sorted");
  }
  return { schemaVersion: 1, pendingAttemptIds };
}

function validateDelay(label: string, value: number, maximum = MAX_POLL_INTERVAL_MS): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`${label} must be a safe integer between 0 and ${String(maximum)}`);
  }
  return value;
}

function abortedExecution(): Error {
  const error = new Error("The deterministic fake execution was aborted.");
  error.name = "AbortError";
  return error;
}

/**
 * Week-2 executor used by the local vertical slice. It has no external effects:
 * each successful output is a stable digest of the scheduler's idempotency key.
 */
export class DeterministicFakeExecutor implements SchedulerStepExecutorPort {
  readonly #delayMs: number;
  readonly #wait: DaemonLoopWait;

  public constructor(options: DeterministicFakeExecutorOptions = {}) {
    this.#delayMs = validateDelay("delayMs", options.delayMs ?? 0);
    this.#wait = options.wait ?? defaultWait;
  }

  public async execute(context: SchedulerExecutionContext) {
    if (context.signal.aborted) throw abortedExecution();
    await context.assertActive();
    if (this.#delayMs > 0) await this.#wait(this.#delayMs, context.signal);
    if (context.signal.aborted) throw abortedExecution();
    await context.assertActive();
    return {
      kind: "succeeded" as const,
      outputDigest: Sha256DigestSchema.parse(
        `sha256:${createHash("sha256")
          .update(`app-factory.fake-executor.v1\0${context.effectKey}`)
          .digest("hex")}`,
      ),
    };
  }
}

function shouldDrain(result: SchedulerTickResult): boolean {
  return (
    result.kind === "paused" ||
    result.kind === "cancelled" ||
    result.kind === "succeeded" ||
    result.kind === "failed"
  );
}

class BackgroundSchedulerLoop {
  readonly #controller: KernelSchedulerController;
  readonly #pollIntervalMs: number;
  readonly #wait: DaemonLoopWait;
  readonly #onError: ((error: unknown) => void) | undefined;
  readonly #afterTick: (() => void) | undefined;
  #stopping = false;
  #wakePending = false;
  #waitAbort: AbortController | null = null;
  #runPromise: Promise<void> | null = null;
  #lastError: unknown | null = null;

  public constructor(
    controller: KernelSchedulerController,
    options: Readonly<{
      pollIntervalMs: number;
      wait: DaemonLoopWait;
      onError?: (error: unknown) => void;
      /**
       * Runs after every tick (successful or not), on the loop's own serial
       * chain: the seam the room factory-event bridge drains on, so a kernel
       * attempt transition the tick just committed reaches its rooms within
       * the same poll cycle. Must not throw; anything it does throw is
       * recorded like a scheduler error and never stops the loop.
       */
      afterTick?: () => void;
    }>,
  ) {
    this.#controller = controller;
    this.#pollIntervalMs = options.pollIntervalMs;
    this.#wait = options.wait;
    this.#onError = options.onError;
    this.#afterTick = options.afterTick;
  }

  public get lastError(): unknown | null {
    return this.#lastError;
  }

  public start(): void {
    if (this.#runPromise !== null) return;
    this.#runPromise = this.#run();
  }

  public wake(): void {
    if (this.#stopping) return;
    this.#wakePending = true;
    this.#waitAbort?.abort();
  }

  public requestStop(): void {
    this.#stopping = true;
    this.#waitAbort?.abort();
  }

  public async stopped(): Promise<void> {
    await this.#runPromise;
  }

  #recordError(error: unknown): void {
    this.#lastError = error;
    try {
      this.#onError?.(error);
    } catch (observerError) {
      this.#lastError = new AggregateError(
        [error, observerError],
        "The scheduler and its error observer both failed",
      );
    }
  }

  async #run(): Promise<void> {
    while (!this.#stopping) {
      this.#wakePending = false;
      let result: SchedulerTickResult | null = null;
      try {
        result = await this.#controller.tick();
        this.#lastError = null;
      } catch (error) {
        this.#recordError(error);
      }
      try {
        this.#afterTick?.();
      } catch (error) {
        this.#recordError(error);
      }
      if (this.#stopping) return;
      if (result !== null && shouldDrain(result)) continue;
      if (this.#wakePending) continue;

      const waitAbort = new AbortController();
      this.#waitAbort = waitAbort;
      try {
        await interruptibleWait(this.#wait, this.#pollIntervalMs, waitAbort.signal);
      } catch (error) {
        if (!waitAbort.signal.aborted) {
          this.#recordError(error);
        }
      } finally {
        if (this.#waitAbort === waitAbort) this.#waitAbort = null;
      }
    }
  }
}

function shouldWakeScheduler(operation: string): boolean {
  return (
    operation === "task.submit" ||
    operation === "task.run" ||
    operation === "attempt.pause" ||
    operation === "attempt.resume" ||
    operation === "attempt.cancel" ||
    operation === "task.retry" ||
    operation === "attempt.unblock" ||
    operation === "daemon.reconcile"
  );
}

function closingError(): CommandHandlerError {
  return new CommandHandlerError(
    "daemon.shutting-down",
    "The daemon is shutting down and is no longer accepting commands.",
    true,
  );
}

function startingError(): CommandHandlerError {
  return new CommandHandlerError(
    "daemon.starting",
    "The daemon has acquired ownership but has not finished starting.",
    true,
  );
}

/**
 * Owns the command socket, the one SQLite connection, and the scheduler loop.
 * Socket ownership is acquired first, so a losing daemon never opens SQLite.
 */
export async function startFactoryDaemonService(
  options: StartFactoryDaemonServiceOptions,
): Promise<FactoryDaemonService> {
  if (options.executor !== undefined && options.localExecution !== undefined) {
    throw new TypeError("executor and localExecution are mutually exclusive");
  }
  const paths = resolveDaemonRuntimePaths(options.runtimeDirectory);
  const executionPaths = resolveVerifiedLocalExecutionPaths(paths.root);
  const socketPath = join(paths.root, COMMAND_SOCKET_FILE_NAME);
  const pollIntervalMs = validateDelay(
    "pollIntervalMs",
    options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  );
  if (pollIntervalMs === 0) {
    throw new TypeError("pollIntervalMs must be greater than zero");
  }
  const wait = options.wait ?? defaultWait;
  const ownerId = options.ownerId ?? `daemon.${randomUUID()}`;

  let runtime: DaemonCommandRuntime | null = null;
  const schedulerState: { controller: KernelSchedulerController | null } = {
    controller: null,
  };
  const effectsState: { subsystem: EffectSubsystem | null } = { subsystem: null };
  const roomsState: {
    handle: RoomsSubsystemHandle | null;
    context: InitializeRoomsContext | null;
  } = { handle: null, context: null };
  const signalSchedulerState: { subsystem: SignalSchedulerSubsystem | null } = { subsystem: null };
  let loop: BackgroundSchedulerLoop | null = null;
  let closing = false;
  let ready = false;
  const startupState: {
    recovery: (() => Promise<StartupRecoveryPlanV1>) | null;
  } = { recovery: null };

  const handler: CommandHandler = async (request, context: CommandHandlerContext) => {
    if (closing) throw closingError();
    const activeRuntime = runtime;
    if (activeRuntime === null || !ready) throw startingError();
    try {
      const result = await activeRuntime.handler(request, context);
      if (
        request.operation !== "attempt.cancel" &&
        options.wakeOnCommand !== false &&
        shouldWakeScheduler(request.operation)
      ) {
        // activeRuntime.handler returns mutating command results only after
        // their durable result-ledger entry is published. In particular,
        // daemon.reconcile never executes a scheduler tick on the command
        // stack; this transient wake happens strictly after durable linkage.
        loop?.wake();
      }
      return result;
    } finally {
      if (request.operation === "attempt.cancel") {
        let cancellationPersisted = false;
        try {
          cancellationPersisted =
            schedulerState.controller?.interruptActiveCancellation(request.payload.attemptId) ??
            false;
        } catch {
          // Preserve the command result/error. The polling loop remains a
          // fail-safe if authoritative cancellation state cannot be read here.
        }
        if (cancellationPersisted && options.wakeOnCommand !== false) loop?.wake();
      }
    }
  };

  const server = await startUnixCommandServer({
    socketPath,
    authorization: options.authorization,
    handler,
  });

  const effectsConfig = options.effects;
  const initializeEffects: OpenDaemonCommandRuntimeOptions["initializeEffects"] =
    effectsConfig?.enabled === true
      ? (context) => {
          const registry = new AdapterRegistry();
          // The registry starts empty by contract; this is the one typed
          // seam a later task uses to register real provider adapters.
          effectsConfig.configureAdapters?.(registry);
          const subsystem = createEffectSubsystem({
            ownerId,
            effects: context.effects,
            artifacts: context.artifacts,
            evidenceStore: context.evidenceStore,
            adapters: registry,
            ...(effectsConfig.credentials === undefined
              ? {}
              : { credentials: effectsConfig.credentials }),
            ...(effectsConfig.claimDurationMs === undefined
              ? {}
              : { claimDurationMs: effectsConfig.claimDurationMs }),
            ...(effectsConfig.adapterCallTimeoutMs === undefined
              ? {}
              : { adapterCallTimeoutMs: effectsConfig.adapterCallTimeoutMs }),
            ...(effectsConfig.reconcileDelayMs === undefined
              ? {}
              : { reconcileDelayMs: effectsConfig.reconcileDelayMs }),
            ...(effectsConfig.pollIntervalMs === undefined
              ? {}
              : { pollIntervalMs: effectsConfig.pollIntervalMs }),
            ...(effectsConfig.maxBackoffMs === undefined
              ? {}
              : { maxBackoffMs: effectsConfig.maxBackoffMs }),
            ...(effectsConfig.wait === undefined ? {} : { wait: effectsConfig.wait }),
            ...(effectsConfig.clock === undefined ? {} : { clock: effectsConfig.clock }),
            ...(effectsConfig.onError === undefined ? {} : { onError: effectsConfig.onError }),
          });
          effectsState.subsystem = subsystem;
          return subsystem.statusPort;
        }
      : undefined;

  const roomsConfig = options.rooms;
  const daemonNow = options.now;

  /**
   * Builds a real `RoomSubsystem` from `configuration` over `context` -- shared by the initial
   * `initializeRooms` composition below AND by `reloadRoomsFromConfig` (Architecture decision 3),
   * so a hot-swapped subsystem gets the exact same `factoryEventSource`/`quota`/`clock` resolution
   * the daemon always applies, never a second, drifted copy of this logic.
   */
  function composeRoomSubsystem(
    configuration: RoomSubsystemConfiguration,
    context: InitializeRoomsContext,
  ): RoomSubsystem {
    // The moderator shares the command runtime's notion of "now" unless a clock is injected
    // explicitly, so attendance and lease arithmetic agree with the instants stamped on human
    // posts. `quota` is resolved here (rather than at `startFactoryDaemonService` call time) when
    // only a `quotaFactory` was supplied, since the kernel database handle a database-backed
    // governor needs does not exist until the command runtime opens it.
    const resolvedQuota =
      configuration.quota ??
      (configuration.quotaFactory === undefined
        ? undefined
        : configuration.quotaFactory(context.database));
    // The factory-event bridge is the missing half of unattended mode (a dormant room acts only on
    // `factory-event` triggers), so it is composed whenever rooms are: over the SAME kernel
    // database handle, with the daemon's evidence store for broker-commit lookups.
    // `factoryEventSource` in the configuration is a test seam (a fake ledger); the daemon never
    // leaves it out.
    const factoryEventSource =
      configuration.factoryEventSource ??
      createKernelFactoryEventSource({
        database: context.database,
        evidenceStore: context.evidenceStore,
      });
    return createRoomSubsystem(
      {
        ...configuration,
        factoryEventSource,
        ...(resolvedQuota === undefined ? {} : { quota: resolvedQuota }),
        ...(configuration.clock === undefined && daemonNow !== undefined
          ? { clock: { now: () => new Date(daemonNow()) } }
          : {}),
      },
      context.rooms,
    );
  }

  const initializeRooms: OpenDaemonCommandRuntimeOptions["initializeRooms"] =
    roomsConfig?.enabled === true
      ? (context) => {
          const handle = createRoomsSubsystemHandle();
          handle.adopt(composeRoomSubsystem(roomsConfig, context));
          roomsState.handle = handle;
          roomsState.context = context;
          return handle.statusPort;
        }
      : undefined;

  /**
   * `provider.upsert`/`provider.remove`/`provider.credential.set`'s hot-reload callback
   * (Architecture decision 3): rebuilds the moderator/contributor/providerCatalog from the
   * freshly-written participants config and swaps it into the live `RoomsSubsystemHandle`,
   * preserving every OTHER setting `roomsConfig` originally specified (a test-injected clock,
   * `onError`/`onRound`, `dormancyMs`, ...). A no-op when rooms were never enabled at all -- the
   * write to the config file already happened; there is simply nothing to swap.
   */
  const reloadRoomsFromConfig = async (
    nextParticipantsConfig: RoomParticipantsConfigV1,
    attested: boolean,
  ): Promise<void> => {
    if (roomsState.handle === null || roomsState.context === null || roomsConfig === undefined) {
      return;
    }
    const { subsystemConfiguration } = buildRoomsCompositionV1(nextParticipantsConfig, attested);
    const merged: RoomSubsystemConfiguration = {
      ...roomsConfig,
      ...subsystemConfiguration,
      enabled: true,
    };
    await roomsState.handle.swap(composeRoomSubsystem(merged, roomsState.context));
  };

  const providerRegistryConfig = options.providerRegistry;
  const providerRegistry: ProviderRegistryPort | undefined =
    providerRegistryConfig === undefined
      ? undefined
      : createProviderRegistryPort({
          configPath: providerRegistryConfig.configPath,
          ...(providerRegistryConfig.containmentAttestationPath === undefined
            ? {}
            : { containmentAttestationPath: providerRegistryConfig.containmentAttestationPath }),
          credentialBroker: providerRegistryConfig.credentialBroker ?? createCredentialBroker(),
          ...(providerRegistryConfig.versionProbe === undefined
            ? {}
            : { versionProbe: providerRegistryConfig.versionProbe }),
          ...(providerRegistryConfig.fetchImpl === undefined
            ? {}
            : { fetchImpl: providerRegistryConfig.fetchImpl }),
          reloadRooms: reloadRoomsFromConfig,
        });

  // Planner execution: the reviewed policy every plan-submitted task binds to is rendered ONCE here
  // (pure in its inputs), its digest handed to the command runtime for `plan.execute`/`plan.tick`
  // and its bytes to the resolver the executor consults -- one text, one digest, two consumers.
  const plannerPolicy =
    options.plannerExecution === undefined
      ? null
      : decodeReviewedPolicyPayload(
          renderPlannerAgentPolicyV1(
            loadStandardRuleStatementsV1(options.plannerExecution.policySourcePath),
          ),
        );

  try {
    runtime = await openDaemonCommandRuntime({
      runtimeDirectory: paths.root,
      daemonVersion: options.daemonVersion,
      ...(plannerPolicy === null ? {} : { planPolicyDigest: plannerPolicy.digest }),
      ...(options.startedAt === undefined ? {} : { startedAt: options.startedAt }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.commandResultLedgerBoundary === undefined
        ? {}
        : { commandResultLedgerBoundary: options.commandResultLedgerBoundary }),
      ...(options.taskPolicyGate === undefined ? {} : { taskPolicyGate: options.taskPolicyGate }),
      ...(options.localExecution?.gitExecutable === undefined
        ? {}
        : { gitExecutable: options.localExecution.gitExecutable }),
      // Seam (a) of the project-registry task: whichever single project the local execution
      // profile prepared a mirror for self-registers idempotently at every daemon start. `null`
      // when no local execution profile is configured (the deterministic fake executor path).
      selfRegisterProject: (() => {
        const project = options.localExecution?.projects[0];
        return project === undefined
          ? null
          : {
              repositoryId: project.repositoryId,
              sourceRepositoryPath: project.sourceRepositoryPath,
            };
      })(),
      ...(options.phaseParticipants === undefined
        ? {}
        : { phaseParticipants: options.phaseParticipants }),
      ...(options.phaseProviderCatalog === undefined
        ? {}
        : { phaseProviderCatalog: options.phaseProviderCatalog }),
      ...(options.releaseObserver === undefined
        ? {}
        : { releaseObserver: options.releaseObserver }),
      initializeDatabase: (database) => {
        const plannerResolver =
          options.plannerExecution === undefined || plannerPolicy === null
            ? null
            : ((): ReturnType<typeof createPlannerProjectResolver> => {
                const repositories = createFactoryRepositories(database);
                const gitExecutable = options.localExecution?.gitExecutable;
                return createPlannerProjectResolver({
                  config: options.plannerExecution.config,
                  runtimeDirectory: paths.root,
                  gitRuntimeRoot: executionPaths.gitRuntimeRoot,
                  gitWorkspace: new GitWorkspaceManager(
                    gitExecutable === undefined ? {} : { gitExecutable },
                  ),
                  projectRegistry: repositories.projectRegistry,
                  projectPlans: repositories.projectPlans,
                  policyBytes: plannerPolicy.bytes,
                  ...(options.plannerExecution.profileDependencies === undefined
                    ? {}
                    : { profileDependencies: options.plannerExecution.profileDependencies }),
                  ...(options.plannerExecution.onDiagnostic === undefined
                    ? {}
                    : { onDiagnostic: options.plannerExecution.onDiagnostic }),
                  ...(options.plannerExecution.verificationPlansFor === undefined
                    ? {}
                    : { verificationPlansFor: options.plannerExecution.verificationPlansFor }),
                });
              })();
        const executor: StartupRecoverableExecutor =
          options.executor ??
          (options.localExecution === undefined && plannerResolver === null
            ? new DeterministicFakeExecutor()
            : new VerifiedLocalExecutionExecutor({
                projects: [],
                ...options.localExecution,
                ...(plannerResolver === null
                  ? {}
                  : { resolveProject: plannerResolver.resolveProject }),
                database,
                ownerId,
                runtimeDirectory: paths.root,
              }));
        if (executor.reconcileStartup !== undefined) {
          startupState.recovery = async () => {
            const result = await executor.reconcileStartup?.();
            return parseStartupRecoveryPlan(result);
          };
        }
        schedulerState.controller = createKernelSchedulerController({
          database,
          ownerId,
          executor,
          ...(options.schedulerClock === undefined ? {} : { clock: options.schedulerClock }),
          ...(options.leaseDurationMs === undefined
            ? {}
            : { leaseDurationMs: options.leaseDurationMs }),
        });
        // Signal scheduler (Wave 7, Architecture decision 11): built over the SAME database handle
        // and the SAME `phaseParticipants`/`phaseProviderCatalog` ports `phase.run` and
        // `signal.run-now` use -- default OFF (`signalScheduler.enabled` unset or false), matching
        // `effects`/`rooms`'s own opt-in shape.
        const signalSchedulerConfig = options.signalScheduler;
        if (signalSchedulerConfig?.enabled === true) {
          const schedulerRepositories: SignalSchedulerRepositories =
            createFactoryRepositories(database);
          // Signals reuse the SAME configured room-participant adapters phases do (no separate
          // "which providers may scout" configuration exists) -- the exact coercion
          // `command-runtime.ts`'s own `signalScoutParticipants` already relies on.
          const scoutParticipants: SignalScoutParticipantsPort = {
            resolve: (provider) =>
              options.phaseParticipants?.resolve(
                provider as Parameters<
                  NonNullable<OpenDaemonCommandRuntimeOptions["phaseParticipants"]>["resolve"]
                >[0],
              ) ?? null,
          };
          signalSchedulerState.subsystem = createSignalSchedulerSubsystem({
            repositories: schedulerRepositories,
            scoutParticipants,
            providerCatalog: options.phaseProviderCatalog ?? {
              resolve: (provider) => {
                throw new Error(
                  `No provider catalog is configured for signal token-usage attribution (resolving "${String(provider)}").`,
                );
              },
            },
            ...(signalSchedulerConfig.pollIntervalMs === undefined
              ? {}
              : { pollIntervalMs: signalSchedulerConfig.pollIntervalMs }),
            ...(signalSchedulerConfig.maxBackoffMs === undefined
              ? {}
              : { maxBackoffMs: signalSchedulerConfig.maxBackoffMs }),
            ...(signalSchedulerConfig.scoutCallTimeoutMs === undefined
              ? {}
              : { scoutCallTimeoutMs: signalSchedulerConfig.scoutCallTimeoutMs }),
            ...(signalSchedulerConfig.wait === undefined
              ? {}
              : { wait: signalSchedulerConfig.wait }),
            ...(signalSchedulerConfig.clock === undefined
              ? {}
              : { clock: signalSchedulerConfig.clock }),
            ...(signalSchedulerConfig.onError === undefined
              ? {}
              : { onError: signalSchedulerConfig.onError }),
          });
        }
      },
      ...(initializeEffects === undefined ? {} : { initializeEffects }),
      ...(initializeRooms === undefined ? {} : { initializeRooms }),
      ...(providerRegistry === undefined ? {} : { providerRegistry }),
    });
    const activeController = schedulerState.controller;
    if (activeController === null) {
      throw new Error("The daemon runtime did not initialize its scheduler controller");
    }
    if (startupState.recovery !== null) {
      let recoveryPlan = await startupState.recovery();
      if (recoveryPlan.pendingAttemptIds.length > 0) {
        const recoveryDeadline =
          Date.now() + (options.leaseDurationMs ?? 30_000) + Math.max(5_000, pollIntervalMs * 2);
        activeController.setStartupRecoveryScope(recoveryPlan.pendingAttemptIds);
        try {
          while (recoveryPlan.pendingAttemptIds.length > 0) {
            const admitted = new Set(recoveryPlan.pendingAttemptIds);
            const tickResult = await activeController.tick();
            if (
              "attemptId" in tickResult &&
              tickResult.attemptId !== null &&
              !admitted.has(AttemptIdSchema.parse(tickResult.attemptId))
            ) {
              throw new Error(
                `Startup recovery scheduler escaped its admitted attempt scope: ${tickResult.attemptId}`,
              );
            }

            const refreshedPlan = await startupState.recovery();
            if (refreshedPlan.pendingAttemptIds.length === 0) {
              recoveryPlan = refreshedPlan;
              break;
            }
            activeController.setStartupRecoveryScope(refreshedPlan.pendingAttemptIds);

            const unchanged =
              refreshedPlan.pendingAttemptIds.length === recoveryPlan.pendingAttemptIds.length &&
              refreshedPlan.pendingAttemptIds.every(
                (attemptId, index) => attemptId === recoveryPlan.pendingAttemptIds[index],
              );
            recoveryPlan = refreshedPlan;
            if (!unchanged) continue;

            if (
              tickResult.kind === "contended" ||
              tickResult.kind === "busy" ||
              tickResult.kind === "fenced" ||
              tickResult.kind === "interrupted"
            ) {
              if (Date.now() >= recoveryDeadline) {
                throw new Error(
                  "Startup recovery could not acquire a fresh scheduler lease before its bounded deadline",
                );
              }
              await wait(Math.min(pollIntervalMs, 250), new AbortController().signal);
              continue;
            }
            throw new Error(
              `Startup recovery did not reconcile its admitted OCI run after scheduler result ${tickResult.kind}`,
            );
          }
        } finally {
          activeController.setStartupRecoveryScope(null);
        }
      }
    }
    loop = new BackgroundSchedulerLoop(activeController, {
      pollIntervalMs,
      wait,
      ...(options.onSchedulerError === undefined ? {} : { onError: options.onSchedulerError }),
      // Rooms absent: nothing to drain (fail closed, no second event bus).
      // The bridge itself never throws from drain (it records and reports
      // through the rooms `onError` port), so this cannot poison the loop.
      afterTick: () => {
        roomsState.handle?.drainFactoryEvents();
      },
    });
    loop.start();
    // The pump starts only once every other composition step (including
    // startup recovery) has completed without throwing, the same instant the
    // daemon is about to declare itself ready to accept commands.
    effectsState.subsystem?.start();
    // The room moderator sweeps orphaned grants and resumes pending rooms at
    // the same instant, strictly after startup recovery succeeded.
    roomsState.handle?.start();
    // The signal scheduler starts at the same instant, strictly after startup recovery succeeded --
    // it may immediately dispatch a real model call for a signal that was already due.
    signalSchedulerState.subsystem?.start();
    ready = true;
  } catch (error) {
    await signalSchedulerState.subsystem?.stop().catch(() => undefined);
    await roomsState.handle?.stop().catch(() => undefined);
    await effectsState.subsystem?.stop().catch(() => undefined);
    await schedulerState.controller?.stop().catch(() => undefined);
    runtime?.close();
    await server.close().catch(() => undefined);
    throw error;
  }

  const activeRuntime = runtime;
  const activeController = schedulerState.controller;
  const activeLoop = loop;
  const activeEffectsSubsystem = effectsState.subsystem;
  const activeRoomsHandle = roomsState.handle;
  const activeSignalScheduler = signalSchedulerState.subsystem;
  if (activeRuntime === null || activeController === null || activeLoop === null) {
    throw new Error("The daemon composition finished without all owned components");
  }
  let closePromise: Promise<void> | null = null;

  return {
    runtimeDirectory: paths.root,
    socketPath,
    executionPaths,
    startedAt: activeRuntime.startedAt,
    getLastSchedulerError: () => activeLoop.lastError,
    getLastEffectsPumpError: () => activeEffectsSubsystem?.loop.lastError ?? null,
    getLastRoomsError: () => activeRoomsHandle?.lastError() ?? null,
    getLastSignalSchedulerError: () => activeSignalScheduler?.loop.lastError ?? null,
    close: async () => {
      if (closePromise !== null) return await closePromise;
      closing = true;
      activeLoop.requestStop();
      closePromise = (async () => {
        const serverClose = server.close();
        const results = await Promise.allSettled([
          serverClose,
          activeController.stop(),
          activeLoop.stopped(),
          activeEffectsSubsystem === null ? Promise.resolve() : activeEffectsSubsystem.stop(),
          activeRoomsHandle === null ? Promise.resolve() : activeRoomsHandle.stop(),
          activeSignalScheduler === null ? Promise.resolve() : activeSignalScheduler.stop(),
        ]);
        activeRuntime.close();
        const failures = results
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason);
        if (failures.length > 0) {
          throw new AggregateError(failures, "The daemon did not shut down cleanly");
        }
      })();
      return await closePromise;
    },
  };
}
