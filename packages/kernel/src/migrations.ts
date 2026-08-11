import { createHash } from "node:crypto";

import type Database from "better-sqlite3";

import { initialControlPlaneMigration } from "./migrations/0001-initial-control-plane.js";
import type { SqlMigration } from "./migration-types.js";

export type { SqlMigration } from "./migration-types.js";

export type AppliedMigration = Readonly<{
  version: number;
  name: string;
  checksum: string;
  appliedAt: string;
}>;

export type RunMigrationsOptions = Readonly<{
  migrations?: readonly SqlMigration[];
  now?: () => Date;
}>;

export type MigrationResult = Readonly<{
  currentVersion: number;
  newlyAppliedVersions: readonly number[];
}>;

export const FACTORY_MIGRATIONS: readonly SqlMigration[] = [initialControlPlaneMigration];

const MIGRATION_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function checksumMigration(migration: SqlMigration): string {
  return `sha256:${createHash("sha256")
    .update(`${migration.version}\0${migration.name}\0${migration.sql}`, "utf8")
    .digest("hex")}`;
}

function assertMigrationPlan(migrations: readonly SqlMigration[]): void {
  const names = new Set<string>();
  for (let index = 0; index < migrations.length; index += 1) {
    const migration = migrations[index];
    if (migration === undefined) {
      throw new Error("Migration plan contains an empty entry");
    }
    const expectedVersion = index + 1;
    if (migration.version !== expectedVersion) {
      throw new Error(
        `Migration versions must be contiguous from 1; expected ${expectedVersion}, received ${migration.version}`,
      );
    }
    if (!MIGRATION_NAME_PATTERN.test(migration.name) || migration.name.length > 100) {
      throw new Error(`Invalid migration name: ${migration.name}`);
    }
    if (names.has(migration.name)) {
      throw new Error(`Duplicate migration name: ${migration.name}`);
    }
    if (migration.sql.trim().length === 0) {
      throw new Error(`Migration ${migration.version} has no SQL`);
    }
    names.add(migration.name);
  }
}

function createMigrationLedger(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY CHECK(version > 0),
      name TEXT NOT NULL UNIQUE CHECK(length(name) BETWEEN 1 AND 100),
      checksum TEXT NOT NULL CHECK(length(checksum) = 71 AND substr(checksum, 1, 7) = 'sha256:'),
      applied_at TEXT NOT NULL CHECK(length(applied_at) = 24 AND substr(applied_at, 24, 1) = 'Z')
    ) STRICT;
  `);
}

function readAppliedMigrations(database: Database.Database): readonly AppliedMigration[] {
  return database
    .prepare(
      `SELECT version, name, checksum, applied_at AS appliedAt
       FROM schema_migrations
       ORDER BY version`,
    )
    .all() as readonly AppliedMigration[];
}

function assertLedgerMatchesPlan(
  applied: readonly AppliedMigration[],
  migrations: readonly SqlMigration[],
  userVersion: number,
): void {
  let expectedVersion = 1;
  for (const record of applied) {
    if (record.version !== expectedVersion) {
      throw new Error(
        `Migration ledger is not contiguous; expected ${expectedVersion}, received ${record.version}`,
      );
    }
    const planned = migrations[record.version - 1];
    if (planned === undefined) {
      throw new Error(`Database migration ${record.version} is newer than this Factory build`);
    }
    const expectedChecksum = checksumMigration(planned);
    if (record.name !== planned.name || record.checksum !== expectedChecksum) {
      throw new Error(`Migration ${record.version} does not match its recorded name/checksum`);
    }
    expectedVersion += 1;
  }

  const ledgerVersion = applied.at(-1)?.version ?? 0;
  if (userVersion !== ledgerVersion) {
    throw new Error(
      `SQLite user_version ${userVersion} disagrees with migration ledger ${ledgerVersion}`,
    );
  }
}

export function runMigrations(
  database: Database.Database,
  options: RunMigrationsOptions = {},
): MigrationResult {
  if (database.inTransaction) {
    throw new Error("Migrations cannot run inside an existing transaction");
  }

  const migrations = options.migrations ?? FACTORY_MIGRATIONS;
  const now = options.now ?? (() => new Date());
  assertMigrationPlan(migrations);
  createMigrationLedger(database);

  const applied = readAppliedMigrations(database);
  const rawUserVersion = database.pragma("user_version", { simple: true });
  if (typeof rawUserVersion !== "number" || !Number.isSafeInteger(rawUserVersion)) {
    throw new Error(`SQLite returned an invalid user_version: ${String(rawUserVersion)}`);
  }
  assertLedgerMatchesPlan(applied, migrations, rawUserVersion);

  const newlyAppliedVersions: number[] = [];
  for (const migration of migrations.slice(applied.length)) {
    const apply = database.transaction(() => {
      database.exec(migration.sql);
      const appliedAt = now().toISOString();
      database
        .prepare(
          `INSERT INTO schema_migrations(version, name, checksum, applied_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(migration.version, migration.name, checksumMigration(migration), appliedAt);
      database.pragma(`user_version = ${migration.version}`);
    });

    try {
      apply.immediate();
    } catch (error) {
      throw new Error(`Migration ${migration.version} (${migration.name}) failed`, {
        cause: error,
      });
    }
    newlyAppliedVersions.push(migration.version);
  }

  return {
    currentVersion: migrations.length,
    newlyAppliedVersions,
  };
}

export function listAppliedMigrations(database: Database.Database): readonly AppliedMigration[] {
  createMigrationLedger(database);
  return readAppliedMigrations(database);
}
