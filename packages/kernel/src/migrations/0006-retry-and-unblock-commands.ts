import type { SqlMigration } from "../migration-types.js";

/**
 * Adds the `task.retry` and `attempt.unblock` durable command kinds and the
 * `attempt.unblock-answered` domain event. SQLite has no `ALTER TABLE` support
 * for changing a `CHECK` constraint, so `commands` and `events` are rebuilt in
 * place with widened `kind`/`type` enums; every other column, constraint,
 * index, and trigger is carried over unchanged.
 *
 * `commands` is the parent of foreign keys from `task_snapshots` and `events`,
 * and SQLite refuses to `DROP TABLE` a parent while a child still references
 * it and enforcement is on. `disableForeignKeysDuringApply` has the runner
 * disable enforcement for this migration's transaction only, verify with
 * `PRAGMA foreign_key_check` before commit, and restore it immediately after.
 * `events` only self-references (`causation_event_id`), which DROP TABLE
 * tolerates with enforcement on, so its rebuild does not need that.
 */
export const retryAndUnblockCommandsMigration: SqlMigration = {
  version: 6,
  name: "retry-and-unblock-commands",
  disableForeignKeysDuringApply: true,
  sql: String.raw`
CREATE TABLE commands_new (
  command_id TEXT PRIMARY KEY CHECK(length(command_id) = 36 AND command_id = lower(command_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  kind TEXT NOT NULL CHECK(kind IN (
    'task.submit', 'attempt.set-desired-state', 'daemon.reconcile', 'task.retry', 'attempt.unblock'
  )),
  origin TEXT NOT NULL CHECK(origin IN ('cli', 'mcp', 'dashboard', 'system')),
  issued_at TEXT NOT NULL CHECK(length(issued_at) = 24 AND substr(issued_at, 24, 1) = 'Z'),
  task_id TEXT CHECK(task_id IS NULL OR (length(task_id) = 36 AND task_id = lower(task_id))),
  attempt_id TEXT CHECK(attempt_id IS NULL OR (length(attempt_id) = 36 AND attempt_id = lower(attempt_id))),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK(
    (kind = 'task.submit' AND task_id IS NOT NULL AND attempt_id IS NULL)
    OR (kind = 'attempt.set-desired-state' AND task_id IS NULL AND attempt_id IS NOT NULL)
    OR (kind = 'daemon.reconcile' AND task_id IS NULL)
    OR (kind = 'task.retry' AND task_id IS NOT NULL AND attempt_id IS NOT NULL)
    OR (kind = 'attempt.unblock' AND task_id IS NULL AND attempt_id IS NOT NULL)
  )
) STRICT;

INSERT INTO commands_new SELECT * FROM commands;
DROP TABLE commands;
ALTER TABLE commands_new RENAME TO commands;

CREATE INDEX commands_kind_issued_at_idx ON commands(kind, issued_at);
CREATE INDEX commands_attempt_id_idx ON commands(attempt_id) WHERE attempt_id IS NOT NULL;

CREATE TRIGGER commands_reject_update
BEFORE UPDATE ON commands BEGIN
  SELECT RAISE(ABORT, 'commands are immutable');
END;
CREATE TRIGGER commands_reject_delete
BEFORE DELETE ON commands BEGIN
  SELECT RAISE(ABORT, 'commands are immutable');
END;

CREATE TABLE events_new (
  event_id TEXT PRIMARY KEY CHECK(length(event_id) = 36 AND event_id = lower(event_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id),
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  type TEXT NOT NULL CHECK(type IN (
    'attempt.created',
    'attempt.state-changed',
    'attempt.desired-state-changed',
    'attempt.fence-claimed',
    'attempt.unblock-answered',
    'step.created',
    'step.state-changed',
    'evidence.recorded',
    'commit.recorded'
  )),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at) = 24 AND substr(occurred_at, 24, 1) = 'Z'),
  command_id TEXT REFERENCES commands(command_id),
  causation_event_id TEXT REFERENCES events_new(event_id),
  fence INTEGER NOT NULL CHECK(fence >= 0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE(attempt_id, sequence)
) STRICT;

INSERT INTO events_new SELECT * FROM events;
DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX events_attempt_occurred_at_idx ON events(attempt_id, occurred_at);
CREATE INDEX events_command_id_idx ON events(command_id) WHERE command_id IS NOT NULL;
CREATE INDEX events_type_occurred_at_idx ON events(type, occurred_at);

CREATE TRIGGER events_reject_update
BEFORE UPDATE ON events BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
CREATE TRIGGER events_reject_delete
BEFORE DELETE ON events BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
`,
};
