import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  LEGAL_ATTEMPT_STATE_TRANSITIONS,
  LEGAL_STEP_STATE_TRANSITIONS,
  assertLegalAttemptStateTransition,
  assertLegalStepStateTransition,
  computeTaskSpecDigest,
  createFactoryRepositories,
  isLegalAttemptStateTransition,
  isLegalStepStateTransition,
  openMigratedFactoryDatabase,
} from "../src/index.js";

const T0 = "2026-08-10T12:00:00.000Z";
const T1 = "2026-08-10T12:00:01.000Z";
const T2 = "2026-08-10T12:00:02.000Z";
const T3 = "2026-08-10T12:00:03.000Z";
const T4 = "2026-08-10T12:00:04.000Z";
const T5 = "2026-08-10T12:00:05.000Z";
const T6 = "2026-08-10T12:00:06.000Z";

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "10000000-0000-4000-8000-000000000002";
const TASK_ID = "10000000-0000-4000-8000-000000000003";
const SUBMIT_COMMAND_ID = "10000000-0000-4000-8000-000000000004";
const ATTEMPT_ID = "10000000-0000-4000-8000-000000000005";
const CREATED_EVENT_ID = "10000000-0000-4000-8000-000000000006";
const DESIRED_COMMAND_ID = "10000000-0000-4000-8000-000000000010";
const DESIRED_EVENT_ID = "10000000-0000-4000-8000-000000000011";
const SECOND_COMMAND_ID = "10000000-0000-4000-8000-000000000012";
const STEP_ID = "10000000-0000-4000-8000-000000000020";
const STEP_CREATED_EVENT_ID = "10000000-0000-4000-8000-000000000021";
const STEP_RUNNING_EVENT_ID = "10000000-0000-4000-8000-000000000022";
const STEP_TERMINAL_EVENT_ID = "10000000-0000-4000-8000-000000000023";
const FIRST_FENCE_EVENT_ID = "10000000-0000-4000-8000-000000000030";
const SECOND_FENCE_EVENT_ID = "10000000-0000-4000-8000-000000000031";
const STATE_EVENT_ID = "10000000-0000-4000-8000-000000000040";
const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const INPUT_DIGEST = `sha256:${"b".repeat(64)}`;
const OUTPUT_DIGEST = `sha256:${"c".repeat(64)}`;
const BASE_COMMIT = "d".repeat(40);

const ATTEMPT_STATES = [
  "queued",
  "running",
  "paused",
  "blocked",
  "succeeded",
  "failed",
  "cancelled",
] as const;
const STEP_STATES = [
  "pending",
  "running",
  "blocked",
  "succeeded",
  "failed",
  "cancelled",
  "skipped",
] as const;

const temporaryDirectories: string[] = [];

function makeDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-durability-test-"));
  temporaryDirectories.push(directory);
  return join(directory, "factory.db");
}

function makeSubmission() {
  const taskSpec = {
    schemaVersion: 1,
    taskId: TASK_ID,
    projectId: PROJECT_ID,
    createdAt: T0,
    title: "Execute one durable step",
    objective: "Verify command, checkpoint, and fencing persistence.",
    acceptanceCriteria: [
      {
        id: "durable-step",
        statement: "The durable step succeeds once.",
        verification: "automated",
      },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: BASE_COMMIT },
    requestedScope: { paths: ["Sources/Greeting.swift"] },
    policyDigest: POLICY_DIGEST,
  } as const;
  const taskSpecDigest = computeTaskSpecDigest(taskSpec);
  const command = {
    schemaVersion: 1,
    commandId: SUBMIT_COMMAND_ID,
    issuedAt: T0,
    origin: "cli",
    kind: "task.submit",
    taskSpec,
  } as const;
  const attempt = {
    schemaVersion: 1,
    attemptId: ATTEMPT_ID,
    taskId: TASK_ID,
    taskSpecDigest,
    attemptNumber: 1,
    state: "queued",
    desiredState: "running",
    revision: 0,
    fence: 0,
    currentStepId: null,
    blocker: null,
    outcome: null,
    createdAt: T0,
    updatedAt: T0,
    terminalAt: null,
  } as const;
  const event = {
    schemaVersion: 1,
    eventId: CREATED_EVENT_ID,
    attemptId: ATTEMPT_ID,
    sequence: 1,
    occurredAt: T0,
    commandId: SUBMIT_COMMAND_ID,
    causationEventId: null,
    fence: 0,
    type: "attempt.created",
    data: { taskId: TASK_ID, taskSpecDigest },
  } as const;
  return { command, taskSpecDigest, attempt, event };
}

function seed(databasePath = makeDatabasePath()) {
  const database = openMigratedFactoryDatabase(databasePath);
  const repositories = createFactoryRepositories(database);
  const submission = makeSubmission();
  repositories.createTaskAttempt(submission);
  return { databasePath, database, repositories, submission };
}

function desiredStateChange() {
  return {
    command: {
      schemaVersion: 1,
      commandId: DESIRED_COMMAND_ID,
      issuedAt: T1,
      origin: "dashboard",
      kind: "attempt.set-desired-state",
      attemptId: ATTEMPT_ID,
      desiredState: "paused",
      reason: "Operator review",
    },
    expectedRevision: 0,
    event: {
      schemaVersion: 1,
      eventId: DESIRED_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 2,
      occurredAt: T1,
      commandId: DESIRED_COMMAND_ID,
      causationEventId: CREATED_EVENT_ID,
      fence: 0,
      type: "attempt.desired-state-changed",
      data: {
        from: "running",
        to: "paused",
        reason: "Operator review",
      },
    },
  } as const;
}

function fenceClaim(
  ownerId: string,
  expectedAttemptRevision: number,
  previousFence: number,
  acquiredAt: string,
  expiresAt: string,
  eventId: string,
  sequence: number,
) {
  return {
    leaseKey: `attempt:${ATTEMPT_ID}`,
    attemptId: ATTEMPT_ID,
    ownerId,
    expectedAttemptRevision,
    acquiredAt,
    expiresAt,
    event: {
      schemaVersion: 1,
      eventId,
      attemptId: ATTEMPT_ID,
      sequence,
      occurredAt: acquiredAt,
      commandId: null,
      causationEventId: CREATED_EVENT_ID,
      fence: previousFence + 1,
      type: "attempt.fence-claimed",
      data: { previousFence, newFence: previousFence + 1, ownerId },
    },
  } as const;
}

function pendingStep(fence: number) {
  return {
    schemaVersion: 1,
    stepId: STEP_ID,
    attemptId: ATTEMPT_ID,
    ordinal: 0,
    operation: "agent.execute",
    state: "pending",
    revision: 0,
    lastFence: fence,
    runCount: 0,
    inputDigest: INPUT_DIGEST,
    outputDigest: null,
    blocker: null,
    failure: null,
    startedAt: null,
    finishedAt: null,
  } as const;
}

function createStepInput(fence: number, sequence: number) {
  return {
    step: pendingStep(fence),
    event: {
      schemaVersion: 1,
      eventId: STEP_CREATED_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence,
      occurredAt: T2,
      commandId: null,
      causationEventId: FIRST_FENCE_EVENT_ID,
      fence,
      type: "step.created",
      data: {
        stepId: STEP_ID,
        ordinal: 0,
        operation: "agent.execute",
        inputDigest: INPUT_DIGEST,
      },
    },
  } as const;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("table-driven state machines", () => {
  it("classifies every attempt state pair from the explicit transition table", () => {
    for (const from of ATTEMPT_STATES) {
      for (const to of ATTEMPT_STATES) {
        expect(isLegalAttemptStateTransition(from, to), `${from} -> ${to}`).toBe(
          (LEGAL_ATTEMPT_STATE_TRANSITIONS[from] as readonly string[]).includes(to),
        );
        if ((LEGAL_ATTEMPT_STATE_TRANSITIONS[from] as readonly string[]).includes(to)) {
          expect(() => assertLegalAttemptStateTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertLegalAttemptStateTransition(from, to)).toThrow(
            `illegal attempt transition ${from} -> ${to}`,
          );
        }
      }
    }
  });

  it("classifies every step state pair from the explicit transition table", () => {
    for (const from of STEP_STATES) {
      for (const to of STEP_STATES) {
        expect(isLegalStepStateTransition(from, to), `${from} -> ${to}`).toBe(
          (LEGAL_STEP_STATE_TRANSITIONS[from] as readonly string[]).includes(to),
        );
        if ((LEGAL_STEP_STATE_TRANSITIONS[from] as readonly string[]).includes(to)) {
          expect(() => assertLegalStepStateTransition(from, to)).not.toThrow();
        } else {
          expect(() => assertLegalStepStateTransition(from, to)).toThrow(
            `illegal step transition ${from} -> ${to}`,
          );
        }
      }
    }
  });

  it("rejects illegal attempt transitions and incoherent terminal/blocker snapshots", () => {
    const { database, repositories, submission } = seed();
    const succeeded = {
      ...submission.attempt,
      state: "succeeded",
      revision: 1,
      outcome: { kind: "succeeded" },
      updatedAt: T1,
      terminalAt: T1,
    } as const;
    expect(() =>
      repositories.transitionAttemptState({
        expectedRevision: 0,
        attempt: succeeded,
        event: {
          schemaVersion: 1,
          eventId: STATE_EVENT_ID,
          attemptId: ATTEMPT_ID,
          sequence: 2,
          occurredAt: T1,
          commandId: null,
          causationEventId: CREATED_EVENT_ID,
          fence: 0,
          type: "attempt.state-changed",
          data: { from: "queued", to: "succeeded", blocker: null, outcome: succeeded.outcome },
        },
      }),
    ).toThrow(/illegal attempt transition queued -> succeeded/);

    expect(() =>
      repositories.transitionAttemptState({
        expectedRevision: 0,
        attempt: {
          ...submission.attempt,
          state: "running",
          revision: 1,
          outcome: { kind: "succeeded" },
          updatedAt: T1,
        },
        event: {
          schemaVersion: 1,
          eventId: STATE_EVENT_ID,
          attemptId: ATTEMPT_ID,
          sequence: 2,
          occurredAt: T1,
          commandId: null,
          causationEventId: null,
          fence: 0,
          type: "attempt.state-changed",
          data: { from: "queued", to: "running", blocker: null, outcome: null },
        },
      }),
    ).toThrow(/nonterminal attempt cannot have outcome/);

    expect(() =>
      repositories.transitionAttemptState({
        expectedRevision: 0,
        attempt: {
          ...submission.attempt,
          state: "cancelled",
          desiredState: "cancelled",
          revision: 1,
          outcome: {
            kind: "failed",
            failure: {
              code: "worker.failed",
              summary: "Wrong terminal outcome",
              retryable: false,
              detailArtifactDigest: null,
            },
          },
          updatedAt: T1,
          terminalAt: T1,
        },
        event: {
          schemaVersion: 1,
          eventId: STATE_EVENT_ID,
          attemptId: ATTEMPT_ID,
          sequence: 2,
          occurredAt: T1,
          commandId: null,
          causationEventId: null,
          fence: 0,
          type: "attempt.state-changed",
          data: {
            from: "queued",
            to: "cancelled",
            blocker: null,
            outcome: {
              kind: "failed",
              failure: {
                code: "worker.failed",
                summary: "Wrong terminal outcome",
                retryable: false,
                detailArtifactDigest: null,
              },
            },
          },
        },
      }),
    ).toThrow(/terminal attempt state cancelled must match outcome.kind/);

    expect(() =>
      repositories.transitionAttemptState({
        expectedRevision: 0,
        attempt: {
          ...submission.attempt,
          state: "blocked",
          revision: 1,
          updatedAt: T1,
        },
        event: {
          schemaVersion: 1,
          eventId: STATE_EVENT_ID,
          attemptId: ATTEMPT_ID,
          sequence: 2,
          occurredAt: T1,
          commandId: null,
          causationEventId: null,
          fence: 0,
          type: "attempt.state-changed",
          data: { from: "queued", to: "blocked", blocker: null, outcome: null },
        },
      }),
    ).toThrow(/blocker must be present exactly/);
    expect(repositories.attempts.findById(ATTEMPT_ID)).toEqual(submission.attempt);
    database.close();
  });
});

describe("canonical task binding", () => {
  it("is independent of object key order and rejects a caller-supplied digest mismatch pre-write", () => {
    const database = openMigratedFactoryDatabase(makeDatabasePath());
    const repositories = createFactoryRepositories(database);
    const submission = makeSubmission();
    const reordered = {
      title: submission.command.taskSpec.title,
      schemaVersion: submission.command.taskSpec.schemaVersion,
      taskId: submission.command.taskSpec.taskId,
      projectId: submission.command.taskSpec.projectId,
      createdAt: submission.command.taskSpec.createdAt,
      objective: submission.command.taskSpec.objective,
      acceptanceCriteria: submission.command.taskSpec.acceptanceCriteria,
      base: submission.command.taskSpec.base,
      requestedScope: submission.command.taskSpec.requestedScope,
      policyDigest: submission.command.taskSpec.policyDigest,
    };
    expect(computeTaskSpecDigest(reordered)).toBe(submission.taskSpecDigest);

    const falseDigest = `sha256:${"f".repeat(64)}`;
    expect(() =>
      repositories.createTaskAttempt({
        ...submission,
        taskSpecDigest: falseDigest,
        attempt: { ...submission.attempt, taskSpecDigest: falseDigest },
        event: { ...submission.event, data: { taskId: TASK_ID, taskSpecDigest: falseDigest } },
      }),
    ).toThrow(/canonical taskSpecDigest/);
    expect(database.prepare("SELECT COUNT(*) AS count FROM commands").get()).toEqual({ count: 0 });
    database.close();
  });
});

describe("idempotent desired-state commands", () => {
  it("returns the immutable original result for duplicate delivery and after reopen", () => {
    const databasePath = makeDatabasePath();
    let { database, repositories } = seed(databasePath);
    const input = desiredStateChange();
    expect(repositories.desiredStates.apply(input)).toMatchObject({ duplicate: false });
    expect(repositories.attempts.findById(ATTEMPT_ID)).toMatchObject({
      desiredState: "paused",
      revision: 1,
      updatedAt: T1,
    });

    expect(repositories.desiredStates.apply({ ...input, expectedRevision: 999 })).toMatchObject({
      command: input.command,
      event: input.event,
      duplicate: true,
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM commands").get()).toEqual({ count: 2 });
    expect(repositories.events.listByAttempt(ATTEMPT_ID)).toHaveLength(2);
    database.close();

    database = openMigratedFactoryDatabase(databasePath, { fileMustExist: true });
    repositories = createFactoryRepositories(database);
    expect(repositories.desiredStates.findOriginalResult(DESIRED_COMMAND_ID)).toMatchObject({
      command: input.command,
      event: input.event,
      duplicate: true,
    });
    database.close();
  });

  it("rejects command-id payload collisions and atomically rolls back a failed result event", () => {
    const { database, repositories } = seed();
    const first = desiredStateChange();
    repositories.desiredStates.apply(first);

    expect(() =>
      repositories.desiredStates.apply({
        ...first,
        command: { ...first.command, desiredState: "running", reason: "Collision" },
      }),
    ).toThrow(/duplicate command payload/);

    const second = {
      command: {
        ...first.command,
        commandId: SECOND_COMMAND_ID,
        issuedAt: T2,
        desiredState: "running",
        reason: null,
      },
      expectedRevision: 1,
      event: {
        ...first.event,
        eventId: CREATED_EVENT_ID,
        sequence: 3,
        occurredAt: T2,
        commandId: SECOND_COMMAND_ID,
        data: { from: "paused", to: "running", reason: null },
      },
    } as const;
    expect(() => repositories.desiredStates.apply(second)).toThrow();
    expect(repositories.commands.findById(SECOND_COMMAND_ID)).toBeNull();
    expect(repositories.attempts.findById(ATTEMPT_ID)).toMatchObject({
      desiredState: "paused",
      revision: 1,
    });
    expect(repositories.events.listByAttempt(ATTEMPT_ID)).toHaveLength(2);
    database.close();
  });
});

describe("durable steps and fenced attempt leases", () => {
  it("heartbeats, releases, reclaims with a larger fence, rejects stale work, and survives reopen", () => {
    const databasePath = makeDatabasePath();
    let { database, repositories } = seed(databasePath);
    const firstClaim = fenceClaim("worker.one", 0, 0, T1, T4, FIRST_FENCE_EVENT_ID, 2);
    expect(repositories.leases.claim(firstClaim)).toMatchObject({
      lease: { ownerId: "worker.one", fence: 1, revision: 0 },
      attempt: { fence: 1, revision: 1 },
    });
    expect(
      repositories.leases.heartbeat({
        leaseKey: firstClaim.leaseKey,
        ownerId: "worker.one",
        fence: 1,
        expectedRevision: 0,
        heartbeatAt: T2,
        expiresAt: T5,
      }),
    ).toMatchObject({ revision: 1, heartbeatAt: T2, expiresAt: T5 });
    expect(() =>
      repositories.leases.heartbeat({
        leaseKey: firstClaim.leaseKey,
        ownerId: "worker.one",
        fence: 0,
        expectedRevision: 1,
        heartbeatAt: T3,
        expiresAt: T6,
      }),
    ).toThrow(/lease heartbeat fence/);

    repositories.steps.create(createStepInput(1, 3));
    const runningStep = {
      ...pendingStep(1),
      state: "running",
      revision: 1,
      runCount: 1,
      startedAt: T3,
    } as const;
    repositories.steps.transition({
      expectedRevision: 0,
      fence: 1,
      step: runningStep,
      event: {
        schemaVersion: 1,
        eventId: STEP_RUNNING_EVENT_ID,
        attemptId: ATTEMPT_ID,
        sequence: 4,
        occurredAt: T3,
        commandId: null,
        causationEventId: STEP_CREATED_EVENT_ID,
        fence: 1,
        type: "step.state-changed",
        data: {
          stepId: STEP_ID,
          from: "pending",
          to: "running",
          outputDigest: null,
          failureCode: null,
        },
      },
    });

    repositories.leases.release({
      leaseKey: firstClaim.leaseKey,
      ownerId: "worker.one",
      fence: 1,
    });
    const secondClaim = fenceClaim("worker.two", 1, 1, T4, T6, SECOND_FENCE_EVENT_ID, 5);
    expect(repositories.leases.claim(secondClaim)).toMatchObject({
      lease: { ownerId: "worker.two", fence: 2 },
      attempt: { fence: 2, revision: 2 },
    });

    const succeededStep = {
      ...runningStep,
      state: "succeeded",
      revision: 2,
      lastFence: 2,
      outputDigest: OUTPUT_DIGEST,
      finishedAt: T5,
    } as const;
    const terminalEvent = {
      schemaVersion: 1,
      eventId: STEP_TERMINAL_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 6,
      occurredAt: T5,
      commandId: null,
      causationEventId: SECOND_FENCE_EVENT_ID,
      fence: 2,
      type: "step.state-changed",
      data: {
        stepId: STEP_ID,
        from: "running",
        to: "succeeded",
        outputDigest: OUTPUT_DIGEST,
        failureCode: null,
      },
    } as const;
    expect(() =>
      repositories.steps.transition({
        expectedRevision: 1,
        fence: 1,
        step: { ...succeededStep, lastFence: 1 },
        event: { ...terminalEvent, fence: 1 },
      }),
    ).toThrow(/step mutation fence/);
    expect(repositories.steps.findById(STEP_ID)).toEqual(runningStep);
    repositories.steps.transition({
      expectedRevision: 1,
      fence: 2,
      step: succeededStep,
      event: terminalEvent,
    });
    database.close();

    database = openMigratedFactoryDatabase(databasePath, { fileMustExist: true });
    repositories = createFactoryRepositories(database);
    expect(repositories.steps.findById(STEP_ID)).toEqual(succeededStep);
    expect(repositories.leases.findByKey(secondClaim.leaseKey)).toMatchObject({
      ownerId: "worker.two",
      fence: 2,
    });
    expect(repositories.attempts.findById(ATTEMPT_ID)).toMatchObject({ fence: 2, revision: 2 });
    database.close();
  });

  it("reclaims an expired lease without release and never lets the old owner mutate it", () => {
    const { database, repositories } = seed();
    const first = fenceClaim("worker.old", 0, 0, T1, T2, FIRST_FENCE_EVENT_ID, 2);
    repositories.leases.claim(first);
    const second = fenceClaim("worker.new", 1, 1, T3, T5, SECOND_FENCE_EVENT_ID, 3);
    expect(repositories.leases.claim(second)).toMatchObject({
      lease: { ownerId: "worker.new", fence: 2, revision: 1 },
      attempt: { fence: 2, revision: 2 },
    });
    expect(() =>
      repositories.leases.release({ leaseKey: first.leaseKey, ownerId: "worker.old", fence: 1 }),
    ).toThrow(/lease release owner/);
    database.close();
  });

  it("rolls step and lease mutations back when their event append fails", () => {
    const { database, repositories } = seed();
    const brokenClaim = fenceClaim("worker.one", 0, 0, T1, T4, CREATED_EVENT_ID, 2);
    expect(() => repositories.leases.claim(brokenClaim)).toThrow();
    expect(repositories.leases.findByKey(brokenClaim.leaseKey)).toBeNull();
    expect(repositories.attempts.findById(ATTEMPT_ID)).toMatchObject({ revision: 0, fence: 0 });

    const claim = fenceClaim("worker.one", 0, 0, T1, T4, FIRST_FENCE_EVENT_ID, 2);
    repositories.leases.claim(claim);
    repositories.steps.create(createStepInput(1, 3));
    const running = {
      ...pendingStep(1),
      state: "running",
      revision: 1,
      runCount: 1,
      startedAt: T3,
    } as const;
    expect(() =>
      repositories.steps.transition({
        expectedRevision: 0,
        fence: 1,
        step: running,
        event: {
          schemaVersion: 1,
          eventId: STEP_CREATED_EVENT_ID,
          attemptId: ATTEMPT_ID,
          sequence: 4,
          occurredAt: T3,
          commandId: null,
          causationEventId: STEP_CREATED_EVENT_ID,
          fence: 1,
          type: "step.state-changed",
          data: {
            stepId: STEP_ID,
            from: "pending",
            to: "running",
            outputDigest: null,
            failureCode: null,
          },
        },
      }),
    ).toThrow();
    expect(repositories.steps.findById(STEP_ID)).toEqual(pendingStep(1));
    expect(repositories.events.listByAttempt(ATTEMPT_ID)).toHaveLength(3);
    database.close();
  });
});
