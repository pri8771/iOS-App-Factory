import { describe, expect, it } from "vitest";

import {
  MonotonicSchedulerClock,
  RestartSafeScheduler,
  SchedulerFenceError,
  SchedulerInterruptedError,
  SchedulerInvariantError,
  type SchedulerAttemptSnapshot,
  type SchedulerAttemptState,
  type SchedulerAttemptTransition,
  type SchedulerCandidate,
  type SchedulerClockPort,
  type SchedulerDesiredState,
  type SchedulerExecutionContext,
  type SchedulerFailure,
  type SchedulerLease,
  type SchedulerObserverPort,
  type SchedulerPersistencePort,
  type SchedulerPhase,
  type SchedulerPhaseContext,
  type SchedulerStepExecutorPort,
  type SchedulerStepKey,
  type SchedulerStepOutcome,
  type SchedulerStepSnapshot,
  type SchedulerStepState,
  type SchedulerStepTransition,
  type SchedulerWorkSnapshot,
  type SCHEDULER_STEP_PLAN,
} from "../src/index.js";

const ATTEMPT_ID = "attempt-0001";
const LEASE_KEY = `attempt:${ATTEMPT_ID}`;
const LEASE_DURATION_MS = 30_000;

class ManualClock implements SchedulerClockPort {
  #milliseconds = Date.parse("2026-08-11T12:00:00.000Z");

  public now(): Date {
    return new Date(this.#milliseconds);
  }

  public advance(milliseconds: number): void {
    this.#milliseconds += milliseconds;
  }
}

type MutableAttempt = {
  attemptId: string;
  state: SchedulerAttemptState;
  desiredState: SchedulerDesiredState;
  revision: number;
  fence: number;
  updatedAt: string;
  blocker: SchedulerAttemptSnapshot["blocker"];
  failure: SchedulerFailure | null;
};

type MutableStep = {
  attemptId: string;
  key: SchedulerStepKey;
  ordinal: number;
  state: SchedulerStepState;
  revision: number;
  runCount: number;
  blocker: SchedulerStepSnapshot["blocker"];
  failure: SchedulerFailure | null;
  outputDigest: string | null;
};

function cloneAttempt(attempt: MutableAttempt): SchedulerAttemptSnapshot {
  return structuredClone(attempt);
}

function cloneStep(step: MutableStep): SchedulerStepSnapshot {
  return structuredClone(step);
}

class InMemorySchedulerPersistence implements SchedulerPersistencePort {
  public readonly mutations: string[] = [];
  public assertCount = 0;
  public renewCount = 0;
  public lease: SchedulerLease | null = null;
  public readonly attempt: MutableAttempt = {
    attemptId: ATTEMPT_ID,
    state: "queued",
    desiredState: "running",
    revision: 0,
    fence: 0,
    updatedAt: "2026-08-11T12:00:00.000Z",
    blocker: null,
    failure: null,
  };
  public readonly steps = new Map<SchedulerStepKey, MutableStep>();

  public constructor(private readonly clock: ManualClock) {}

  public async discoverEligible(input: {
    readonly limit: number;
    readonly observedAt: string;
  }): Promise<readonly SchedulerCandidate[]> {
    void input.observedAt;
    if (
      input.limit < 1 ||
      this.attempt.state === "succeeded" ||
      this.attempt.state === "failed" ||
      this.attempt.state === "cancelled"
    ) {
      return [];
    }
    return [{ attemptId: ATTEMPT_ID, leaseKey: LEASE_KEY, updatedAt: this.attempt.updatedAt }];
  }

  public async claimLease(input: {
    readonly candidate: SchedulerCandidate;
    readonly ownerId: string;
    readonly acquiredAt: string;
    readonly expiresAt: string;
  }): Promise<SchedulerLease | null> {
    if (input.candidate.attemptId !== ATTEMPT_ID || input.candidate.leaseKey !== LEASE_KEY) {
      throw new SchedulerInvariantError("test candidate mismatch");
    }
    if (this.lease !== null && this.lease.expiresAt > input.acquiredAt) {
      return null;
    }
    this.assertLaterThan("lease claim", input.acquiredAt, this.attempt.updatedAt);
    this.attempt.fence += 1;
    this.attempt.revision += 1;
    this.attempt.updatedAt = input.acquiredAt;
    this.lease = {
      leaseKey: LEASE_KEY,
      attemptId: ATTEMPT_ID,
      ownerId: input.ownerId,
      fence: this.attempt.fence,
      revision: 0,
      heartbeatAt: input.acquiredAt,
      expiresAt: input.expiresAt,
    };
    this.mutations.push("lease:claim");
    return structuredClone(this.lease);
  }

  public async renewLease(input: {
    readonly lease: SchedulerLease;
    readonly heartbeatAt: string;
    readonly expiresAt: string;
  }): Promise<SchedulerLease> {
    this.assertStoredLease(input.lease, input.heartbeatAt);
    this.assertLaterThan("lease heartbeat", input.heartbeatAt, input.lease.heartbeatAt);
    this.renewCount += 1;
    this.lease = {
      ...input.lease,
      revision: input.lease.revision + 1,
      heartbeatAt: input.heartbeatAt,
      expiresAt: input.expiresAt,
    };
    this.mutations.push("lease:renew");
    return structuredClone(this.lease);
  }

  public async assertLease(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
  }): Promise<void> {
    this.assertCount += 1;
    this.assertStoredLease(input.lease, input.observedAt);
  }

  public async releaseLease(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
  }): Promise<void> {
    this.assertStoredLease(input.lease, input.observedAt);
    this.lease = null;
    this.mutations.push("lease:release");
  }

  public async loadWork(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
  }): Promise<SchedulerWorkSnapshot> {
    this.assertStoredLease(input.lease, input.observedAt);
    return this.snapshot();
  }

  public async ensurePlan(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
    readonly plan: typeof SCHEDULER_STEP_PLAN;
  }): Promise<SchedulerWorkSnapshot> {
    this.assertStoredLease(input.lease, input.observedAt);
    if (this.steps.size === 0) {
      this.assertLaterThan("plan creation", input.observedAt, this.attempt.updatedAt);
      for (const definition of input.plan) {
        this.steps.set(definition.key, {
          attemptId: ATTEMPT_ID,
          key: definition.key,
          ordinal: definition.ordinal,
          state: "pending",
          revision: 0,
          runCount: 0,
          blocker: null,
          failure: null,
          outputDigest: null,
        });
      }
      this.attempt.revision += 1;
      this.attempt.updatedAt = input.observedAt;
      this.mutations.push("plan:create");
    }
    return this.snapshot();
  }

  public async transitionAttempt(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
    readonly expectedRevision: number;
    readonly transition: SchedulerAttemptTransition;
  }): Promise<SchedulerAttemptSnapshot> {
    this.assertStoredLease(input.lease, input.observedAt);
    if (input.expectedRevision !== this.attempt.revision) {
      throw new SchedulerFenceError("Stale attempt revision");
    }
    this.assertLaterThan("attempt transition", input.observedAt, this.attempt.updatedAt);
    this.assertAttemptTransition(this.attempt.state, input.transition.to);
    this.attempt.state = input.transition.to;
    this.attempt.blocker = input.transition.to === "blocked" ? input.transition.blocker : null;
    this.attempt.failure = input.transition.to === "failed" ? input.transition.failure : null;
    this.attempt.revision += 1;
    this.attempt.updatedAt = input.observedAt;
    this.mutations.push(`attempt:${input.transition.to}`);
    return cloneAttempt(this.attempt);
  }

  public async transitionStep(input: {
    readonly lease: SchedulerLease;
    readonly observedAt: string;
    readonly key: SchedulerStepKey;
    readonly expectedRevision: number;
    readonly transition: SchedulerStepTransition;
  }): Promise<SchedulerStepSnapshot> {
    this.assertStoredLease(input.lease, input.observedAt);
    const step = this.steps.get(input.key);
    if (step === undefined) {
      throw new SchedulerInvariantError(`test step ${input.key} does not exist`);
    }
    if (step.revision !== input.expectedRevision) {
      throw new SchedulerFenceError("Stale step revision");
    }
    this.assertLaterThan("step transition", input.observedAt, this.attempt.updatedAt);
    this.assertStepTransition(step.state, input.transition.to);
    step.state = input.transition.to;
    step.revision += 1;
    if (input.transition.to === "running") {
      step.runCount += 1;
      step.blocker = null;
      step.failure = null;
      step.outputDigest = null;
    } else if (input.transition.to === "succeeded") {
      step.outputDigest = input.transition.outputDigest;
      step.blocker = null;
      step.failure = null;
    } else if (input.transition.to === "blocked") {
      step.blocker = input.transition.blocker;
      step.failure = null;
      step.outputDigest = null;
    } else if (input.transition.to === "failed") {
      step.failure = input.transition.failure;
      step.blocker = null;
      step.outputDigest = null;
    } else {
      step.blocker = null;
      step.failure = null;
      step.outputDigest = null;
    }
    this.mutations.push(`step:${step.key}:${input.transition.to}`);
    this.attempt.revision += 1;
    this.attempt.updatedAt = input.observedAt;
    return cloneStep(step);
  }

  public setDesiredState(desiredState: SchedulerDesiredState): void {
    this.attempt.desiredState = desiredState;
    this.attempt.revision += 1;
    this.attempt.updatedAt = new Date(Date.parse(this.attempt.updatedAt) + 1).toISOString();
  }

  public resolveBlockedStep(key: SchedulerStepKey): void {
    const step = this.steps.get(key);
    if (step === undefined || step.state !== "blocked") {
      throw new SchedulerInvariantError(`test step ${key} is not blocked`);
    }
    step.state = "running";
    step.runCount += 1;
    step.revision += 1;
    step.blocker = null;
    this.attempt.revision += 1;
    this.attempt.updatedAt = new Date(Date.parse(this.attempt.updatedAt) + 1).toISOString();
  }

  public stealLease(ownerId: string): void {
    const current = this.lease;
    if (current === null) {
      throw new SchedulerInvariantError("cannot steal a missing test lease");
    }
    this.attempt.fence += 1;
    this.attempt.revision += 1;
    const stolenAt = new Date(Date.parse(this.attempt.updatedAt) + 1).toISOString();
    this.attempt.updatedAt = stolenAt;
    this.lease = {
      ...current,
      ownerId,
      fence: this.attempt.fence,
      revision: 0,
      heartbeatAt: stolenAt,
      expiresAt: new Date(this.clock.now().getTime() + LEASE_DURATION_MS).toISOString(),
    };
  }

  public corruptPlan(): void {
    const verify = this.steps.get("verify");
    if (verify !== undefined) {
      verify.ordinal = 99;
    }
  }

  private snapshot(): SchedulerWorkSnapshot {
    return {
      attempt: cloneAttempt(this.attempt),
      steps: [...this.steps.values()].map((step) => cloneStep(step)),
    };
  }

  private assertStoredLease(lease: SchedulerLease, observedAt: string): void {
    const current = this.lease;
    if (
      current === null ||
      current.leaseKey !== lease.leaseKey ||
      current.attemptId !== lease.attemptId ||
      current.ownerId !== lease.ownerId ||
      current.fence !== lease.fence ||
      current.revision !== lease.revision ||
      current.expiresAt <= observedAt
    ) {
      throw new SchedulerFenceError();
    }
  }

  private assertLaterThan(label: string, value: string, floor: string): void {
    if (value <= floor) {
      throw new SchedulerInvariantError(`${label} must be later than ${floor}; received ${value}`);
    }
  }

  private assertAttemptTransition(from: SchedulerAttemptState, to: SchedulerAttemptState): void {
    const legal: Readonly<Record<SchedulerAttemptState, readonly SchedulerAttemptState[]>> = {
      queued: ["running", "paused", "cancelled"],
      running: ["paused", "blocked", "succeeded", "failed", "cancelled"],
      paused: ["running", "cancelled"],
      blocked: ["running", "paused", "failed", "cancelled"],
      succeeded: [],
      failed: [],
      cancelled: [],
    };
    if (!legal[from].includes(to)) {
      throw new SchedulerInvariantError(`illegal test attempt transition ${from} -> ${to}`);
    }
  }

  private assertStepTransition(from: SchedulerStepState, to: SchedulerStepState): void {
    const legal: Readonly<Record<SchedulerStepState, readonly SchedulerStepState[]>> = {
      pending: ["running", "skipped"],
      running: ["blocked", "succeeded", "failed", "cancelled"],
      blocked: ["running", "failed", "cancelled"],
      succeeded: [],
      failed: [],
      cancelled: [],
      skipped: [],
    };
    if (!legal[from].includes(to)) {
      throw new SchedulerInvariantError(`illegal test step transition ${from} -> ${to}`);
    }
  }
}

class IdempotentFakeExecutor implements SchedulerStepExecutorPort {
  public readonly calls: string[] = [];
  public readonly applications = new Map<string, number>();
  public readonly outcomes = new Map<SchedulerStepKey, SchedulerStepOutcome>();
  public onApplied: ((context: SchedulerExecutionContext) => void | Promise<void>) | undefined;
  public beforeExecute: ((context: SchedulerExecutionContext) => void | Promise<void>) | undefined;
  readonly #results = new Map<string, SchedulerStepOutcome>();

  public async execute(context: SchedulerExecutionContext): Promise<SchedulerStepOutcome> {
    this.calls.push(context.effectKey);
    await context.assertActive();
    await this.beforeExecute?.(context);
    if (context.signal.aborted) {
      throw new Error("fake executor aborted");
    }
    const existing = this.#results.get(context.effectKey);
    if (existing !== undefined) {
      return existing;
    }
    const outcome =
      this.outcomes.get(context.step.key) ??
      ({
        kind: "succeeded",
        outputDigest: `sha256:${context.step.key}:${context.step.runCount}`,
      } as const);
    this.#results.set(context.effectKey, outcome);
    this.applications.set(context.effectKey, (this.applications.get(context.effectKey) ?? 0) + 1);
    await this.onApplied?.(context);
    return outcome;
  }

  public applicationCount(stepKey: SchedulerStepKey): number {
    return [...this.applications.entries()]
      .filter(([key]) => key.includes(`:${stepKey}:`))
      .reduce((total, [, count]) => total + count, 0);
  }
}

class OneShotInterruption implements SchedulerObserverPort {
  #triggered = false;

  public constructor(
    private readonly phase: SchedulerPhase,
    private readonly stepKey: SchedulerStepKey | null,
  ) {}

  public reached(context: SchedulerPhaseContext): void {
    if (!this.#triggered && context.phase === this.phase && context.stepKey === this.stepKey) {
      this.#triggered = true;
      throw new SchedulerInterruptedError(context.phase);
    }
  }
}

function createScheduler(
  persistence: InMemorySchedulerPersistence,
  executor: SchedulerStepExecutorPort,
  clock: ManualClock,
  options: { ownerId?: string; observer?: SchedulerObserverPort } = {},
): RestartSafeScheduler {
  return new RestartSafeScheduler({
    ownerId: options.ownerId ?? "worker-a",
    persistence,
    executor,
    clock,
    leaseDurationMs: LEASE_DURATION_MS,
    ...(options.observer === undefined ? {} : { observer: options.observer }),
  });
}

describe("RestartSafeScheduler", () => {
  it("advances logical ISO instants with a frozen clock and across a restart floor", () => {
    const wallClock = new ManualClock();
    const firstProcessClock = new MonotonicSchedulerClock(wallClock);
    expect(firstProcessClock.next().toISOString()).toBe("2026-08-11T12:00:00.000Z");
    expect(firstProcessClock.next().toISOString()).toBe("2026-08-11T12:00:00.001Z");

    const restartedClock = new MonotonicSchedulerClock(wallClock);
    expect(restartedClock.next("2026-08-11T12:00:00.050Z").toISOString()).toBe(
      "2026-08-11T12:00:00.051Z",
    );
  });

  it("claims, renews, fences, and durably completes exactly three ordered steps", async () => {
    const clock = new ManualClock();
    const persistence = new InMemorySchedulerPersistence(clock);
    const executor = new IdempotentFakeExecutor();
    const scheduler = createScheduler(persistence, executor, clock);

    await expect(scheduler.tick()).resolves.toEqual({ kind: "succeeded", attemptId: ATTEMPT_ID });

    expect(persistence.attempt.state).toBe("succeeded");
    expect([...persistence.steps.values()].map(({ key, state }) => [key, state])).toEqual([
      ["prepare", "succeeded"],
      ["execute", "succeeded"],
      ["verify", "succeeded"],
    ]);
    expect(executor.calls).toEqual([
      `scheduler.v1:${ATTEMPT_ID}:prepare:run-1`,
      `scheduler.v1:${ATTEMPT_ID}:execute:run-1`,
      `scheduler.v1:${ATTEMPT_ID}:verify:run-1`,
    ]);
    expect(persistence.renewCount).toBeGreaterThan(6);
    expect(persistence.assertCount).toBeGreaterThan(persistence.mutations.length);
    expect(persistence.lease).toBeNull();
    await expect(scheduler.tick()).resolves.toEqual({ kind: "idle" });
  });

  it("recovers after interruption at every durable phase without duplicating effects", async () => {
    const failpoints: readonly (readonly [SchedulerPhase, SchedulerStepKey | null])[] = [
      ["lease-claimed", null],
      ["attempt-state-committed", null],
      ["plan-ready", null],
      ["step-started", "prepare"],
      ["step-effect-completed", "prepare"],
      ["step-committed", "prepare"],
      ["step-started", "execute"],
      ["step-effect-completed", "execute"],
      ["step-committed", "execute"],
      ["step-started", "verify"],
      ["step-effect-completed", "verify"],
      ["step-committed", "verify"],
      ["attempt-completed", null],
    ];

    for (const [phase, stepKey] of failpoints) {
      const clock = new ManualClock();
      const persistence = new InMemorySchedulerPersistence(clock);
      const executor = new IdempotentFakeExecutor();
      const interrupted = createScheduler(persistence, executor, clock, {
        observer: new OneShotInterruption(phase, stepKey),
      });

      await expect(interrupted.tick(), `${phase}:${stepKey ?? "attempt"}`).resolves.toMatchObject({
        kind: "interrupted",
        phase,
      });
      const restarted = createScheduler(persistence, executor, clock, { ownerId: "worker-b" });
      const recovered = await restarted.tick();
      expect(["succeeded", "idle"], `${phase}:${stepKey ?? "attempt"}`).toContain(recovered.kind);
      expect(persistence.attempt.state).toBe("succeeded");
      for (const key of ["prepare", "execute", "verify"] as const) {
        expect(executor.applicationCount(key), `${phase}:${stepKey ?? "attempt"}:${key}`).toBe(1);
      }
    }
  });

  it("rejects a stale worker before commit and lets a successor resume idempotently", async () => {
    const clock = new ManualClock();
    const persistence = new InMemorySchedulerPersistence(clock);
    const executor = new IdempotentFakeExecutor();
    executor.onApplied = (context) => {
      if (context.step.key === "prepare") {
        persistence.stealLease("worker-rival");
      }
    };

    const stale = createScheduler(persistence, executor, clock);
    await expect(stale.tick()).resolves.toEqual({ kind: "fenced", attemptId: ATTEMPT_ID });
    expect(persistence.steps.get("prepare")?.state).toBe("running");
    expect(executor.applicationCount("prepare")).toBe(1);

    executor.onApplied = undefined;
    clock.advance(LEASE_DURATION_MS + 1);
    const successor = createScheduler(persistence, executor, clock, { ownerId: "worker-b" });
    await expect(successor.tick()).resolves.toEqual({ kind: "succeeded", attemptId: ATTEMPT_ID });
    expect(executor.applicationCount("prepare")).toBe(1);
    expect(persistence.attempt.fence).toBe(3);
  });

  it("serializes duplicate ticks with bounded concurrency one", async () => {
    const clock = new ManualClock();
    const persistence = new InMemorySchedulerPersistence(clock);
    const executor = new IdempotentFakeExecutor();
    let unblock: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let started: (() => void) | undefined;
    const didStart = new Promise<void>((resolve) => {
      started = resolve;
    });
    executor.beforeExecute = async (context) => {
      if (context.step.key === "prepare") {
        started?.();
        await blocked;
      }
    };
    const scheduler = createScheduler(persistence, executor, clock);

    const first = scheduler.tick();
    await didStart;
    await expect(scheduler.tick()).resolves.toEqual({ kind: "busy", attemptId: ATTEMPT_ID });
    unblock?.();
    await expect(first).resolves.toEqual({ kind: "succeeded", attemptId: ATTEMPT_ID });
    expect(executor.applicationCount("prepare")).toBe(1);
  });

  it("honors pause before work and resumes the same durable plan", async () => {
    const clock = new ManualClock();
    const persistence = new InMemorySchedulerPersistence(clock);
    const executor = new IdempotentFakeExecutor();
    persistence.setDesiredState("paused");

    await expect(createScheduler(persistence, executor, clock).tick()).resolves.toEqual({
      kind: "paused",
      attemptId: ATTEMPT_ID,
    });
    expect(executor.applications.size).toBe(0);
    expect(persistence.attempt.state).toBe("paused");

    persistence.setDesiredState("running");
    await expect(
      createScheduler(persistence, executor, clock, { ownerId: "worker-b" }).tick(),
    ).resolves.toEqual({ kind: "succeeded", attemptId: ATTEMPT_ID });
    expect(executor.applications.size).toBe(3);
  });

  it("pauses at a post-effect boundary and resumes without applying that effect twice", async () => {
    const clock = new ManualClock();
    const persistence = new InMemorySchedulerPersistence(clock);
    const executor = new IdempotentFakeExecutor();
    executor.onApplied = (context) => {
      if (context.step.key === "prepare") {
        persistence.setDesiredState("paused");
      }
    };

    await expect(createScheduler(persistence, executor, clock).tick()).resolves.toEqual({
      kind: "paused",
      attemptId: ATTEMPT_ID,
    });
    expect(persistence.attempt.state).toBe("paused");
    expect(persistence.steps.get("prepare")?.state).toBe("running");
    expect(executor.applicationCount("prepare")).toBe(1);

    executor.onApplied = undefined;
    persistence.setDesiredState("running");
    await expect(
      createScheduler(persistence, executor, clock, { ownerId: "worker-b" }).tick(),
    ).resolves.toEqual({ kind: "succeeded", attemptId: ATTEMPT_ID });
    expect(executor.applicationCount("prepare")).toBe(1);
    expect(persistence.steps.get("prepare")?.runCount).toBe(1);
  });

  it("observes cancellation after an effect and commits no later effects", async () => {
    const clock = new ManualClock();
    const persistence = new InMemorySchedulerPersistence(clock);
    const executor = new IdempotentFakeExecutor();
    executor.onApplied = (context) => {
      if (context.step.key === "prepare") {
        persistence.setDesiredState("cancelled");
      }
    };

    await expect(createScheduler(persistence, executor, clock).tick()).resolves.toEqual({
      kind: "cancelled",
      attemptId: ATTEMPT_ID,
    });
    expect(persistence.attempt.state).toBe("cancelled");
    expect(persistence.steps.get("prepare")?.state).toBe("cancelled");
    expect(executor.applicationCount("prepare")).toBe(1);
    expect(executor.applicationCount("execute")).toBe(0);
  });

  it("persists needs-input and failure as explicit step and attempt states", async () => {
    const needsInputClock = new ManualClock();
    const needsInputStore = new InMemorySchedulerPersistence(needsInputClock);
    const needsInputExecutor = new IdempotentFakeExecutor();
    const blocker = { code: "approval_required", message: "Review the generated plan." };
    needsInputExecutor.outcomes.set("execute", { kind: "needs-input", blocker });

    await expect(
      createScheduler(needsInputStore, needsInputExecutor, needsInputClock).tick(),
    ).resolves.toEqual({ kind: "blocked", attemptId: ATTEMPT_ID, blocker });
    expect(needsInputStore.attempt.state).toBe("blocked");
    expect(needsInputStore.steps.get("execute")?.state).toBe("blocked");
    expect(needsInputExecutor.applicationCount("verify")).toBe(0);

    const failureClock = new ManualClock();
    const failureStore = new InMemorySchedulerPersistence(failureClock);
    const failureExecutor = new IdempotentFakeExecutor();
    const failure = { code: "verification_failed", message: "Fixture failed.", retryable: false };
    failureExecutor.outcomes.set("verify", { kind: "failed", failure });

    await expect(
      createScheduler(failureStore, failureExecutor, failureClock).tick(),
    ).resolves.toEqual({ kind: "failed", attemptId: ATTEMPT_ID, failure });
    expect(failureStore.attempt.state).toBe("failed");
    expect(failureStore.steps.get("verify")?.failure).toEqual(failure);
  });

  it("uses a new effect key only after an intentional blocked-step retry", async () => {
    const clock = new ManualClock();
    const persistence = new InMemorySchedulerPersistence(clock);
    const executor = new IdempotentFakeExecutor();
    executor.outcomes.set("execute", {
      kind: "needs-input",
      blocker: { code: "input", message: "Provide input." },
    });
    await createScheduler(persistence, executor, clock).tick();

    persistence.resolveBlockedStep("execute");
    executor.outcomes.set("execute", {
      kind: "succeeded",
      outputDigest: "sha256:execute-with-input",
    });
    await expect(
      createScheduler(persistence, executor, clock, { ownerId: "worker-b" }).tick(),
    ).resolves.toEqual({ kind: "succeeded", attemptId: ATTEMPT_ID });
    expect(executor.calls.filter((key) => key.includes(":execute:"))).toEqual([
      `scheduler.v1:${ATTEMPT_ID}:execute:run-1`,
      `scheduler.v1:${ATTEMPT_ID}:execute:run-2`,
    ]);
    expect(executor.applicationCount("execute")).toBe(2);
  });

  it("cooperatively aborts on stop and a new instance resumes the running step", async () => {
    const clock = new ManualClock();
    const persistence = new InMemorySchedulerPersistence(clock);
    const executor = new IdempotentFakeExecutor();
    let started: (() => void) | undefined;
    const didStart = new Promise<void>((resolve) => {
      started = resolve;
    });
    executor.beforeExecute = async (context) => {
      if (context.step.key !== "prepare") {
        return;
      }
      started?.();
      await new Promise<void>((_resolve, reject) => {
        context.signal.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    };
    const scheduler = createScheduler(persistence, executor, clock);
    const tick = scheduler.tick();
    await didStart;
    await scheduler.stop();
    await expect(tick).resolves.toEqual({ kind: "stopped", attemptId: ATTEMPT_ID });
    expect(persistence.steps.get("prepare")?.state).toBe("running");
    expect(persistence.lease).toBeNull();
    await expect(scheduler.tick()).resolves.toEqual({ kind: "stopped", attemptId: null });

    executor.beforeExecute = undefined;
    const restarted = createScheduler(persistence, executor, clock, { ownerId: "worker-b" });
    await expect(restarted.tick()).resolves.toEqual({ kind: "succeeded", attemptId: ATTEMPT_ID });
    expect(persistence.steps.get("prepare")?.runCount).toBe(1);
  });

  it("exposes heartbeats to long-running executors", async () => {
    const clock = new ManualClock();
    const persistence = new InMemorySchedulerPersistence(clock);
    const executor = new IdempotentFakeExecutor();
    executor.beforeExecute = async (context) => {
      if (context.step.key === "prepare") {
        clock.advance(10_000);
        await context.heartbeat();
        clock.advance(10_000);
        await context.heartbeat();
      }
    };
    await createScheduler(persistence, executor, clock).tick();
    expect(persistence.renewCount).toBeGreaterThan(8);
  });

  it("converts an unexpected executor exception into a sanitized durable failure", async () => {
    const clock = new ManualClock();
    const persistence = new InMemorySchedulerPersistence(clock);
    const executor: SchedulerStepExecutorPort = {
      execute: async () => {
        throw new Error("secret-looking provider payload");
      },
    };
    const result = await createScheduler(persistence, executor, clock).tick();
    expect(result).toEqual({
      kind: "failed",
      attemptId: ATTEMPT_ID,
      failure: {
        code: "executor_exception",
        message: "The step executor stopped unexpectedly.",
        retryable: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain("provider payload");
  });

  it("fails closed when the persisted plan does not match the fixed plan", async () => {
    const clock = new ManualClock();
    const persistence = new InMemorySchedulerPersistence(clock);
    await createScheduler(persistence, new IdempotentFakeExecutor(), clock, {
      observer: new OneShotInterruption("plan-ready", null),
    }).tick();
    persistence.corruptPlan();

    await expect(
      createScheduler(persistence, new IdempotentFakeExecutor(), clock).tick(),
    ).rejects.toThrow(SchedulerInvariantError);
  });
});
