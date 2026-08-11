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
import { dirname, isAbsolute, basename, join } from "node:path";
import { randomUUID } from "node:crypto";

import { parseSupervisorIdentityV1, type SupervisorIdentityV1 } from "./model.js";

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function assertAbsoluteStatePath(statePath: string): void {
  if (!isAbsolute(statePath)) {
    throw new TypeError(`Supervisor state path must be absolute: ${statePath}`);
  }
}

function assertOwnedByCurrentUser(stats: Stats, label: string): void {
  const currentUserId = process.getuid?.();
  if (currentUserId !== undefined && stats.uid !== currentUserId) {
    throw new Error(`${label} is not owned by the current user`);
  }
}

function assertPrivateDirectory(directoryPath: string): void {
  mkdirSync(directoryPath, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
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

export function writeSupervisorStateFile(statePath: string, identity: SupervisorIdentityV1): void {
  assertAbsoluteStatePath(statePath);
  const validated = parseSupervisorIdentityV1(identity);
  const directoryPath = dirname(statePath);
  assertPrivateDirectory(directoryPath);

  try {
    assertPrivateRegularFile(statePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  const temporaryPath = join(
    directoryPath,
    `.${basename(statePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      temporaryPath,
      openFlags(constants.O_WRONLY, constants.O_CREAT, constants.O_EXCL, constants.O_NOFOLLOW ?? 0),
      PRIVATE_FILE_MODE,
    );
    writeFileSync(descriptor, `${JSON.stringify(validated)}\n`, { encoding: "utf8" });
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, statePath);
    synchronizeDirectory(directoryPath);
  } catch (error) {
    if (descriptor !== undefined) {
      closeSync(descriptor);
    }
    try {
      unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new AggregateError([error, cleanupError], "Failed to write supervisor state safely", {
          cause: cleanupError,
        });
      }
    }
    throw error;
  }
}

export function readSupervisorStateFile(statePath: string): SupervisorIdentityV1 | null {
  assertAbsoluteStatePath(statePath);
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
    return parseSupervisorIdentityV1(JSON.parse(serialized) as unknown);
  } finally {
    closeSync(descriptor);
  }
}

export function removeSupervisorStateFile(statePath: string): boolean {
  assertAbsoluteStatePath(statePath);
  try {
    assertPrivateRegularFile(statePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
  unlinkSync(statePath);
  synchronizeDirectory(dirname(statePath));
  return true;
}
