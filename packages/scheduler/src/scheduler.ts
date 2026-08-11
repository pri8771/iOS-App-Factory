export const SCHEDULER_STEP_PLAN = [
  { key: "prepare", ordinal: 0 },
  { key: "execute", ordinal: 1 },
  { key: "verify", ordinal: 2 },
] as const;

export type SchedulerStepKey = (typeof SCHEDULER_STEP_PLAN)[number]["key"];

export type SchedulerAttemptState =
  "queued" | "running" | "paused" | "blocked" | "succeeded" | "failed" | "cancelled";

export type SchedulerDesiredState = "running" | "paused" | "cancelled";

export type SchedulerStepState =
  "pending" | "running" | "blocked" | "succeeded" | "failed" | "cancelled" | "skipped";

export type SchedulerBlocker = Readonly<{
  code: string;
  message: string;
}>;

export type SchedulerFailure = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
}>;

export type SchedulerCandidate = Readonly<{
  attemptId: string;
  leaseKey: string;
  /** Latest durable attempt timestamp; a claim must be strictly later. */
  updatedAt: string;
}>;

export type SchedulerLease = Readonly<{
  leaseKey: string;
  attemptId: string;
  ownerId: string;
  fence: number;
  revision: number;
  heartbeatAt: string;
  expiresAt: string;
}>;

export type SchedulerAttemptSnapshot = Readonly<{
  attemptId: string;
  state: SchedulerAttemptState;
  desiredState: SchedulerDesiredState;
  revision: number;
  fence: number;
  updatedAt: string;
  blocker: SchedulerBlocker | null;
  failure: SchedulerFailure | null;
}>;

export type SchedulerStepSnapshot = Readonly<{
  attemptId: string;
  key: SchedulerStepKey;
  ordinal: number;
  state: SchedulerStepState;
  revision: number;
  runCount: number;
  blocker: SchedulerBlocker | null;
  failure: SchedulerFailure | null;
  outputDigest: string | null;
}>;

export type SchedulerWorkSnapshot = Readonly<{
  attempt: SchedulerAttemptSnapshot;
  steps: readonly SchedulerStepSnapshot[];
}>;

export type SchedulerAttemptTransition =
  | Readonly<{ to: "running" | "paused" | "cancelled" | "succeeded" }>
  | Readonly<{ to: "blocked"; blocker: SchedulerBlocker }>
  | Readonly<{ to: "failed"; failure: SchedulerFailure }>;

export type SchedulerStepTransition =
  | Readonly<{ to: "running" | "cancelled" | "skipped" }>
  | Readonly<{ to: "succeeded"; outputDigest: string }>
  | Readonly<{ to: "blocked"; blocker: SchedulerBlocker }>
  | Readonly<{ to: "failed"; failure: SchedulerFailure }>;

export interface SchedulerPersistencePort {
  /** Results must be deterministic and ordered; the scheduler requests one item initially. */
  discoverEligible(input: {
    readonly limit: number;
    readonly observedAt: string;
  }): Promise<readonly SchedulerCandidate[]>;

  /** Atomically claims the attempt and advances its fence, or returns null on contention. */
  claimLease(input: {
    readonly candidate: SchedulerCandidate;
    readonly ownerId: string;
    readonly acquiredAt: string;
    readonly expiresAt: string;
  }): Promise<SchedulerLease | null>;

  /** Atomically validates owner/fence/revision before renewing. */
  renewLease(input: {
    readonly lease: SchedulerLease;
    readonly heartbeatAt: string;
    readonly expiresAt: string;
  }): Promise<SchedulerLease>;

  /** Rejects an absent, expired, owner-mismatched, or stale-fence lease. */
  assertLease(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
  }): Promise<void>;

  /** Release is owner- and fence-guarded and must not remove a successor's lease. */
  releaseLease(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
  }): Promise<void>;

  /** Reads one coherent attempt-plus-steps snapshot under the supplied fence. */
  loadWork(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
  }): Promise<SchedulerWorkSnapshot>;

  /**
   * Atomically verifies the active fence and creates the exact supplied plan idempotently.
   * An existing plan with different keys or ordinals must be rejected.
   */
  ensurePlan(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
    readonly plan: typeof SCHEDULER_STEP_PLAN;
  }): Promise<SchedulerWorkSnapshot>;

  /** Atomically verifies the active fence and expected attempt revision before committing. */
  transitionAttempt(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
    readonly expectedRevision: number;
    readonly transition: SchedulerAttemptTransition;
  }): Promise<SchedulerAttemptSnapshot>;

  /** Atomically verifies the active fence and expected step revision before committing. */
  transitionStep(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
    readonly key: SchedulerStepKey;
    readonly expectedRevision: number;
    readonly transition: SchedulerStepTransition;
  }): Promise<SchedulerStepSnapshot>;
}

export type SchedulerStepOutcome =
  | Readonly<{ kind: "succeeded"; outputDigest: string }>
  | Readonly<{ kind: "needs-input"; blocker: SchedulerBlocker }>
  | Readonly<{ kind: "failed"; failure: SchedulerFailure }>;

export type SchedulerExecutionContext = Readonly<{
  attemptId: string;
  step: SchedulerStepSnapshot;
  /** Stable across crash replay; changes only for an intentional new run. */
  effectKey: string;
  fence: number;
  signal: AbortSignal;
  /** Executors must call this immediately before each externally visible effect. */
  assertActive(): Promise<void>;
  /** Long-running executors call this before the current lease can expire. */
  heartbeat(): Promise<void>;
}>;

export interface SchedulerStepExecutorPort {
  execute(context: SchedulerExecutionContext): Promise<SchedulerStepOutcome>;
}

export interface SchedulerClockPort {
  now(): Date;
}

/**
 * Converts a wall clock into strictly increasing logical instants. A durable
 * floor makes the first write after restart later than already-persisted state,
 * even when the wall clock is frozen or has moved backwards.
 */
export class MonotonicSchedulerClock {
  readonly #wallClock: SchedulerClockPort;
  #lastMilliseconds = Number.NEGATIVE_INFINITY;

  public constructor(wallClock: SchedulerClockPort = { now: () => new Date() }) {
    this.#wallClock = wallClock;
  }

  public next(after?: string): Date {
    const wallMilliseconds = this.#wallClock.now().getTime();
    if (!Number.isFinite(wallMilliseconds)) {
      throw new TypeError("Scheduler wall clock returned an invalid date");
    }
    let floorMilliseconds = Number.NEGATIVE_INFINITY;
    if (after !== undefined) {
      floorMilliseconds = Date.parse(after);
      if (
        !Number.isFinite(floorMilliseconds) ||
        new Date(floorMilliseconds).toISOString() !== after
      ) {
        throw new TypeError("Scheduler durable time floor is not an ISO instant");
      }
    }
    const milliseconds = Math.max(
      wallMilliseconds,
      this.#lastMilliseconds + 1,
      floorMilliseconds + 1,
    );
    this.#lastMilliseconds = milliseconds;
    return new Date(milliseconds);
  }
}

export type SchedulerPhase =
  | "lease-claimed"
  | "attempt-state-committed"
  | "plan-ready"
  | "step-started"
  | "step-effect-completed"
  | "step-committed"
  | "attempt-completed";

export type SchedulerPhaseContext = Readonly<{
  phase: SchedulerPhase;
  attemptId: string;
  fence: number;
  stepKey: SchedulerStepKey | null;
}>;

export interface SchedulerObserverPort {
  reached(context: SchedulerPhaseContext): void | Promise<void>;
}

export type SchedulerTickResult =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "busy"; attemptId: string | null }>
  | Readonly<{ kind: "stopped"; attemptId: string | null }>
  | Readonly<{ kind: "contended"; attemptId: string }>
  | Readonly<{ kind: "interrupted"; attemptId: string; phase: SchedulerPhase }>
  | Readonly<{ kind: "fenced"; attemptId: string }>
  | Readonly<{ kind: "paused" | "cancelled" | "succeeded"; attemptId: string }>
  | Readonly<{ kind: "blocked"; attemptId: string; blocker: SchedulerBlocker }>
  | Readonly<{ kind: "failed"; attemptId: string; failure: SchedulerFailure }>;

export type RestartSafeSchedulerOptions = Readonly<{
  ownerId: string;
  persistence: SchedulerPersistencePort;
  executor: SchedulerStepExecutorPort;
  clock?: SchedulerClockPort;
  observer?: SchedulerObserverPort;
  leaseDurationMs?: number;
}>;

export class SchedulerFenceError extends Error {
  public constructor(message = "Scheduler lease or fence is no longer active") {
    super(message);
    this.name = "SchedulerFenceError";
  }
}

export class SchedulerInvariantError extends Error {
  public constructor(message: string) {
    super(`Scheduler invariant failed: ${message}`);
    this.name = "SchedulerInvariantError";
  }
}

/** A lifecycle observer may throw this to model abrupt process interruption in recovery tests. */
export class SchedulerInterruptedError extends Error {
  public readonly phase: SchedulerPhase;

  public constructor(phase: SchedulerPhase) {
    super(`Scheduler interrupted after ${phase}`);
    this.name = "SchedulerInterruptedError";
    this.phase = phase;
  }
}

class SchedulerStopError extends Error {
  public constructor() {
    super("Scheduler stop requested");
    this.name = "SchedulerStopError";
  }
}

type ActiveRun = {
  currentLease: SchedulerLease;
  readonly abortController: AbortController;
};

const DEFAULT_LEASE_DURATION_MS = 30_000;
const EXECUTOR_EXCEPTION_FAILURE: SchedulerFailure = {
  code: "executor_exception",
  message: "The step executor stopped unexpectedly.",
  retryable: false,
};

function isoAfter(now: Date, durationMs: number): string {
  return new Date(now.getTime() + durationMs).toISOString();
}

function assertNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must not be empty`);
  }
}

function assertPositiveSafeInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
}

function isTerminal(state: SchedulerAttemptState): boolean {
  return state === "succeeded" || state === "failed" || state === "cancelled";
}

function effectKey(attemptId: string, step: SchedulerStepSnapshot): string {
  if (step.runCount < 1) {
    throw new SchedulerInvariantError(`running step ${step.key} has no run count`);
  }
  return `scheduler.v1:${attemptId}:${step.key}:run-${step.runCount}`;
}

function validateWork(snapshot: SchedulerWorkSnapshot, lease: SchedulerLease): void {
  if (snapshot.attempt.attemptId !== lease.attemptId) {
    throw new SchedulerInvariantError("loaded attempt does not match its lease");
  }
  if (snapshot.attempt.fence !== lease.fence) {
    throw new SchedulerFenceError("Loaded attempt fence does not match the claimed lease");
  }
  const sorted = [...snapshot.steps].sort((left, right) => left.ordinal - right.ordinal);
  if (sorted.length !== SCHEDULER_STEP_PLAN.length) {
    throw new SchedulerInvariantError("durable plan must contain exactly three steps");
  }
  for (let index = 0; index < SCHEDULER_STEP_PLAN.length; index += 1) {
    const expected = SCHEDULER_STEP_PLAN[index];
    const actual = sorted[index];
    if (
      expected === undefined ||
      actual === undefined ||
      actual.attemptId !== lease.attemptId ||
      actual.key !== expected.key ||
      actual.ordinal !== expected.ordinal
    ) {
      throw new SchedulerInvariantError("durable plan keys or ordinals do not match scheduler.v1");
    }
  }
}

function stepFor(snapshot: SchedulerWorkSnapshot, key: SchedulerStepKey): SchedulerStepSnapshot {
  const step = snapshot.steps.find((candidate) => candidate.key === key);
  if (step === undefined) {
    throw new SchedulerInvariantError(`missing durable step ${key}`);
  }
  return step;
}

/**
 * A bounded-concurrency (one-attempt) scheduler. Persistence adapters own atomic
 * compare-and-set transactions; executors own idempotent external effects.
 */
export class RestartSafeScheduler {
  readonly #ownerId: string;
  readonly #persistence: SchedulerPersistencePort;
  readonly #executor: SchedulerStepExecutorPort;
  readonly #clock: MonotonicSchedulerClock;
  readonly #observer: SchedulerObserverPort | undefined;
  readonly #leaseDurationMs: number;
  #stopRequested = false;
  #activeAttemptId: string | null = null;
  #activeRun: ActiveRun | null = null;
  #activeTick: Promise<SchedulerTickResult> | null = null;

  public constructor(options: RestartSafeSchedulerOptions) {
    assertNonEmpty("ownerId", options.ownerId);
    const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
    assertPositiveSafeInteger("leaseDurationMs", leaseDurationMs);
    this.#ownerId = options.ownerId;
    this.#persistence = options.persistence;
    this.#executor = options.executor;
    this.#clock = new MonotonicSchedulerClock(options.clock);
    this.#observer = options.observer;
    this.#leaseDurationMs = leaseDurationMs;
  }

  public get activeAttemptId(): string | null {
    return this.#activeAttemptId;
  }

  public get stopRequested(): boolean {
    return this.#stopRequested;
  }

  public async tick(): Promise<SchedulerTickResult> {
    if (this.#stopRequested) {
      return { kind: "stopped", attemptId: this.#activeAttemptId };
    }
    if (this.#activeTick !== null) {
      return { kind: "busy", attemptId: this.#activeAttemptId };
    }

    const activeTick = this.#runTick();
    this.#activeTick = activeTick;
    try {
      return await activeTick;
    } finally {
      if (this.#activeTick === activeTick) {
        this.#activeTick = null;
      }
    }
  }

  /** Starts a graceful stop and aborts the active executor at its cooperative boundary. */
  public requestStop(): void {
    this.#stopRequested = true;
    this.#activeRun?.abortController.abort();
  }

  /** Waits for the current tick to observe the abort and release its lease. */
  public async stop(): Promise<void> {
    this.requestStop();
    await this.#activeTick;
  }

  async #runTick(): Promise<SchedulerTickResult> {
    const discoveryTime = this.#clock.next();
    const candidates = await this.#persistence.discoverEligible({
      limit: 1,
      observedAt: discoveryTime.toISOString(),
    });
    const candidate = candidates[0];
    if (candidate === undefined) {
      return { kind: "idle" };
    }
    if (this.#stopRequested) {
      return { kind: "stopped", attemptId: null };
    }

    const claimTime = this.#clock.next(candidate.updatedAt);
    const lease = await this.#persistence.claimLease({
      candidate,
      ownerId: this.#ownerId,
      acquiredAt: claimTime.toISOString(),
      expiresAt: isoAfter(claimTime, this.#leaseDurationMs),
    });
    if (lease === null) {
      return { kind: "contended", attemptId: candidate.attemptId };
    }
    if (
      lease.attemptId !== candidate.attemptId ||
      lease.leaseKey !== candidate.leaseKey ||
      lease.ownerId !== this.#ownerId
    ) {
      throw new SchedulerInvariantError("claim returned an identity-mismatched lease");
    }

    const active: ActiveRun = {
      currentLease: lease,
      abortController: new AbortController(),
    };
    this.#activeRun = active;
    this.#activeAttemptId = candidate.attemptId;
    if (this.#stopRequested) {
      active.abortController.abort();
    }

    let result: SchedulerTickResult;
    try {
      await this.#notify(active, "lease-claimed", null);
      result = await this.#drive(active);
    } catch (error) {
      if (error instanceof SchedulerInterruptedError) {
        result = {
          kind: "interrupted",
          attemptId: active.currentLease.attemptId,
          phase: error.phase,
        };
      } else if (error instanceof SchedulerFenceError) {
        result = { kind: "fenced", attemptId: active.currentLease.attemptId };
      } else if (error instanceof SchedulerStopError || active.abortController.signal.aborted) {
        result = { kind: "stopped", attemptId: active.currentLease.attemptId };
      } else {
        throw error;
      }
    } finally {
      await this.#safeRelease(active);
      if (this.#activeRun === active) {
        this.#activeRun = null;
        this.#activeAttemptId = null;
      }
    }
    return result;
  }

  async #drive(active: ActiveRun): Promise<SchedulerTickResult> {
    this.#throwIfStopped(active);
    await this.#renew(active);
    let work = await this.#loadWork(active, false);

    const desiredResult = await this.#reconcileDesiredState(active, work);
    if (desiredResult !== null) {
      return desiredResult;
    }
    if (isTerminal(work.attempt.state)) {
      return this.#terminalResult(work.attempt);
    }

    work = await this.#ensurePlan(active);
    const checkpointResult = await this.#settleExistingCheckpoint(active, work);
    if (checkpointResult !== null) {
      return checkpointResult;
    }

    work = await this.#loadWork(active);
    if (work.attempt.state !== "running") {
      await this.#transitionAttempt(active, work.attempt, { to: "running" });
      await this.#notify(active, "attempt-state-committed", null);
    }

    for (const definition of SCHEDULER_STEP_PLAN) {
      this.#throwIfStopped(active);
      work = await this.#loadWork(active);
      const boundaryResult = await this.#reconcileDesiredState(active, work);
      if (boundaryResult !== null) {
        return boundaryResult;
      }

      let step = stepFor(work, definition.key);
      if (step.state === "succeeded" || step.state === "skipped") {
        continue;
      }
      if (step.state === "blocked") {
        return await this.#blockAttempt(active, work.attempt, step.blocker);
      }
      if (step.state === "failed") {
        return await this.#failAttempt(active, work.attempt, step.failure);
      }
      if (step.state === "cancelled") {
        throw new SchedulerInvariantError("a cancelled step requires a cancelled attempt");
      }
      if (step.state === "pending") {
        step = await this.#transitionStep(active, step, { to: "running" }, work.attempt.updatedAt);
        await this.#notify(active, "step-started", step.key);
      }

      const outcome = await this.#executeStep(active, step);
      await this.#notify(active, "step-effect-completed", step.key);
      this.#throwIfStopped(active);

      work = await this.#loadWork(active);
      const postEffectResult = await this.#reconcileDesiredState(active, work);
      if (postEffectResult !== null) {
        return postEffectResult;
      }
      step = stepFor(work, definition.key);
      if (step.state !== "running") {
        throw new SchedulerInvariantError(
          `step ${step.key} changed from running before its result could commit`,
        );
      }

      if (outcome.kind === "succeeded") {
        await this.#transitionStep(
          active,
          step,
          {
            to: "succeeded",
            outputDigest: outcome.outputDigest,
          },
          work.attempt.updatedAt,
        );
        await this.#notify(active, "step-committed", step.key);
        continue;
      }
      if (outcome.kind === "needs-input") {
        const blockedStep = await this.#transitionStep(
          active,
          step,
          {
            to: "blocked",
            blocker: outcome.blocker,
          },
          work.attempt.updatedAt,
        );
        await this.#notify(active, "step-committed", step.key);
        work = await this.#loadWork(active);
        return await this.#blockAttempt(active, work.attempt, blockedStep.blocker);
      }

      const failedStep = await this.#transitionStep(
        active,
        step,
        {
          to: "failed",
          failure: outcome.failure,
        },
        work.attempt.updatedAt,
      );
      await this.#notify(active, "step-committed", step.key);
      work = await this.#loadWork(active);
      return await this.#failAttempt(active, work.attempt, failedStep.failure);
    }

    work = await this.#loadWork(active);
    const finalBoundaryResult = await this.#reconcileDesiredState(active, work);
    if (finalBoundaryResult !== null) {
      return finalBoundaryResult;
    }
    const incomplete = work.steps.find(
      (step) => step.state !== "succeeded" && step.state !== "skipped",
    );
    if (incomplete !== undefined) {
      throw new SchedulerInvariantError(`attempt completion raced with step ${incomplete.key}`);
    }
    const attempt = await this.#transitionAttempt(active, work.attempt, { to: "succeeded" });
    await this.#notify(active, "attempt-completed", null);
    return { kind: "succeeded", attemptId: attempt.attemptId };
  }

  async #executeStep(
    active: ActiveRun,
    step: SchedulerStepSnapshot,
  ): Promise<SchedulerStepOutcome> {
    await this.#renew(active);
    await this.#assertActive(active);
    this.#throwIfStopped(active);
    try {
      const outcome = await this.#executor.execute({
        attemptId: active.currentLease.attemptId,
        step,
        effectKey: effectKey(active.currentLease.attemptId, step),
        fence: active.currentLease.fence,
        signal: active.abortController.signal,
        assertActive: async () => await this.#assertActive(active),
        heartbeat: async () => await this.#renew(active),
      });
      this.#throwIfStopped(active);
      return outcome;
    } catch (error) {
      if (
        error instanceof SchedulerFenceError ||
        error instanceof SchedulerInterruptedError ||
        error instanceof SchedulerStopError
      ) {
        throw error;
      }
      if (active.abortController.signal.aborted) {
        throw new SchedulerStopError();
      }
      return { kind: "failed", failure: EXECUTOR_EXCEPTION_FAILURE };
    }
  }

  async #settleExistingCheckpoint(
    active: ActiveRun,
    work: SchedulerWorkSnapshot,
  ): Promise<SchedulerTickResult | null> {
    const blocked = work.steps.find((step) => step.state === "blocked");
    if (blocked !== undefined) {
      if (work.attempt.state !== "running" && work.attempt.state !== "blocked") {
        const attempt = await this.#transitionAttempt(active, work.attempt, { to: "running" });
        await this.#notify(active, "attempt-state-committed", null);
        work = { ...work, attempt };
      }
      return await this.#blockAttempt(active, work.attempt, blocked.blocker);
    }
    const failed = work.steps.find((step) => step.state === "failed");
    if (failed !== undefined) {
      if (
        work.attempt.state !== "running" &&
        work.attempt.state !== "blocked" &&
        work.attempt.state !== "failed"
      ) {
        const attempt = await this.#transitionAttempt(active, work.attempt, { to: "running" });
        await this.#notify(active, "attempt-state-committed", null);
        work = { ...work, attempt };
      }
      return await this.#failAttempt(active, work.attempt, failed.failure);
    }
    const cancelled = work.steps.find((step) => step.state === "cancelled");
    if (cancelled !== undefined) {
      if (work.attempt.desiredState !== "cancelled") {
        throw new SchedulerInvariantError("cancelled step has a non-cancelled desired state");
      }
      return await this.#cancelAttempt(active, work);
    }
    if (work.steps.every((step) => step.state === "succeeded" || step.state === "skipped")) {
      if (work.attempt.state === "succeeded") {
        return { kind: "succeeded", attemptId: work.attempt.attemptId };
      }
      if (work.attempt.state !== "running") {
        const running = await this.#transitionAttempt(active, work.attempt, { to: "running" });
        await this.#notify(active, "attempt-state-committed", null);
        work = { ...work, attempt: running };
      }
      const attempt = await this.#transitionAttempt(active, work.attempt, { to: "succeeded" });
      await this.#notify(active, "attempt-completed", null);
      return { kind: "succeeded", attemptId: attempt.attemptId };
    }
    return null;
  }

  async #reconcileDesiredState(
    active: ActiveRun,
    work: SchedulerWorkSnapshot,
  ): Promise<SchedulerTickResult | null> {
    if (isTerminal(work.attempt.state)) {
      return this.#terminalResult(work.attempt);
    }
    if (work.attempt.desiredState === "cancelled") {
      return await this.#cancelAttempt(active, work);
    }
    if (work.attempt.desiredState === "paused") {
      if (work.attempt.state !== "paused") {
        await this.#transitionAttempt(active, work.attempt, { to: "paused" });
        await this.#notify(active, "attempt-state-committed", null);
      }
      return { kind: "paused", attemptId: work.attempt.attemptId };
    }
    return null;
  }

  async #cancelAttempt(
    active: ActiveRun,
    work: SchedulerWorkSnapshot,
  ): Promise<SchedulerTickResult> {
    const running = work.steps.find((step) => step.state === "running");
    if (running !== undefined) {
      await this.#transitionStep(active, running, { to: "cancelled" }, work.attempt.updatedAt);
      await this.#notify(active, "step-committed", running.key);
      work = await this.#loadWork(active);
    }
    if (work.attempt.state !== "cancelled") {
      await this.#transitionAttempt(active, work.attempt, { to: "cancelled" });
      await this.#notify(active, "attempt-state-committed", null);
    }
    return { kind: "cancelled", attemptId: work.attempt.attemptId };
  }

  async #blockAttempt(
    active: ActiveRun,
    attempt: SchedulerAttemptSnapshot,
    blocker: SchedulerBlocker | null,
  ): Promise<SchedulerTickResult> {
    if (blocker === null) {
      throw new SchedulerInvariantError("blocked step is missing blocker details");
    }
    if (attempt.state !== "blocked") {
      await this.#transitionAttempt(active, attempt, { to: "blocked", blocker });
      await this.#notify(active, "attempt-state-committed", null);
    }
    return { kind: "blocked", attemptId: attempt.attemptId, blocker };
  }

  async #failAttempt(
    active: ActiveRun,
    attempt: SchedulerAttemptSnapshot,
    failure: SchedulerFailure | null,
  ): Promise<SchedulerTickResult> {
    if (failure === null) {
      throw new SchedulerInvariantError("failed step is missing failure details");
    }
    if (attempt.state !== "failed") {
      await this.#transitionAttempt(active, attempt, { to: "failed", failure });
      await this.#notify(active, "attempt-completed", null);
    }
    return { kind: "failed", attemptId: attempt.attemptId, failure };
  }

  #terminalResult(attempt: SchedulerAttemptSnapshot): SchedulerTickResult {
    if (attempt.state === "succeeded" || attempt.state === "cancelled") {
      return { kind: attempt.state, attemptId: attempt.attemptId };
    }
    if (attempt.state === "failed") {
      if (attempt.failure === null) {
        throw new SchedulerInvariantError("failed attempt is missing failure details");
      }
      return { kind: "failed", attemptId: attempt.attemptId, failure: attempt.failure };
    }
    throw new SchedulerInvariantError(`nonterminal attempt ${attempt.attemptId} used as terminal`);
  }

  async #ensurePlan(active: ActiveRun): Promise<SchedulerWorkSnapshot> {
    await this.#renew(active);
    await this.#assertActive(active);
    const work = await this.#persistence.ensurePlan({
      lease: active.currentLease,
      observedAt: this.#clock.next().toISOString(),
      plan: SCHEDULER_STEP_PLAN,
    });
    validateWork(work, active.currentLease);
    await this.#notify(active, "plan-ready", null);
    return work;
  }

  async #loadWork(active: ActiveRun, requirePlan = true): Promise<SchedulerWorkSnapshot> {
    await this.#assertActive(active);
    const work = await this.#persistence.loadWork({
      lease: active.currentLease,
      observedAt: this.#clock.next().toISOString(),
    });
    if (requirePlan) {
      validateWork(work, active.currentLease);
    } else if (
      work.attempt.attemptId !== active.currentLease.attemptId ||
      work.attempt.fence !== active.currentLease.fence
    ) {
      throw new SchedulerFenceError("Loaded attempt does not match the active fence");
    }
    return work;
  }

  async #transitionAttempt(
    active: ActiveRun,
    attempt: SchedulerAttemptSnapshot,
    transition: SchedulerAttemptTransition,
  ): Promise<SchedulerAttemptSnapshot> {
    await this.#renew(active);
    await this.#assertActive(active);
    return await this.#persistence.transitionAttempt({
      lease: active.currentLease,
      observedAt: this.#clock.next(attempt.updatedAt).toISOString(),
      expectedRevision: attempt.revision,
      transition,
    });
  }

  async #transitionStep(
    active: ActiveRun,
    step: SchedulerStepSnapshot,
    transition: SchedulerStepTransition,
    attemptUpdatedAt: string,
  ): Promise<SchedulerStepSnapshot> {
    await this.#renew(active);
    await this.#assertActive(active);
    return await this.#persistence.transitionStep({
      lease: active.currentLease,
      observedAt: this.#clock.next(attemptUpdatedAt).toISOString(),
      key: step.key,
      expectedRevision: step.revision,
      transition,
    });
  }

  async #renew(active: ActiveRun): Promise<void> {
    this.#throwIfStopped(active);
    await this.#assertActive(active);
    const heartbeatTime = this.#clock.next(active.currentLease.heartbeatAt);
    active.currentLease = await this.#persistence.renewLease({
      lease: active.currentLease,
      heartbeatAt: heartbeatTime.toISOString(),
      expiresAt: isoAfter(heartbeatTime, this.#leaseDurationMs),
    });
  }

  async #assertActive(active: ActiveRun): Promise<void> {
    this.#throwIfStopped(active);
    await this.#persistence.assertLease({
      lease: active.currentLease,
      observedAt: this.#clock.next().toISOString(),
    });
  }

  async #notify(
    active: ActiveRun,
    phase: SchedulerPhase,
    stepKey: SchedulerStepKey | null,
  ): Promise<void> {
    await this.#observer?.reached({
      phase,
      attemptId: active.currentLease.attemptId,
      fence: active.currentLease.fence,
      stepKey,
    });
  }

  #throwIfStopped(active: ActiveRun): void {
    if (this.#stopRequested || active.abortController.signal.aborted) {
      throw new SchedulerStopError();
    }
  }

  async #safeRelease(active: ActiveRun): Promise<void> {
    try {
      await this.#persistence.assertLease({
        lease: active.currentLease,
        observedAt: this.#clock.next().toISOString(),
      });
      await this.#persistence.releaseLease({
        lease: active.currentLease,
        observedAt: this.#clock.next().toISOString(),
      });
    } catch (error) {
      if (!(error instanceof SchedulerFenceError)) {
        throw error;
      }
    }
  }
}
