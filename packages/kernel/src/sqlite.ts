import { isAbsolute } from "node:path";

import Database from "better-sqlite3";

import { runMigrations, type RunMigrationsOptions } from "./migrations.js";

export const MINIMUM_SAFE_SQLITE_VERSION = "3.51.3";
export const DEFAULT_SQLITE_BUSY_TIMEOUT_MS = 5_000;

export type FactoryDatabaseHealth = Readonly<{
  sqliteVersion: string;
  journalMode: "wal";
  foreignKeys: true;
  busyTimeoutMs: number;
  synchronous: "FULL";
  integrity: "ok";
}>;

export type OpenFactoryDatabaseOptions = Readonly<{
  busyTimeoutMs?: number;
  fileMustExist?: boolean;
}>;

export type FactoryDatabaseBackup = Readonly<{
  destinationPath: string;
  sqliteVersion: string;
  integrity: "ok";
  pageCount: number;
}>;

function assertAbsoluteDatabasePath(databasePath: string): void {
  if (!isAbsolute(databasePath)) {
    throw new TypeError(`SQLite database path must be absolute: ${databasePath}`);
  }
}

function assertBusyTimeout(busyTimeoutMs: number): void {
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 60_000) {
    throw new RangeError(
      `SQLite busy timeout must be an integer from 0 through 60000: ${busyTimeoutMs}`,
    );
  }
}

function parseSqliteVersion(version: string): readonly [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) {
    throw new Error(`Unrecognized SQLite version: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) {
    throw new Error(`Unrecognized SQLite version: ${version}`);
  }

  return [major, minor, patch];
}

export function isSqliteVersionAtLeast(actual: string, minimum: string): boolean {
  const left = parseSqliteVersion(actual);
  const right = parseSqliteVersion(minimum);

  for (let index = 0; index < left.length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined || rightPart === undefined) {
      throw new Error("SQLite version comparison invariant failed");
    }
    if (leftPart !== rightPart) {
      return leftPart > rightPart;
    }
  }

  return true;
}

export function readSqliteVersion(database: Database.Database): string {
  const row = database.prepare("SELECT sqlite_version() AS version").get() as
    Readonly<{ version?: unknown }> | undefined;

  if (row === undefined || typeof row.version !== "string") {
    throw new Error("SQLite did not return a version string");
  }

  return row.version;
}

export function assertSafeSqliteVersion(database: Database.Database): string {
  const sqliteVersion = readSqliteVersion(database);
  if (!isSqliteVersionAtLeast(sqliteVersion, MINIMUM_SAFE_SQLITE_VERSION)) {
    throw new Error(
      `SQLite ${sqliteVersion} predates the ${MINIMUM_SAFE_SQLITE_VERSION} WAL-reset fix`,
    );
  }
  return sqliteVersion;
}

export function assertDatabaseIntegrity(database: Database.Database): void {
  const rows = database.pragma("integrity_check") as readonly Readonly<Record<string, unknown>>[];
  const messages = rows.flatMap((row) => Object.values(row));

  if (messages.length !== 1 || messages[0] !== "ok") {
    throw new Error(`SQLite integrity check failed: ${JSON.stringify(messages)}`);
  }
}

export function inspectFactoryDatabase(database: Database.Database): FactoryDatabaseHealth {
  const sqliteVersion = assertSafeSqliteVersion(database);
  const journalMode = database.pragma("journal_mode", { simple: true });
  const foreignKeys = database.pragma("foreign_keys", { simple: true });
  const busyTimeoutMs = database.pragma("busy_timeout", { simple: true });
  const synchronous = database.pragma("synchronous", { simple: true });

  if (typeof journalMode !== "string" || journalMode.toLowerCase() !== "wal") {
    throw new Error(`SQLite journal_mode must be WAL: ${String(journalMode)}`);
  }
  if (foreignKeys !== 1) {
    throw new Error(`SQLite foreign_keys must be enabled: ${String(foreignKeys)}`);
  }
  if (typeof busyTimeoutMs !== "number" || busyTimeoutMs < 0) {
    throw new Error(`SQLite busy_timeout must be a non-negative number: ${String(busyTimeoutMs)}`);
  }
  if (synchronous !== 2) {
    throw new Error(`SQLite synchronous must be FULL: ${String(synchronous)}`);
  }

  assertDatabaseIntegrity(database);
  return {
    sqliteVersion,
    journalMode: "wal",
    foreignKeys: true,
    busyTimeoutMs,
    synchronous: "FULL",
    integrity: "ok",
  };
}

export function openFactoryDatabase(
  databasePath: string,
  options: OpenFactoryDatabaseOptions = {},
): Database.Database {
  assertAbsoluteDatabasePath(databasePath);
  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_SQLITE_BUSY_TIMEOUT_MS;
  assertBusyTimeout(busyTimeoutMs);

  const database = new Database(databasePath, {
    fileMustExist: options.fileMustExist ?? false,
    timeout: busyTimeoutMs,
  });

  try {
    const journalMode = database.pragma("journal_mode = WAL", { simple: true });
    if (typeof journalMode !== "string" || journalMode.toLowerCase() !== "wal") {
      throw new Error(`Could not enable SQLite WAL mode: ${String(journalMode)}`);
    }

    database.pragma("foreign_keys = ON");
    database.pragma(`busy_timeout = ${busyTimeoutMs}`);
    database.pragma("synchronous = FULL");
    inspectFactoryDatabase(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function openMigratedFactoryDatabase(
  databasePath: string,
  options: OpenFactoryDatabaseOptions & RunMigrationsOptions = {},
): Database.Database {
  const database = openFactoryDatabase(databasePath, options);
  try {
    runMigrations(database, options);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export async function backupFactoryDatabase(
  database: Database.Database,
  destinationPath: string,
): Promise<FactoryDatabaseBackup> {
  assertAbsoluteDatabasePath(destinationPath);
  if (destinationPath === database.name) {
    throw new Error("SQLite backup destination must differ from the live database");
  }

  await database.backup(destinationPath);
  const backup = new Database(destinationPath, {
    fileMustExist: true,
    readonly: true,
  });

  try {
    assertDatabaseIntegrity(backup);
    const sqliteVersion = assertSafeSqliteVersion(backup);
    const pageCount = backup.pragma("page_count", { simple: true });
    if (typeof pageCount !== "number" || !Number.isSafeInteger(pageCount) || pageCount < 1) {
      throw new Error(`SQLite backup has an invalid page count: ${String(pageCount)}`);
    }

    return {
      destinationPath,
      sqliteVersion,
      integrity: "ok",
      pageCount,
    };
  } finally {
    backup.close();
  }
}
