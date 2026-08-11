import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";

import { Sha256DigestSchema } from "@app-factory/contracts";
import type {
  SchedulerClockPort,
  SchedulerExecutionContext,
  SchedulerStepExecutorPort,
  SchedulerTickResult,
} from "@app-factory/scheduler";

import {
  CommandHandlerError,
  type CommandHandler,
  type CommandHandlerContext,
  startUnixCommandServer,
} from "./unix-command-server.js";
import {
  openDaemonCommandRuntime,
  resolveDaemonRuntimePaths,
  type DaemonCommandRuntime,
  type OpenDaemonCommandRuntimeOptions,
} from "./command-runtime.js";
import {
  createKernelSchedulerController,
  type KernelSchedulerController,
} from "./kernel-scheduler-adapter.js";
import {
  VerifiedLocalExecutionExecutor,
  resolveVerifiedLocalExecutionPaths,
  type VerifiedLocalExecutionConfiguration,
  type VerifiedLocalExecutionPaths,
} from "./verified-local-executor.js";

const COMMAND_SOCKET_FILE_NAME = "daemon.sock";
const DEFAULT_POLL_INTERVAL_MS = 100;
const MAX_POLL_INTERVAL_MS = 60_000;

/**
 * Injectable loop timing. Implementations should release their own resources
 * when aborted; daemon shutdown itself does not depend on that cooperation.
 */
export type DaemonLoopWait = (delayMs: number, signal: AbortSignal) => Promise<void>;

export type DeterministicFakeExecutorOptions = Readonly<{
  delayMs?: number;
  wait?: DaemonLoopWait;
}>;

export type StartFactoryDaemonServiceOptions = Readonly<{
  runtimeDirectory: string;
  authorization: string;
  daemonVersion: string;
  ownerId?: string;
  startedAt?: string;
  now?: () => string;
  schedulerClock?: SchedulerClockPort;
  executor?: SchedulerStepExecutorPort;
  /**
   * Explicit local-only real execution. Omitted by default; it is mutually
   * exclusive with a directly injected executor.
   */
  localExecution?: VerifiedLocalExecutionConfiguration;
  leaseDurationMs?: number;
  pollIntervalMs?: number;
  wait?: DaemonLoopWait;
  /** Disable event-driven wakeups for polling-only diagnostics and deterministic harnesses. */
  wakeOnCommand?: boolean;
  commandResultLedgerBoundary?: OpenDaemonCommandRuntimeOptions["commandResultLedgerBoundary"];
  onSchedulerError?: (error: unknown) => void;
}>;

export type FactoryDaemonService = Readonly<{
  runtimeDirectory: string;
  socketPath: string;
  executionPaths: VerifiedLocalExecutionPaths;
  startedAt: string;
  getLastSchedulerError(): unknown | null;
  close(): Promise<void>;
}>;

function validateDelay(label: string, value: number, maximum = MAX_POLL_INTERVAL_MS): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new TypeError(`${label} must be a safe integer between 0 and ${String(maximum)}`);
  }
  return value;
}

async function defaultWait(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(finish, delayMs);
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
    signal.addEventListener("abort", finish, { once: true });
  });
}

async function interruptibleWait(
  wait: DaemonLoopWait,
  delayMs: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return;
  let resolveAborted: (() => void) | undefined;
  const aborted = new Promise<Readonly<{ kind: "aborted" }>>((resolve) => {
    resolveAborted = () => resolve({ kind: "aborted" });
  });
  const onAbort = () => resolveAborted?.();
  signal.addEventListener("abort", onAbort, { once: true });
  const waited: Promise<
    Readonly<{ kind: "completed" }> | Readonly<{ kind: "failed"; error: unknown }>
  > = Promise.resolve()
    .then(async () => await wait(delayMs, signal))
    .then(() => ({ kind: "completed" as const }))
    .catch((error: unknown) => ({ kind: "failed" as const, error }));
  const result = await Promise.race([aborted, waited]).finally(() => {
    signal.removeEventListener("abort", onAbort);
  });
  if (result.kind === "failed") throw result.error;
}

function abortedExecution(): Error {
  const error = new Error("The deterministic fake execution was aborted.");
  error.name = "AbortError";
  return error;
}

/**
 * Week-2 executor used by the local vertical slice. It has no external effects:
 * each successful output is a stable digest of the scheduler's idempotency key.
 */
export class DeterministicFakeExecutor implements SchedulerStepExecutorPort {
  readonly #delayMs: number;
  readonly #wait: DaemonLoopWait;

  public constructor(options: DeterministicFakeExecutorOptions = {}) {
    this.#delayMs = validateDelay("delayMs", options.delayMs ?? 0);
    this.#wait = options.wait ?? defaultWait;
  }

  public async execute(context: SchedulerExecutionContext) {
    if (context.signal.aborted) throw abortedExecution();
    await context.assertActive();
    if (this.#delayMs > 0) await this.#wait(this.#delayMs, context.signal);
    if (context.signal.aborted) throw abortedExecution();
    await context.assertActive();
    return {
      kind: "succeeded" as const,
      outputDigest: Sha256DigestSchema.parse(
        `sha256:${createHash("sha256")
          .update(`app-factory.fake-executor.v1\0${context.effectKey}`)
          .digest("hex")}`,
      ),
    };
  }
}

function shouldDrain(result: SchedulerTickResult): boolean {
  return (
    result.kind === "paused" ||
    result.kind === "cancelled" ||
    result.kind === "succeeded" ||
    result.kind === "blocked" ||
    result.kind === "failed"
  );
}

class BackgroundSchedulerLoop {
  readonly #controller: KernelSchedulerController;
  readonly #pollIntervalMs: number;
  readonly #wait: DaemonLoopWait;
  readonly #onError: ((error: unknown) => void) | undefined;
  #stopping = false;
  #wakePending = false;
  #waitAbort: AbortController | null = null;
  #runPromise: Promise<void> | null = null;
  #lastError: unknown | null = null;

  public constructor(
    controller: KernelSchedulerController,
    options: Readonly<{
      pollIntervalMs: number;
      wait: DaemonLoopWait;
      onError?: (error: unknown) => void;
    }>,
  ) {
    this.#controller = controller;
    this.#pollIntervalMs = options.pollIntervalMs;
    this.#wait = options.wait;
    this.#onError = options.onError;
  }

  public get lastError(): unknown | null {
    return this.#lastError;
  }

  public start(): void {
    if (this.#runPromise !== null) return;
    this.#runPromise = this.#run();
  }

  public wake(): void {
    if (this.#stopping) return;
    this.#wakePending = true;
    this.#waitAbort?.abort();
  }

  public requestStop(): void {
    this.#stopping = true;
    this.#waitAbort?.abort();
  }

  public async stopped(): Promise<void> {
    await this.#runPromise;
  }

  #recordError(error: unknown): void {
    this.#lastError = error;
    try {
      this.#onError?.(error);
    } catch (observerError) {
      this.#lastError = new AggregateError(
        [error, observerError],
        "The scheduler and its error observer both failed",
      );
    }
  }

  async #run(): Promise<void> {
    while (!this.#stopping) {
      this.#wakePending = false;
      let result: SchedulerTickResult | null = null;
      try {
        result = await this.#controller.tick();
        this.#lastError = null;
      } catch (error) {
        this.#recordError(error);
      }
      if (this.#stopping) return;
      if (result !== null && shouldDrain(result)) continue;
      if (this.#wakePending) continue;

      const waitAbort = new AbortController();
      this.#waitAbort = waitAbort;
      try {
        await interruptibleWait(this.#wait, this.#pollIntervalMs, waitAbort.signal);
      } catch (error) {
        if (!waitAbort.signal.aborted) {
          this.#recordError(error);
        }
      } finally {
        if (this.#waitAbort === waitAbort) this.#waitAbort = null;
      }
    }
  }
}

function shouldWakeScheduler(operation: string): boolean {
  return (
    operation === "task.submit" ||
    operation === "task.run" ||
    operation === "attempt.pause" ||
    operation === "attempt.resume" ||
    operation === "attempt.cancel" ||
    operation === "daemon.reconcile"
  );
}

function closingError(): CommandHandlerError {
  return new CommandHandlerError(
    "daemon.shutting-down",
    "The daemon is shutting down and is no longer accepting commands.",
    true,
  );
}

function startingError(): CommandHandlerError {
  return new CommandHandlerError(
    "daemon.starting",
    "The daemon has acquired ownership but has not finished starting.",
    true,
  );
}

/**
 * Owns the command socket, the one SQLite connection, and the scheduler loop.
 * Socket ownership is acquired first, so a losing daemon never opens SQLite.
 */
export async function startFactoryDaemonService(
  options: StartFactoryDaemonServiceOptions,
): Promise<FactoryDaemonService> {
  if (options.executor !== undefined && options.localExecution !== undefined) {
    throw new TypeError("executor and localExecution are mutually exclusive");
  }
  const paths = resolveDaemonRuntimePaths(options.runtimeDirectory);
  const executionPaths = resolveVerifiedLocalExecutionPaths(paths.root);
  const socketPath = join(paths.root, COMMAND_SOCKET_FILE_NAME);
  const pollIntervalMs = validateDelay(
    "pollIntervalMs",
    options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  );
  if (pollIntervalMs === 0) {
    throw new TypeError("pollIntervalMs must be greater than zero");
  }
  const wait = options.wait ?? defaultWait;
  const ownerId = options.ownerId ?? `daemon.${randomUUID()}`;

  let runtime: DaemonCommandRuntime | null = null;
  const schedulerState: { controller: KernelSchedulerController | null } = {
    controller: null,
  };
  let loop: BackgroundSchedulerLoop | null = null;
  let closing = false;

  const handler: CommandHandler = async (request, context: CommandHandlerContext) => {
    if (closing) throw closingError();
    const activeRuntime = runtime;
    if (activeRuntime === null) throw startingError();
    try {
      const result = await activeRuntime.handler(request, context);
      if (
        request.operation !== "attempt.cancel" &&
        options.wakeOnCommand !== false &&
        shouldWakeScheduler(request.operation)
      ) {
        // activeRuntime.handler returns mutating command results only after
        // their durable result-ledger entry is published. In particular,
        // daemon.reconcile never executes a scheduler tick on the command
        // stack; this transient wake happens strictly after durable linkage.
        loop?.wake();
      }
      return result;
    } finally {
      if (request.operation === "attempt.cancel") {
        let cancellationPersisted = false;
        try {
          cancellationPersisted =
            schedulerState.controller?.interruptActiveCancellation(request.payload.attemptId) ??
            false;
        } catch {
          // Preserve the command result/error. The polling loop remains a
          // fail-safe if authoritative cancellation state cannot be read here.
        }
        if (cancellationPersisted && options.wakeOnCommand !== false) loop?.wake();
      }
    }
  };

  const server = await startUnixCommandServer({
    socketPath,
    authorization: options.authorization,
    handler,
  });

  try {
    runtime = await openDaemonCommandRuntime({
      runtimeDirectory: paths.root,
      daemonVersion: options.daemonVersion,
      ...(options.startedAt === undefined ? {} : { startedAt: options.startedAt }),
      ...(options.now === undefined ? {} : { now: options.now }),
      ...(options.commandResultLedgerBoundary === undefined
        ? {}
        : { commandResultLedgerBoundary: options.commandResultLedgerBoundary }),
      initializeDatabase: (database) => {
        const executor =
          options.executor ??
          (options.localExecution === undefined
            ? new DeterministicFakeExecutor()
            : new VerifiedLocalExecutionExecutor({
                ...options.localExecution,
                database,
                ownerId,
                runtimeDirectory: paths.root,
              }));
        schedulerState.controller = createKernelSchedulerController({
          database,
          ownerId,
          executor,
          ...(options.schedulerClock === undefined ? {} : { clock: options.schedulerClock }),
          ...(options.leaseDurationMs === undefined
            ? {}
            : { leaseDurationMs: options.leaseDurationMs }),
        });
      },
    });
    const activeController = schedulerState.controller;
    if (activeController === null) {
      throw new Error("The daemon runtime did not initialize its scheduler controller");
    }
    loop = new BackgroundSchedulerLoop(activeController, {
      pollIntervalMs,
      wait,
      ...(options.onSchedulerError === undefined ? {} : { onError: options.onSchedulerError }),
    });
    loop.start();
  } catch (error) {
    await schedulerState.controller?.stop().catch(() => undefined);
    runtime?.close();
    await server.close().catch(() => undefined);
    throw error;
  }

  const activeRuntime = runtime;
  const activeController = schedulerState.controller;
  const activeLoop = loop;
  if (activeRuntime === null || activeController === null || activeLoop === null) {
    throw new Error("The daemon composition finished without all owned components");
  }
  let closePromise: Promise<void> | null = null;

  return {
    runtimeDirectory: paths.root,
    socketPath,
    executionPaths,
    startedAt: activeRuntime.startedAt,
    getLastSchedulerError: () => activeLoop.lastError,
    close: async () => {
      if (closePromise !== null) return await closePromise;
      closing = true;
      activeLoop.requestStop();
      closePromise = (async () => {
        const serverClose = server.close();
        const results = await Promise.allSettled([
          serverClose,
          activeController.stop(),
          activeLoop.stopped(),
        ]);
        activeRuntime.close();
        const failures = results
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => result.reason);
        if (failures.length > 0) {
          throw new AggregateError(failures, "The daemon did not shut down cleanly");
        }
      })();
      return await closePromise;
    },
  };
}
