import { chmod, lstat, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AttemptIdSchema,
  CommandRequestV1Schema,
  type CommandRequestV1,
  type TaskSpecV1,
} from "@app-factory/contracts";
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
const PAUSE_COMMAND_ID = "20000000-0000-4000-8000-000000000008";
const RESUME_COMMAND_ID = "20000000-0000-4000-8000-000000000009";
const CANCEL_COMMAND_ID = "20000000-0000-4000-8000-000000000010";
const RECONCILE_COMMAND_ID = "20000000-0000-4000-8000-000000000011";
const REQUEST_ID = "20000000-0000-4000-8000-000000000012";
const DOCTOR_COMMAND_ID = "20000000-0000-4000-8000-000000000020";

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

describe("task intake and authoritative queries", () => {
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

  it("replays a reconciler result after restart without invoking the port again", async () => {
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
    const reconciledId = AttemptIdSchema.parse(intake.attemptId);
    intakeRuntime.close();

    const firstPort = vi.fn(() => [reconciledId, reconciledId]);
    const firstRuntime = await openRuntime(root, { reconcile: firstPort });
    const command = request("daemon.reconcile", RECONCILE_COMMAND_ID, { attemptId: null }, T1);
    expect(await invoke(firstRuntime, command)).toEqual({
      operation: "daemon.reconcile",
      accepted: true,
      reconciledAttemptIds: [reconciledId],
    });
    expect(firstPort).toHaveBeenCalledTimes(1);
    firstRuntime.close();

    const secondPort = vi.fn(() => []);
    const secondRuntime = await openRuntime(root, { reconcile: secondPort });
    expect(await invoke(secondRuntime, command)).toMatchObject({
      reconciledAttemptIds: [reconciledId],
    });
    expect(secondPort).not.toHaveBeenCalled();
  });
});
