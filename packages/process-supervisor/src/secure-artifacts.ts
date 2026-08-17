import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  type Stats,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, join, normalize, parse, relative, sep } from "node:path";

export const PRIVATE_DIRECTORY_MODE = 0o700;
export const PRIVATE_FILE_MODE = 0o600;

function openFlags(...flags: number[]): number {
  return flags.reduce((combined, flag) => combined | flag, 0);
}

export function assertNormalizedAbsolutePath(value: string, label: string): void {
  if (!isAbsolute(value) || normalize(value) !== value || value.includes("\0")) {
    throw new TypeError(`${label} must be a normalized absolute path`);
  }
}

function assertOwnedByCurrentUser(stats: Stats, label: string): void {
  const currentUserId = process.getuid?.();
  if (currentUserId !== undefined && stats.uid !== currentUserId) {
    throw new Error(`${label} is not owned by the current user`);
  }
}

export function assertNoSymbolicLinkAncestors(
  directoryPath: string,
  allowMissingTail: boolean,
): void {
  assertNormalizedAbsolutePath(directoryPath, "Private directory path");
  const root = parse(directoryPath).root;
  let currentPath = root;
  for (const component of relative(root, directoryPath).split(sep).filter(Boolean)) {
    currentPath = join(currentPath, component);
    let stats: Stats;
    try {
      stats = lstatSync(currentPath);
    } catch (error) {
      if (allowMissingTail && (error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`Private path must not traverse a symbolic-link ancestor: ${currentPath}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`Private path ancestor must be a directory: ${currentPath}`);
    }
  }
}

export function assertPrivateExistingDirectory(directoryPath: string): void {
  assertNoSymbolicLinkAncestors(directoryPath, false);
  const stats = lstatSync(directoryPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Private path must be a real directory: ${directoryPath}`);
  }
  assertOwnedByCurrentUser(stats, "Private directory");
  if ((stats.mode & 0o077) !== 0) {
    throw new Error(`Private directory permissions must be 0700 or stricter: ${directoryPath}`);
  }
}

export function ensurePrivateDirectory(directoryPath: string): void {
  assertNoSymbolicLinkAncestors(directoryPath, true);
  mkdirSync(directoryPath, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  assertPrivateExistingDirectory(directoryPath);
}

// createPrivateFileExclusive below publishes an artifact by hard-linking a private, fully
// written temporary sibling into place (see its docstring) and then unlinking that sibling. Both
// steps are plain, adjacent syscalls with nothing else in between, but a concurrent reader's
// stat can still land in the brief window where the link count is transiently 2 -- widened, under
// real CPU contention, by ordinary scheduler preemption between those two syscalls. That is not a
// hard-link attack, just this reader catching a legitimate publish mid-flight, and it is
// indistinguishable from one via a single stat() call. Re-check a small bounded number of times,
// yielding the thread between attempts (via a synchronous sleep, not a busy spin) so the OS
// scheduler actually gets to run the publisher and finish its unlink() under contention; a link
// count that never settles back to 1 is treated as the real, persistent problem it would then be.
const TRANSIENT_LINK_COUNT_RETRY_ATTEMPTS = 20;
const TRANSIENT_LINK_COUNT_RETRY_DELAY_MS = 1;

function synchronousSleep(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function withStableLinkCount(getStats: () => Stats): Stats {
  let stats = getStats();
  for (
    let attempt = 0;
    stats.nlink !== 1 && attempt < TRANSIENT_LINK_COUNT_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    synchronousSleep(TRANSIENT_LINK_COUNT_RETRY_DELAY_MS);
    stats = getStats();
  }
  return stats;
}

export function assertPrivateRegularFile(filePath: string): Stats {
  assertNormalizedAbsolutePath(filePath, "Private file path");
  assertNoSymbolicLinkAncestors(dirname(filePath), false);
  const stats = withStableLinkCount(() => lstatSync(filePath));
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Private artifact must be a real regular file: ${filePath}`);
  }
  assertOwnedByCurrentUser(stats, "Private artifact");
  if ((stats.mode & 0o077) !== 0) {
    throw new Error(`Private artifact permissions must be 0600 or stricter: ${filePath}`);
  }
  if (stats.nlink !== 1) {
    throw new Error(`Private artifact must have exactly one hard link: ${filePath}`);
  }
  return stats;
}

export function synchronizeDirectory(directoryPath: string): void {
  const descriptor = openSync(
    directoryPath,
    openFlags(constants.O_RDONLY, constants.O_DIRECTORY ?? 0, constants.O_NOFOLLOW ?? 0),
  );
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

export function readPrivateFile(filePath: string, maximumBytes: number): Buffer | null {
  assertNormalizedAbsolutePath(filePath, "Private file path");
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new RangeError("Private artifact byte limit must be a non-negative safe integer");
  }
  assertNoSymbolicLinkAncestors(dirname(filePath), true);
  let before: Stats;
  try {
    before = assertPrivateRegularFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const descriptor = openSync(filePath, openFlags(constants.O_RDONLY, constants.O_NOFOLLOW ?? 0));
  try {
    return readStablePrivateFileDescriptor(descriptor, before, maximumBytes);
  } finally {
    closeSync(descriptor);
  }
}

function sameStableFileSnapshot(left: Stats, right: Stats): boolean {
  return (
    right.isFile() &&
    right.dev === left.dev &&
    right.ino === left.ino &&
    right.nlink === 1 &&
    right.size === left.size &&
    right.mode === left.mode &&
    right.uid === left.uid &&
    right.gid === left.gid &&
    right.mtimeMs === left.mtimeMs &&
    right.ctimeMs === left.ctimeMs
  );
}

/**
 * Reads one already-open regular file from a stable metadata snapshot without ever allocating or
 * returning more than `maximumBytes`. Exported from this internal module for deterministic race
 * regression tests; it is not part of the package entrypoint.
 */
export function readStablePrivateFileDescriptor(
  descriptor: number,
  beforeOpen: Stats,
  maximumBytes: number,
): Buffer {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0) {
    throw new RangeError("Private artifact byte limit must be a non-negative safe integer");
  }
  const opened = withStableLinkCount(() => fstatSync(descriptor));
  if (!sameStableFileSnapshot(beforeOpen, opened)) {
    throw new Error("Private artifact identity or metadata changed while opening it");
  }
  if (opened.size > maximumBytes) {
    throw new Error(`Private artifact exceeds its ${String(maximumBytes)} byte limit`);
  }

  const bytes = Buffer.alloc(opened.size);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = readSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
    if (count <= 0) {
      throw new Error("Private artifact changed while its bounded snapshot was being read");
    }
    offset += count;
  }

  const trailingByte = Buffer.allocUnsafe(1);
  const trailingCount = readSync(descriptor, trailingByte, 0, 1, bytes.byteLength);
  const afterRead = withStableLinkCount(() => fstatSync(descriptor));
  if (trailingCount !== 0 || !sameStableFileSnapshot(opened, afterRead)) {
    throw new Error("Private artifact changed while its bounded snapshot was being read");
  }
  return bytes;
}

/**
 * Publishes `bytes` at `filePath` exactly once, atomically with respect to every concurrent
 * reader.
 *
 * The content is first written to a private, uniquely named sibling file and fsynced there, so
 * the write itself can never be observed mid-flight. `filePath` is then published with a single
 * `link(2)` from that sibling: link(2) is specified to atomically fail with EEXIST if `filePath`
 * already exists (preserving the create-if-absent semantics every caller relies on for
 * idempotent claims) and otherwise makes the already-complete, already-fsynced inode visible at
 * `filePath` in one step. A concurrent reader can therefore only ever observe `filePath` as
 * either absent or fully written -- never present-but-empty or present-but-truncated.
 *
 * (An earlier version wrote directly to `filePath` under O_CREAT|O_EXCL, then filled it in with a
 * separate write() call. That left a real window, widened under CPU load, where the file existed
 * with size 0 and stable metadata: a concurrent reader's before/after stability snapshot matched
 * exactly, so no race was detected, and the reader received a "stable" empty buffer that failed
 * JSON parsing. See secure-artifacts.test.ts for a deterministic regression test.)
 */
export function createPrivateFileExclusive(filePath: string, bytes: Uint8Array): void {
  assertNormalizedAbsolutePath(filePath, "Private file path");
  const directoryPath = dirname(filePath);
  ensurePrivateDirectory(directoryPath);
  const temporaryPath = join(
    directoryPath,
    `.${basename(filePath)}.${String(process.pid)}.${randomUUID()}.tmp`,
  );
  const descriptor = openSync(
    temporaryPath,
    openFlags(constants.O_WRONLY, constants.O_CREAT, constants.O_EXCL, constants.O_NOFOLLOW ?? 0),
    PRIVATE_FILE_MODE,
  );
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    linkSync(temporaryPath, filePath);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new AggregateError(
          [error, cleanupError],
          "Failed to publish a private artifact safely",
          { cause: cleanupError },
        );
      }
    }
    throw error;
  }
  try {
    unlinkSync(temporaryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  assertPrivateRegularFile(filePath);
  synchronizeDirectory(directoryPath);
}

/** Creates a private, single-link artifact and returns its still-open writable descriptor. */
export function openPrivateFileExclusiveForWrite(filePath: string): number {
  assertNormalizedAbsolutePath(filePath, "Private file path");
  const directoryPath = dirname(filePath);
  ensurePrivateDirectory(directoryPath);
  const descriptor = openSync(
    filePath,
    openFlags(constants.O_WRONLY, constants.O_CREAT, constants.O_EXCL, constants.O_NOFOLLOW ?? 0),
    PRIVATE_FILE_MODE,
  );
  try {
    const stats = fstatSync(descriptor);
    if (!stats.isFile() || stats.nlink !== 1) {
      throw new Error("Private artifact descriptor is not one regular file");
    }
    assertOwnedByCurrentUser(stats, "Private artifact");
    synchronizeDirectory(directoryPath);
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}
