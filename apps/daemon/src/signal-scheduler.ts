import { createHash } from "node:crypto";

import {
  IsoInstantSchema,
  SignalInsightIdSchema,
  type IsoInstant,
  type SignalId,
  type SignalInsightId,
  type SignalScoutRunOutcomeV1,
  type SignalV1,
} from "@app-factory/contracts";
import type { FactoryRepositories } from "@app-factory/kernel";
import type { RoomProviderCatalogPort } from "@app-factory/studio-rooms";

import { defaultWait, interruptibleWait, type DaemonLoopWait } from "./daemon-loop-wait.js";
import {
  performSignalCheck,
  type PerformSignalCheckDependencies,
  type SignalScoutParticipantsPort,
} from "./signal-command-runtime.js";

/**
 * The signal scheduler (Architecture decision 11, Wave 7): a background loop, shaped like
 * `effect-pump.ts`'s `EffectPumpLoop`, that runs AT MOST ONE due signal's Scout check per pass --
 * scouts are real model/network round trips (≤2min budget, same as `signal.run-now`), so this
 * loop -- like the effect pump -- runs entirely OUTSIDE the serial executor and outside any command
 * handler. `performSignalCheck` (`signal-command-runtime.ts`) is the exact same core
 * `command-runtime.ts`'s `runSignalNow` calls, so a scheduled check and a manual `signal.run-now`
 * behave identically once dispatched -- only how the check is triggered, and how its Insight ID is
 * minted, differ.
 *
 * "Due" (Architecture decision 11): `status: "active"`, `checkIntervalMinutes` non-null, and either
 * never checked (`lastCheckedAt: null`) or checked longer ago than the interval. Selection is a
 * pure function (`selectDueSignalV1`) over the small, already-bounded `signals.list()` result --
 * signals are operator-defined and few, the same "just list them" precedent `SignalRepository.list`
 * already uses -- so this loop needs no dedicated SQL query.
 *
 * Deliberately gated OFF by default (`APP_FACTORY_SIGNAL_SCHEDULER_ENABLED`): unlike the effect
 * pump, an unattended real-model call is a real-identity, real-cost action, and Wave 7 treats
 * "operator opted in" the same way `APP_FACTORY_ROOMS_ENABLED` treats live room participation.
 */

// ---------------------------------------------------------------------------
// Pure due-selection + slot alignment
// ---------------------------------------------------------------------------

/** `+Infinity` (never due) when unscheduled; `-Infinity` (always due once active) when never
 *  checked; otherwise the epoch-ms instant the signal next becomes due. */
export function signalDueAtMs(signal: SignalV1): number {
  if (signal.checkIntervalMinutes === null) return Number.POSITIVE_INFINITY;
  if (signal.lastCheckedAt === null) return Number.NEGATIVE_INFINITY;
  return Date.parse(signal.lastCheckedAt) + signal.checkIntervalMinutes * 60_000;
}

/**
 * The single most-overdue active, interval-scheduled signal at `nowIso`, or `null` when none is
 * due -- deterministic ("ONE due signal per pass"): ties break on `signalId` so two signals due at
 * the exact same instant still resolve to a stable choice run over run.
 */
export function selectDueSignalV1(signals: readonly SignalV1[], nowIso: string): SignalV1 | null {
  const nowMs = Date.parse(nowIso);
  let selected: SignalV1 | null = null;
  let selectedDueAtMs = Number.POSITIVE_INFINITY;
  for (const signal of signals) {
    if (signal.status !== "active" || signal.checkIntervalMinutes === null) continue;
    const dueAtMs = signalDueAtMs(signal);
    if (dueAtMs > nowMs) continue;
    if (
      selected === null ||
      dueAtMs < selectedDueAtMs ||
      (dueAtMs === selectedDueAtMs && signal.signalId < selected.signalId)
    ) {
      selected = signal;
      selectedDueAtMs = dueAtMs;
    }
  }
  return selected;
}

/**
 * The interval-aligned slot `nowIso` falls into for a signal checked every `intervalMinutes` --
 * epoch-relative boundaries (a 5-minute interval lands on :00/:05/:10/...), so the SAME slot is
 * recomputed by a retried pass shortly after a crash, and a genuinely later pass (the interval has
 * rolled over) always lands on a distinct slot.
 */
export function computeSignalSlotIsoV1(nowIso: string, intervalMinutes: number): string {
  const intervalMs = intervalMinutes * 60_000;
  const nowMs = Date.parse(nowIso);
  const slotMs = Math.floor(nowMs / intervalMs) * intervalMs;
  return new Date(slotMs).toISOString();
}

/** Deterministic lowercase UUID from parts, independent of `command-runtime.ts`'s own (commandId-
 *  keyed) derivation -- this one has no commandId to key off, only a signal identity + time slot. */
function deterministicInsightIdV1(signalId: SignalId, slotIso: string): SignalInsightId {
  const digest = createHash("sha256")
    .update(`app-factory.signal-scheduler.v1\0signal-scheduled\0${signalId}\0${slotIso}`)
    .digest("hex");
  const uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
  return SignalInsightIdSchema.parse(uuid);
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export type SignalSchedulerTickResult =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "checked"; signalId: SignalId; outcome: SignalScoutRunOutcomeV1 }>;

export type SignalSchedulerWorkerPort = Readonly<{
  processNextDueSignal(signal: AbortSignal): Promise<SignalSchedulerTickResult>;
}>;

export type SignalSchedulerRepositories = Pick<
  FactoryRepositories,
  "signals" | "signalInsights" | "tokenUsage"
>;

export type SignalSchedulerWorkerOptions = Readonly<{
  repositories: SignalSchedulerRepositories;
  scoutParticipants: SignalScoutParticipantsPort;
  providerCatalog: RoomProviderCatalogPort;
  clock?: Readonly<{ now(): Date }>;
  /** Per-scout-call budget; defaults to the same 2 minutes `signal.run-now` uses. */
  scoutCallTimeoutMs?: number;
}>;

const DEFAULT_SCOUT_CALL_TIMEOUT_MS = 2 * 60_000;

/**
 * The real worker: selects the single most-overdue due signal (if any), derives its slot-aligned
 * insight identity, and runs `performSignalCheck` -- the exact core `signal.run-now` shares.
 */
export function createSignalSchedulerWorker(
  options: SignalSchedulerWorkerOptions,
): SignalSchedulerWorkerPort {
  const clock = options.clock ?? { now: () => new Date() };
  const scoutCallTimeoutMs = options.scoutCallTimeoutMs ?? DEFAULT_SCOUT_CALL_TIMEOUT_MS;
  const deps: PerformSignalCheckDependencies = {
    scoutParticipants: options.scoutParticipants,
    signals: options.repositories.signals,
    signalInsights: options.repositories.signalInsights,
    tokenUsage: options.repositories.tokenUsage,
    providerCatalog: options.providerCatalog,
  };
  return {
    async processNextDueSignal(loopSignal) {
      const nowIso = IsoInstantSchema.parse(clock.now().toISOString());
      const due = selectDueSignalV1(options.repositories.signals.list(), nowIso);
      if (due === null || due.checkIntervalMinutes === null) return { kind: "idle" };
      const slotIso = computeSignalSlotIsoV1(nowIso, due.checkIntervalMinutes);
      const insightId = deterministicInsightIdV1(due.signalId, slotIso);
      const callSignal = AbortSignal.any([loopSignal, AbortSignal.timeout(scoutCallTimeoutMs)]);
      const result = await performSignalCheck(deps, due, { insightId }, nowIso, {
        signal: callSignal,
      });
      return { kind: "checked", signalId: due.signalId, outcome: result.outcome };
    },
  };
}

// ---------------------------------------------------------------------------
// Loop (shaped like EffectPumpLoop)
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const MAX_POLL_INTERVAL_MS = 10 * 60_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
const MAX_BACKOFF_CEILING_MS = 10 * 60_000;
const MAX_ERROR_MESSAGE_LENGTH = 2_000;

function validateDelay(label: string, value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${label} must be a positive integer of at most ${String(maximum)}`);
  }
  return value;
}

function boundedBackoffMs(baseMs: number, maxMs: number, consecutiveErrors: number): number {
  if (consecutiveErrors <= 0) return baseMs;
  const exponent = Math.min(consecutiveErrors - 1, 20);
  const scaled = baseMs * 2 ** exponent;
  return Math.min(maxMs, Number.isFinite(scaled) ? scaled : maxMs);
}

function summarizeError(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.replaceAll(/\s+/g, " ").trim();
  if (normalized.length === 0) return "An unlabeled error occurred.";
  return normalized.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${normalized.slice(0, MAX_ERROR_MESSAGE_LENGTH)}...`
    : normalized;
}

export type SignalSchedulerStatusV1 = Readonly<{
  enabled: boolean;
  lastActivityAt: IsoInstant | null;
  lastErrorMessage: string | null;
}>;

export type SignalSchedulerStatusPort = Readonly<{ status(): SignalSchedulerStatusV1 }>;

export type SignalSchedulerLoopOptions = Readonly<{
  pollIntervalMs?: number;
  maxBackoffMs?: number;
  wait?: DaemonLoopWait;
  clock?: Readonly<{ now(): Date }>;
  onError?: (error: unknown) => void;
}>;

/**
 * Drains at most one due signal per tick, mirroring `EffectPumpLoop`'s start/wake/requestStop
 * lifecycle and bounded-backoff shape exactly (same drain-on-activity, interruptible-wait-when-idle
 * pattern): a `"checked"` result loops again immediately (there may be another due signal), an
 * `"idle"` result waits a full `pollIntervalMs`, and a persistent error backs off exponentially
 * rather than hot-looping against a signal it cannot currently check.
 */
export class SignalSchedulerLoop {
  readonly #worker: SignalSchedulerWorkerPort;
  readonly #pollIntervalMs: number;
  readonly #maxBackoffMs: number;
  readonly #wait: DaemonLoopWait;
  readonly #clock: Readonly<{ now(): Date }>;
  readonly #onError: ((error: unknown) => void) | undefined;
  readonly #abort = new AbortController();
  #stopping = false;
  #wakePending = false;
  #waitAbort: AbortController | null = null;
  #runPromise: Promise<void> | null = null;
  #lastError: unknown | null = null;
  #lastActivityAt: IsoInstant | null = null;
  #consecutiveErrors = 0;

  public constructor(worker: SignalSchedulerWorkerPort, options: SignalSchedulerLoopOptions = {}) {
    this.#worker = worker;
    this.#pollIntervalMs = validateDelay(
      "pollIntervalMs",
      options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      MAX_POLL_INTERVAL_MS,
    );
    this.#maxBackoffMs = validateDelay(
      "maxBackoffMs",
      options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS,
      MAX_BACKOFF_CEILING_MS,
    );
    if (this.#maxBackoffMs < this.#pollIntervalMs) {
      throw new TypeError("maxBackoffMs must be at least pollIntervalMs");
    }
    this.#wait = options.wait ?? defaultWait;
    this.#clock = options.clock ?? { now: () => new Date() };
    this.#onError = options.onError;
  }

  public get lastError(): unknown | null {
    return this.#lastError;
  }

  public get lastActivityAt(): IsoInstant | null {
    return this.#lastActivityAt;
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
    this.#abort.abort();
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
        "The signal scheduler loop and its error observer both failed",
      );
    }
  }

  #recordActivity(): void {
    this.#lastActivityAt = IsoInstantSchema.parse(this.#clock.now().toISOString());
    this.#consecutiveErrors = 0;
  }

  async #run(): Promise<void> {
    while (!this.#stopping) {
      this.#wakePending = false;
      let result: SignalSchedulerTickResult | null = null;
      let errored = false;

      try {
        result = await this.#worker.processNextDueSignal(this.#abort.signal);
        this.#lastError = null;
      } catch (error) {
        this.#recordError(error);
        errored = true;
      }
      if (this.#stopping) return;

      if (result !== null && result.kind === "checked") {
        this.#recordActivity();
        continue;
      }
      this.#consecutiveErrors = errored ? this.#consecutiveErrors + 1 : 0;
      if (this.#wakePending) continue;

      const delayMs = errored
        ? boundedBackoffMs(this.#pollIntervalMs, this.#maxBackoffMs, this.#consecutiveErrors)
        : this.#pollIntervalMs;
      const waitAbort = new AbortController();
      this.#waitAbort = waitAbort;
      try {
        await interruptibleWait(this.#wait, delayMs, waitAbort.signal);
      } catch (error) {
        if (!waitAbort.signal.aborted) this.#recordError(error);
      } finally {
        if (this.#waitAbort === waitAbort) this.#waitAbort = null;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Subsystem composition (mirrors createEffectSubsystem)
// ---------------------------------------------------------------------------

export type SignalSchedulerSubsystemOptions = Readonly<{
  repositories: SignalSchedulerRepositories;
  scoutParticipants: SignalScoutParticipantsPort;
  providerCatalog: RoomProviderCatalogPort;
  pollIntervalMs?: number;
  maxBackoffMs?: number;
  scoutCallTimeoutMs?: number;
  wait?: DaemonLoopWait;
  clock?: Readonly<{ now(): Date }>;
  onError?: (error: unknown) => void;
}>;

export type SignalSchedulerSubsystem = Readonly<{
  loop: SignalSchedulerLoop;
  statusPort: SignalSchedulerStatusPort;
  start(): void;
  stop(): Promise<void>;
}>;

export function createSignalSchedulerSubsystem(
  options: SignalSchedulerSubsystemOptions,
): SignalSchedulerSubsystem {
  const worker = createSignalSchedulerWorker({
    repositories: options.repositories,
    scoutParticipants: options.scoutParticipants,
    providerCatalog: options.providerCatalog,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.scoutCallTimeoutMs === undefined
      ? {}
      : { scoutCallTimeoutMs: options.scoutCallTimeoutMs }),
  });
  const loop = new SignalSchedulerLoop(worker, {
    ...(options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs }),
    ...(options.maxBackoffMs === undefined ? {} : { maxBackoffMs: options.maxBackoffMs }),
    ...(options.wait === undefined ? {} : { wait: options.wait }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });
  const statusPort: SignalSchedulerStatusPort = {
    status: (): SignalSchedulerStatusV1 => ({
      enabled: true,
      lastActivityAt: loop.lastActivityAt,
      lastErrorMessage: summarizeError(loop.lastError),
    }),
  };
  return {
    loop,
    statusPort,
    start: () => loop.start(),
    stop: async () => {
      loop.requestStop();
      await loop.stopped();
    },
  };
}
