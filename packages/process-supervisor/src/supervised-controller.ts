import { closeSync, fsyncSync, readFileSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

import {
  parseSupervisedRunReceipt,
  type SupervisedRunOutputV1,
  type SupervisedRunReceiptV1,
} from "./supervised-model.js";
import {
  assertSupervisedRunExecutionAuthorized,
  loadClaimedSupervisedRunForController,
  publishSupervisedRunExecutionPermission,
  publishSupervisedRunGateRelease,
  readBoundSupervisedRunCancellation,
  type PreparedSupervisedRun,
} from "./supervised-run.js";
import {
  createPrivateFileExclusive,
  openPrivateFileExclusiveForWrite,
} from "./secure-artifacts.js";
import { writeSupervisorStateFile, removeSupervisorStateFile } from "./state-file.js";
import { createSystemPlatformProbe, type PlatformProcessProbe } from "./platform.js";
import { launchProcessGroup, terminateProcessGroup, type SupervisorClock } from "./supervisor.js";
import {
  parseSupervisorIdentityV2,
  SUPERVISOR_IDENTITY_SCHEMA_VERSION_V2,
  type SupervisorIdentityV2,
} from "./model.js";

const CONTROL_FILE_DESCRIPTOR = 3;
const EXECUTION_PERMISSION = Buffer.from("EXEC\n", "utf8");

const SYSTEM_CLOCK: SupervisorClock = {
  now: () => performance.now(),
  wallClock: () => new Date(),
  sleep: async (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
};

type ExitResult = Readonly<{ exitCode: number | null; signal: NodeJS.Signals | null }>;

class BoundedSpool {
  readonly #descriptor: number;
  readonly #maximumBytes: number;
  readonly #hash = createHash("sha256");
  #capturedByteLength = 0;
  #observedByteLength = 0;
  #finished = false;

  public constructor(path: string, maximumBytes: number) {
    this.#descriptor = openPrivateFileExclusiveForWrite(path);
    this.#maximumBytes = maximumBytes;
  }

  public accept(chunk: Buffer): boolean {
    if (this.#finished) throw new Error("Cannot write a finished supervised output spool");
    this.#observedByteLength += chunk.byteLength;
    if (!Number.isSafeInteger(this.#observedByteLength)) {
      throw new Error("Observed supervised output length exceeded the safe integer range");
    }
    const remaining = this.#maximumBytes - this.#capturedByteLength;
    const captured = remaining <= 0 ? Buffer.alloc(0) : chunk.subarray(0, remaining);
    if (captured.byteLength > 0) {
      let offset = 0;
      while (offset < captured.byteLength) {
        const written = writeSync(this.#descriptor, captured, offset, captured.byteLength - offset);
        if (written <= 0) throw new Error("Supervised output spool write made no progress");
        offset += written;
      }
      this.#hash.update(captured);
      this.#capturedByteLength += captured.byteLength;
    }
    return chunk.byteLength > remaining;
  }

  public finish(): SupervisedRunOutputV1 {
    if (this.#finished) throw new Error("Supervised output spool was already finished");
    this.#finished = true;
    fsyncSync(this.#descriptor);
    closeSync(this.#descriptor);
    return {
      capturedByteLength: this.#capturedByteLength,
      observedByteLength: this.#observedByteLength,
      sha256: `sha256:${this.#hash.digest("hex")}`,
      truncated: this.#observedByteLength > this.#capturedByteLength,
    };
  }
}

function asReadable(stream: ChildProcess["stdout"], label: string): Readable {
  if (stream === null) throw new Error(`${label} pipe was not created`);
  return stream;
}

function asWritable(
  stream: ChildProcess["stdin"] | ChildProcess["stdio"][number],
  label: string,
): Writable {
  if (stream === null || typeof (stream as Writable).end !== "function") {
    throw new Error(`${label} pipe was not created`);
  }
  return stream as Writable;
}

function exitPromise(child: ChildProcess): Promise<ExitResult> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => resolve({ exitCode, signal }));
  });
}

function closePromise(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve());
  });
}

function endWritable(stream: Writable, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      stream.off("error", onError);
      reject(error);
    };
    stream.once("error", onError);
    stream.end(bytes, () => {
      stream.off("error", onError);
      resolve();
    });
  });
}

function parseCanonicalCancellation(
  prepared: PreparedSupervisedRun,
  identity: SupervisorIdentityV2,
): boolean {
  return readBoundSupervisedRunCancellation(prepared, identity) !== null;
}

function classifyOutcome(
  origin: SupervisedRunReceiptV1["terminationOrigin"],
  exit: ExitResult,
): SupervisedRunReceiptV1["outcome"] {
  if (origin === "timeout") return "timed-out";
  if (origin === "output-overflow") return "output-overflow";
  if (origin === "cancellation") return "cancelled";
  return exit.exitCode === 0 ? "succeeded" : "failed";
}

async function proveGroupEmptyAfterLeaderExit(
  identity: SupervisorIdentityV2,
  probe: PlatformProcessProbe,
  clock: SupervisorClock,
  pollMs: number,
): Promise<boolean> {
  const deadline = clock.now() + Math.max(250, pollMs * 4);
  do {
    const group = probe.inspectProcessGroup(identity.processGroupId);
    if (group.kind === "missing") return true;
    if (group.kind === "unprovable") return false;
    await clock.sleep(Math.min(pollMs, Math.max(0, deadline - clock.now())));
  } while (clock.now() < deadline);
  return probe.inspectProcessGroup(identity.processGroupId).kind === "missing";
}

export type SupervisedControllerDependencies = Readonly<{
  probe?: PlatformProcessProbe;
  clock?: SupervisorClock;
  entrypointPath?: string;
}>;

/**
 * Detached controller. It is deliberately outside the target process group. The target gate is
 * unable to exec until this function has fsynced its probed identity to the V2 state artifact.
 */
export async function runSupervisedController(
  intentPath: string,
  dependencies: SupervisedControllerDependencies = {},
): Promise<void> {
  const prepared = loadClaimedSupervisedRunForController(intentPath);
  const { intent, paths } = prepared;
  const probe = dependencies.probe ?? createSystemPlatformProbe();
  const clock = dependencies.clock ?? SYSTEM_CLOCK;
  const entrypointPath =
    dependencies.entrypointPath ??
    fileURLToPath(new URL("./supervised-entrypoint.js", import.meta.url));
  const controllerStartedAt = clock.wallClock().toISOString();

  const controllerObservation = probe.inspectProcess(process.pid);
  if (
    controllerObservation.kind !== "live" ||
    controllerObservation.processGroupId !== process.pid
  ) {
    throw new Error("Detached controller identity could not be proven as its process-group leader");
  }
  const controllerIdentity = parseSupervisorIdentityV2({
    schemaVersion: SUPERVISOR_IDENTITY_SCHEMA_VERSION_V2,
    attemptId: intent.attemptId,
    fence: intent.fence,
    pid: process.pid,
    processStartIdentity: controllerObservation.processStartIdentity,
    bootIdentity: probe.currentBootIdentity(),
    processGroupId: controllerObservation.processGroupId,
    primaryChild: null,
    launchedAt: controllerStartedAt,
  });
  writeSupervisorStateFile(paths.controllerStatePath, controllerIdentity, null);

  const stdoutSpool = new BoundedSpool(paths.stdoutPath, intent.limits.maxOutputBytesPerStream);
  const stderrSpool = new BoundedSpool(paths.stderrPath, intent.limits.maxOutputBytesPerStream);
  const launched = await launchProcessGroup(
    {
      attemptId: intent.attemptId,
      fence: intent.fence,
      executable: process.execPath,
      args: [entrypointPath, "gate", intentPath],
      cwd: paths.runDirectory,
      environment: {},
      stdio: ["pipe", "pipe", "pipe", "pipe"],
      identityTimeoutMs: 5_000,
      identityPollMs: intent.limits.pollMs,
    },
    probe,
    clock,
  );
  const { child, identity } = launched;
  if (controllerIdentity.processGroupId === identity.processGroupId) {
    child.kill("SIGKILL");
    throw new Error("Controller unexpectedly joined the target process group");
  }
  const stdout = asReadable(child.stdout, "stdout");
  const stderr = asReadable(child.stderr, "stderr");
  const stdin = asWritable(child.stdin, "stdin");
  const control = asWritable(child.stdio[CONTROL_FILE_DESCRIPTOR], "control");
  const exited = exitPromise(child);
  const closed = closePromise(child);

  let terminationOrigin: SupervisedRunReceiptV1["terminationOrigin"] | null = null;
  let terminationStarted = false;
  let exitObserved = false;
  let reportTerminationFailure!: (reason: string) => void;
  const terminationFailure = new Promise<string>((resolve) => {
    reportTerminationFailure = resolve;
  });
  const beginTermination = (
    origin: Exclude<SupervisedRunReceiptV1["terminationOrigin"], "natural" | "external">,
  ): void => {
    if (terminationStarted) return;
    terminationStarted = true;
    terminationOrigin = origin;
    void (async () => {
      try {
        const result = await terminateProcessGroup(
          identity,
          probe,
          {
            graceMs: intent.limits.graceMs,
            forceWaitMs: intent.limits.forceWaitMs,
            pollMs: intent.limits.pollMs,
          },
          clock,
        );
        if (result.outcome === "blocked" || result.outcome === "timed-out") {
          reportTerminationFailure(`identity-safe-termination-${result.outcome}`);
          return;
        }
        await clock.sleep(Math.max(250, intent.limits.pollMs * 4));
        if (!exitObserved) {
          reportTerminationFailure("target-exit-was-not-observed-after-termination");
        }
      } catch (error) {
        reportTerminationFailure(`identity-safe-termination-error:${(error as Error).message}`);
      }
    })();
  };
  stdout.on("data", (chunk: Buffer) => {
    if (stdoutSpool.accept(chunk)) beginTermination("output-overflow");
  });
  stderr.on("data", (chunk: Buffer) => {
    if (stderrSpool.accept(chunk)) beginTermination("output-overflow");
  });

  // CAS publication and fsync complete before either target stdin or execution permission is sent.
  writeSupervisorStateFile(paths.statePath, identity, null);
  const targetRegisteredAt = clock.wallClock().toISOString();
  const permittedAt = clock.wallClock().toISOString();
  // This immutable authorization is fsynced before the gate can possibly exec.
  publishSupervisedRunExecutionPermission(prepared, identity, permittedAt);
  await endWritable(control, EXECUTION_PERMISSION);
  // The gate does not consume fd 0, so sending a large stdin before permission could fill the pipe
  // and deadlock registration. Delivery begins only after exec permission, and receipt publication
  // still requires the complete bound stdin to have been accepted by the target pipe.
  const stdinDelivered = endWritable(stdin, Buffer.from(intent.stdin.base64, "base64")).then(
    () => {
      // The externally visible registration boundary includes complete stdin acceptance. This
      // prevents an immediate cancellation from racing the bound input into a false receipt.
      publishSupervisedRunGateRelease(prepared, identity, clock.wallClock().toISOString());
      return true;
    },
    () => false,
  );

  const timeout = setTimeout(() => beginTermination("timeout"), intent.limits.timeoutMs);
  const cancellationPoll = setInterval(() => {
    try {
      if (parseCanonicalCancellation(prepared, identity)) beginTermination("cancellation");
    } catch {
      // A malformed or mismatched cancellation is never authority to signal. Startup inspection
      // exposes the artifact error; the controller continues the already-authorized target.
    }
  }, intent.limits.pollMs);

  const targetSettlement = await Promise.race([
    exited.then((exit) => ({ kind: "exit" as const, exit })),
    terminationFailure.then((reason) => ({ kind: "termination-failure" as const, reason })),
  ]);
  clearTimeout(timeout);
  clearInterval(cancellationPoll);
  if (targetSettlement.kind === "termination-failure") {
    stdout.destroy();
    stderr.destroy();
    stdoutSpool.finish();
    stderrSpool.finish();
    // The target may still be live. Its state is intentionally retained for startup recovery.
    throw new Error(targetSettlement.reason);
  }
  exitObserved = true;
  const exit = targetSettlement.exit;
  if (terminationOrigin === null) {
    terminationOrigin = parseCanonicalCancellation(prepared, identity)
      ? "cancellation"
      : exit.signal === null
        ? "natural"
        : "external";
  }

  if (!(await proveGroupEmptyAfterLeaderExit(identity, probe, clock, intent.limits.pollMs))) {
    stdout.destroy();
    stderr.destroy();
    stdoutSpool.finish();
    stderrSpool.finish();
    // No receipt and no state removal: an unproven descendant group is a durable blocker.
    throw new Error("Target leader exited but its process group could not be proven empty");
  }

  const streamsDrained = await Promise.race([
    closed.then(() => true),
    clock.sleep(Math.max(1_000, intent.limits.pollMs * 8)).then(() => false),
  ]);
  if (!streamsDrained) {
    stdout.destroy();
    stderr.destroy();
    stdoutSpool.finish();
    stderrSpool.finish();
    throw new Error("Target streams did not close after its process group exited");
  }
  const stdinDeliveryComplete = await Promise.race([
    stdinDelivered,
    clock.sleep(Math.max(1_000, intent.limits.pollMs * 8)).then(() => false),
  ]);
  if (!stdinDeliveryComplete) {
    stdoutSpool.finish();
    stderrSpool.finish();
    throw new Error("Target stdin was not delivered completely; terminal receipt is withheld");
  }
  const stdoutResult = stdoutSpool.finish();
  const stderrResult = stderrSpool.finish();
  const finishedAt = clock.wallClock().toISOString();
  const receipt = parseSupervisedRunReceipt({
    schemaVersion: 1,
    runKey: intent.runKey,
    attemptId: intent.attemptId,
    fence: intent.fence,
    intentDigest: prepared.intentDigest,
    invocationDigest: intent.invocationDigest,
    controllerStartedAt,
    targetRegisteredAt,
    permittedAt,
    finishedAt,
    identity,
    process: { exitCode: exit.exitCode, signal: exit.signal },
    terminationOrigin,
    outcome: classifyOutcome(terminationOrigin, exit),
    stdout: stdoutResult,
    stderr: stderrResult,
  });
  createPrivateFileExclusive(
    paths.receiptPath,
    Buffer.from(`${JSON.stringify(receipt)}\n`, "utf8"),
  );
  // Receipt and spools are durable before exact-record cleanup is attempted.
  removeSupervisorStateFile(paths.statePath, identity);
  removeSupervisorStateFile(paths.controllerStatePath, controllerIdentity);
}

export type SupervisedGateDependencies = Readonly<{
  controlFileDescriptor?: number;
  execve?: (file: string, args: string[], env: Record<string, string>) => never;
  authorize?: (prepared: PreparedSupervisedRun) => void;
}>;

/** Returns without exec when the controller closes the control channel or sends anything else. */
export function runSupervisedTargetGate(
  intentPath: string,
  dependencies: SupervisedGateDependencies = {},
): "permission-eof" {
  const prepared = loadClaimedSupervisedRunForController(intentPath);
  const controlFileDescriptor = dependencies.controlFileDescriptor ?? CONTROL_FILE_DESCRIPTOR;
  const permission = readFileSync(controlFileDescriptor);
  closeSync(controlFileDescriptor);
  if (!permission.equals(EXECUTION_PERMISSION)) return "permission-eof";
  if (dependencies.authorize === undefined) {
    assertSupervisedRunExecutionAuthorized(prepared, process.pid);
  } else {
    dependencies.authorize(prepared);
  }
  const environment = Object.fromEntries(
    prepared.intent.environment.map(({ name, value }) => [name, value]),
  );
  const execve = dependencies.execve ?? process.execve;
  if (execve === undefined) {
    throw new Error("Pinned Node runtime does not expose process.execve");
  }
  execve(
    prepared.intent.executable,
    [prepared.intent.executable, ...prepared.intent.argv],
    environment,
  );
  throw new Error("process.execve unexpectedly returned");
}
