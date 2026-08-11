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
const T0 = "2026-08-10T00:00:00.000Z";
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
  public completionCount = 0;

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
    this.completionCount += 1;
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

class CancelAwareHangingExecutor implements SchedulerStepExecutorPort {
  readonly #startedPromise: Promise<void>;
  #markStarted: (() => void) | undefined;
  readonly #abortedPromise: Promise<void>;
  #markAborted: (() => void) | undefined;
  public abortCount = 0;

  public constructor() {
    this.#startedPromise = new Promise((resolve) => {
      this.#markStarted = resolve;
    });
    this.#abortedPromise = new Promise((resolve) => {
      this.#markAborted = resolve;
    });
  }

  public async started(): Promise<void> {
    await this.#startedPromise;
  }

  public async aborted(): Promise<void> {
    await this.#abortedPromise;
  }

  public async execute(context: SchedulerExecutionContext) {
    await context.assertActive();
    this.#markStarted?.();
    return await new Promise<never>((_resolve, reject) => {
      const abort = () => {
        this.abortCount += 1;
        this.#markAborted?.();
        reject(new Error("executor interrupted for persisted cancellation"));
      };
      if (context.signal.aborted) abort();
      else context.signal.addEventListener("abort", abort, { once: true });
    });
  }
}

class BlockingExecutor implements SchedulerStepExecutorPort {
  public callCount = 0;

  public async execute(context: SchedulerExecutionContext) {
    await context.assertActive();
    this.callCount += 1;
    return {
      kind: "needs-input" as const,
      blocker: {
        code: "agent.authentication-required",
        message: "Authenticate the dedicated local agent profile.",
      },
    };
  }
}

class DeferredExecutionGuardExecutor implements SchedulerStepExecutorPort {
  readonly #startedPromise: Promise<void>;
  #markStarted: (() => void) | undefined;
  readonly #probePromise: Promise<void>;
  #requestProbe: (() => void) | undefined;
  readonly #rejectedPromise: Promise<void>;
  #markRejected: (() => void) | undefined;

  public constructor() {
    this.#startedPromise = new Promise((resolve) => {
      this.#markStarted = resolve;
    });
    this.#probePromise = new Promise((resolve) => {
      this.#requestProbe = resolve;
    });
    this.#rejectedPromise = new Promise((resolve) => {
      this.#markRejected = resolve;
    });
  }

  public async started(): Promise<void> {
    await this.#startedPromise;
  }

  public probeAuthoritativeGuard(): void {
    this.#requestProbe?.();
  }

  public async rejected(): Promise<void> {
    await this.#rejectedPromise;
  }

  public async execute(context: SchedulerExecutionContext) {
    await context.assertActive();
    this.#markStarted?.();
    await this.#probePromise;
    try {
      await context.assertActive();
    } catch (error) {
      this.#markRejected?.();
      throw error;
    }
    throw new Error("execution guard accepted work after durable cancellation");
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

  it("returns a retryable ambiguous error and recovers with the same command identity", async () => {
    let failFirstPublication = true;
    const service = await startFactoryDaemonService({
      runtimeDirectory: await makeRoot(),
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-ambiguous-result",
      wakeOnCommand: false,
      commandResultLedgerBoundary: ({ request }) => {
        if (request.operation === "task.run" && failFirstPublication) {
          failFirstPublication = false;
          throw new Error("simulated crash after kernel commit");
        }
      },
    });
    services.push(service);
    const client = clientFor(service);
    const identity = client.createIdentity();
    const spec = taskSpec(12);

    await expect(client.run(spec, identity)).rejects.toMatchObject({
      code: "command.result-persistence-ambiguous",
      retryable: true,
    });
    const recovered = await client.run(spec, client.createRetryIdentity(identity));
    const events = await client.events(recovered.attemptId, { limit: 100 });

    expect(recovered).toMatchObject({ operation: "task.run", state: "queued" });
    expect(events.events.filter((event) => event.type === "attempt.created")).toHaveLength(1);
  });

  it("interrupts only the targeted active attempt and reconciles its persisted cancellation", async () => {
    const executor = new CancelAwareHangingExecutor();
    const service = await startFactoryDaemonService({
      runtimeDirectory: await makeRoot(),
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-targeted-cancel",
      executor,
      pollIntervalMs: 5,
    });
    services.push(service);
    const client = clientFor(service);

    const active = await client.run(taskSpec(40));
    await executor.started();
    const other = await client.submit(taskSpec(41));
    await client.cancel(other.attemptId, "Cancel the non-active attempt first.");

    expect(executor.abortCount).toBe(0);
    await expect(client.status(active.attemptId)).resolves.toMatchObject({
      attempt: { state: "running", desiredState: "running" },
    });

    await client.cancel(active.attemptId, "Cancel the active hung execution.");
    await executor.aborted();
    await eventually(async () => {
      const result = await client.status(active.attemptId);
      return result.attempt.state === "cancelled";
    });

    await expect(client.status(active.attemptId)).resolves.toMatchObject({
      attempt: { state: "cancelled", desiredState: "cancelled", fence: 2 },
    });
    const events = await client.events(active.attemptId, { limit: 100 });
    expect(events.events.filter((event) => event.type === "attempt.fence-claimed")).toHaveLength(2);
    expect(
      events.events.some(
        (event) => event.type === "step.state-changed" && event.data.to === "cancelled",
      ),
    ).toBe(true);
    expect(service.getLastSchedulerError()).toBeNull();
  });

  it("lets an active step finish under paused intent and stops at the durable boundary", async () => {
    const executor = new GatedExecutor();
    const service = await startFactoryDaemonService({
      runtimeDirectory: await makeRoot(),
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-pause-boundary",
      executor,
      pollIntervalMs: 5,
    });
    services.push(service);
    const client = clientFor(service);
    const active = await client.run(taskSpec(44));
    await executor.started();

    await client.pause(active.attemptId, "Pause after the active step.");
    executor.release();
    await eventually(async () => {
      const result = await client.status(active.attemptId);
      return result.attempt.state === "paused";
    });

    expect(executor.completionCount).toBe(1);
    await expect(client.status(active.attemptId)).resolves.toMatchObject({
      attempt: { state: "paused", desiredState: "paused" },
    });
    expect(service.getLastSchedulerError()).toBeNull();
  });

  it("leaves a blocked attempt quiescent instead of reclaiming it on every poll", async () => {
    const executor = new BlockingExecutor();
    const service = await startFactoryDaemonService({
      runtimeDirectory: await makeRoot(),
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-quiescent-blocker",
      executor,
      pollIntervalMs: 5,
    });
    services.push(service);
    const client = clientFor(service);
    const intake = await client.run(taskSpec(45));

    await eventually(async () => (await client.status(intake.attemptId)).attempt.state === "blocked");
    expect(executor.callCount).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(executor.callCount).toBe(1);
    await expect(client.status(intake.attemptId)).resolves.toMatchObject({
      attempt: { state: "blocked", desiredState: "running" },
    });
    expect(service.getLastSchedulerError()).toBeNull();
  });

  it.each(["delayed", "failed"] as const)(
    "revokes execution during a %s cancellation-result ledger boundary",
    async (ledgerOutcome) => {
      const executor = new DeferredExecutionGuardExecutor();
      let markBoundaryEntered: (() => void) | undefined;
      const boundaryEntered = new Promise<void>((resolve) => {
        markBoundaryEntered = resolve;
      });
      let releaseBoundary: (() => void) | undefined;
      let failBoundary: ((error: Error) => void) | undefined;
      const boundaryDecision = new Promise<void>((resolve, reject) => {
        releaseBoundary = resolve;
        failBoundary = reject;
      });
      const service = await startFactoryDaemonService({
        runtimeDirectory: await makeRoot(),
        authorization: AUTHORIZATION,
        daemonVersion: `0.2.0-${ledgerOutcome}-cancel-ledger`,
        executor,
        pollIntervalMs: 5,
        commandResultLedgerBoundary: async ({ request }) => {
          if (request.operation !== "attempt.cancel") return;
          markBoundaryEntered?.();
          await boundaryDecision;
        },
      });
      services.push(service);
      const client = clientFor(service);
      const active = await client.run(taskSpec(ledgerOutcome === "delayed" ? 42 : 43));
      await executor.started();

      const cancelResult = client
        .cancel(active.attemptId, `${ledgerOutcome} result-ledger boundary`)
        .then(
          () => "completed" as const,
          () => "failed" as const,
        );
      await boundaryEntered;
      executor.probeAuthoritativeGuard();
      await executor.rejected();

      if (ledgerOutcome === "delayed") releaseBoundary?.();
      else failBoundary?.(new Error("injected command-result journal failure"));
      await expect(cancelResult).resolves.toBe(
        ledgerOutcome === "delayed" ? "completed" : "failed",
      );

      await eventually(async () => {
        const result = await client.status(active.attemptId);
        return result.attempt.state === "cancelled";
      });
      await expect(client.status(active.attemptId)).resolves.toMatchObject({
        attempt: { state: "cancelled", desiredState: "cancelled", fence: 2 },
      });
      expect(service.getLastSchedulerError()).toBeNull();
    },
  );

  it("acknowledges reconcile without executing inline when event wakeups are disabled", async () => {
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

    expect(reconciled.reconciledAttemptIds).toEqual([]);
    await expect(client.status(requested.attemptId)).resolves.toMatchObject({
      attempt: { state: "queued", desiredState: "paused", revision: 0, fence: 0 },
    });
    await expect(client.status(runnable.attemptId)).resolves.toMatchObject({
      attempt: { state: "queued", desiredState: "running", revision: 0, fence: 0 },
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
