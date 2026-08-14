import { createHash } from "node:crypto";
import { chmod, lstat, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  canonicalPortfolioReadModelDigestInputV1,
  CommandRequestV1Schema,
  type CommandRequestV1,
  type ExecutionAttemptV1,
  type TaskSpecV1,
} from "@app-factory/contracts";
import { createFactoryRepositories, type FactoryRepositories } from "@app-factory/kernel";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openDaemonCommandRuntime,
  resolveDaemonRuntimePaths,
  type DaemonCommandRuntime,
} from "../src/command-runtime.js";

const T0 = "2026-08-11T12:00:00.000Z";
const T1 = "2026-08-11T12:00:01.000Z";
const T2 = "2026-08-11T12:00:02.000Z";
const PROJECT_ID = "20000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "20000000-0000-4000-8000-000000000002";
const TASK_ID = "20000000-0000-4000-8000-000000000003";
const SUBMIT_COMMAND_ID = "20000000-0000-4000-8000-000000000004";
const RUN_COMMAND_ID = "20000000-0000-4000-8000-000000000005";
const STATUS_COMMAND_ID = "20000000-0000-4000-8000-000000000006";
const EVENTS_COMMAND_ID = "20000000-0000-4000-8000-000000000007";
const ATTEMPT_LIST_COMMAND_ID = "20000000-0000-4000-8000-000000000032";
const PAUSE_COMMAND_ID = "20000000-0000-4000-8000-000000000008";
const RESUME_COMMAND_ID = "20000000-0000-4000-8000-000000000009";
const CANCEL_COMMAND_ID = "20000000-0000-4000-8000-000000000010";
const RECONCILE_COMMAND_ID = "20000000-0000-4000-8000-000000000011";
const REQUEST_ID = "20000000-0000-4000-8000-000000000012";
const DOCTOR_COMMAND_ID = "20000000-0000-4000-8000-000000000020";
const PORTFOLIO_COMMAND_ID = "20000000-0000-4000-8000-000000000025";
const RETRY_COMMAND_ID = "20000000-0000-4000-8000-000000000033";
const UNBLOCK_COMMAND_ID = "20000000-0000-4000-8000-000000000034";
const FUTURE = "2026-08-11T12:06:03.000Z";

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

const taskSpec: TaskSpecV1 = {
  schemaVersion: 1,
  taskId: TASK_ID,
  projectId: PROJECT_ID,
  createdAt: T0,
  title: "Build the command runtime",
  objective: "Persist command intake and expose authoritative attempt state.",
  acceptanceCriteria: [
    {
      id: "durable-runtime",
      statement: "A logical retry returns the original result after restart.",
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

function submitRequest(commandId = SUBMIT_COMMAND_ID, issuedAt = T0): CommandRequestV1 {
  return request("task.submit", commandId, { taskSpec }, issuedAt);
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-command-runtime-"));
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
) {
  const result = await invoke(runtime, request("attempt.status", commandId, { attemptId }, T1));
  if (result.operation !== "attempt.status") throw new Error("Unexpected status result");
  return result.attempt;
}

/**
 * Drives a running attempt straight to `failed` through the raw kernel
 * repositories so `task.retry` has an eligible prior attempt to work with.
 * The command runtime does not itself expose a way to fail an attempt; only
 * the scheduler does that, so tests manufacture it directly against the same
 * database the runtime opened (captured through `initializeDatabase`).
 */
function failAttempt(
  repositories: FactoryRepositories,
  attempt: ExecutionAttemptV1,
  seed: string,
): ExecutionAttemptV1 {
  const leaseKey = `attempt:${attempt.attemptId}`;
  const ownerId = "test.worker";
  const acquiredAt = "2026-08-11T12:00:02.100Z";
  const runningAt = "2026-08-11T12:00:02.150Z";
  const failedAt = "2026-08-11T12:00:02.200Z";
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
  const running = repositories.transitionAttemptState({
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
  return repositories.transitionAttemptState({
    leaseKey,
    ownerId,
    observedAt: failedAt,
    expectedRevision: running.revision,
    attempt: {
      ...running,
      state: "failed",
      revision: running.revision + 1,
      currentStepId: null,
      updatedAt: failedAt,
      terminalAt: failedAt,
      outcome: {
        kind: "failed",
        failure: {
          code: "task.execution-failed",
          summary: "Deterministic test failure.",
          retryable: true,
          detailArtifactDigest: null,
        },
      },
    },
    event: {
      schemaVersion: 1,
      eventId: `${seed}-0000-4000-8000-000000000003`,
      attemptId: attempt.attemptId,
      sequence: 4,
      occurredAt: failedAt,
      commandId: null,
      causationEventId: `${seed}-0000-4000-8000-000000000002`,
      fence: 1,
      type: "attempt.state-changed",
      data: {
        from: "running",
        to: "failed",
        blocker: null,
        outcome: {
          kind: "failed",
          failure: {
            code: "task.execution-failed",
            summary: "Deterministic test failure.",
            retryable: true,
            detailArtifactDigest: null,
          },
        },
      },
    },
  });
}

/**
 * Drives a running attempt to `blocked` with a blocked step through the raw
 * kernel repositories, mirroring what the scheduler would persist, so
 * `attempt.unblock` has a blocked attempt to resume.
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

describe("daemon runtime path security and lifecycle", () => {
  it("requires a normalized absolute private directory that is not a symlink", async () => {
    expect(() => resolveDaemonRuntimePaths("relative/runtime")).toThrow("absolute normalized path");

    const permissive = await makeRoot();
    await chmod(permissive, 0o755);
    await expect(openRuntime(permissive)).rejects.toMatchObject({
      code: "daemon.unsafe-runtime-path",
    });

    const target = await makeRoot();
    const parent = await makeRoot();
    const linked = join(parent, "linked-runtime");
    await symlink(target, linked);
    await expect(openRuntime(linked)).rejects.toMatchObject({
      code: "daemon.unsafe-runtime-path",
    });
  });

  it("creates private database and journal paths and closes idempotently", async () => {
    const runtime = await openRuntime(await makeRoot());
    expect((await lstat(runtime.paths.root)).mode & 0o777).toBe(0o700);
    expect((await lstat(runtime.paths.commandResults)).mode & 0o777).toBe(0o700);
    expect((await lstat(runtime.paths.evidence)).mode & 0o777).toBe(0o700);
    expect((await lstat(runtime.paths.database)).mode & 0o777).toBe(0o600);
    runtime.close();
    runtime.close();
    await expect(
      invoke(runtime, request("doctor", STATUS_COMMAND_ID, {}, T1)),
    ).rejects.toMatchObject({ code: "daemon.runtime-closed" });
  });

  it("reports deterministic ready health from the migrated database", async () => {
    const runtime = await openRuntime(await makeRoot());
    await expect(invoke(runtime, request("doctor", DOCTOR_COMMAND_ID, {}, T1))).resolves.toEqual({
      operation: "doctor",
      readiness: "ready",
      daemonVersion: "0.1.0-test",
      protocolVersion: 1,
      startedAt: T0,
      issues: [],
    });
  });
});

describe("daemon evidence command boundary", () => {
  it("lists through the daemon-owned store and returns a stable missing-manifest error", async () => {
    const runtime = await openRuntime(await makeRoot());
    await expect(
      invoke(
        runtime,
        request(
          "evidence.list",
          "20000000-0000-4000-8000-000000000021",
          { afterAttemptId: null, limit: 50 },
          T1,
        ),
      ),
    ).resolves.toEqual({
      operation: "evidence.list",
      manifests: [],
      nextAfterAttemptId: null,
      hasMore: false,
    });
    await expect(
      invoke(
        runtime,
        request(
          "evidence.inspect",
          "20000000-0000-4000-8000-000000000022",
          { attemptId: "20000000-0000-4000-8000-000000000099" },
          T1,
        ),
      ),
    ).rejects.toMatchObject({ code: "evidence.not-found", retryable: false });
  });
});

describe("task intake and authoritative queries", () => {
  it("uses daemon-owned execution times and rejects excessive client clock skew", async () => {
    const runtime = await openRuntime(await makeRoot());
    const nearFutureCommand = request(
      "task.run",
      "20000000-0000-4000-8000-000000000026",
      {
        taskSpec: {
          ...taskSpec,
          taskId: "20000000-0000-4000-8000-000000000027",
          createdAt: T1,
        },
      },
      "2026-08-11T12:00:03.000Z",
    );
    const accepted = await invoke(runtime, nearFutureCommand);
    if (accepted.operation !== "task.run") throw new Error("Unexpected task run result");
    expect(
      await status(runtime, accepted.attemptId, "20000000-0000-4000-8000-000000000028"),
    ).toMatchObject({ createdAt: T2, updatedAt: T2 });

    await expect(
      invoke(runtime, request("doctor", "20000000-0000-4000-8000-000000000029", {}, FUTURE)),
    ).rejects.toMatchObject({ code: "command.future-timestamp", retryable: false });
    await expect(
      invoke(
        runtime,
        request(
          "task.submit",
          "20000000-0000-4000-8000-000000000030",
          {
            taskSpec: {
              ...taskSpec,
              taskId: "20000000-0000-4000-8000-000000000031",
              createdAt: FUTURE,
            },
          },
          T1,
        ),
      ),
    ).rejects.toMatchObject({ code: "command.future-timestamp", retryable: false });
  });

  it("projects local project state without fabricating unavailable provider values", async () => {
    const runtime = await openRuntime(await makeRoot());
    const submitted = await invoke(runtime, submitRequest());
    if (submitted.operation !== "task.submit") throw new Error("Unexpected submit result");
    const result = await invoke(
      runtime,
      request("portfolio.snapshot", PORTFOLIO_COMMAND_ID, {}, T2),
    );
    if (result.operation !== "portfolio.snapshot") {
      throw new Error("Unexpected portfolio result");
    }
    expect(result.snapshot).toMatchObject({
      schemaVersion: 1,
      generatedAt: T2,
      totals: {
        projects: 1,
        attempts: 1,
        activeAttempts: 1,
        blockers: 0,
        openPullRequests: null,
        jiraTodo: null,
        jiraInProgress: null,
        unresolvedP0: null,
        unresolvedP1: null,
      },
      projects: [
        {
          projectId: PROJECT_ID,
          slug: `project-${PROJECT_ID}`,
          metadataSource: "task-derived",
          lifecycleStage: null,
          attemptCount: 1,
          activeAttemptCount: 1,
          blockerCount: 0,
          openPullRequestCount: null,
          jiraTodoCount: null,
          unresolvedP0: null,
          releaseStage: null,
          analyticsFreshness: "unavailable",
          health: "unknown",
          healthReasons: [
            "jira-unavailable",
            "github-unavailable",
            "quality-unavailable",
            "release-unavailable",
            "analytics-unavailable",
          ],
        },
      ],
    });
    expect(result.snapshot.sourceSnapshotDigest).toBe(
      `sha256:${createHash("sha256")
        .update(canonicalPortfolioReadModelDigestInputV1(result.snapshot))
        .digest("hex")}`,
    );
  });

  it("keeps generatedAt at or after monotonic project activity under a fixed clock", async () => {
    const runtime = await openRuntime(await makeRoot(), { now: () => T2 });
    const running = await invoke(runtime, request("task.run", RUN_COMMAND_ID, { taskSpec }, T2));
    if (running.operation !== "task.run") throw new Error("Unexpected task run result");
    await invoke(
      runtime,
      request(
        "attempt.pause",
        PAUSE_COMMAND_ID,
        { attemptId: running.attemptId, reason: "fixed-clock regression" },
        T2,
      ),
    );

    const result = await invoke(
      runtime,
      request("portfolio.snapshot", PORTFOLIO_COMMAND_ID, {}, T2),
    );
    if (result.operation !== "portfolio.snapshot") {
      throw new Error("Unexpected portfolio result");
    }
    expect(result.snapshot.projects[0]?.lastActivityAt).toBe("2026-08-11T12:00:02.001Z");
    expect(result.snapshot.generatedAt).toBe("2026-08-11T12:00:02.001Z");
  });

  it("atomically submits paused and runs with running desired state", async () => {
    const submitRuntime = await openRuntime(await makeRoot());
    const submitted = await invoke(submitRuntime, submitRequest());
    expect(submitted).toMatchObject({ operation: "task.submit", taskId: TASK_ID, state: "queued" });
    if (submitted.operation !== "task.submit") throw new Error("Unexpected submit result");
    const submittedAttempt = await status(submitRuntime, submitted.attemptId);
    expect(submittedAttempt).toMatchObject({ desiredState: "paused", revision: 0 });

    const runRoot = await makeRoot();
    const runRuntime = await openRuntime(runRoot);
    const runSpec = { ...taskSpec, taskId: "20000000-0000-4000-8000-000000000013" };
    const run = await invoke(
      runRuntime,
      request("task.run", RUN_COMMAND_ID, { taskSpec: runSpec }),
    );
    expect(run).toMatchObject({ operation: "task.run", state: "queued" });
    if (run.operation !== "task.run") throw new Error("Unexpected run result");
    expect(await status(runRuntime, run.attemptId)).toMatchObject({
      desiredState: "running",
      revision: 0,
    });
  });

  it("uses injected deterministic identities at the persistence boundary", async () => {
    const generatedAttemptId = "30000000-0000-4000-8000-000000000001";
    const generatedEventId = "30000000-0000-4000-8000-000000000002";
    const idFactory = vi.fn((purpose: string) =>
      purpose === "attempt" ? generatedAttemptId : generatedEventId,
    );
    const runtime = await openRuntime(await makeRoot(), { idFactory });
    const submitted = await invoke(runtime, submitRequest());
    expect(submitted).toMatchObject({ attemptId: generatedAttemptId });
    expect(idFactory.mock.calls.map(([purpose]) => purpose)).toEqual([
      "attempt",
      "attempt-created-event",
    ]);
  });

  it("paginates the authoritative event stream by sequence", async () => {
    const runtime = await openRuntime(await makeRoot());
    const submitted = await invoke(runtime, submitRequest());
    if (submitted.operation !== "task.submit") throw new Error("Unexpected submit result");
    const first = await invoke(
      runtime,
      request(
        "attempt.events",
        EVENTS_COMMAND_ID,
        { attemptId: submitted.attemptId, afterSequence: 0, limit: 1 },
        T1,
      ),
    );
    expect(first).toMatchObject({
      operation: "attempt.events",
      nextAfterSequence: 1,
      events: [{ sequence: 1, type: "attempt.created" }],
    });
    const second = await invoke(
      runtime,
      request(
        "attempt.events",
        "20000000-0000-4000-8000-000000000014",
        { attemptId: submitted.attemptId, afterSequence: 1, limit: 10 },
        T2,
      ),
    );
    expect(second).toMatchObject({
      operation: "attempt.events",
      nextAfterSequence: 1,
      events: [],
    });
  });

  it("lists a bounded authoritative work queue with task navigation context", async () => {
    const runtime = await openRuntime(await makeRoot());
    const submitted = await invoke(runtime, submitRequest());
    if (submitted.operation !== "task.submit") throw new Error("Unexpected submit result");

    await expect(
      invoke(
        runtime,
        request(
          "attempt.list",
          ATTEMPT_LIST_COMMAND_ID,
          { scope: "active", projectId: PROJECT_ID, after: null, limit: 50 },
          T1,
        ),
      ),
    ).resolves.toMatchObject({
      operation: "attempt.list",
      page: {
        attempts: [
          {
            projectId: PROJECT_ID,
            title: taskSpec.title,
            attempt: { attemptId: submitted.attemptId, taskId: TASK_ID, state: "queued" },
          },
        ],
        nextAfter: null,
        hasMore: false,
      },
    });
  });

  it("reports missing attempts instead of treating them as empty event streams", async () => {
    const runtime = await openRuntime(await makeRoot());
    const missing = "20000000-0000-4000-8000-000000000099";
    await expect(status(runtime, missing)).rejects.toMatchObject({ code: "attempt.not-found" });
    await expect(
      invoke(
        runtime,
        request("attempt.events", EVENTS_COMMAND_ID, {
          attemptId: missing,
          afterSequence: 0,
          limit: 10,
        }),
      ),
    ).rejects.toMatchObject({ code: "attempt.not-found" });
  });
});

describe("durable logical command idempotency", () => {
  it("journals mutations but not repeated authoritative read-only queries", async () => {
    const boundary = vi.fn();
    const runtime = await openRuntime(await makeRoot(), {
      commandResultLedgerBoundary: boundary,
    });
    const submitted = await invoke(runtime, submitRequest());
    if (submitted.operation !== "task.submit") throw new Error("Unexpected submit result");

    await invoke(runtime, request("doctor", DOCTOR_COMMAND_ID, {}, T1));
    await invoke(runtime, request("doctor", DOCTOR_COMMAND_ID, {}, T2));
    await status(runtime, submitted.attemptId);
    await status(runtime, submitted.attemptId, "20000000-0000-4000-8000-000000000023");
    await invoke(
      runtime,
      request(
        "attempt.list",
        ATTEMPT_LIST_COMMAND_ID,
        { scope: "active", projectId: null, after: null, limit: 50 },
        T2,
      ),
    );
    await invoke(
      runtime,
      request(
        "evidence.list",
        "20000000-0000-4000-8000-000000000024",
        { afterAttemptId: null, limit: 50 },
        T2,
      ),
    );
    await invoke(runtime, request("portfolio.snapshot", PORTFOLIO_COMMAND_ID, {}, T2));

    expect(await readdir(runtime.paths.commandResults)).toEqual([`${SUBMIT_COMMAND_ID}.json`]);
    expect(boundary).toHaveBeenCalledTimes(1);
    expect(boundary).toHaveBeenCalledWith(
      expect.objectContaining({ request: expect.objectContaining({ operation: "task.submit" }) }),
    );
  });

  it("returns the byte-equivalent original submission result after restart", async () => {
    const root = await makeRoot();
    const firstRuntime = await openRuntime(root);
    const command = submitRequest();
    const first = await invoke(firstRuntime, command);
    firstRuntime.close();

    const secondRuntime = await openRuntime(root);
    const retry = await secondRuntime.handler(command, {
      requestId: "20000000-0000-4000-8000-000000000015",
    });
    expect(retry).toEqual(first);
    if (retry.operation !== "task.submit") throw new Error("Unexpected submit result");
    const events = await invoke(
      secondRuntime,
      request(
        "attempt.events",
        EVENTS_COMMAND_ID,
        { attemptId: retry.attemptId, afterSequence: 0, limit: 10 },
        T2,
      ),
    );
    if (events.operation !== "attempt.events") throw new Error("Unexpected events result");
    expect(events.events).toHaveLength(1);

    const journalPath = join(secondRuntime.paths.commandResults, `${SUBMIT_COMMAND_ID}.json`);
    expect((await lstat(journalPath)).mode & 0o777).toBe(0o600);
    const journal = await readFile(journalPath, "utf8");
    expect(journal).not.toContain(REQUEST_ID);
  });

  it("rejects command ID reuse when issuedAt or operation changes", async () => {
    const runtime = await openRuntime(await makeRoot());
    await invoke(runtime, submitRequest());
    await expect(invoke(runtime, submitRequest(SUBMIT_COMMAND_ID, T1))).rejects.toMatchObject({
      code: "command.identity-conflict",
    });
    await expect(
      invoke(runtime, request("task.run", SUBMIT_COMMAND_ID, { taskSpec }, T0)),
    ).rejects.toMatchObject({ code: "command.identity-conflict" });
  });

  it("serializes concurrent duplicate deliveries into one durable result", async () => {
    const runtime = await openRuntime(await makeRoot());
    const command = submitRequest();
    const [first, second] = await Promise.all([
      runtime.handler(command, { requestId: REQUEST_ID }),
      runtime.handler(command, {
        requestId: "20000000-0000-4000-8000-000000000016",
      }),
    ]);
    expect(second).toEqual(first);
  });
});

describe("desired state and reconciliation commands", () => {
  it("persists pause, resume, and cancel intent with immutable command results", async () => {
    const runtime = await openRuntime(await makeRoot());
    const runSpec = { ...taskSpec, taskId: "20000000-0000-4000-8000-000000000017" };
    const run = await invoke(runtime, request("task.run", RUN_COMMAND_ID, { taskSpec: runSpec }));
    if (run.operation !== "task.run") throw new Error("Unexpected run result");

    const pause = request(
      "attempt.pause",
      PAUSE_COMMAND_ID,
      { attemptId: run.attemptId, reason: "Review" },
      T1,
    );
    expect(await invoke(runtime, pause)).toMatchObject({ desiredState: "paused", accepted: true });
    expect(await invoke(runtime, pause)).toMatchObject({ desiredState: "paused", accepted: true });
    expect(
      await invoke(
        runtime,
        request(
          "attempt.resume",
          RESUME_COMMAND_ID,
          { attemptId: run.attemptId, reason: null },
          "2026-08-11T12:00:03.000Z",
        ),
      ),
    ).toMatchObject({ desiredState: "running", accepted: true });
    expect(
      await invoke(
        runtime,
        request(
          "attempt.cancel",
          CANCEL_COMMAND_ID,
          { attemptId: run.attemptId, reason: "Stop" },
          "2026-08-11T12:00:04.000Z",
        ),
      ),
    ).toMatchObject({ desiredState: "cancelled", accepted: true });
    expect(
      await status(runtime, run.attemptId, "20000000-0000-4000-8000-000000000018"),
    ).toMatchObject({
      desiredState: "cancelled",
      revision: 3,
    });
  });

  it("journals and replays a stable wake acknowledgement without advancing work", async () => {
    const root = await makeRoot();
    const intakeRuntime = await openRuntime(root);
    const reconcileSpec = {
      ...taskSpec,
      taskId: "20000000-0000-4000-8000-000000000019",
    };
    const intake = await invoke(
      intakeRuntime,
      request("task.run", RUN_COMMAND_ID, { taskSpec: reconcileSpec }),
    );
    if (intake.operation !== "task.run") throw new Error("Unexpected run result");
    intakeRuntime.close();

    const firstRuntime = await openRuntime(root);
    const command = request(
      "daemon.reconcile",
      RECONCILE_COMMAND_ID,
      { attemptId: intake.attemptId },
      T1,
    );
    expect(await invoke(firstRuntime, command)).toEqual({
      operation: "daemon.reconcile",
      accepted: true,
      reconciledAttemptIds: [],
    });
    await expect(status(firstRuntime, intake.attemptId)).resolves.toMatchObject({
      state: "queued",
      desiredState: "running",
      revision: 0,
      fence: 0,
    });
    firstRuntime.close();

    const secondRuntime = await openRuntime(root);
    await expect(invoke(secondRuntime, command)).resolves.toEqual({
      operation: "daemon.reconcile",
      accepted: true,
      reconciledAttemptIds: [],
    });
    await expect(status(secondRuntime, intake.attemptId)).resolves.toMatchObject({
      state: "queued",
      desiredState: "running",
      revision: 0,
      fence: 0,
    });
  });

  it("does not advance work before a failed reconcile result-ledger boundary", async () => {
    const root = await makeRoot();
    const intakeRuntime = await openRuntime(root);
    const boundarySpec = {
      ...taskSpec,
      taskId: "20000000-0000-4000-8000-000000000021",
    };
    const run = await invoke(
      intakeRuntime,
      request("task.run", "20000000-0000-4000-8000-000000000022", { taskSpec: boundarySpec }, T1),
    );
    if (run.operation !== "task.run") throw new Error("Unexpected run result");
    intakeRuntime.close();

    const runtime = await openRuntime(root, {
      commandResultLedgerBoundary: ({ request: candidate }) => {
        if (candidate.operation === "daemon.reconcile") {
          throw new Error("injected reconcile ledger crash");
        }
      },
    });
    const command = request(
      "daemon.reconcile",
      "20000000-0000-4000-8000-000000000023",
      { attemptId: run.attemptId },
      T2,
    );

    await expect(invoke(runtime, command)).rejects.toMatchObject({
      code: "command.result-persistence-ambiguous",
      retryable: true,
    });
    await expect(
      status(runtime, run.attemptId, "20000000-0000-4000-8000-000000000024"),
    ).resolves.toMatchObject({ state: "queued", desiredState: "running", revision: 0, fence: 0 });
    expect(await readdir(runtime.paths.commandResults)).not.toContain(
      "20000000-0000-4000-8000-000000000023.json",
    );
    runtime.close();

    const restarted = await openRuntime(root);
    await expect(invoke(restarted, command)).resolves.toEqual({
      operation: "daemon.reconcile",
      accepted: true,
      reconciledAttemptIds: [],
    });
    await expect(
      status(restarted, run.attemptId, "20000000-0000-4000-8000-000000000026"),
    ).resolves.toMatchObject({ state: "queued", desiredState: "running", revision: 0, fence: 0 });
  });
});

describe("task.retry", () => {
  it("creates attempt N+1 from a failed attempt, replays idempotently, and refuses ineligible retries", async () => {
    let repositories!: FactoryRepositories;
    const runtime = await openRuntime(await makeRoot(), {
      initializeDatabase: (database) => {
        repositories = createFactoryRepositories(database);
      },
    });
    const retrySpec = { ...taskSpec, taskId: "20000000-0000-4000-8000-000000000040" };
    const run = await invoke(runtime, request("task.run", RUN_COMMAND_ID, { taskSpec: retrySpec }));
    if (run.operation !== "task.run") throw new Error("Unexpected run result");

    await expect(
      invoke(
        runtime,
        request(
          "task.retry",
          "20000000-0000-4000-8000-000000000041",
          { taskId: retrySpec.taskId, attemptId: run.attemptId },
          T1,
        ),
      ),
    ).rejects.toMatchObject({ code: "task.retry-not-eligible" });

    const priorAttempt = await status(runtime, run.attemptId);
    failAttempt(repositories, priorAttempt, "a1a10000");

    await expect(
      invoke(
        runtime,
        request(
          "task.retry",
          "20000000-0000-4000-8000-000000000042",
          { taskId: "20000000-0000-4000-8000-000000000099", attemptId: run.attemptId },
          T2,
        ),
      ),
    ).rejects.toMatchObject({ code: "task.retry-task-mismatch" });

    const retryRequest = request(
      "task.retry",
      RETRY_COMMAND_ID,
      { taskId: retrySpec.taskId, attemptId: run.attemptId },
      T2,
    );
    const retried = await invoke(runtime, retryRequest);
    expect(retried).toMatchObject({
      operation: "task.retry",
      taskId: retrySpec.taskId,
      state: "queued",
      priorAttemptId: run.attemptId,
    });
    if (retried.operation !== "task.retry") throw new Error("Unexpected retry result");
    expect(retried.attemptId).not.toBe(run.attemptId);
    await expect(status(runtime, retried.attemptId)).resolves.toMatchObject({
      attemptNumber: 2,
      state: "queued",
      desiredState: "running",
    });

    const replay = await invoke(runtime, retryRequest);
    expect(replay).toEqual(retried);

    await expect(
      invoke(
        runtime,
        request(
          "task.retry",
          "20000000-0000-4000-8000-000000000043",
          { taskId: retrySpec.taskId, attemptId: run.attemptId },
          "2026-08-11T12:00:03.000Z",
        ),
      ),
    ).rejects.toBeTruthy();
  });
});

describe("attempt.unblock", () => {
  it("resumes a blocked attempt with the operator's answer recorded as an event", async () => {
    let repositories!: FactoryRepositories;
    const runtime = await openRuntime(await makeRoot(), {
      initializeDatabase: (database) => {
        repositories = createFactoryRepositories(database);
      },
    });
    const unblockSpec = { ...taskSpec, taskId: "20000000-0000-4000-8000-000000000050" };
    const run = await invoke(
      runtime,
      request("task.run", RUN_COMMAND_ID, { taskSpec: unblockSpec }),
    );
    if (run.operation !== "task.run") throw new Error("Unexpected run result");

    await expect(
      invoke(
        runtime,
        request(
          "attempt.unblock",
          "20000000-0000-4000-8000-000000000051",
          { attemptId: run.attemptId, answer: "n/a" },
          T1,
        ),
      ),
    ).rejects.toMatchObject({ code: "attempt.not-blocked" });

    const runningAttempt = await status(runtime, run.attemptId);
    const { stepId } = blockAttempt(repositories, runningAttempt, "b1b10000");
    await expect(status(runtime, run.attemptId)).resolves.toMatchObject({
      state: "blocked",
      blocker: { code: "task.needs-input" },
    });

    const answer = "Target the staging environment.";
    const unblocked = await invoke(
      runtime,
      request(
        "attempt.unblock",
        UNBLOCK_COMMAND_ID,
        { attemptId: run.attemptId, answer },
        "2026-08-11T12:00:03.000Z",
      ),
    );
    expect(unblocked).toMatchObject({
      operation: "attempt.unblock",
      attemptId: run.attemptId,
      state: "running",
      accepted: true,
    });
    await expect(status(runtime, run.attemptId)).resolves.toMatchObject({
      state: "running",
      blocker: null,
      currentStepId: stepId,
    });

    const events = await invoke(
      runtime,
      request(
        "attempt.events",
        "20000000-0000-4000-8000-000000000052",
        { attemptId: run.attemptId, afterSequence: 0, limit: 100 },
        "2026-08-11T12:00:03.000Z",
      ),
    );
    if (events.operation !== "attempt.events") throw new Error("Unexpected events result");
    const answered = events.events.find((event) => event.type === "attempt.unblock-answered");
    expect(answered).toMatchObject({ data: { stepId, answer } });
  });
});
