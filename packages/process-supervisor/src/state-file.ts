import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  type Stats,
} from "node:fs";
import { dirname, isAbsolute, basename, join, normalize, parse, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";

import { parseSupervisorIdentity, type SupervisorIdentity } from "./model.js";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function assertAbsoluteStatePath(statePath: string): void {
  if (!isAbsolute(statePath)) {
    throw new TypeError(`Supervisor state path must be absolute: ${statePath}`);
  }
  if (normalize(statePath) !== statePath) {
    throw new TypeError(`Supervisor state path must be normalized: ${statePath}`);
  }
}

function assertOwnedByCurrentUser(stats: Stats, label: string): void {
  const currentUserId = process.getuid?.();
  if (currentUserId !== undefined && stats.uid !== currentUserId) {
    throw new Error(`${label} is not owned by the current user`);
  }
}

function assertNoSymbolicLinkDirectoryAncestors(
  directoryPath: string,
  allowMissingTail: boolean,
): void {
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
      throw new Error(
        `Supervisor state directory must not traverse a symbolic-link ancestor: ${currentPath}`,
      );
    }
    if (!stats.isDirectory()) {
      throw new Error(`Supervisor state directory ancestor must be a directory: ${currentPath}`);
    }
  }
}

function assertPrivateDirectory(directoryPath: string): void {
  assertNoSymbolicLinkDirectoryAncestors(directoryPath, true);
  mkdirSync(directoryPath, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  assertNoSymbolicLinkDirectoryAncestors(directoryPath, false);
  const stats = lstatSync(directoryPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Supervisor state directory must be a real directory: ${directoryPath}`);
  }
  assertOwnedByCurrentUser(stats, "Supervisor state directory");
  if ((stats.mode & 0o077) !== 0) {
    throw new Error(`Supervisor state directory permissions must be 0700 or stricter`);
  }
}

function assertPrivateRegularFile(statePath: string): Stats {
  const stats = lstatSync(statePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Supervisor state must be a real regular file: ${statePath}`);
  }
  assertOwnedByCurrentUser(stats, "Supervisor state file");
  if ((stats.mode & 0o077) !== 0) {
    throw new Error("Supervisor state file permissions must be 0600 or stricter");
  }
  if (stats.nlink !== 1) {
    throw new Error("Supervisor state file must have exactly one hard link");
  }
  return stats;
}

function openFlags(...flags: number[]): number {
  return flags.reduce((combined, flag) => combined | flag, 0);
}

function synchronizeDirectory(directoryPath: string): void {
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

type StateMutationLock = Readonly<{
  path: string;
  descriptor: number;
  device: number;
  inode: number;
}>;

function acquireStateMutationLock(statePath: string): StateMutationLock {
  const directoryPath = dirname(statePath);
  const lockPath = join(directoryPath, `.${basename(statePath)}.mutation-lock`);
  let descriptor: number;
  try {
    descriptor = openSync(
      lockPath,
      openFlags(constants.O_WRONLY, constants.O_CREAT, constants.O_EXCL, constants.O_NOFOLLOW ?? 0),
      PRIVATE_FILE_MODE,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new SupervisorStateConflictError(
        "Supervisor state is locked by another mutation or an interrupted mutation",
      );
    }
    throw error;
  }
  try {
    writeFileSync(descriptor, `${String(process.pid)}\n`, { encoding: "utf8" });
    fsyncSync(descriptor);
    const stats = fstatSync(descriptor);
    if (!stats.isFile() || stats.nlink !== 1) {
      throw new Error("Supervisor state mutation lock is not one regular file");
    }
    synchronizeDirectory(directoryPath);
    return { path: lockPath, descriptor, device: stats.dev, inode: stats.ino };
  } catch (error) {
    closeSync(descriptor);
    try {
      unlinkSync(lockPath);
      synchronizeDirectory(directoryPath);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Failed to acquire supervisor state lock", {
        cause: cleanupError,
      });
    }
    throw error;
  }
}

function releaseStateMutationLock(lock: StateMutationLock): void {
  try {
    const stats = lstatSync(lock.path);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.nlink !== 1 ||
      stats.dev !== lock.device ||
      stats.ino !== lock.inode
    ) {
      throw new Error("Supervisor state mutation lock identity changed before release");
    }
    unlinkSync(lock.path);
    synchronizeDirectory(dirname(lock.path));
  } finally {
    closeSync(lock.descriptor);
  }
}

function withStateMutationLock<T>(statePath: string, action: () => T): T {
  const lock = acquireStateMutationLock(statePath);
  let result!: T;
  let actionFailed = false;
  let actionError: unknown;
  try {
    result = action();
  } catch (error) {
    actionFailed = true;
    actionError = error;
  }
  try {
    releaseStateMutationLock(lock);
  } catch (cleanupError) {
    if (actionFailed) {
      throw new AggregateError(
        [actionError, cleanupError],
        "Supervisor state mutation cleanup failed",
        {
          cause: cleanupError,
        },
      );
    }
    throw cleanupError;
  }
  if (actionFailed) throw actionError;
  return result;
}

function sameIdentity(left: SupervisorIdentity, right: SupervisorIdentity): boolean {
  return (
    JSON.stringify(parseSupervisorIdentity(left)) === JSON.stringify(parseSupervisorIdentity(right))
  );
}

function assertExpectedState(
  statePath: string,
  expected: SupervisorIdentity | null,
): SupervisorIdentity | null {
  const current = readSupervisorStateFile(statePath);
  if (expected === null) {
    if (current !== null) {
      throw new SupervisorStateConflictError("Supervisor state already exists");
    }
    return null;
  }
  const validatedExpected = parseSupervisorIdentity(expected);
  if (current === null || !sameIdentity(current, validatedExpected)) {
    throw new SupervisorStateConflictError(
      "Supervisor state no longer matches the expected record",
    );
  }
  return current;
}

export class SupervisorStateConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SupervisorStateConflictError";
  }
}

/** Atomically publishes `identity` only while the exact expected record is current. */
export function writeSupervisorStateFile(
  statePath: string,
  identity: SupervisorIdentity,
  expected: SupervisorIdentity | null,
): void {
  assertAbsoluteStatePath(statePath);
  const validated = parseSupervisorIdentity(identity);
  const directoryPath = dirname(statePath);
  assertPrivateDirectory(directoryPath);
  withStateMutationLock(statePath, () => {
    assertExpectedState(statePath, expected);

    const temporaryPath = join(
      directoryPath,
      `.${basename(statePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let descriptor: number | undefined;
    try {
      descriptor = openSync(
        temporaryPath,
        openFlags(
          constants.O_WRONLY,
          constants.O_CREAT,
          constants.O_EXCL,
          constants.O_NOFOLLOW ?? 0,
        ),
        PRIVATE_FILE_MODE,
      );
      writeFileSync(descriptor, `${JSON.stringify(validated)}\n`, { encoding: "utf8" });
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      renameSync(temporaryPath, statePath);
      synchronizeDirectory(directoryPath);
    } catch (error) {
      if (descriptor !== undefined) closeSync(descriptor);
      try {
        unlinkSync(temporaryPath);
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
          throw new AggregateError(
            [error, cleanupError],
            "Failed to write supervisor state safely",
            { cause: cleanupError },
          );
        }
      }
      throw error;
    }
  });
}

export function readSupervisorStateFile(statePath: string): SupervisorIdentity | null {
  assertAbsoluteStatePath(statePath);
  assertNoSymbolicLinkDirectoryAncestors(dirname(statePath), true);
  let before: Stats;
  try {
    before = assertPrivateRegularFile(statePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const descriptor = openSync(statePath, openFlags(constants.O_RDONLY, constants.O_NOFOLLOW ?? 0));
  try {
    const after = fstatSync(descriptor);
    if (before.dev !== after.dev || before.ino !== after.ino || !after.isFile()) {
      throw new Error("Supervisor state file changed while it was being opened");
    }
    if (after.size > 16_384) {
      throw new Error("Supervisor state file exceeds the maximum size");
    }
    const serialized = readFileSync(descriptor, "utf8");
    return parseSupervisorIdentity(JSON.parse(serialized) as unknown);
  } finally {
    closeSync(descriptor);
  }
}

/** Removes only the exact expected record, so stale cleanup cannot erase a successor. */
export function removeSupervisorStateFile(
  statePath: string,
  expected: SupervisorIdentity,
): boolean {
  assertAbsoluteStatePath(statePath);
  const directoryPath = dirname(statePath);
  assertPrivateDirectory(directoryPath);
  return withStateMutationLock(statePath, () => {
    const current = readSupervisorStateFile(statePath);
    if (current === null) return false;
    if (!sameIdentity(current, expected)) {
      throw new SupervisorStateConflictError(
        "Supervisor state no longer matches the expected removal record",
      );
    }
    assertPrivateRegularFile(statePath);
    unlinkSync(statePath);
    synchronizeDirectory(directoryPath);
    return true;
  });
}
