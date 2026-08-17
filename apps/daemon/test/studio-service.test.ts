import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CommandRequestV1Schema,
  canonicalStudioSnapshotDigestInputV1,
  projectSlugFallbackV1,
  type CommandRequestV1,
  type ExecutionAttemptV1,
  type TaskSpecV1,
} from "@app-factory/contracts";
import { createFactoryRepositories, type FactoryRepositories } from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";

/**
 * End-to-end tests for the Studio Phase 2 service surface
 * (`studio.snapshot`/`studio.assistant.query`/`studio.assistant.intent.propose`/`.execute`), driven
 * through the real `openDaemonCommandRuntime` handler exactly like `command-runtime.test.ts` drives
 * the pre-existing 21 ops — not isolated unit calls into `studio-command-runtime.ts` — so these
 * tests exercise the actual wire wiring in `command-runtime.ts`, including the intent-execute
 * reentrant dispatch and its idempotency.
 */

const T0 = "2026-08-11T12:00:00.000Z";
const T1 = "2026-08-11T12:00:01.000Z";
const T2 = "2026-08-11T12:00:02.000Z";
const PROJECT_ID = "90000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "90000000-0000-4000-8000-000000000002";
const TASK_ID = "90000000-0000-4000-8000-000000000003";
const RUN_COMMAND_ID = "90000000-0000-4000-8000-000000000004";
const SNAPSHOT_COMMAND_ID = "90000000-0000-4000-8000-000000000005";
const QUERY_COMMAND_ID = "90000000-0000-4000-8000-000000000006";
const PROPOSE_COMMAND_ID = "90000000-0000-4000-8000-000000000007";
const EXECUTE_COMMAND_ID = "90000000-0000-4000-8000-000000000008";
const STATUS_COMMAND_ID = "90000000-0000-4000-8000-000000000009";
const REQUEST_ID = "90000000-0000-4000-8000-000000000010";

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

const taskSpec: TaskSpecV1 = {
  schemaVersion: 1,
  taskId: TASK_ID,
  projectId: PROJECT_ID,
  createdAt: T0,
  title: "Ship the studio service seam",
  objective: "Expose a studio snapshot and assistant surface over existing daemon state.",
  acceptanceCriteria: [
    {
      id: "studio-surface",
      statement: "The studio snapshot renders honestly today.",
      verification: "automated",
    },
  ],
  base: { repositoryId: REPOSITORY_ID, commit: "a".repeat(40) },
  requestedScope: { paths: ["Sources/App.swift"] },
  policyDigest: `sha256:${"b".repeat(64)}`,
};

function request(
  operation: CommandRequestV1["operation"],
  commandId: string,
  payload: unknown,
  issuedAt = T0,
): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId,
    issuedAt,
    origin: "cli",
    operation,
    payload,
  });
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-studio-service-"));
  roots.push(root);
  return root;
}

async function openRuntime(
  root: string,
  overrides: Partial<Parameters<typeof openDaemonCommandRuntime>[0]> = {},
): Promise<DaemonCommandRuntime> {
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: root,
    daemonVersion: "0.1.0-test",
    startedAt: T0,
    now: () => T2,
    ...overrides,
  });
  runtimes.push(runtime);
  return runtime;
}

async function invoke(runtime: DaemonCommandRuntime, command: CommandRequestV1) {
  return await runtime.handler(command, { requestId: REQUEST_ID });
}

async function status(
  runtime: DaemonCommandRuntime,
  attemptId: string,
  commandId = STATUS_COMMAND_ID,
): Promise<ExecutionAttemptV1> {
  const result = await invoke(runtime, request("attempt.status", commandId, { attemptId }, T1));
  if (result.operation !== "attempt.status") throw new Error("Unexpected status result");
  return result.attempt;
}

/**
 * Drives a running attempt straight to `blocked` through the raw kernel repositories, mirroring the
 * identical helper in `command-runtime.test.ts` (duplicated locally, as the sibling
 * `project-command-runtime.test.ts`/`evidence-command-runtime.test.ts` files already each keep
 * their own copies of the helpers they need rather than importing across test files).
 */
function blockAttempt(
  repositories: FactoryRepositories,
  attempt: ExecutionAttemptV1,
  seed: string,
): Readonly<{ attempt: ExecutionAttemptV1; stepId: string }> {
  const leaseKey = `attempt:${attempt.attemptId}`;
  const ownerId = "test.worker";
  const acquiredAt = "2026-08-11T12:00:02.100Z";
  const runningAt = "2026-08-11T12:00:02.150Z";
  const stepId = `${seed}-0000-4000-8000-000000000010`;
  const claimed = repositories.leases.claim({
    leaseKey,
    attemptId: attempt.attemptId,
    ownerId,
    expectedAttemptRevision: attempt.revision,
    acquiredAt,
    expiresAt: "2026-08-11T12:00:10.000Z",
    event: {
      schemaVersion: 1,
      eventId: `${seed}-0000-4000-8000-000000000001`,
      attemptId: attempt.attemptId,
      sequence: 2,
      occurredAt: acquiredAt,
      commandId: null,
      causationEventId: null,
      fence: 1,
      type: "attempt.fence-claimed",
      data: { previousFence: 0, newFence: 1, ownerId },
    },
  });
  repositories.transitionAttemptState({
    leaseKey,
    ownerId,
    observedAt: runningAt,
    expectedRevision: claimed.attempt.revision,
    attempt: {
      ...claimed.attempt,
      state: "running",
      revision: claimed.attempt.revision + 1,
      updatedAt: runningAt,
    },
    event: {
      schemaVersion: 1,
      eventId: `${seed}-0000-4000-8000-000000000002`,
      attemptId: attempt.attemptId,
      sequence: 3,
      occurredAt: runningAt,
      commandId: null,
      causationEventId: `${seed}-0000-4000-8000-000000000001`,
      fence: 1,
      type: "attempt.state-changed",
      data: { from: attempt.state, to: "running", blocker: null, outcome: null },
    },
  });

  const stepInputDigest = `sha256:${"c".repeat(64)}`;
  const step = repositories.steps.create({
    leaseKey,
    ownerId,
    observedAt: runningAt,
    step: {
      schemaVersion: 1,
      stepId,
      attemptId: attempt.attemptId,
      ordinal: 0,
      operation: "factory.execute",
      state: "pending",
      revision: 0,
      lastFence: 1,
      runCount: 0,
      inputDigest: stepInputDigest,
      outputDigest: null,
      blocker: null,
      failure: null,
      startedAt: null,
      finishedAt: null,
    },
    event: {
      schemaVersion: 1,
      eventId: `${seed}-0000-4000-8000-000000000004`,
      attemptId: attempt.attemptId,
      sequence: 4,
      occurredAt: runningAt,
      commandId: null,
      causationEventId: `${seed}-0000-4000-8000-000000000002`,
      fence: 1,
      type: "step.created",
      data: { stepId, ordinal: 0, operation: "factory.execute", inputDigest: stepInputDigest },
    },
  });

  const stepRunningAt = "2026-08-11T12:00:02.200Z";
  const runningStep = repositories.steps.transition({
    leaseKey,
    ownerId,
    observedAt: stepRunningAt,
    expectedRevision: step.revision,
    fence: 1,
    step: {
      ...step,
      state: "running",
      revision: step.revision + 1,
      runCount: 1,
      startedAt: stepRunningAt,
    },
    event: {
      schemaVersion: 1,
      eventId: `${seed}-0000-4000-8000-000000000005`,
      attemptId: attempt.attemptId,
      sequence: 5,
      occurredAt: stepRunningAt,
      commandId: null,
      causationEventId: `${seed}-0000-4000-8000-000000000004`,
      fence: 1,
      type: "step.state-changed",
      data: { stepId, from: "pending", to: "running", outputDigest: null, failureCode: null },
    },
  });

  const runningAttempt = repositories.attempts.findById(attempt.attemptId);
  if (runningAttempt === null) throw new Error("Expected the projected attempt to exist");

  const blockedAt = "2026-08-11T12:00:02.300Z";
  const blocker = {
    kind: "clarification" as const,
    code: "task.needs-input",
    summary: "Which environment should this target?",
    requiredAction: "Answer the question and unblock the attempt.",
  };
  repositories.steps.transition({
    leaseKey,
    ownerId,
    observedAt: blockedAt,
    expectedRevision: runningStep.revision,
    fence: 1,
    step: { ...runningStep, state: "blocked", revision: runningStep.revision + 1, blocker },
    event: {
      schemaVersion: 1,
      eventId: `${seed}-0000-4000-8000-000000000006`,
      attemptId: attempt.attemptId,
      sequence: 6,
      occurredAt: blockedAt,
      commandId: null,
      causationEventId: `${seed}-0000-4000-8000-000000000005`,
      fence: 1,
      type: "step.state-changed",
      data: { stepId, from: "running", to: "blocked", outputDigest: null, failureCode: null },
    },
  });

  const blockedAttempt = repositories.transitionAttemptState({
    leaseKey,
    ownerId,
    observedAt: blockedAt,
    expectedRevision: runningAttempt.revision,
    attempt: {
      ...runningAttempt,
      state: "blocked",
      revision: runningAttempt.revision + 1,
      updatedAt: blockedAt,
      blocker,
    },
    event: {
      schemaVersion: 1,
      eventId: `${seed}-0000-4000-8000-000000000007`,
      attemptId: attempt.attemptId,
      sequence: 7,
      occurredAt: blockedAt,
      commandId: null,
      causationEventId: `${seed}-0000-4000-8000-000000000006`,
      fence: 1,
      type: "attempt.state-changed",
      data: { from: "running", to: "blocked", blocker, outcome: null },
    },
  });
  repositories.leases.release({ leaseKey, ownerId, fence: 1 });

  return { attempt: blockedAttempt, stepId };
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe("studio.snapshot", () => {
  it("composes an honest snapshot with a real slug, no persisted gates, no authored milestones yet, and unavailable rooms, with a verifiable digest", async () => {
    const runtime = await openRuntime(await makeRoot());
    const run = await invoke(runtime, request("task.run", RUN_COMMAND_ID, { taskSpec }, T0));
    if (run.operation !== "task.run") throw new Error("Unexpected run result");

    const result = await invoke(runtime, request("studio.snapshot", SNAPSHOT_COMMAND_ID, {}, T2));
    if (result.operation !== "studio.snapshot")
      throw new Error("Unexpected studio.snapshot result");
    const { snapshot } = result;

    expect(snapshot.projects).toHaveLength(1);
    const project = snapshot.projects[0];
    expect(project).toMatchObject({
      projectId: PROJECT_ID,
      slug: projectSlugFallbackV1(PROJECT_ID),
      lifecycleStage: null,
      gates: { typed: null, owner: null, state: "unavailable" },
      latestAttemptSummary: { attemptId: run.attemptId, taskId: TASK_ID, state: run.state },
      awaitingHuman: [],
    });
    // No persisted typed-gate observation exists yet for this project: an honest "no records",
    // never the generic "not implemented" stub this daemon used before typed-gate reporting
    // was wired.
    expect(project?.gates.unavailableReason).toBe("no gate records for project");
    // No milestones have been authored for this project yet — a real, non-error empty state now
    // that milestones are sourced from the durable milestone repository, not the retired
    // StudioMilestone placeholder.
    expect(project?.timeline.milestones).toEqual([]);
    expect(project?.timeline.milestonesUnavailableReason).toBeNull();
    expect(snapshot.rooms).toEqual([]);
    expect(snapshot.roomsUnavailableReason).toMatch(/not yet wired/);
    // Never a defaulted number: a metric this daemon genuinely cannot compute is unavailable, not 0.
    expect(snapshot.portfolio.agentWindowShare).toMatchObject({ value: null });
    expect(snapshot.portfolio.agentWindowShare.unavailableReason).not.toBeNull();

    // Digest stability: the exact same canonical content re-hashes to the exact same digest.
    expect(snapshot.sourceSnapshotDigest).toBe(
      `sha256:${createHash("sha256")
        .update(canonicalStudioSnapshotDigestInputV1(snapshot))
        .digest("hex")}`,
    );
    expect(canonicalStudioSnapshotDigestInputV1(snapshot)).toBe(
      canonicalStudioSnapshotDigestInputV1(structuredClone(snapshot)),
    );
  });

  it("reports a blocked attempt in awaitingHuman and the portfolio's awaitingYouCount", async () => {
    let repositories!: FactoryRepositories;
    const runtime = await openRuntime(await makeRoot(), {
      initializeDatabase: (database) => {
        repositories = createFactoryRepositories(database);
      },
    });
    const run = await invoke(runtime, request("task.run", RUN_COMMAND_ID, { taskSpec }, T0));
    if (run.operation !== "task.run") throw new Error("Unexpected run result");
    const runningAttempt = await status(runtime, run.attemptId);
    blockAttempt(repositories, runningAttempt, "9b1b0000");

    const result = await invoke(runtime, request("studio.snapshot", SNAPSHOT_COMMAND_ID, {}, T2));
    if (result.operation !== "studio.snapshot")
      throw new Error("Unexpected studio.snapshot result");
    expect(result.snapshot.projects[0]?.awaitingHuman).toEqual([
      expect.objectContaining({ kind: "blocked-attempt", attemptId: run.attemptId }),
    ]);
    expect(result.snapshot.portfolio.awaitingYouCount).toEqual({
      value: 1,
      unavailableReason: null,
    });
  });

  it("reflects a real, authored milestone from the milestone repository — the seam project.milestones.list also reads", async () => {
    const runtime = await openRuntime(await makeRoot());
    const run = await invoke(runtime, request("task.run", RUN_COMMAND_ID, { taskSpec }, T0));
    if (run.operation !== "task.run") throw new Error("Unexpected run result");
    const milestoneId = "90000000-0000-4000-8000-000000000101";
    const upsert = await invoke(
      runtime,
      request(
        "project.milestone.upsert",
        "90000000-0000-4000-8000-000000000102",
        {
          milestone: {
            milestoneId,
            projectId: PROJECT_ID,
            phase: "build",
            kind: "stage",
            label: "Beta launch",
            targetDate: "2026-09-01",
            dependsOn: [],
            owner: "human",
            status: "planned",
            evidenceDigest: null,
          },
          expectedRevision: null,
        },
        T1,
      ),
    );
    if (upsert.operation !== "project.milestone.upsert")
      throw new Error("Unexpected upsert result");

    const result = await invoke(runtime, request("studio.snapshot", SNAPSHOT_COMMAND_ID, {}, T2));
    if (result.operation !== "studio.snapshot")
      throw new Error("Unexpected studio.snapshot result");
    expect(result.snapshot.projects[0]?.timeline.milestones).toEqual([upsert.milestone]);
    expect(result.snapshot.projects[0]?.timeline.milestonesUnavailableReason).toBeNull();

    // The assistant's "when does X ship" lookup now answers for real from the same snapshot,
    // instead of the honest refusal the seam's placeholder milestone type forced before.
    const answer = await invoke(
      runtime,
      request(
        "studio.assistant.query",
        QUERY_COMMAND_ID,
        { query: { schemaVersion: 1, question: "When will this project ship?", projectId: null } },
        T2,
      ),
    );
    if (answer.operation !== "studio.assistant.query") throw new Error("Unexpected query result");
    expect(answer.answer).toMatchObject({
      kind: "answered",
      text: expect.stringContaining("Beta launch"),
      citations: [{ kind: "milestone", id: milestoneId }],
    });
  });
});

describe("studio.assistant.query", () => {
  it("refuses to invent a ship date", async () => {
    const runtime = await openRuntime(await makeRoot());
    await invoke(runtime, request("task.run", RUN_COMMAND_ID, { taskSpec }, T0));

    const result = await invoke(
      runtime,
      request(
        "studio.assistant.query",
        QUERY_COMMAND_ID,
        { query: { schemaVersion: 1, question: "When will this project ship?", projectId: null } },
        T2,
      ),
    );
    if (result.operation !== "studio.assistant.query") throw new Error("Unexpected query result");
    expect(result.answer).toMatchObject({
      kind: "cannot-answer",
      cannotAnswer: { reason: "no-milestone-target-date" },
    });
  });

  it("answers a status question grounded in a citation", async () => {
    const runtime = await openRuntime(await makeRoot());
    const run = await invoke(runtime, request("task.run", RUN_COMMAND_ID, { taskSpec }, T0));
    if (run.operation !== "task.run") throw new Error("Unexpected run result");

    const result = await invoke(
      runtime,
      request(
        "studio.assistant.query",
        QUERY_COMMAND_ID,
        {
          query: {
            schemaVersion: 1,
            question: "What's the status of this project?",
            projectId: PROJECT_ID,
          },
        },
        T2,
      ),
    );
    if (result.operation !== "studio.assistant.query") throw new Error("Unexpected query result");
    expect(result.answer.kind).toBe("answered");
    if (result.answer.kind !== "answered") throw new Error("Expected an answered response");
    expect(result.answer.citations).toEqual([{ kind: "attempt", id: run.attemptId }]);
  });

  it("reports no matching project for an unknown projectId, rather than guessing", async () => {
    const runtime = await openRuntime(await makeRoot());
    const otherProject = "90000000-0000-4000-8000-000000009999";
    const result = await invoke(
      runtime,
      request(
        "studio.assistant.query",
        QUERY_COMMAND_ID,
        { query: { schemaVersion: 1, question: "status?", projectId: otherProject } },
        T2,
      ),
    );
    if (result.operation !== "studio.assistant.query") throw new Error("Unexpected query result");
    expect(result.answer).toMatchObject({
      kind: "cannot-answer",
      cannotAnswer: { reason: "no-matching-project" },
    });
  });
});

describe("studio.assistant.intent propose/execute", () => {
  it("rejects an utterance that does not match the intent's phrase prefix or identifiers", async () => {
    const runtime = await openRuntime(await makeRoot());
    await expect(
      invoke(
        runtime,
        request(
          "studio.assistant.intent.propose",
          PROPOSE_COMMAND_ID,
          { utterance: "please run this task", intent: { kind: "run-phase", taskSpec } },
          T0,
        ),
      ),
    ).rejects.toMatchObject({ code: "assistant.intent-utterance-mismatch" });

    await expect(
      invoke(
        runtime,
        request(
          "studio.assistant.intent.propose",
          "90000000-0000-4000-8000-000000000011",
          {
            utterance: `run task ${"9".repeat(8)}-0000-4000-8000-000000000000 now`,
            intent: { kind: "run-phase", taskSpec },
          },
          T0,
        ),
      ),
    ).rejects.toMatchObject({ code: "assistant.intent-utterance-mismatch" });
  });

  it("proposes then executes a run-phase intent, dispatching to task.run idempotently", async () => {
    const runtime = await openRuntime(await makeRoot());
    const utterance = `run task ${TASK_ID} now`;
    const proposed = await invoke(
      runtime,
      request(
        "studio.assistant.intent.propose",
        PROPOSE_COMMAND_ID,
        { utterance, intent: { kind: "run-phase", taskSpec } },
        T0,
      ),
    );
    if (proposed.operation !== "studio.assistant.intent.propose") {
      throw new Error("Unexpected propose result");
    }
    expect(proposed.intent).toMatchObject({
      utterance,
      requiresConfirmation: true,
      payload: { kind: "run-phase" },
    });

    const executed = await invoke(
      runtime,
      request(
        "studio.assistant.intent.execute",
        EXECUTE_COMMAND_ID,
        { intent: proposed.intent },
        T1,
      ),
    );
    if (executed.operation !== "studio.assistant.intent.execute") {
      throw new Error("Unexpected execute result");
    }
    expect(executed.intentId).toBe(proposed.intent.intentId);
    expect(executed.outcome.kind).toBe("task.run");
    if (executed.outcome.kind !== "task.run") throw new Error("Expected a task.run outcome");
    expect(executed.outcome.result).toMatchObject({ operation: "task.run", taskId: TASK_ID });

    const runningAttemptId = executed.outcome.result.attemptId;
    await expect(status(runtime, runningAttemptId)).resolves.toMatchObject({ taskId: TASK_ID });

    // Idempotent replay of the identical execute command must not dispatch a second attempt.
    const replay = await invoke(
      runtime,
      request(
        "studio.assistant.intent.execute",
        EXECUTE_COMMAND_ID,
        { intent: proposed.intent },
        T1,
      ),
    );
    expect(replay).toEqual(executed);

    const attempts = await invoke(
      runtime,
      request(
        "attempt.list",
        "90000000-0000-4000-8000-000000000012",
        { scope: "all", projectId: PROJECT_ID, after: null, limit: 50 },
        T1,
      ),
    );
    if (attempts.operation !== "attempt.list") throw new Error("Unexpected attempt.list result");
    expect(attempts.page.attempts).toHaveLength(1);
  });

  it("proposes then executes an approve-attempt intent, dispatching to attempt.unblock", async () => {
    let repositories!: FactoryRepositories;
    const runtime = await openRuntime(await makeRoot(), {
      initializeDatabase: (database) => {
        repositories = createFactoryRepositories(database);
      },
    });
    const run = await invoke(runtime, request("task.run", RUN_COMMAND_ID, { taskSpec }, T0));
    if (run.operation !== "task.run") throw new Error("Unexpected run result");
    const runningAttempt = await status(runtime, run.attemptId);
    blockAttempt(repositories, runningAttempt, "9c1c0000");

    const utterance = `approve attempt ${run.attemptId}`;
    const proposed = await invoke(
      runtime,
      request(
        "studio.assistant.intent.propose",
        PROPOSE_COMMAND_ID,
        {
          utterance,
          intent: { kind: "approve-attempt", attemptId: run.attemptId, answer: "Target staging." },
        },
        T1,
      ),
    );
    if (proposed.operation !== "studio.assistant.intent.propose") {
      throw new Error("Unexpected propose result");
    }

    const executed = await invoke(
      runtime,
      request(
        "studio.assistant.intent.execute",
        EXECUTE_COMMAND_ID,
        { intent: proposed.intent },
        "2026-08-11T12:00:03.000Z",
      ),
    );
    if (executed.operation !== "studio.assistant.intent.execute") {
      throw new Error("Unexpected execute result");
    }
    expect(executed.outcome).toMatchObject({
      kind: "attempt.unblock",
      result: { attemptId: run.attemptId, state: "running", accepted: true },
    });
  });
});
