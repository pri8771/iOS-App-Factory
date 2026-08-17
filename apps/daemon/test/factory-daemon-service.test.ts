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

class StartupRecoveryExecutor implements SchedulerStepExecutorPort {
  readonly #enteredPromise: Promise<void>;
  #markEntered: (() => void) | undefined;
  readonly #releasedPromise: Promise<void>;
  #releaseRecovery: (() => void) | undefined;
  public reconcileCalls = 0;

  public constructor() {
    this.#enteredPromise = new Promise((resolve) => {
      this.#markEntered = resolve;
    });
    this.#releasedPromise = new Promise((resolve) => {
      this.#releaseRecovery = resolve;
    });
  }

  public async reconcileStartup(): Promise<void> {
    this.reconcileCalls += 1;
    this.#markEntered?.();
    await this.#releasedPromise;
  }

  public async entered(): Promise<void> {
    await this.#enteredPromise;
  }

  public release(): void {
    this.#releaseRecovery?.();
  }

  public async execute(context: SchedulerExecutionContext) {
    await context.assertActive();
    return {
      kind: "succeeded" as const,
      outputDigest: succeededDigest(context.effectKey),
    };
  }
}

type DurableIsolatedRunState = {
  pendingAttemptId: string | null;
  launchCount: number;
  adoptionCount: number;
};

class CrashAdoptingExecutor implements SchedulerStepExecutorPort {
  readonly #state: DurableIsolatedRunState;
  readonly #hangAfterLaunch: boolean;
  readonly #startedPromise: Promise<void>;
  #markStarted: (() => void) | undefined;

  public constructor(state: DurableIsolatedRunState, hangAfterLaunch: boolean) {
    this.#state = state;
    this.#hangAfterLaunch = hangAfterLaunch;
    this.#startedPromise = new Promise((resolve) => {
      this.#markStarted = resolve;
    });
  }

  public async started(): Promise<void> {
    await this.#startedPromise;
  }

  public async reconcileStartup() {
    return {
      schemaVersion: 1 as const,
      pendingAttemptIds:
        this.#state.pendingAttemptId === null ? [] : [this.#state.pendingAttemptId],
    };
  }

  public async execute(context: SchedulerExecutionContext) {
    await context.assertActive();
    if (context.step.key === "execute") {
      if (this.#state.pendingAttemptId === null) {
        this.#state.pendingAttemptId = context.attemptId;
        this.#state.launchCount += 1;
      } else {
        expect(this.#state.pendingAttemptId).toBe(context.attemptId);
        this.#state.adoptionCount += 1;
      }
      this.#markStarted?.();
      if (this.#hangAfterLaunch) {
        return await new Promise<never>((_resolve, reject) => {
          const abort = () => reject(new Error("simulated daemon crash after isolated launch"));
          if (context.signal.aborted) abort();
          else context.signal.addEventListener("abort", abort, { once: true });
        });
      }
      this.#state.pendingAttemptId = null;
    }
    return {
      kind: "succeeded" as const,
      outputDigest: succeededDigest(context.effectKey),
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
  it("keeps command handling in starting state until durable executor recovery completes", async () => {
    const root = await makeRoot();
    const executor = new StartupRecoveryExecutor();
    const starting = startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-startup-recovery",
      executor,
    });
    await executor.entered();

    const client = createCommandClient({
      socketPath: join(root, "daemon.sock"),
      authorization: AUTHORIZATION,
      origin: "cli",
    });
    clients.push(client);
    await expect(client.doctor()).rejects.toMatchObject({
      code: "daemon.starting",
      retryable: true,
    });

    executor.release();
    const service = await starting;
    services.push(service);
    expect(executor.reconcileCalls).toBe(1);
    await expect(client.doctor()).resolves.toMatchObject({ readiness: "ready" });
  });

  it("adopts one durable in-flight run after restart without launching a duplicate", async () => {
    const root = await makeRoot();
    const durableRun: DurableIsolatedRunState = {
      pendingAttemptId: null,
      launchCount: 0,
      adoptionCount: 0,
    };
    const crashingExecutor = new CrashAdoptingExecutor(durableRun, true);
    const first = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-before-isolated-restart",
      executor: crashingExecutor,
      pollIntervalMs: 5,
    });
    services.push(first);
    const intake = await clientFor(first).run(taskSpec(92));
    await crashingExecutor.started();
    expect(durableRun).toMatchObject({
      pendingAttemptId: intake.attemptId,
      launchCount: 1,
      adoptionCount: 0,
    });

    await first.close();

    const recovered = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-after-isolated-restart",
      executor: new CrashAdoptingExecutor(durableRun, false),
      pollIntervalMs: 5,
    });
    services.push(recovered);

    await expect(clientFor(recovered).status(intake.attemptId)).resolves.toMatchObject({
      attempt: { state: "succeeded" },
    });
    expect(durableRun).toEqual({
      pendingAttemptId: null,
      launchCount: 1,
      adoptionCount: 1,
    });
  });

  it("releases daemon ownership when startup recovery fails closed", async () => {
    const root = await makeRoot();
    const failure = new Error("ambiguous durable child identity");
    const executor = Object.assign(new DeterministicFakeExecutor(), {
      reconcileStartup: async () => {
        throw failure;
      },
    });

    await expect(
      startFactoryDaemonService({
        runtimeDirectory: root,
        authorization: AUTHORIZATION,
        daemonVersion: "0.2.0-startup-recovery-failure",
        executor,
      }),
    ).rejects.toBe(failure);

    const recovered = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.2.0-after-recovery-failure",
    });
    services.push(recovered);
    await expect(clientFor(recovered).doctor()).resolves.toMatchObject({ readiness: "ready" });
  });

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

    await eventually(
      async () => (await client.status(intake.attemptId)).attempt.state === "blocked",
    );
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

describe("effect pump subsystem lifecycle", () => {
  it("stays fully inert (no pump, pump.enabled false) when the effects option is omitted", async () => {
    const root = await makeRoot();
    const service = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.3.0-effects-off",
      pollIntervalMs: 5,
    });
    services.push(service);
    const client = clientFor(service);

    const status = await client.effectsStatus();
    expect(status.status).toMatchObject({
      pendingOutbox: 0,
      pump: { enabled: false, lastActivityAt: null, lastErrorMessage: null },
    });
    expect(service.getLastEffectsPumpError()).toBeNull();
    await expect(service.close()).resolves.toBeUndefined();
  });

  it("starts the pump after readiness and reports it enabled, then stops cleanly on shutdown", async () => {
    const root = await makeRoot();
    const service = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.3.0-effects-on",
      pollIntervalMs: 5,
      effects: { enabled: true, pollIntervalMs: 10 },
    });
    services.push(service);
    const client = clientFor(service);

    const status = await client.effectsStatus();
    expect(status.status.pump.enabled).toBe(true);
    expect(service.getLastEffectsPumpError()).toBeNull();

    // The registry is never populated in this test (no configureAdapters),
    // so with an empty outbox the pump only ever idles; shutdown must still
    // complete cleanly and promptly.
    await expect(service.close()).resolves.toBeUndefined();
    expect(service.getLastEffectsPumpError()).toBeNull();
  });
});

describe("room moderator subsystem lifecycle", () => {
  const ROOM_ID = "30000000-0000-4000-8000-000000000001";
  const roomSpec = {
    roomId: ROOM_ID,
    title: "Service rooms",
    projectId: null,
    unattendedEnabled: false,
    agentCooldownEvents: 1,
    participants: [
      { persona: "architect", provider: "ollama", displayName: "Architect" },
      { persona: "critic", provider: "ollama", displayName: "Critic" },
    ],
    budget: {
      dailyCeilingTokens: 5_000,
      unattendedDailyCeilingTokens: 500,
      maxTokensPerReply: 500,
    },
  } as const;

  it("keeps rooms as an inert transcript when the rooms option is omitted", async () => {
    const root = await makeRoot();
    const service = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.4.0-rooms-off",
      pollIntervalMs: 5,
    });
    services.push(service);
    const client = clientFor(service);
    const created = await client.createRoom(roomSpec);
    expect(created).toMatchObject({ operation: "room.create", duplicate: false });
    await client.postToRoom(ROOM_ID, "priyansh", "anyone there?");
    await new Promise((resolve) => setTimeout(resolve, 50));
    const events = await client.roomEvents(ROOM_ID);
    expect(events.moderator.enabled).toBe(false);
    expect(events.messages.map((message) => message.kind)).toEqual(["message"]);
    expect(events.room.pendingTrigger?.kind).toBe("human-message");
    // No moderator composed: the participants catalog answers honestly instead of erroring.
    const participants = await client.listRoomParticipants();
    expect(participants.catalog).toMatchObject({
      enabled: false,
      unavailableReason: expect.stringContaining("APP_FACTORY_ROOMS_ENABLED") as string,
      providers: [],
      roster: [],
    });
    expect(service.getLastRoomsError()).toBeNull();
    await expect(service.close()).resolves.toBeUndefined();
  });

  it("refuses to enable rooms without the model-facing ports", async () => {
    const root = await makeRoot();
    await expect(
      startFactoryDaemonService({
        runtimeDirectory: root,
        authorization: AUTHORIZATION,
        daemonVersion: "0.4.0-rooms-misconfigured",
        pollIntervalMs: 5,
        rooms: { enabled: true },
      }),
    ).rejects.toThrow(/rooms\.scorer, rooms\.contributor, and rooms\.revalidator are required/);
    // Composition failure released socket ownership: a follow-up daemon starts cleanly.
    const service = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.4.0-rooms-off",
      pollIntervalMs: 5,
    });
    services.push(service);
    await expect(service.close()).resolves.toBeUndefined();
  });

  it("moderates a room end to end over the socket, resumes after restart, and stops cleanly", async () => {
    const root = await makeRoot();
    let clock = Date.parse("2026-08-16T12:00:00.000Z");
    const now = () => new Date(clock).toISOString();
    const roomsConfig = {
      enabled: true,
      scorer: {
        score: (request: { candidates: readonly { persona: string }[] }) =>
          Promise.resolve(
            Object.fromEntries(
              request.candidates.map((candidate) => [
                candidate.persona,
                candidate.persona === "critic" ? 2 : 0,
              ]),
            ),
          ),
      },
      contributor: {
        contribute: (request: { participant: { persona: string } }) =>
          Promise.resolve({
            kind: "message" as const,
            body: `${request.participant.persona} answering`,
            tokensUsed: 30,
          }),
      },
      revalidator: { revalidate: () => Promise.resolve({ decision: "post" as const }) },
      participantsCatalog: {
        providers: [{ provider: "ollama" as const, model: "qwen2.5-coder:14b", cliVersion: null }],
        roster: [
          {
            roomId: ROOM_ID,
            kind: "project" as const,
            charter: null,
            participants: [{ persona: "critic", oneLineCharter: "Finds what the plan misses." }],
          },
        ],
      },
    };
    const first = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.4.0-rooms-on",
      pollIntervalMs: 5,
      now,
      rooms: roomsConfig,
    });
    services.push(first);
    const clientAt = (service: FactoryDaemonService): CommandClient => {
      const client = createCommandClient({
        socketPath: service.socketPath,
        authorization: AUTHORIZATION,
        origin: "cli",
        now: () => new Date(clock),
      });
      clients.push(client);
      return client;
    };
    const client = clientAt(first);
    await client.createRoom(roomSpec);
    clock += 1_000;
    await client.postToRoom(ROOM_ID, "priyansh", "@critic what next?");
    await eventually(async () => (await client.roomEvents(ROOM_ID)).room.headSequence >= 3);
    let events = await client.roomEvents(ROOM_ID);
    expect(events.room).toMatchObject({ pendingTrigger: null, activeGrantId: null });
    expect(events.moderator).toMatchObject({
      enabled: true,
      attendance: "attended",
      // The real daemon composes the factory-event bridge whenever rooms are on; it anchored on
      // an empty kernel ledger (no attempt yet), so the cursor is at position 0 with no event.
      factoryBridge: {
        enabled: true,
        cursor: { ledgerPosition: 0, eventId: null, deliveredCount: 0 },
      },
    });
    // critic answered; the chain then found architect (urgency 0) only, so it passed legibly.
    expect(
      events.messages.map((message) =>
        message.kind === "system" ? `system:${message.code}` : message.author.kind,
      ),
    ).toEqual(["human", "agent", "system:all-passed"]);
    expect(events.room.budget).toMatchObject({ reservedTokens: 0, spentTokens: 30 });
    // The composed moderator's catalog is served verbatim over the socket, and the client's own
    // digest re-verification accepts it.
    const participants = await client.listRoomParticipants();
    expect(participants.catalog).toMatchObject({
      enabled: true,
      unavailableReason: null,
      providers: roomsConfig.participantsCatalog.providers,
      roster: roomsConfig.participantsCatalog.roster,
    });
    expect(first.getLastRoomsError()).toBeNull();
    await first.close();

    // Restart against the same database: the sweep finds nothing open and the transcript
    // continues from its durable head.
    const second = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.4.0-rooms-on-restart",
      pollIntervalMs: 5,
      now,
      rooms: roomsConfig,
    });
    services.push(second);
    const client2 = clientAt(second);
    clock += 1_000;
    await client2.postToRoom(ROOM_ID, "priyansh", "@architect and you?");
    await eventually(async () => (await client2.roomEvents(ROOM_ID)).room.headSequence >= 6);
    events = await client2.roomEvents(ROOM_ID, { afterSequence: 3 });
    // @architect is a forced invite but only wins ties: critic's urgency 2 beats the forced
    // floor of 1, so critic answers; the chain then finds only architect at urgency 0.
    expect(
      events.messages.map((message) =>
        message.kind === "system"
          ? `system:${message.code}`
          : `${message.author.kind}:${message.author.kind === "agent" ? message.author.persona : "human"}`,
      ),
    ).toEqual(["human:human", "agent:critic", "system:all-passed"]);
    expect(events.room).toMatchObject({ pendingTrigger: null, activeGrantId: null });
    const typing = await client2.signalRoomTyping(ROOM_ID, "priyansh", 5_000);
    expect(typing.typingUntil).toBe(new Date(clock + 5_000).toISOString());
    expect(second.getLastRoomsError()).toBeNull();
    await expect(second.close()).resolves.toBeUndefined();
  });

  it("bridges a real kernel attempt transition into every room bound to the task's project, and only there", async () => {
    const root = await makeRoot();
    let clock = Date.parse("2026-08-17T09:00:00.000Z");
    const now = () => new Date(clock).toISOString();
    const scored: string[][] = [];
    const roomsConfig = {
      enabled: true,
      scorer: {
        score: (request: { candidates: readonly { persona: string }[] }) => {
          scored.push(request.candidates.map((candidate) => candidate.persona));
          return Promise.resolve(
            Object.fromEntries(
              request.candidates.map((candidate) => [
                candidate.persona,
                candidate.persona === "critic" ? 3 : 0,
              ]),
            ),
          );
        },
      },
      contributor: {
        contribute: (request: { participant: { persona: string } }) =>
          Promise.resolve({
            kind: "message" as const,
            body: `${request.participant.persona}: noted the factory result`,
            tokensUsed: 40,
          }),
      },
      revalidator: { revalidate: () => Promise.resolve({ decision: "post" as const }) },
    };
    const service = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.5.0-rooms-bridge",
      pollIntervalMs: 5,
      now,
      rooms: roomsConfig,
    });
    services.push(service);
    const client = createCommandClient({
      socketPath: service.socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => new Date(clock),
    });
    clients.push(client);
    const BOUND_ROOM = "30000000-0000-4000-8000-000000000011";
    const OTHER_ROOM = "30000000-0000-4000-8000-000000000012";
    const PORTFOLIO_ROOM = "30000000-0000-4000-8000-000000000013";
    // Never attended by a human: dormant from birth, so ONLY a factory-event may run a round, and
    // only under the unattended ceiling.
    const bound = {
      ...roomSpec,
      roomId: BOUND_ROOM,
      projectId: taskSpec(90).projectId,
      unattendedEnabled: true,
      // Room for exactly two unattended replies (500 reserved per grant) across the restart below.
      budget: {
        dailyCeilingTokens: 5_000,
        unattendedDailyCeilingTokens: 1_000,
        maxTokensPerReply: 500,
      },
    };
    await client.createRoom(bound);
    await client.createRoom({
      ...roomSpec,
      roomId: OTHER_ROOM,
      projectId: "51000000-0000-4000-8000-0000000000ff",
      unattendedEnabled: true,
    });
    await client.createRoom({ ...roomSpec, roomId: PORTFOLIO_ROOM, unattendedEnabled: true });
    const before = await client.roomEvents(BOUND_ROOM);
    expect(before.moderator.factoryBridge).toMatchObject({
      enabled: true,
      cursor: { ledgerPosition: 0, eventId: null, deliveredCount: 0 },
    });

    // A REAL kernel attempt over the deterministic fake executor: queued -> running -> succeeded,
    // committed to the kernel `events` ledger by the scheduler on the daemon's own tick loop.
    clock += 1_000;
    const run = await client.run(taskSpec(90));
    await eventually(
      async () => (await client.status(run.attemptId)).attempt.state === "succeeded",
    );
    // The bridge drains after every tick: the terminal transition reaches the bound room, whose
    // dormant-but-unattended-enabled moderator then runs exactly one round on that trigger.
    await eventually(async () => (await client.roomEvents(BOUND_ROOM)).room.headSequence >= 2);
    const events = await client.roomEvents(BOUND_ROOM);
    expect(
      events.messages.map((message) =>
        message.kind === "system" ? `system:${message.code}` : `agent:${message.author.kind}`,
      ),
    ).toEqual(["system:factory-event", "agent:agent"]);
    const line = events.messages[0];
    if (line === undefined || line.kind !== "system") throw new Error("expected a system line");
    expect(line.body).toBe(
      `Factory: attempt ${run.attemptId.slice(0, 8)} for task "Daemon service task 90" → succeeded`,
    );
    expect(events.moderator.attendance).toBe("dormant");
    // Spent under the unattended ceiling: the grant was issued while dormant.
    expect(events.room.budget).toMatchObject({ spentTokens: 40, unattendedSpentTokens: 40 });
    expect(scored).toEqual([["architect", "critic"]]);
    // The bridge cursor moved to the kernel event that produced the line.
    const kernelEvents = await client.events(run.attemptId);
    const terminal = kernelEvents.events.findLast(
      (event) => event.type === "attempt.state-changed" && event.data.to === "succeeded",
    );
    expect(terminal).toBeDefined();
    // The line's instant is durable state only: the daemon clock floored at the kernel event's
    // own occurredAt (here the scheduler's real clock is far ahead of the test's fake `now`).
    expect(line.occurredAt).toBe(terminal?.occurredAt);
    expect(line.occurredAt >= now()).toBe(true);
    expect(events.moderator.factoryBridge).toMatchObject({
      enabled: true,
      cursor: {
        eventId: terminal?.eventId,
        lastDeliveredEventId: terminal?.eventId,
        deliveredCount: 1,
      },
    });
    expect(events.moderator.factoryBridge.cursor?.ledgerPosition).toBeGreaterThan(0);
    // Other-project and portfolio-wide rooms received nothing.
    expect((await client.roomEvents(OTHER_ROOM)).messages).toEqual([]);
    expect((await client.roomEvents(PORTFOLIO_ROOM)).messages).toEqual([]);
    expect(service.getLastRoomsError()).toBeNull();
    await service.close();

    // Restart over the same database: the durable cursor means the same kernel event is never
    // bridged twice, and a transition that happens after the restart is bridged exactly once.
    const second = await startFactoryDaemonService({
      runtimeDirectory: root,
      authorization: AUTHORIZATION,
      daemonVersion: "0.5.0-rooms-bridge-restart",
      pollIntervalMs: 5,
      now,
      rooms: roomsConfig,
    });
    services.push(second);
    const client2 = createCommandClient({
      socketPath: second.socketPath,
      authorization: AUTHORIZATION,
      origin: "cli",
      now: () => new Date(clock),
    });
    clients.push(client2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await client2.roomEvents(BOUND_ROOM)).room.headSequence).toBe(2);
    clock += 1_000;
    const run2 = await client2.run(taskSpec(91));
    await eventually(
      async () => (await client2.status(run2.attemptId)).attempt.state === "succeeded",
    );
    await eventually(async () => (await client2.roomEvents(BOUND_ROOM)).room.headSequence >= 4);
    const after = await client2.roomEvents(BOUND_ROOM, { afterSequence: 2 });
    expect(
      after.messages.map((message) => (message.kind === "system" ? message.code : "chat")),
    ).toEqual(["factory-event", "chat"]);
    expect(after.moderator.factoryBridge.cursor).toMatchObject({ deliveredCount: 2 });
    expect(second.getLastRoomsError()).toBeNull();
    await expect(second.close()).resolves.toBeUndefined();
  });

  it("bridges nothing and keeps no cursor when rooms are disabled", async () => {
    const service = await startFactoryDaemonService({
      runtimeDirectory: await makeRoot(),
      authorization: AUTHORIZATION,
      daemonVersion: "0.5.0-rooms-off-no-bridge",
      pollIntervalMs: 5,
    });
    services.push(service);
    const client = clientFor(service);
    await client.createRoom({
      ...roomSpec,
      projectId: taskSpec(92).projectId,
      unattendedEnabled: true,
    });
    const run = await client.run(taskSpec(92));
    await eventually(
      async () => (await client.status(run.attemptId)).attempt.state === "succeeded",
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    const events = await client.roomEvents(ROOM_ID);
    expect(events.messages).toEqual([]);
    expect(events.moderator).toEqual({
      enabled: false,
      attendance: "dormant",
      factoryBridge: { enabled: false, cursor: null },
    });
    expect(service.getLastRoomsError()).toBeNull();
    await expect(service.close()).resolves.toBeUndefined();
  });
});
