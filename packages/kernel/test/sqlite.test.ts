import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
  MINIMUM_SAFE_SQLITE_VERSION,
  assertDatabaseIntegrity,
  backupFactoryDatabase,
  inspectFactoryDatabase,
  isSqliteVersionAtLeast,
  openFactoryDatabase,
} from "../src/sqlite.js";

const temporaryDirectories: string[] = [];

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-sqlite-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("SQLite capability baseline", () => {
  it("configures a safe WAL connection and survives close and reopen", () => {
    const databasePath = join(makeTemporaryDirectory(), "factory.db");
    let database = openFactoryDatabase(databasePath);

    const initialHealth = inspectFactoryDatabase(database);
    expect(initialHealth).toMatchObject({
      busyTimeoutMs: DEFAULT_SQLITE_BUSY_TIMEOUT_MS,
      foreignKeys: true,
      integrity: "ok",
      journalMode: "wal",
      synchronous: "FULL",
    });
    expect(isSqliteVersionAtLeast(initialHealth.sqliteVersion, MINIMUM_SAFE_SQLITE_VERSION)).toBe(
      true,
    );

    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE parents (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      CREATE TABLE children (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES parents(id)
      ) STRICT;
      INSERT INTO schema_migrations(version, applied_at)
      VALUES (1, '2026-08-10T00:00:00.000Z');
      PRAGMA user_version = 1;
    `);

    database.transaction(() => {
      database.prepare("INSERT INTO parents(id, value) VALUES (?, ?)").run(1, "persisted");
      database.prepare("INSERT INTO children(id, parent_id) VALUES (?, ?)").run(1, 1);
    })();

    assert.throws(() => {
      database.prepare("INSERT INTO children(id, parent_id) VALUES (?, ?)").run(2, 999);
    });
    database.close();

    database = openFactoryDatabase(databasePath, { fileMustExist: true });
    expect(database.pragma("user_version", { simple: true })).toBe(1);
    expect(database.prepare("SELECT id, value FROM parents").all()).toEqual([
      { id: 1, value: "persisted" },
    ]);
    assertDatabaseIntegrity(database);
    database.close();
  });

  it("rolls back every write when a transaction fails", () => {
    const databasePath = join(makeTemporaryDirectory(), "factory.db");
    const database = openFactoryDatabase(databasePath);
    database.exec(`
      CREATE TABLE state (id INTEGER PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        state_id INTEGER NOT NULL REFERENCES state(id)
      ) STRICT;
    `);

    const mutateStateAndEvent = database.transaction(() => {
      database.prepare("INSERT INTO state(id, value) VALUES (?, ?)").run(1, "must-roll-back");
      database.prepare("INSERT INTO events(id, state_id) VALUES (?, ?)").run(1, 999);
    });

    expect(mutateStateAndEvent).toThrow();
    expect(database.prepare("SELECT COUNT(*) AS count FROM state").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM events").get()).toEqual({ count: 0 });
    database.close();
  });

  it("creates an independently readable and integral online backup", async () => {
    const directory = makeTemporaryDirectory();
    const databasePath = join(directory, "factory.db");
    const backupPath = join(directory, "factory.backup.db");
    const database = openFactoryDatabase(databasePath);
    database.exec(`
      CREATE TABLE durable_values (
        id INTEGER PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      INSERT INTO durable_values(id, value) VALUES (1, 'backed-up');
    `);

    const result = await backupFactoryDatabase(database, backupPath);
    expect(result).toMatchObject({
      destinationPath: backupPath,
      integrity: "ok",
    });
    expect(result.pageCount).toBeGreaterThan(0);
    database.close();

    const backup = new Database(backupPath, {
      fileMustExist: true,
      readonly: true,
    });
    expect(backup.prepare("SELECT id, value FROM durable_values").all()).toEqual([
      { id: 1, value: "backed-up" },
    ]);
    assertDatabaseIntegrity(backup);
    backup.close();
  });

  it("compares SQLite versions numerically and fails closed on bad values", () => {
    expect(isSqliteVersionAtLeast("3.51.3", "3.51.3")).toBe(true);
    expect(isSqliteVersionAtLeast("3.53.2", "3.51.3")).toBe(true);
    expect(isSqliteVersionAtLeast("3.51.2", "3.51.3")).toBe(false);
    expect(isSqliteVersionAtLeast("3.9.0", "3.51.3")).toBe(false);
    expect(() => isSqliteVersionAtLeast("not-a-version", "3.51.3")).toThrow(
      /Unrecognized SQLite version/,
    );
  });

  it("rejects relative database paths and unsafe timeouts", () => {
    expect(() => openFactoryDatabase("relative.db")).toThrow(/path must be absolute/);
    const databasePath = join(makeTemporaryDirectory(), "factory.db");
    expect(() => openFactoryDatabase(databasePath, { busyTimeoutMs: -1 })).toThrow(/busy timeout/);
  });
});
