import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  Sha256DigestSchema,
  VerificationClaimsV1Schema,
  type GitObjectId,
  type IsoInstant,
  type NamespacedCode,
  type Sha256Digest,
  type ToolVersionV1,
  type VerificationClaimsV1,
} from "@app-factory/contracts";

const SAFE_ENVIRONMENT_NAMES = new Set([
  "DEVELOPER_DIR",
  "LANG",
  "LC_ALL",
  "PATH",
  "SDKROOT",
  "SWIFT_DETERMINISTIC_HASHING",
  "TMPDIR",
  "TZ",
]);
const MAX_ARGUMENTS = 64;
const MAX_ARGUMENT_BYTES = 64 * 1024;

export class TrustedVerificationError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TrustedVerificationError";
  }
}

export class TrustedVerificationCancelledError extends TrustedVerificationError {
  public constructor() {
    super("Trusted verification was cancelled");
    this.name = "TrustedVerificationCancelledError";
  }
}

class TrustedVerificationProcessGroupError extends TrustedVerificationError {
  public constructor() {
    super("Verifier process group did not terminate after SIGKILL");
    this.name = "TrustedVerificationProcessGroupError";
  }
}

export type TrustedVerificationPlan = Readonly<{
  checkId: string;
  checkoutDirectory: string;
  /** Derived by the coordinator from attempt + fence + checkout identity. */
  scratchDirectory: string;
  expectedTree: string;
  executable: string;
  args: readonly string[];
  environment: Readonly<Record<string, string>>;
  protectedFiles: Readonly<Record<string, string>>;
  timeoutMs: number;
  terminationGraceMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  toolVersions: readonly ToolVersionV1[];
}>;

export type TrustedVerificationRun = Readonly<{
  claims: VerificationClaimsV1;
  stdout: Buffer;
  stderr: Buffer;
  stdoutDigest: Sha256Digest;
  stderrDigest: Sha256Digest;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  protectedFilesUnchanged: boolean;
  checkoutCleanAfter: boolean;
}>;

type ProcessCapture = Readonly<{
  exitCode: number | null;
  stdout: Buffer;
  stderr: Buffer;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  cancelled: boolean;
}>;

export type TrustedVerificationRunOptions = Readonly<{
  now?: () => Date;
  signal?: AbortSignal;
}>;

function sha256(bytes: Uint8Array): Sha256Digest {
  return Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
}

function parsePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function canonicalDirectory(path: string): string {
  if (!isAbsolute(path) || resolve(path) !== path) {
    throw new TrustedVerificationError("Verification checkout must be a normalized absolute path");
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new TrustedVerificationError("Verification checkout must be a real directory");
  }
  return realpathSync(path);
}

type ScratchIdentity = Readonly<{ path: string; dev: number; ino: number }>;

function prepareScratchDirectory(path: string, checkoutRoot: string): ScratchIdentity {
  if (!isAbsolute(path) || resolve(path) !== path || path.includes("\0")) {
    throw new TrustedVerificationError(
      "Verification scratch directory must be a normalized absolute path",
    );
  }
  const relation = relative(checkoutRoot, path);
  if (relation === "" || (!relation.startsWith(`..${sep}`) && relation !== "..")) {
    throw new TrustedVerificationError("Verification scratch must be outside the checkout");
  }
  const parent = dirname(path);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const parentStats = lstatSync(parent);
  if (
    parentStats.isSymbolicLink() ||
    !parentStats.isDirectory() ||
    realpathSync(parent) !== parent ||
    (parentStats.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" && parentStats.uid !== process.getuid())
  ) {
    throw new TrustedVerificationError("Verification scratch parent is not private and owned");
  }
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    throw new TrustedVerificationError("Verification scratch identity already exists", {
      cause: error,
    });
  }
  chmodSync(path, 0o700);
  for (const child of ["home", "tmp", "swiftpm-build"]) {
    mkdirSync(join(path, child), { mode: 0o700 });
  }
  const stats = lstatSync(path);
  if (
    stats.isSymbolicLink() ||
    !stats.isDirectory() ||
    realpathSync(path) !== path ||
    (stats.mode & 0o077) !== 0 ||
    (typeof process.getuid === "function" && stats.uid !== process.getuid())
  ) {
    throw new TrustedVerificationError("Verification scratch is not private and owned");
  }
  return { path, dev: stats.dev, ino: stats.ino };
}

function cleanupScratchDirectory(identity: ScratchIdentity): void {
  const stats = lstatSync(identity.path);
  if (
    stats.isSymbolicLink() ||
    !stats.isDirectory() ||
    stats.dev !== identity.dev ||
    stats.ino !== identity.ino ||
    realpathSync(identity.path) !== identity.path
  ) {
    throw new TrustedVerificationError("Verification scratch changed identity before cleanup");
  }
  rmSync(identity.path, { recursive: true, force: false });
}

function canonicalExecutable(path: string): string {
  if (!isAbsolute(path)) {
    throw new TrustedVerificationError("Verification executable must be absolute");
  }
  const canonical = realpathSync(path);
  if (!lstatSync(canonical).isFile()) {
    throw new TrustedVerificationError("Verification executable must resolve to a regular file");
  }
  return canonical;
}

function git(checkout: string, args: readonly string[]): string {
  const result = spawnSync("/usr/bin/git", ["-C", checkout, ...args], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
    maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new TrustedVerificationError(
      `Git preflight failed: ${(result.stderr || result.stdout).trim()}`,
    );
  }
  return result.stdout.trim();
}

function assertInside(root: string, candidate: string, label: string): void {
  const child = relative(root, candidate);
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new TrustedVerificationError(`${label} escapes the verification checkout`);
  }
}

function fileDigest(root: string, path: string): Sha256Digest {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new TrustedVerificationError(`Protected path is not normalized: ${path}`);
  }
  const absolute = join(root, path);
  assertInside(root, resolve(absolute), `Protected path ${path}`);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new TrustedVerificationError(`Protected path is not a real file: ${path}`);
  }
  assertInside(root, realpathSync(absolute), `Protected path ${path}`);
  return sha256(readFileSync(absolute));
}

function verifyProtectedFiles(root: string, expected: Readonly<Record<string, string>>): boolean {
  for (const [path, expectedDigestInput] of Object.entries(expected)) {
    const expectedDigest = Sha256DigestSchema.parse(expectedDigestInput);
    if (fileDigest(root, path) !== expectedDigest) return false;
  }
  return true;
}

function assertCleanCheckout(root: string, expectedTree: GitObjectId): void {
  const branch = spawnSync("/usr/bin/git", ["-C", root, "symbolic-ref", "-q", "HEAD"], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (branch.status === 0) {
    throw new TrustedVerificationError("Verification checkout must use detached HEAD");
  }
  if (branch.status !== 1) {
    throw new TrustedVerificationError("Could not prove verification checkout is detached");
  }
  if (git(root, ["rev-parse", "HEAD^{tree}"]) !== expectedTree) {
    throw new TrustedVerificationError("Verification checkout tree does not match the candidate");
  }
  if (git(root, ["status", "--porcelain=v1", "--untracked-files=all"]) !== "") {
    throw new TrustedVerificationError("Verification checkout is not clean before the check");
  }
}

function checkoutIsClean(root: string, expectedTree: GitObjectId): boolean {
  try {
    return (
      git(root, ["rev-parse", "HEAD^{tree}"]) === expectedTree &&
      git(root, ["status", "--porcelain=v1", "--untracked-files=all"]) === ""
    );
  } catch {
    return false;
  }
}

function trustedEnvironment(
  input: Readonly<Record<string, string>>,
  scratchRoot: string,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { NO_COLOR: "1", TERM: "dumb" };
  for (const [name, value] of Object.entries(input)) {
    if (!SAFE_ENVIRONMENT_NAMES.has(name)) {
      throw new TrustedVerificationError(`Verification environment name is not allowed: ${name}`);
    }
    if (value.includes("\0")) {
      throw new TrustedVerificationError(`Verification environment value contains NUL: ${name}`);
    }
    environment[name] = value;
  }
  environment.HOME = join(scratchRoot, "home");
  environment.TMPDIR = join(scratchRoot, "tmp");
  environment.SWIFTPM_BUILD_DIR = join(scratchRoot, "swiftpm-build");
  return environment;
}

function validateArgs(args: readonly string[]): readonly string[] {
  if (args.length > MAX_ARGUMENTS) {
    throw new TrustedVerificationError(
      `Verification command exceeds ${String(MAX_ARGUMENTS)} arguments`,
    );
  }
  const byteLength = args.reduce((total, argument) => {
    if (argument.includes("\0")) throw new TrustedVerificationError("Argument contains NUL");
    return total + Buffer.byteLength(argument);
  }, 0);
  if (byteLength > MAX_ARGUMENT_BYTES) {
    throw new TrustedVerificationError("Verification arguments exceed the byte limit");
  }
  return [...args];
}

async function captureProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv,
  limits: Readonly<{
    timeoutMs: number;
    terminationGraceMs: number;
    maxStdoutBytes: number;
    maxStderrBytes: number;
  }>,
  cancellationSignal: AbortSignal,
): Promise<ProcessCapture> {
  if (cancellationSignal.aborted) throw new TrustedVerificationCancelledError();
  return await new Promise<ProcessCapture>((resolvePromise, rejectPromise) => {
    const child = spawn(executable, args, {
      cwd,
      env: environment,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let cancelled = false;
    let stopping = false;
    let finished = false;
    let killTimer: NodeJS.Timeout | undefined;
    let groupPollTimer: NodeJS.Timeout | undefined;
    let terminationDeadlineTimer: NodeJS.Timeout | undefined;
    let closeObserved = false;
    let observedExitCode: number | null = null;
    let groupExitDeadline: number | null = null;
    let unexpectedBackgroundProcesses = false;

    const signalGroup = (signal: NodeJS.Signals): void => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ESRCH") return;
        try {
          child.kill(signal);
        } catch {
          // The close/error boundary below remains authoritative.
        }
      }
    };
    const processGroupExists = (): boolean => {
      if (child.pid === undefined) return false;
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code !== "ESRCH";
      }
    };
    const finishClose = (): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (groupPollTimer !== undefined) clearTimeout(groupPollTimer);
      if (terminationDeadlineTimer !== undefined) clearTimeout(terminationDeadlineTimer);
      cancellationSignal.removeEventListener("abort", onAbort);
      resolvePromise({
        exitCode: observedExitCode,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        timedOut,
        outputLimitExceeded,
        cancelled,
      });
    };
    const failClose = (error: Error): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (groupPollTimer !== undefined) clearTimeout(groupPollTimer);
      if (terminationDeadlineTimer !== undefined) clearTimeout(terminationDeadlineTimer);
      cancellationSignal.removeEventListener("abort", onAbort);
      rejectPromise(error);
    };
    const settleStoppedClose = (): void => {
      if (finished) return;
      if (!closeObserved) {
        if (groupExitDeadline !== null && Date.now() >= groupExitDeadline) {
          child.stdout.destroy();
          child.stderr.destroy();
          failClose(new TrustedVerificationProcessGroupError());
          return;
        }
        groupPollTimer = setTimeout(settleStoppedClose, 5);
        groupPollTimer.unref();
        return;
      }
      if (!processGroupExists()) {
        if (unexpectedBackgroundProcesses) {
          failClose(
            new TrustedVerificationError("Trusted verification left background processes running"),
          );
        } else {
          finishClose();
        }
        return;
      }
      if (killTimer !== undefined) return;
      if (groupExitDeadline !== null && Date.now() >= groupExitDeadline) {
        failClose(new TrustedVerificationProcessGroupError());
        return;
      }
      groupPollTimer = setTimeout(settleStoppedClose, 5);
      groupPollTimer.unref();
    };
    const stop = (): void => {
      stopping = true;
      const deadlineDelay = Math.max(1_000, limits.terminationGraceMs * 2);
      groupExitDeadline ??= Date.now() + deadlineDelay;
      terminationDeadlineTimer ??= setTimeout(() => {
        if (finished) return;
        signalGroup("SIGKILL");
        settleStoppedClose();
      }, deadlineDelay);
      signalGroup("SIGTERM");
      killTimer ??= setTimeout(() => {
        killTimer = undefined;
        signalGroup("SIGKILL");
        settleStoppedClose();
      }, limits.terminationGraceMs);
      killTimer.unref();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      stop();
    }, limits.timeoutMs);
    timeout.unref();
    const onAbort = (): void => {
      cancelled = true;
      stop();
    };
    cancellationSignal.addEventListener("abort", onAbort, { once: true });

    const collect = (target: Buffer[], chunk: Buffer, stream: "stdout" | "stderr"): void => {
      if (stream === "stdout") stdoutBytes += chunk.byteLength;
      else stderrBytes += chunk.byteLength;
      const maximum = stream === "stdout" ? limits.maxStdoutBytes : limits.maxStderrBytes;
      const current = stream === "stdout" ? stdoutBytes : stderrBytes;
      if (current <= maximum) target.push(chunk);
      if (current > maximum && !outputLimitExceeded) {
        outputLimitExceeded = true;
        stop();
      }
    };

    child.stdout.on("data", (chunk: Buffer) => collect(stdout, chunk, "stdout"));
    child.stderr.on("data", (chunk: Buffer) => collect(stderr, chunk, "stderr"));
    child.once("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (killTimer !== undefined) clearTimeout(killTimer);
      if (groupPollTimer !== undefined) clearTimeout(groupPollTimer);
      if (terminationDeadlineTimer !== undefined) clearTimeout(terminationDeadlineTimer);
      cancellationSignal.removeEventListener("abort", onAbort);
      rejectPromise(cancelled ? new TrustedVerificationCancelledError() : error);
    });
    child.once("close", (exitCode) => {
      if (finished) return;
      closeObserved = true;
      observedExitCode = exitCode;
      if (stopping) {
        settleStoppedClose();
      } else if (processGroupExists()) {
        unexpectedBackgroundProcesses = true;
        stop();
        settleStoppedClose();
      } else {
        finishClose();
      }
    });
    if (cancellationSignal.aborted) onAbort();
  });
}

export async function runTrustedVerification(
  planInput: TrustedVerificationPlan,
  optionsInput: TrustedVerificationRunOptions | (() => Date) = {},
): Promise<TrustedVerificationRun> {
  const options: TrustedVerificationRunOptions =
    typeof optionsInput === "function" ? { now: optionsInput } : optionsInput;
  const now = options.now ?? (() => new Date());
  const cancellationSignal = options.signal ?? new AbortController().signal;
  if (cancellationSignal.aborted) throw new TrustedVerificationCancelledError();
  const checkId: NamespacedCode = NamespacedCodeSchema.parse(planInput.checkId);
  const root = canonicalDirectory(planInput.checkoutDirectory);
  const expectedTree = GitObjectIdSchema.parse(planInput.expectedTree);
  const executable = canonicalExecutable(planInput.executable);
  const args = validateArgs(planInput.args);
  const limits = {
    timeoutMs: parsePositiveInteger(planInput.timeoutMs, "timeoutMs"),
    terminationGraceMs: parsePositiveInteger(planInput.terminationGraceMs, "terminationGraceMs"),
    maxStdoutBytes: parsePositiveInteger(planInput.maxStdoutBytes, "maxStdoutBytes"),
    maxStderrBytes: parsePositiveInteger(planInput.maxStderrBytes, "maxStderrBytes"),
  };

  assertCleanCheckout(root, expectedTree);
  if (!verifyProtectedFiles(root, planInput.protectedFiles)) {
    throw new TrustedVerificationError("Protected-file digest is wrong before verification");
  }

  const scratch = prepareScratchDirectory(planInput.scratchDirectory, root);
  const startedAt: IsoInstant = IsoInstantSchema.parse(now().toISOString());
  let capture: ProcessCapture;
  let scratchCanBeCleaned = true;
  try {
    const environment = trustedEnvironment(planInput.environment, scratch.path);
    capture = await captureProcess(executable, args, root, environment, limits, cancellationSignal);
  } catch (error) {
    if (error instanceof TrustedVerificationProcessGroupError) scratchCanBeCleaned = false;
    throw error;
  } finally {
    if (scratchCanBeCleaned) cleanupScratchDirectory(scratch);
  }
  if (capture.cancelled) throw new TrustedVerificationCancelledError();
  const finishedAt: IsoInstant = IsoInstantSchema.parse(now().toISOString());
  const protectedFilesUnchanged = verifyProtectedFiles(root, planInput.protectedFiles);
  const checkoutCleanAfter = checkoutIsClean(root, expectedTree);
  const passed =
    capture.exitCode === 0 &&
    !capture.timedOut &&
    !capture.outputLimitExceeded &&
    protectedFilesUnchanged &&
    checkoutCleanAfter;
  const exitCode = passed ? 0 : Math.min(255, Math.max(1, capture.exitCode ?? 1));
  const claims = VerificationClaimsV1Schema.parse({
    checkId,
    argv: [executable, ...args],
    checkoutTree: expectedTree,
    startedAt,
    finishedAt,
    toolVersions: [...planInput.toolVersions],
    passed,
    exitCode,
  });

  return {
    claims,
    stdout: capture.stdout,
    stderr: capture.stderr,
    stdoutDigest: sha256(capture.stdout),
    stderrDigest: sha256(capture.stderr),
    timedOut: capture.timedOut,
    outputLimitExceeded: capture.outputLimitExceeded,
    protectedFilesUnchanged,
    checkoutCleanAfter,
  };
}
