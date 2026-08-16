import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CommandRequestV1Schema,
  TaskSpecV1Schema,
  type CommandRequestV1,
  type PolicyLockV1,
  type ProjectId,
  type TaskSpecV1,
} from "@app-factory/contracts";
import { compilePolicyBundle } from "@app-factory/policy-engine";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createCommandClient,
  type CommandClient,
} from "../../../packages/command-client/src/index.js";

import {
  openDaemonCommandRuntime,
  type DaemonCommandRuntime,
  type TaskPolicyGateOptions,
} from "../src/command-runtime.js";
import { startFactoryDaemonService, type FactoryDaemonService } from "../src/index.js";

const T0 = "2026-08-11T12:00:00.000Z";
const T2 = "2026-08-11T12:00:02.000Z";
const PROJECT_ID = "20000000-0000-4000-8000-000000000101";
const REPOSITORY_ID = "20000000-0000-4000-8000-000000000102";
const TASK_ID = "20000000-0000-4000-8000-000000000103";
const REQUEST_ID = "20000000-0000-4000-8000-000000000112";
const AUTHORIZATION = "task-policy-gate-service-test-token-0001";
const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];
const services: FactoryDaemonService[] = [];
const clients: CommandClient[] = [];

const bundle = compilePolicyBundle(
  {
    schemaVersion: 1,
    policyId: "factory.gate-policy",
    policyVersion: 3,
    title: "Gate policy",
    authority: "AGENTS.md",
    principles: ["Bind completion to immutable evidence."],
    rules: [
      {
        ruleId: "rule.scope.preserve",
        statement: "Only change declared paths.",
        enforcement: "broker",
        requiredCheck: "policy.changed-paths",
      },
    ],
    protectedSurfaces: [
      {
        path: "quality/baselines",
        classification: "baseline",
        changeApprovalAction: "quality.baseline-change",
      },
    ],
  },
  T0,
);
const enrolledLock: PolicyLockV1 = bundle.lock;
const STALE_DIGEST = `sha256:${"b".repeat(64)}`;

function taskSpec(policyDigest: string, taskId = TASK_ID): TaskSpecV1 {
  return TaskSpecV1Schema.parse({
    schemaVersion: 1,
    taskId,
    projectId: PROJECT_ID,
    createdAt: T0,
    title: "Gate the intake",
    objective: "Reject tasks not bound to the enrolled policy lock.",
    acceptanceCriteria: [
      { id: "gated", statement: "Mismatched digests never intake.", verification: "automated" },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: "a".repeat(40) },
    requestedScope: { paths: ["Sources/App.swift"] },
    policyDigest,
  });
}

let commandCounter = 0;
function request(operation: "task.submit" | "task.run", spec: TaskSpecV1): CommandRequestV1 {
  commandCounter += 1;
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId: `20000000-0000-4000-8000-${String(commandCounter).padStart(12, "0")}`,
    issuedAt: T0,
    origin: "cli",
    operation,
    payload: { taskSpec: spec },
  });
}

async function openRuntime(taskPolicyGate?: TaskPolicyGateOptions): Promise<DaemonCommandRuntime> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-policy-gate-"));
  roots.push(root);
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: root,
    daemonVersion: "0.1.0-test",
    startedAt: T0,
    now: () => T2,
    ...(taskPolicyGate === undefined ? {} : { taskPolicyGate }),
  });
  runtimes.push(runtime);
  return runtime;
}

async function invoke(runtime: DaemonCommandRuntime, command: CommandRequestV1) {
  return await runtime.handler(command, { requestId: REQUEST_ID });
}

async function attemptCount(runtime: DaemonCommandRuntime): Promise<number> {
  commandCounter += 1;
  const result = await invoke(
    runtime,
    CommandRequestV1Schema.parse({
      schemaVersion: 1,
      commandId: `20000000-0000-4000-8000-${String(commandCounter).padStart(12, "0")}`,
      issuedAt: T0,
      origin: "cli",
      operation: "attempt.list",
      payload: { scope: "all", projectId: null, after: null, limit: 50 },
    }),
  );
  if (result.operation !== "attempt.list") throw new Error("Unexpected list result");
  return result.page.attempts.length;
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await Promise.allSettled(services.splice(0).map(async (service) => await service.close()));
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("task intake policy gate", () => {
  it("is off by default and when explicitly disabled", async () => {
    const resolver = vi.fn(() => enrolledLock);
    for (const runtime of [
      await openRuntime(),
      await openRuntime({ enabled: false, resolvePolicyLock: resolver }),
    ]) {
      const accepted = await invoke(runtime, request("task.submit", taskSpec(STALE_DIGEST)));
      expect(accepted).toMatchObject({ operation: "task.submit", state: "queued" });
    }
    expect(resolver).not.toHaveBeenCalled();
  });

  it("accepts a TaskSpec bound to the enrolled lock digest for submit and run", async () => {
    const resolver = vi.fn(async (projectId: ProjectId) => {
      expect(projectId).toBe(PROJECT_ID);
      return enrolledLock;
    });
    const runtime = await openRuntime({ enabled: true, resolvePolicyLock: resolver });
    const submitted = await invoke(
      runtime,
      request("task.submit", taskSpec(enrolledLock.policyDigest)),
    );
    expect(submitted).toMatchObject({ operation: "task.submit", state: "queued" });
    const ran = await invoke(
      runtime,
      request(
        "task.run",
        taskSpec(enrolledLock.policyDigest, "20000000-0000-4000-8000-000000000104"),
      ),
    );
    expect(ran).toMatchObject({ operation: "task.run", state: "queued" });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(await attemptCount(runtime)).toBe(2);
  });

  it("rejects a mismatched digest before any durable state exists", async () => {
    const runtime = await openRuntime({ enabled: true, resolvePolicyLock: () => enrolledLock });
    await expect(
      invoke(runtime, request("task.submit", taskSpec(STALE_DIGEST))),
    ).rejects.toMatchObject({ code: "policy.digest-mismatch", retryable: false });
    await expect(
      invoke(runtime, request("task.run", taskSpec(STALE_DIGEST))),
    ).rejects.toMatchObject({ code: "policy.digest-mismatch", retryable: false });
    expect(await attemptCount(runtime)).toBe(0);
    // A rejected command leaves no journal entry, so a corrected retry under a
    // fresh command ID succeeds and the runtime stays healthy.
    const accepted = await invoke(
      runtime,
      request("task.submit", taskSpec(enrolledLock.policyDigest)),
    );
    expect(accepted).toMatchObject({ operation: "task.submit", state: "queued" });
    expect(await attemptCount(runtime)).toBe(1);
  });

  it("fails closed when the lock is absent, invalid, or the resolver throws", async () => {
    const absent = await openRuntime({ enabled: true, resolvePolicyLock: () => null });
    await expect(
      invoke(absent, request("task.submit", taskSpec(enrolledLock.policyDigest))),
    ).rejects.toMatchObject({ code: "policy.lock-unavailable", retryable: false });

    const invalid = await openRuntime({
      enabled: true,
      resolvePolicyLock: () => ({ ...enrolledLock, requiredChecks: [] }) as PolicyLockV1,
    });
    await expect(
      invoke(invalid, request("task.submit", taskSpec(enrolledLock.policyDigest))),
    ).rejects.toMatchObject({ code: "policy.lock-invalid", retryable: false });

    const throwing = await openRuntime({
      enabled: true,
      resolvePolicyLock: () => {
        throw new Error("lock store offline");
      },
    });
    await expect(
      invoke(throwing, request("task.submit", taskSpec(enrolledLock.policyDigest))),
    ).rejects.toMatchObject({ code: "policy.lock-unavailable", retryable: false });

    for (const runtime of [absent, invalid, throwing]) {
      expect(await attemptCount(runtime)).toBe(0);
    }
  });
});

describe("task policy gate service composition", () => {
  it("passes the gate through the daemon service and stays off when omitted", async () => {
    // The Unix socket path length bound keeps service roots under /private/tmp.
    const gatedRoot = await mkdtemp(join("/private/tmp", "app-factory-gate-"));
    const openRoot = await mkdtemp(join("/private/tmp", "app-factory-gate-"));
    roots.push(gatedRoot, openRoot);
    const gated = await startFactoryDaemonService({
      runtimeDirectory: gatedRoot,
      authorization: AUTHORIZATION,
      daemonVersion: "0.4.0-policy-gate",
      pollIntervalMs: 5,
      taskPolicyGate: { enabled: true, resolvePolicyLock: () => enrolledLock },
    });
    const open = await startFactoryDaemonService({
      runtimeDirectory: openRoot,
      authorization: AUTHORIZATION,
      daemonVersion: "0.4.0-policy-gate",
      pollIntervalMs: 5,
    });
    services.push(gated, open);
    const clientFor = (service: FactoryDaemonService): CommandClient => {
      const client = createCommandClient({
        socketPath: service.socketPath,
        authorization: AUTHORIZATION,
        origin: "cli",
      });
      clients.push(client);
      return client;
    };
    await expect(clientFor(gated).submit(taskSpec(STALE_DIGEST))).rejects.toMatchObject({
      code: "policy.digest-mismatch",
      retryable: false,
    });
    await expect(
      clientFor(gated).submit(taskSpec(enrolledLock.policyDigest)),
    ).resolves.toMatchObject({ operation: "task.submit", state: "queued" });
    await expect(clientFor(open).submit(taskSpec(STALE_DIGEST))).resolves.toMatchObject({
      operation: "task.submit",
      state: "queued",
    });
  });
});
