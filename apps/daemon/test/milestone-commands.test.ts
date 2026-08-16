import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CommandRequestV1Schema, type CommandRequestV1 } from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";

const T0 = "2026-08-16T12:00:00.000Z";
const T1 = "2026-08-16T12:00:01.000Z";
const T2 = "2026-08-16T12:00:02.000Z";
const PROJECT_ID = "84000000-0000-4000-8000-000000000001";
const OTHER_PROJECT_ID = "84000000-0000-4000-8000-000000000002";
const REPOSITORY_ID = "84000000-0000-4000-8000-000000000003";
const REQUEST_ID = "84000000-0000-4000-8000-000000000010";
const M1 = "84000000-0000-4000-8000-000000000101";
const M2 = "84000000-0000-4000-8000-000000000102";
const EVIDENCE_DIGEST = `sha256:${"e".repeat(64)}`;

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

function commandId(index: number): string {
  return `84000000-0000-4000-8000-${(200 + index).toString().padStart(12, "0")}`;
}

function request(
  operation: CommandRequestV1["operation"],
  id: string,
  payload: unknown,
  issuedAt = T0,
): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId: id,
    issuedAt,
    origin: "cli",
    operation,
    payload,
  });
}

function draft(milestoneId: string, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    milestoneId,
    projectId: PROJECT_ID,
    phase: "build",
    kind: "stage",
    label: "Core loop builds green",
    targetDate: null,
    dependsOn: [],
    owner: "machine",
    status: "planned",
    evidenceDigest: null,
    ...overrides,
  };
}

function upsertRequest(
  id: string,
  milestone: ReturnType<typeof draft>,
  expectedRevision: number | null,
  issuedAt = T0,
): CommandRequestV1 {
  return request("project.milestone.upsert", id, { milestone, expectedRevision }, issuedAt);
}

function listRequest(id: string, projectId = PROJECT_ID): CommandRequestV1 {
  return request("project.milestones.list", id, { projectId }, T1);
}

function taskSpec(taskId: string, phase: string | null, createdAt = T0) {
  return {
    schemaVersion: 1,
    taskId,
    projectId: PROJECT_ID,
    createdAt,
    title: `Task ${taskId.slice(-2)}`,
    objective: "Contribute an actual to the project timeline.",
    ...(phase === null ? {} : { phase }),
    acceptanceCriteria: [
      { id: "counted", statement: "The attempt is counted.", verification: "automated" },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: "a".repeat(40) },
    requestedScope: { paths: ["Sources/App.swift"] },
    policyDigest: `sha256:${"b".repeat(64)}`,
  };
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-milestone-commands-"));
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

async function upsert(runtime: DaemonCommandRuntime, command: CommandRequestV1) {
  const result = await invoke(runtime, command);
  if (result.operation !== "project.milestone.upsert") throw new Error("Unexpected upsert result");
  return result;
}

async function timeline(runtime: DaemonCommandRuntime, id: string, projectId = PROJECT_ID) {
  const result = await invoke(runtime, listRequest(id, projectId));
  if (result.operation !== "project.milestones.list") throw new Error("Unexpected list result");
  return result.timeline;
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("project.milestone.upsert", () => {
  it("creates, compare-and-set updates, and stamps daemon-owned monotonic times", async () => {
    const runtime = await openRuntime(await makeRoot());

    const created = await upsert(runtime, upsertRequest(commandId(1), draft(M1), null));
    expect(created).toEqual({
      operation: "project.milestone.upsert",
      milestone: { schemaVersion: 1, ...draft(M1), revision: 0, createdAt: T2, updatedAt: T2 },
      created: true,
    });

    // The daemon clock is fixed at T2; the update must still advance updatedAt.
    const updated = await upsert(
      runtime,
      upsertRequest(commandId(2), draft(M1, { status: "active", targetDate: "2026-09-01" }), 0, T1),
    );
    expect(updated.created).toBe(false);
    expect(updated.milestone).toMatchObject({
      revision: 1,
      status: "active",
      targetDate: "2026-09-01",
      createdAt: T2,
      updatedAt: "2026-08-16T12:00:02.001Z",
    });

    const retracted = await upsert(
      runtime,
      upsertRequest(commandId(3), draft(M1, { status: "active", targetDate: null }), 1, T1),
    );
    expect(retracted.milestone).toMatchObject({ revision: 2, targetDate: null });
  });

  it.each([
    [
      "a stale expected revision",
      () => upsertRequest(commandId(9), draft(M1), 3, T1),
      "milestone.revision-conflict",
    ],
    [
      "creating an existing milestone",
      () => upsertRequest(commandId(9), draft(M1), null, T1),
      "milestone.already-exists",
    ],
    [
      "updating a missing milestone",
      () => upsertRequest(commandId(9), draft(M2), 0, T1),
      "milestone.not-found",
    ],
    [
      "a dependency the project does not have",
      () => upsertRequest(commandId(9), draft(M2, { dependsOn: [OTHER_PROJECT_ID] }), null, T1),
      "milestone.dependency-not-found",
    ],
    [
      "moving a milestone across projects",
      () => upsertRequest(commandId(9), draft(M1, { projectId: OTHER_PROJECT_ID }), 0, T1),
      "milestone.project-mismatch",
    ],
  ])(
    "refuses %s with a stable non-retryable code and journals nothing",
    async (_label, build, code) => {
      const runtime = await openRuntime(await makeRoot());
      await upsert(runtime, upsertRequest(commandId(1), draft(M1), null));
      await expect(invoke(runtime, build())).rejects.toMatchObject({ code, retryable: false });
      expect(await readdir(runtime.paths.commandResults)).toEqual([`${commandId(1)}.json`]);
      expect((await timeline(runtime, commandId(50))).milestones).toHaveLength(1);
    },
  );

  it("refuses a dependency cycle", async () => {
    const runtime = await openRuntime(await makeRoot());
    await upsert(runtime, upsertRequest(commandId(1), draft(M1), null));
    await upsert(runtime, upsertRequest(commandId(2), draft(M2, { dependsOn: [M1] }), null));
    await expect(
      invoke(runtime, upsertRequest(commandId(3), draft(M1, { dependsOn: [M2] }), 0, T1)),
    ).rejects.toMatchObject({ code: "milestone.dependency-cycle", retryable: false });
  });

  it("replays the byte-equivalent original result across restart and refuses a divergent reuse", async () => {
    const root = await makeRoot();
    const first = await openRuntime(root);
    const command = upsertRequest(commandId(1), draft(M1, { targetDate: "2026-09-01" }), null);
    const original = await upsert(first, command);
    first.close();

    const second = await openRuntime(root, { now: () => "2026-08-16T13:00:00.000Z" });
    const replayed = await second.handler(command, {
      requestId: "84000000-0000-4000-8000-000000000011",
    });
    expect(replayed).toEqual(original);
    expect((await timeline(second, commandId(2))).milestones).toHaveLength(1);

    await expect(
      invoke(second, upsertRequest(commandId(1), draft(M1, { label: "Renamed" }), null)),
    ).rejects.toMatchObject({ code: "command.identity-conflict" });
    await expect(
      invoke(
        second,
        request("task.submit", commandId(1), { taskSpec: taskSpec(OTHER_PROJECT_ID, null) }),
      ),
    ).rejects.toMatchObject({ code: "command.identity-conflict" });
  });

  it("refuses a milestone command ID that already names a kernel task command", async () => {
    const runtime = await openRuntime(await makeRoot());
    await invoke(
      runtime,
      request("task.submit", commandId(1), { taskSpec: taskSpec(OTHER_PROJECT_ID, "build") }),
    );
    await expect(
      invoke(runtime, upsertRequest(commandId(1), draft(M1), null)),
    ).rejects.toMatchObject({ code: "command.identity-conflict" });
  });
});

describe("project.milestones.list", () => {
  it("returns an empty, honest timeline for a project with no milestones or attempts", async () => {
    const runtime = await openRuntime(await makeRoot());
    expect(await timeline(runtime, commandId(1))).toEqual({
      schemaVersion: 1,
      projectId: PROJECT_ID,
      generatedAt: T2,
      milestones: [],
      actuals: { phases: [], lifecycle: [] },
      sources: { localExecution: "available", lifecycleEvents: "unavailable" },
    });
    expect(await readdir(runtime.paths.commandResults)).toEqual([]);
  });

  it("orders dated milestones first, keeps undated ones as null, and derives phase actuals from attempts", async () => {
    const runtime = await openRuntime(await makeRoot());
    await upsert(
      runtime,
      upsertRequest(
        commandId(1),
        draft(M2, { targetDate: null, kind: "gate", owner: "human", phase: "release" }),
        null,
      ),
    );
    await upsert(
      runtime,
      upsertRequest(
        commandId(2),
        draft(M1, { targetDate: "2026-09-01", status: "done", evidenceDigest: EVIDENCE_DIGEST }),
        null,
      ),
    );
    await invoke(
      runtime,
      request("task.run", commandId(3), {
        taskSpec: taskSpec("84000000-0000-4000-8000-000000000301", "build"),
      }),
    );
    await invoke(
      runtime,
      request("task.submit", commandId(4), {
        taskSpec: taskSpec("84000000-0000-4000-8000-000000000302", null, T1),
      }),
    );

    const result = await timeline(runtime, commandId(5));
    expect(
      result.milestones.map((milestone) => [milestone.milestoneId, milestone.targetDate]),
    ).toEqual([
      [M1, "2026-09-01"],
      [M2, null],
    ]);
    expect(result.actuals.phases).toEqual([
      {
        phase: "build",
        attemptCount: 1,
        activeAttemptCount: 1,
        blockerCount: 0,
        succeededAttemptCount: 0,
        firstAttemptAt: T2,
        lastActivityAt: T2,
        lastSucceededAt: null,
      },
      {
        phase: null,
        attemptCount: 1,
        activeAttemptCount: 1,
        blockerCount: 0,
        succeededAttemptCount: 0,
        firstAttemptAt: T2,
        lastActivityAt: T2,
        lastSucceededAt: null,
      },
    ]);
    expect(result.actuals.lifecycle).toEqual([]);
    expect(result.sources).toEqual({ localExecution: "available", lifecycleEvents: "unavailable" });
    expect(await timeline(runtime, commandId(6), OTHER_PROJECT_ID)).toMatchObject({
      milestones: [],
      actuals: { phases: [] },
    });

    const page = await invoke(
      runtime,
      request(
        "attempt.list",
        commandId(7),
        { scope: "all", projectId: PROJECT_ID, after: null, limit: 10 },
        T1,
      ),
    );
    if (page.operation !== "attempt.list") throw new Error("Unexpected attempt.list result");
    expect(page.page.attempts.map((item) => item.phase).sort()).toEqual(["build", null].sort());
  });
});
