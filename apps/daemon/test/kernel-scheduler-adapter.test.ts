import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AttemptId, CommandId, EventId } from "@app-factory/contracts";
import {
  computeTaskSpecDigest,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
} from "@app-factory/kernel";
import {
  SCHEDULER_STEP_PLAN,
  SchedulerFenceError,
  SchedulerInterruptedError,
  type SchedulerExecutionContext,
  type SchedulerStepExecutorPort,
} from "@app-factory/scheduler";
import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  KernelSchedulerPersistenceAdapter,
  createKernelSchedulerController,
} from "../src/kernel-scheduler-adapter.js";

const T0 = "2026-08-11T12:00:00.000Z";
const roots: string[] = [];
const databases: Database.Database[] = [];

function id(suffix: number): string {
  return `42000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function plus(instant: string, milliseconds: number): string {
  return new Date(Date.parse(instant) + milliseconds).toISOString();
}

function openDatabase(): Database.Database {
  const root = mkdtempSync(join(tmpdir(), "factory-kernel-scheduler-"));
  roots.push(root);
  const database = openMigratedFactoryDatabase(join(root, "factory.sqlite"));
  databases.push(database);
  return database;
}

function seedAttempt(
  database: Database.Database,
  suffix: number,
  desiredState: "running" | "paused" = "running",
): AttemptId {
  const repositories = createFactoryRepositories(database);
  const taskSpec = {
    schemaVersion: 1,
    taskId: id(suffix * 10 + 1),
    projectId: id(1),
    createdAt: T0,
    title: `Scheduler attempt ${String(suffix)}`,
    objective: "Execute the durable three-step scheduler plan.",
    acceptanceCriteria: [
      { id: "three-steps", statement: "All three steps succeed.", verification: "automated" },
    ],
    base: { repositoryId: id(2), commit: "a".repeat(40) },
    requestedScope: { paths: ["Sources/App.swift"] },
    policyDigest: `sha256:${"b".repeat(64)}`,
  } as const;
  const taskSpecDigest = computeTaskSpecDigest(taskSpec);
  const commandId = id(suffix * 10 + 2) as CommandId;
  const attemptId = id(suffix * 10 + 3) as AttemptId;
  repositories.createTaskAttempt({
    command: {
      schemaVersion: 1,
      commandId,
      issuedAt: T0,
      origin: "system",
      kind: "task.submit",
      initialDesiredState: desiredState,
      taskSpec,
    },
    taskSpecDigest,
    attempt: {
      schemaVersion: 1,
      attemptId,
      taskId: taskSpec.taskId,
      taskSpecDigest,
      attemptNumber: 1,
      state: "queued",
      desiredState,
      revision: 0,
      fence: 0,
      currentStepId: null,
      blocker: null,
      outcome: null,
      createdAt: T0,
      updatedAt: T0,
      terminalAt: null,
    },
    event: {
      schemaVersion: 1,
      eventId: id(suffix * 10 + 4) as EventId,
      attemptId,
      sequence: 1,
      occurredAt: T0,
      commandId,
      causationEventId: null,
      fence: 0,
      type: "attempt.created",
      data: { taskId: taskSpec.taskId, taskSpecDigest },
    },
  });
  return attemptId;
}

function setDesiredState(
  database: Database.Database,
  attemptId: AttemptId,
  desiredState: "running" | "paused" | "cancelled",
  suffix: number,
): void {
  const repositories = createFactoryRepositories(database);
  const attempt = repositories.attempts.findById(attemptId);
  if (attempt === null) throw new Error("Attempt fixture disappeared");
  const last = repositories.events.listByAttempt(attemptId).at(-1);
  if (last === undefined) throw new Error("Attempt fixture has no event");
  const occurredAt = plus(
    attempt.updatedAt > last.occurredAt ? attempt.updatedAt : last.occurredAt,
    1,
  );
  const commandId = id(suffix) as CommandId;
  repositories.desiredStates.apply({
    command: {
      schemaVersion: 1,
      commandId,
      issuedAt: occurredAt,
      origin: "system",
      kind: "attempt.set-desired-state",
      attemptId,
      desiredState,
      reason: "Scheduler adapter test",
    },
    expectedRevision: attempt.revision,
    event: {
      schemaVersion: 1,
      eventId: id(suffix + 1) as EventId,
      attemptId,
      sequence: last.sequence + 1,
      occurredAt,
      commandId,
      causationEventId: last.eventId,
      fence: attempt.fence,
      type: "attempt.desired-state-changed",
      data: { from: attempt.desiredState, to: desiredState, reason: "Scheduler adapter test" },
    },
  });
}

function outputDigest(key: string): string {
  return `sha256:${createHash("sha256").update(key).digest("hex")}`;
}

class RecordingExecutor implements SchedulerStepExecutorPort {
  public readonly calls: Array<Readonly<{ key: string; effectKey: string; fence: number }>> = [];

  public async execute(context: SchedulerExecutionContext) {
    await context.assertActive();
    this.calls.push({
      key: context.step.key,
      effectKey: context.effectKey,
      fence: context.fence,
    });
    return { kind: "succeeded" as const, outputDigest: outputDigest(context.effectKey) };
  }
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    if (database.open) database.close();
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("kernel scheduler adapter", () => {
  it("resumes a paused submission on the scheduler loop's next durable tick", async () => {
    const database = openDatabase();
    const attemptId = seedAttempt(database, 10, "paused");
    const executor = new RecordingExecutor();
    const controller = createKernelSchedulerController({
      database,
      ownerId: "scheduler.paused-resume",
      executor,
      clock: { now: () => new Date(T0) },
    });

    await expect(controller.tick()).resolves.toEqual({ kind: "paused", attemptId });
    expect(createFactoryRepositories(database).attempts.findById(attemptId)).toMatchObject({
      state: "paused",
      desiredState: "paused",
    });
    expect(executor.calls).toEqual([]);

    setDesiredState(database, attemptId, "running", 200);
    await expect(controller.tick()).resolves.toEqual({ kind: "succeeded", attemptId });

    const repositories = createFactoryRepositories(database);
    expect(repositories.attempts.findById(attemptId)).toMatchObject({
      state: "succeeded",
      desiredState: "running",
      currentStepId: null,
      outcome: { kind: "succeeded" },
    });
    expect(
      repositories.steps.listByAttempt(attemptId).map((step) => [step.operation, step.state]),
    ).toEqual([
      ["factory.prepare", "succeeded"],
      ["factory.execute", "succeeded"],
      ["factory.verify", "succeeded"],
    ]);
    expect(executor.calls.map((call) => call.key)).toEqual(["prepare", "execute", "verify"]);
  });

  it("runs an immediate submission to success in one scheduler tick", async () => {
    const database = openDatabase();
    const attemptId = seedAttempt(database, 20);
    const executor = new RecordingExecutor();
    const controller = createKernelSchedulerController({
      database,
      ownerId: "scheduler.immediate",
      executor,
      clock: { now: () => new Date(T0) },
    });

    await expect(controller.tick()).resolves.toEqual({ kind: "succeeded", attemptId });
    expect(executor.calls).toHaveLength(3);
  });

  it("uses injected deterministic identities and keeps plan creation idempotent", async () => {
    const database = openDatabase();
    const attemptId = seedAttempt(database, 25);
    const calls: Array<Readonly<{ purpose: string; sequence: number }>> = [];
    const offsets = {
      "lease-event": 0,
      step: 1,
      "step-created-event": 2,
      "attempt-state-event": 3,
      "step-state-event": 4,
    } as const;
    const persistence = new KernelSchedulerPersistenceAdapter({
      database,
      idFactory: (purpose, context) => {
        calls.push({ purpose, sequence: context.sequence });
        return id(8_000 + offsets[purpose] * 100 + context.sequence);
      },
    });
    const [candidate] = await persistence.discoverEligible({ limit: 1, observedAt: T0 });
    if (candidate === undefined) throw new Error("Expected an identity-test candidate");
    expect(candidate.attemptId).toBe(attemptId);
    const lease = await persistence.claimLease({
      candidate,
      ownerId: "scheduler.identities",
      acquiredAt: plus(T0, 1),
      expiresAt: plus(T0, 100),
    });
    if (lease === null) throw new Error("Expected the identity-test lease claim");

    const first = await persistence.ensurePlan({
      lease,
      observedAt: plus(T0, 2),
      plan: SCHEDULER_STEP_PLAN,
    });
    const callCount = calls.length;
    const second = await persistence.ensurePlan({
      lease,
      observedAt: plus(T0, 20),
      plan: SCHEDULER_STEP_PLAN,
    });
    expect(first.steps).toEqual(second.steps);
    expect(first.steps).toHaveLength(3);
    expect(calls).toHaveLength(callCount);
    expect(calls.filter((call) => call.purpose === "step")).toHaveLength(3);
    expect(calls.filter((call) => call.purpose === "step-created-event")).toHaveLength(3);
  });

  it("replays a running checkpoint after a crash with the same effect key", async () => {
    const database = openDatabase();
    const attemptId = seedAttempt(database, 30);
    const firstExecutor = new RecordingExecutor();
    const interrupted = createKernelSchedulerController({
      database,
      ownerId: "scheduler.before-crash",
      executor: firstExecutor,
      clock: { now: () => new Date(T0) },
      observer: {
        reached(context) {
          if (context.phase === "step-effect-completed" && context.stepKey === "prepare") {
            throw new SchedulerInterruptedError(context.phase);
          }
        },
      },
    });
    await expect(interrupted.tick()).resolves.toMatchObject({
      kind: "interrupted",
      attemptId,
      phase: "step-effect-completed",
    });
    const running = createFactoryRepositories(database).steps.listByAttempt(attemptId)[0];
    expect(running).toMatchObject({ operation: "factory.prepare", state: "running", runCount: 1 });

    const replayExecutor = new RecordingExecutor();
    const restarted = createKernelSchedulerController({
      database,
      ownerId: "scheduler.after-crash",
      executor: replayExecutor,
      clock: { now: () => new Date(T0) },
    });
    await expect(restarted.tick()).resolves.toEqual({ kind: "succeeded", attemptId });
    expect(replayExecutor.calls[0]?.effectKey).toBe(firstExecutor.calls[0]?.effectKey);
    expect(createFactoryRepositories(database).steps.listByAttempt(attemptId)[0]).toMatchObject({
      state: "succeeded",
      runCount: 1,
    });
  });

  it("rejects stale owners and fences after lease reclamation", async () => {
    const database = openDatabase();
    const attemptId = seedAttempt(database, 40);
    const first = new KernelSchedulerPersistenceAdapter({ database });
    const [candidate] = await first.discoverEligible({ limit: 1, observedAt: T0 });
    if (candidate === undefined) throw new Error("Expected a scheduler candidate");
    const staleLease = await first.claimLease({
      candidate,
      ownerId: "scheduler.old",
      acquiredAt: plus(T0, 1),
      expiresAt: plus(T0, 10),
    });
    if (staleLease === null) throw new Error("Expected the first lease claim to succeed");

    const second = new KernelSchedulerPersistenceAdapter({ database });
    const [reclaimCandidate] = await second.discoverEligible({
      limit: 1,
      observedAt: plus(T0, 11),
    });
    if (reclaimCandidate === undefined) throw new Error("Expected a reclaim candidate");
    const successor = await second.claimLease({
      candidate: reclaimCandidate,
      ownerId: "scheduler.new",
      acquiredAt: plus(T0, 11),
      expiresAt: plus(T0, 100),
    });
    expect(successor).toMatchObject({ attemptId, ownerId: "scheduler.new", fence: 2 });
    await expect(
      first.assertLease({ lease: staleLease, observedAt: plus(T0, 5) }),
    ).rejects.toBeInstanceOf(SchedulerFenceError);
    await expect(
      first.transitionAttempt({
        lease: staleLease,
        observedAt: plus(T0, 5),
        expectedRevision: 1,
        transition: { to: "running" },
      }),
    ).rejects.toBeInstanceOf(SchedulerFenceError);
  });

  it("reconciles cancellation without executing work", async () => {
    const database = openDatabase();
    const attemptId = seedAttempt(database, 50);
    setDesiredState(database, attemptId, "cancelled", 600);
    const executor = new RecordingExecutor();
    const controller = createKernelSchedulerController({
      database,
      ownerId: "scheduler.cancel",
      executor,
      clock: { now: () => new Date(T0) },
    });

    await expect(controller.tick()).resolves.toEqual({ kind: "cancelled", attemptId });
    expect(executor.calls).toEqual([]);
    expect(createFactoryRepositories(database).attempts.findById(attemptId)).toMatchObject({
      state: "cancelled",
      desiredState: "cancelled",
      outcome: { kind: "cancelled" },
    });
  });

  it("keeps all persisted event timestamps strictly increasing with a frozen wall clock", async () => {
    const database = openDatabase();
    const attemptId = seedAttempt(database, 70);
    const controller = createKernelSchedulerController({
      database,
      ownerId: "scheduler.frozen-clock",
      executor: new RecordingExecutor(),
      clock: { now: () => new Date(T0) },
      leaseDurationMs: 1_000,
    });
    await expect(controller.tick()).resolves.toEqual({ kind: "succeeded", attemptId });

    const occurredAt = createFactoryRepositories(database)
      .events.listByAttempt(attemptId)
      .map((event) => Date.parse(event.occurredAt));
    expect(
      occurredAt.every((value, index) => {
        if (index === 0) return true;
        const previous = occurredAt[index - 1];
        return previous !== undefined && value > previous;
      }),
    ).toBe(true);
  });
});
