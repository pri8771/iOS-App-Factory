import type { AdapterRegistry } from "@app-factory/adapter-sdk";
import { IsoInstantSchema, type EffectPumpStatusV1, type IsoInstant } from "@app-factory/contracts";
import {
  createCanonicalObservationIssuerPort,
  createDurableSanitizedProviderEvidencePort,
  createKernelEffectPayloadPort,
  EffectWorker,
  type EffectCredentialPort,
  type EffectWorkerClockPort,
  type EffectWorkerResult,
} from "@app-factory/effect-worker";
import type { EvidenceStore } from "@app-factory/evidence-store";
import type { ArtifactRepository, EffectRepository } from "@app-factory/kernel";

import type { EffectPumpStatusPort } from "./command-runtime.js";
import { defaultWait, interruptibleWait, type DaemonLoopWait } from "./daemon-loop-wait.js";

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const MAX_POLL_INTERVAL_MS = 60_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;
// Ten minutes: a hard safety ceiling on how stale the pump's own retry cadence
// may drift under sustained failures, independent of caller configuration.
const MAX_BACKOFF_CEILING_MS = 10 * 60_000;
const MAX_ERROR_MESSAGE_LENGTH = 2_000;

function validateDelay(label: string, value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(`${label} must be a positive integer of at most ${String(maximum)}`);
  }
  return value;
}

/**
 * `baseMs` on the first consecutive failure, doubling on each further one,
 * capped at `maxMs`. Never applied when idle-but-healthy (see call site).
 */
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

export type EffectPumpWorkerPort = Readonly<{
  processNextSend(signal: AbortSignal): Promise<EffectWorkerResult>;
  processNextReconciliation(signal: AbortSignal): Promise<EffectWorkerResult>;
}>;

export type EffectPumpLoopOptions = Readonly<{
  pollIntervalMs?: number;
  maxBackoffMs?: number;
  wait?: DaemonLoopWait;
  clock?: EffectWorkerClockPort;
  onError?: (error: unknown) => void;
}>;

/**
 * Drains the kernel's effect outbox: one send claim, then one reconciliation
 * claim, per tick. Mirrors `BackgroundSchedulerLoop`'s start/wake/requestStop
 * lifecycle exactly (same drain-on-activity, interruptible-wait-when-idle
 * shape), and adds bounded exponential backoff on top so a persistent error
 * — e.g. a claimed effect whose provider has no registered adapter — cannot
 * turn into a hot loop against the kernel. An empty outbox (the only state
 * possible until a later task starts planning effects) always resolves both
 * claims as "idle" and the loop simply waits `pollIntervalMs` between polls.
 */
export class EffectPumpLoop {
  readonly #worker: EffectPumpWorkerPort;
  readonly #pollIntervalMs: number;
  readonly #maxBackoffMs: number;
  readonly #wait: DaemonLoopWait;
  readonly #clock: EffectWorkerClockPort;
  readonly #onError: ((error: unknown) => void) | undefined;
  readonly #abort = new AbortController();
  #stopping = false;
  #wakePending = false;
  #waitAbort: AbortController | null = null;
  #runPromise: Promise<void> | null = null;
  #lastError: unknown | null = null;
  #lastActivityAt: IsoInstant | null = null;
  #consecutiveErrors = 0;

  public constructor(worker: EffectPumpWorkerPort, options: EffectPumpLoopOptions = {}) {
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
        "The effect pump loop and its error observer both failed",
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
      let didWork = false;
      let errored = false;

      try {
        const sent = await this.#worker.processNextSend(this.#abort.signal);
        if (sent.kind !== "idle") didWork = true;
        this.#lastError = null;
      } catch (error) {
        this.#recordError(error);
        errored = true;
      }
      if (this.#stopping) return;

      if (!errored) {
        try {
          const reconciled = await this.#worker.processNextReconciliation(this.#abort.signal);
          if (reconciled.kind !== "idle") didWork = true;
          this.#lastError = null;
        } catch (error) {
          this.#recordError(error);
          errored = true;
        }
      }
      if (this.#stopping) return;

      if (didWork) {
        // Same shape as BackgroundSchedulerLoop's shouldDrain: keep pulling
        // the outbox immediately while there is real work, no wait at all.
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

const NO_CREDENTIALS: EffectCredentialPort = { referenceFor: () => null };

export type EffectSubsystemOptions = Readonly<{
  ownerId: string;
  effects: EffectRepository;
  artifacts: ArtifactRepository;
  evidenceStore: EvidenceStore;
  /**
   * Starts empty by contract. A future task is expected to call `.register`
   * on it (e.g. from a `configureAdapters` composition hook) once a provider
   * adapter and its credentials exist; until then every claim the loop makes
   * against a real effect fails closed with "no adapter is registered."
   */
  adapters: AdapterRegistry;
  /** Defaults to a port that never resolves a credential (no broker exists yet). */
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

export type EffectSubsystem = Readonly<{
  loop: EffectPumpLoop;
  statusPort: EffectPumpStatusPort;
  start(): void;
  stop(): Promise<void>;
}>;

/**
 * Wires a real `EffectWorker` (kernel repository + the three production
 * ports from `@app-factory/effect-worker`) to a bounded-backoff pump loop,
 * and exposes an `EffectPumpStatusPort` the command runtime can report
 * through `effects.status`. Constructing this is the daemon's only
 * "effects enabled" seam; nothing here plans an effect or registers an
 * adapter on its own.
 */
export function createEffectSubsystem(options: EffectSubsystemOptions): EffectSubsystem {
  const worker = new EffectWorker({
    ownerId: options.ownerId,
    repository: options.effects,
    adapters: options.adapters,
    payloads: createKernelEffectPayloadPort({
      artifacts: options.artifacts,
      evidenceStore: options.evidenceStore,
    }),
    evidence: createDurableSanitizedProviderEvidencePort({
      artifacts: options.artifacts,
      evidenceStore: options.evidenceStore,
    }),
    observations: createCanonicalObservationIssuerPort(),
    credentials: options.credentials ?? NO_CREDENTIALS,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.claimDurationMs === undefined ? {} : { claimDurationMs: options.claimDurationMs }),
    ...(options.adapterCallTimeoutMs === undefined
      ? {}
      : { adapterCallTimeoutMs: options.adapterCallTimeoutMs }),
    ...(options.reconcileDelayMs === undefined
      ? {}
      : { reconcileDelayMs: options.reconcileDelayMs }),
  });

  const loop = new EffectPumpLoop(worker, {
    ...(options.pollIntervalMs === undefined ? {} : { pollIntervalMs: options.pollIntervalMs }),
    ...(options.maxBackoffMs === undefined ? {} : { maxBackoffMs: options.maxBackoffMs }),
    ...(options.wait === undefined ? {} : { wait: options.wait }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  });

  const statusPort: EffectPumpStatusPort = {
    status: (): EffectPumpStatusV1 => ({
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
