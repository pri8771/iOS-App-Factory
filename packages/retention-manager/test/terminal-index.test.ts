import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openMigratedFactoryDatabase } from "@app-factory/kernel";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { loadTerminalAttemptIndex } from "../src/terminal-index.js";
import { RetentionManagerError } from "../src/types.js";

const temporaryDirectories: string[] = [];
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-retention-terminal-index-"));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** Seeds one command + task_snapshot + one attempt directly with raw SQL,
 * which is far less setup than driving the full task-submission pipeline
 * for what is purely a test of the `attempts` table snapshot. Every
 * inserted row must still satisfy the same CHECK/FK/UNIQUE constraints the
 * real kernel enforces (including the project-projection trigger's own
 * upsert), so this stays an honest test of the schema this tool actually
 * reads. Every identifier and digest is derived from the attemptId so
 * concurrent seed calls never collide on a UNIQUE constraint.
 */
function seedAttempt(
  database: Database.Database,
  input: Readonly<{
    attemptId: string;
    state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    terminalAt: string | null;
  }>,
): void {
  const suffix = input.attemptId.slice(0, 8);
  const commandId = `${suffix}-0000-4000-8000-000000000c01`;
  const taskId = `${suffix}-0000-4000-8000-0000000000ta`;
  const projectId = `${suffix}-0000-4000-8000-000000000ppp`.slice(0, 36);
  const repositoryId = `${suffix}-0000-4000-8000-000000000rrr`.slice(0, 36);
  const taskDigest = `sha256:${suffix.padEnd(64, "0")}`;
  database
    .prepare(
      `INSERT INTO commands(command_id, schema_version, kind, origin, issued_at, task_id, attempt_id, payload_json)
       VALUES (?, 1, 'task.submit', 'cli', '2026-08-01T00:00:00.000Z', ?, NULL, '{}')`,
    )
    .run(commandId, taskId);
  database
    .prepare(
      `INSERT INTO task_snapshots(task_id, schema_version, project_id, repository_id, base_commit, task_spec_digest, submitted_by_command_id, created_at, payload_json)
       VALUES (?, 1, ?, ?, ?, ?, ?, '2026-08-01T00:00:00.000Z', '{}')`,
    )
    .run(taskId, projectId, repositoryId, "a".repeat(40), taskDigest, commandId);
  const terminal =
    input.state === "succeeded" || input.state === "failed" || input.state === "cancelled";
  const desiredState = input.state === "cancelled" ? "cancelled" : "running";
  database
    .prepare(
      `INSERT INTO attempts(attempt_id, schema_version, task_id, task_spec_digest, attempt_number, state, desired_state, revision, fence, current_step_id, blocker_json, outcome_json, created_at, updated_at, terminal_at, payload_json)
       VALUES (?, 1, ?, ?, 1, ?, ?, 0, 0, NULL, NULL, ?, '2026-08-01T00:00:00.000Z', ?, ?, '{}')`,
    )
    .run(
      input.attemptId,
      taskId,
      taskDigest,
      input.state,
      desiredState,
      terminal ? `{"kind":"${input.state}"}` : null,
      input.terminalAt ?? "2026-08-01T00:00:00.000Z",
      input.terminalAt,
    );
}

const SUCCEEDED = "11111111-1111-4111-8111-111111111111";
const FAILED = "22222222-2222-4222-8222-222222222222";
const CANCELLED = "33333333-3333-4333-8333-333333333333";
const RUNNING = "55555555-5555-4555-8555-555555555555";
const QUEUED = "66666666-6666-4666-8666-666666666666";

function seededDatabasePath(): string {
  const path = join(temporaryDirectory(), "control-plane.sqlite");
  const database = openMigratedFactoryDatabase(path);
  seedAttempt(database, {
    attemptId: SUCCEEDED,
    state: "succeeded",
    terminalAt: "2026-08-05T00:00:00.000Z",
  });
  seedAttempt(database, {
    attemptId: FAILED,
    state: "failed",
    terminalAt: "2026-08-06T00:00:00.000Z",
  });
  seedAttempt(database, {
    attemptId: CANCELLED,
    state: "cancelled",
    terminalAt: "2026-08-07T00:00:00.000Z",
  });
  seedAttempt(database, { attemptId: RUNNING, state: "running", terminalAt: null });
  seedAttempt(database, { attemptId: QUEUED, state: "queued", terminalAt: null });
  database.close();
  return path;
}

describe("loadTerminalAttemptIndex", () => {
  it("reports exactly the terminal attempts, each with its recorded terminal_at", () => {
    const index = loadTerminalAttemptIndex(seededDatabasePath());

    for (const [attemptId, terminalAt] of [
      [SUCCEEDED, "2026-08-05T00:00:00.000Z"],
      [FAILED, "2026-08-06T00:00:00.000Z"],
      [CANCELLED, "2026-08-07T00:00:00.000Z"],
    ] as const) {
      expect(index.isTerminal(attemptId)).toBe(true);
      expect(index.terminalAt(attemptId)).toBe(terminalAt);
    }
    for (const attemptId of [RUNNING, QUEUED]) {
      expect(index.isTerminal(attemptId)).toBe(false);
      expect(index.terminalAt(attemptId)).toBeNull();
    }
  });

  it("treats an attemptId the database has never heard of as not proven terminal", () => {
    const index = loadTerminalAttemptIndex(seededDatabasePath());
    const unknown = "77777777-7777-4777-8777-777777777777";

    expect(index.isTerminal(unknown)).toBe(false);
    expect(index.terminalAt(unknown)).toBeNull();
  });

  it("works concurrently with a live writer, via WAL", () => {
    const path = join(temporaryDirectory(), "control-plane.sqlite");
    const writer = openMigratedFactoryDatabase(path);
    seedAttempt(writer, {
      attemptId: SUCCEEDED,
      state: "succeeded",
      terminalAt: "2026-08-05T00:00:00.000Z",
    });

    const index = loadTerminalAttemptIndex(path);
    expect(index.isTerminal(SUCCEEDED)).toBe(true);
    writer.close();
  });

  it("refuses rather than guesses when the database file does not exist", () => {
    const missing = join(temporaryDirectory(), "does-not-exist.sqlite");
    expect(() => loadTerminalAttemptIndex(missing)).toThrow(RetentionManagerError);
  });

  it("refuses rather than guesses when the file is not a control-plane database", () => {
    const path = join(temporaryDirectory(), "not-control-plane.sqlite");
    const database = new Database(path);
    database.exec("CREATE TABLE unrelated (id INTEGER PRIMARY KEY) STRICT;");
    database.close();

    expect(() => loadTerminalAttemptIndex(path)).toThrow(RetentionManagerError);
  });

  it("refuses rather than guesses when the database is not WAL-mode", () => {
    const path = join(temporaryDirectory(), "rollback-journal.sqlite");
    const database = new Database(path);
    database.pragma("journal_mode = DELETE");
    database.exec("CREATE TABLE attempts (attempt_id TEXT PRIMARY KEY, terminal_at TEXT);");
    database.close();

    expect(() => loadTerminalAttemptIndex(path)).toThrow();
  });
});
