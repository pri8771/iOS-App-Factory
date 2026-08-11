import { createHash } from "node:crypto";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

import { Sha256DigestSchema, TaskSpecV1Schema, type TaskSpecV1 } from "@app-factory/contracts";
import type { SchedulerExecutionContext, SchedulerStepExecutorPort } from "@app-factory/scheduler";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCommandClient,
  type CommandClient,
} from "../../../packages/command-client/src/index.js";

import {
  CommandServerStartError,
  DeterministicFakeExecutor,
  startFactoryDaemonService,
  type FactoryDaemonService,
} from "../src/index.js";

const AUTHORIZATION = "week-two-daemon-service-test-token-0001";
const T0 = "2026-08-11T12:00:00.000Z";
const roots: string[] = [];
const services: FactoryDaemonService[] = [];
const clients: CommandClient[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join("/private/tmp", "app-factory-service-"));
  roots.push(root);
  return root;
}

function taskSpec(suffix: number): TaskSpecV1 {
  return TaskSpecV1Schema.parse({
    schemaVersion: 1,
    taskId: `51000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`,
    projectId: "51000000-0000-4000-8000-000000000001",
    createdAt: T0,
    title: `Daemon service task ${String(suffix)}`,
    objective: "Prove detached command intake and restart-safe background execution.",
    acceptanceCriteria: [
      {
        id: "terminal",
        statement: "The background scheduler reaches a terminal success state.",
        verification: "automated",
      },
    ],
    base: {
      repositoryId: "51000000-0000-4000-8000-000000000002",
      commit: "a".repeat(40),
    },
    requestedScope: { paths: ["Sources/App.swift"] },
    policyDigest: `sha256:${"b".repeat(64)}`,
  });
}

function clientFor(service: FactoryDaemonService): CommandClient {
  const client = createCommandClient({
    socketPath: service.socketPath,
    authorization: AUTHORIZATION,
    origin: "cli",
  });
  clients.push(client);
  return client;
}

async function eventually(predicate: () => Promise<boolean>, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for daemon state");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function succeededDigest(effectKey: string): string {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(`test\0${effectKey}`).digest("hex")}`,
  );
}

class GatedExecutor implements SchedulerStepExecutorPort {
  readonly #startedPromise: Promise<void>;
  #markStarted: (() => void) | undefined;
  readonly #releasedPromise: Promise<void>;
  #releaseExecution: (() => void) | undefined;

  public constructor() {
    this.#startedPromise = new Promise((resolve) => {
      this.#markStarted = resolve;
    });
    this.#releasedPromise = new Promise((resolve) => {
      this.#releaseExecution = resolve;
    });
  }

  public async started(): Promise<void> {
    await this.#startedPromise;
  }

  public release(): void {
    this.#releaseExecution?.();
  }

  public async execute(context: SchedulerExecutionContext) {
    await context.assertActive();
    this.#markStarted?.();
    await this.#releasedPromise;
    await context.assertActive();
    return {
      kind: "succeeded" as const,
      outputDigest: succeededDigest(context.effectKey),
    };
  }
}

class AbortOnShutdownExecutor implements SchedulerStepExecutorPort {
  readonly #startedPromise: Promise<void>;
  #markStarted: (() => void) | undefined;

  public constructor() {
    this.#startedPromise = new Promise((resolve) => {
      this.#markStarted = resolve;
    });
  }

  public async started(): Promise<void> {
    await this.#startedPromise;
  }

  public async execute(context: SchedulerExecutionContext) {
    this.#markStarted?.();
    await new Promise<never>((_resolve, reject) => {
      const abort = () => reject(new Error("executor stopped with daemon"));
      if (context.signal.aborted) abort();
      else context.signal.addEventListener("abort", abort, { once: true });
    });
  }
}

class CooperativeSuspendedWait {
  readonly #enteredPromise: Promise<void>;
  #markEntered: (() => void) | undefined;

  public constructor() {
    this.#enteredPromise = new Promise((resolve) => {
      this.#markEntered = resolve;
    });
  }

  public readonly wait = async (_delayMs: number, signal: AbortSignal): Promise<void> => {
    this.#markEntered?.();
    if (signal.aborted) return;
    await new Promise<void>((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    });
  };

  public async entered(): Promise<void> {
    await this.#enteredPromise;
  }
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await Promise.allSettled(services.splice(0).map(async (service) => await service.close()));
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true })));
});

describe("single-writer daemon composition", () => {
  it("owns a private socket and rejects a second daemon before it can take ownership", async () => {
    const root = await makeRoot();
    const service = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-test",
      startedAt: T0,
    });
    services.push(service);

    expect((await lstat(service.socketPath)).mode & 0o777).toBe(0o600);
    await expect(
      startFactoryDaemonService({
        runtimeDirectory: root,
        authorization: AUTHORIZATION,
        daemonVersion: "0.2.0-loser",
      }),
    ).rejects.toBeInstanceOf(CommandServerStartError);
    await expect(clientFor(service).doctor()).resolves.toMatchObject({ readiness: "ready" });
  });

  it("releases socket ownership when composition fails after the lock is acquired", async () => {
    const root = await makeRoot();
    await expect(
      startFactoryDaemonService({
        runtimeDirectory: root,
        authorization: AUTHORIZATION,
        daemonVersion: "0.2.0-invalid-owner",
        ownerId: "",
      }),
    ).rejects.toThrow("ownerId must not be empty");

    const recovered = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-recovered",
    });
    services.push(recovered);
    await expect(clientFor(recovered).doctor()).resolves.toMatchObject({ readiness: "ready" });
  });

  it("returns command intake before execution and keeps working after its client disconnects", async () => {
    const executor = new GatedExecutor();
    const service = await startFactoryDaemonService({
      runtimeDirectory: await makeRoot(),
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-test",
      executor,
      pollIntervalMs: 5,
    });
    services.push(service);

    const submittingClient = clientFor(service);
    const intake = await submittingClient.run(taskSpec(10));
    expect(intake.state).toBe("queued");
    await executor.started();
    submittingClient.close();

    const observingClient = clientFor(service);
    await expect(observingClient.status(intake.attemptId)).resolves.toMatchObject({
      attempt: { state: "running" },
    });
    executor.release();
    await eventually(async () => {
      const result = await observingClient.status(intake.attemptId);
      return result.attempt.state === "succeeded";
    });
    expect(service.getLastSchedulerError()).toBeNull();
  });

  it("reconciles only the requested attempt even when another attempt is runnable", async () => {
    const suspendedWait = new CooperativeSuspendedWait();
    const service = await startFactoryDaemonService({
      runtimeDirectory: await makeRoot(),
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-scoped-reconcile",
      pollIntervalMs: 60_000,
      wait: suspendedWait.wait,
      wakeOnCommand: false,
    });
    services.push(service);
    await suspendedWait.entered();

    const client = clientFor(service);
    const runnable = await client.run(taskSpec(30));
    const requested = await client.submit(taskSpec(31));
    const reconciled = await client.reconcile(requested.attemptId);

    expect(reconciled.reconciledAttemptIds).toEqual([requested.attemptId]);
    await expect(client.status(requested.attemptId)).resolves.toMatchObject({
      attempt: { state: "paused", desiredState: "paused" },
    });
    await expect(client.status(runnable.attemptId)).resolves.toMatchObject({
      attempt: { state: "queued", desiredState: "running" },
    });
  });

  it("shuts down even when an injected wait adapter ignores cancellation", async () => {
    let entered: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const service = await startFactoryDaemonService({
      runtimeDirectory: await makeRoot(),
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-noncooperative-wait",
      pollIntervalMs: 60_000,
      wait: async () =>
        await new Promise<void>(() => {
          entered?.();
        }),
    });
    services.push(service);
    await waiting;

    await expect(service.close()).resolves.toBeUndefined();
  });

  it("gracefully checkpoints a running step and resumes it after a full daemon restart", async () => {
    const root = await makeRoot();
    const interruptedExecutor = new AbortOnShutdownExecutor();
    const first = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-before-restart",
      executor: interruptedExecutor,
      pollIntervalMs: 5,
    });
    services.push(first);
    const firstClient = clientFor(first);
    const intake = await firstClient.run(taskSpec(20));
    await interruptedExecutor.started();
    firstClient.close();
    await first.close();

    const restarted = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-after-restart",
      executor: new DeterministicFakeExecutor(),
      pollIntervalMs: 5,
    });
    services.push(restarted);
    const restartedClient = clientFor(restarted);
    await eventually(async () => {
      const result = await restartedClient.status(intake.attemptId);
      return result.attempt.state === "succeeded";
    });
    const events = await restartedClient.events(intake.attemptId, { limit: 100 });
    expect(events.events.filter((event) => event.type === "attempt.created")).toHaveLength(1);
    expect(events.events.at(-1)?.type).toBe("attempt.state-changed");
    expect(restarted.getLastSchedulerError()).toBeNull();
  });
});
