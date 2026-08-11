import type { SqlMigration } from "../migration-types.js";

export const initialControlPlaneMigration: SqlMigration = {
  version: 1,
  name: "initial-control-plane",
  sql: `
CREATE TABLE commands (
  command_id TEXT PRIMARY KEY CHECK(length(command_id) = 36 AND command_id = lower(command_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  kind TEXT NOT NULL CHECK(kind IN ('task.submit', 'attempt.set-desired-state', 'daemon.reconcile')),
  origin TEXT NOT NULL CHECK(origin IN ('cli', 'mcp', 'dashboard', 'system')),
  issued_at TEXT NOT NULL CHECK(length(issued_at) = 24 AND substr(issued_at, 24, 1) = 'Z'),
  task_id TEXT CHECK(task_id IS NULL OR (length(task_id) = 36 AND task_id = lower(task_id))),
  attempt_id TEXT CHECK(attempt_id IS NULL OR (length(attempt_id) = 36 AND attempt_id = lower(attempt_id))),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK(
    (kind = 'task.submit' AND task_id IS NOT NULL AND attempt_id IS NULL)
    OR (kind = 'attempt.set-desired-state' AND task_id IS NULL AND attempt_id IS NOT NULL)
    OR (kind = 'daemon.reconcile' AND task_id IS NULL)
  )
) STRICT;

CREATE INDEX commands_kind_issued_at_idx ON commands(kind, issued_at);
CREATE INDEX commands_attempt_id_idx ON commands(attempt_id) WHERE attempt_id IS NOT NULL;

CREATE TABLE task_snapshots (
  task_id TEXT PRIMARY KEY CHECK(length(task_id) = 36 AND task_id = lower(task_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  project_id TEXT NOT NULL CHECK(length(project_id) = 36 AND project_id = lower(project_id)),
  repository_id TEXT NOT NULL CHECK(length(repository_id) = 36 AND repository_id = lower(repository_id)),
  base_commit TEXT NOT NULL CHECK(length(base_commit) IN (40, 64) AND base_commit = lower(base_commit)),
  task_spec_digest TEXT NOT NULL UNIQUE CHECK(
    length(task_spec_digest) = 71
    AND substr(task_spec_digest, 1, 7) = 'sha256:'
    AND task_spec_digest = lower(task_spec_digest)
  ),
  submitted_by_command_id TEXT NOT NULL UNIQUE REFERENCES commands(command_id),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object')
) STRICT;

CREATE INDEX task_snapshots_project_created_at_idx
  ON task_snapshots(project_id, created_at);
CREATE INDEX task_snapshots_repository_created_at_idx
  ON task_snapshots(repository_id, created_at);

CREATE TABLE attempts (
  attempt_id TEXT PRIMARY KEY CHECK(length(attempt_id) = 36 AND attempt_id = lower(attempt_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  task_id TEXT NOT NULL REFERENCES task_snapshots(task_id),
  task_spec_digest TEXT NOT NULL CHECK(
    length(task_spec_digest) = 71
    AND substr(task_spec_digest, 1, 7) = 'sha256:'
    AND task_spec_digest = lower(task_spec_digest)
  ),
  attempt_number INTEGER NOT NULL CHECK(attempt_number > 0),
  state TEXT NOT NULL CHECK(state IN ('queued', 'running', 'paused', 'blocked', 'succeeded', 'failed', 'cancelled')),
  desired_state TEXT NOT NULL CHECK(desired_state IN ('running', 'paused', 'cancelled')),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  fence INTEGER NOT NULL CHECK(fence >= 0),
  current_step_id TEXT CHECK(
    current_step_id IS NULL
    OR (length(current_step_id) = 36 AND current_step_id = lower(current_step_id))
  ),
  blocker_json TEXT CHECK(blocker_json IS NULL OR (json_valid(blocker_json) AND json_type(blocker_json) = 'object')),
  outcome_json TEXT CHECK(outcome_json IS NULL OR (json_valid(outcome_json) AND json_type(outcome_json) = 'object')),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  terminal_at TEXT CHECK(terminal_at IS NULL OR (length(terminal_at) = 24 AND substr(terminal_at, 24, 1) = 'Z')),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE(task_id, attempt_number),
  CHECK(updated_at >= created_at),
  CHECK(
    (state IN ('succeeded', 'failed', 'cancelled') AND outcome_json IS NOT NULL AND terminal_at IS NOT NULL)
    OR (state NOT IN ('succeeded', 'failed', 'cancelled') AND outcome_json IS NULL AND terminal_at IS NULL)
  )
) STRICT;

CREATE INDEX attempts_state_updated_at_idx ON attempts(state, updated_at);
CREATE INDEX attempts_desired_state_state_idx ON attempts(desired_state, state);

CREATE TABLE steps (
  step_id TEXT PRIMARY KEY CHECK(length(step_id) = 36 AND step_id = lower(step_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id),
  ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
  operation TEXT NOT NULL CHECK(length(operation) BETWEEN 3 AND 128),
  state TEXT NOT NULL CHECK(state IN ('pending', 'running', 'blocked', 'succeeded', 'failed', 'cancelled', 'skipped')),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  last_fence INTEGER NOT NULL CHECK(last_fence >= 0),
  run_count INTEGER NOT NULL CHECK(run_count >= 0),
  input_digest TEXT NOT NULL CHECK(
    length(input_digest) = 71 AND substr(input_digest, 1, 7) = 'sha256:' AND input_digest = lower(input_digest)
  ),
  output_digest TEXT CHECK(
    output_digest IS NULL
    OR (length(output_digest) = 71 AND substr(output_digest, 1, 7) = 'sha256:' AND output_digest = lower(output_digest))
  ),
  blocker_json TEXT CHECK(blocker_json IS NULL OR (json_valid(blocker_json) AND json_type(blocker_json) = 'object')),
  failure_json TEXT CHECK(failure_json IS NULL OR (json_valid(failure_json) AND json_type(failure_json) = 'object')),
  started_at TEXT CHECK(started_at IS NULL OR (length(started_at) = 24 AND substr(started_at, 24, 1) = 'Z')),
  finished_at TEXT CHECK(finished_at IS NULL OR (length(finished_at) = 24 AND substr(finished_at, 24, 1) = 'Z')),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE(attempt_id, ordinal),
  CHECK(finished_at IS NULL OR (started_at IS NOT NULL AND finished_at >= started_at))
) STRICT;

CREATE INDEX steps_attempt_state_idx ON steps(attempt_id, state);

CREATE TABLE leases (
  lease_key TEXT PRIMARY KEY CHECK(length(lease_key) BETWEEN 1 AND 300),
  attempt_id TEXT REFERENCES attempts(attempt_id),
  owner_id TEXT NOT NULL CHECK(length(owner_id) BETWEEN 1 AND 200),
  fence INTEGER NOT NULL CHECK(fence >= 0),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  acquired_at TEXT NOT NULL CHECK(length(acquired_at) = 24 AND substr(acquired_at, 24, 1) = 'Z'),
  heartbeat_at TEXT NOT NULL CHECK(length(heartbeat_at) = 24 AND substr(heartbeat_at, 24, 1) = 'Z'),
  expires_at TEXT NOT NULL CHECK(length(expires_at) = 24 AND substr(expires_at, 24, 1) = 'Z'),
  CHECK(heartbeat_at >= acquired_at),
  CHECK(expires_at > heartbeat_at)
) STRICT;

CREATE INDEX leases_attempt_id_idx ON leases(attempt_id) WHERE attempt_id IS NOT NULL;
CREATE INDEX leases_expires_at_idx ON leases(expires_at);

CREATE TABLE events (
  event_id TEXT PRIMARY KEY CHECK(length(event_id) = 36 AND event_id = lower(event_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id),
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  type TEXT NOT NULL CHECK(type IN (
    'attempt.created',
    'attempt.state-changed',
    'attempt.desired-state-changed',
    'attempt.fence-claimed',
    'step.created',
    'step.state-changed',
    'evidence.recorded',
    'commit.recorded'
  )),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at) = 24 AND substr(occurred_at, 24, 1) = 'Z'),
  command_id TEXT REFERENCES commands(command_id),
  causation_event_id TEXT REFERENCES events(event_id),
  fence INTEGER NOT NULL CHECK(fence >= 0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE(attempt_id, sequence)
) STRICT;

CREATE INDEX events_attempt_occurred_at_idx ON events(attempt_id, occurred_at);
CREATE INDEX events_command_id_idx ON events(command_id) WHERE command_id IS NOT NULL;
CREATE INDEX events_type_occurred_at_idx ON events(type, occurred_at);

CREATE TABLE artifacts (
  digest TEXT PRIMARY KEY CHECK(
    length(digest) = 71
    AND substr(digest, 1, 7) = 'sha256:'
    AND digest = lower(digest)
  ),
  byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
  media_type TEXT NOT NULL CHECK(length(media_type) BETWEEN 1 AND 200),
  logical_name TEXT NOT NULL CHECK(length(logical_name) BETWEEN 1 AND 200),
  storage_path TEXT NOT NULL UNIQUE CHECK(substr(storage_path, 1, 1) = '/'),
  recorded_at TEXT NOT NULL CHECK(length(recorded_at) = 24 AND substr(recorded_at, 24, 1) = 'Z')
) STRICT;

CREATE INDEX artifacts_recorded_at_idx ON artifacts(recorded_at);

CREATE TRIGGER commands_reject_update
BEFORE UPDATE ON commands BEGIN
  SELECT RAISE(ABORT, 'commands are immutable');
END;
CREATE TRIGGER commands_reject_delete
BEFORE DELETE ON commands BEGIN
  SELECT RAISE(ABORT, 'commands are immutable');
END;
CREATE TRIGGER task_snapshots_reject_update
BEFORE UPDATE ON task_snapshots BEGIN
  SELECT RAISE(ABORT, 'task snapshots are immutable');
END;
CREATE TRIGGER task_snapshots_reject_delete
BEFORE DELETE ON task_snapshots BEGIN
  SELECT RAISE(ABORT, 'task snapshots are immutable');
END;
CREATE TRIGGER events_reject_update
BEFORE UPDATE ON events BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
CREATE TRIGGER events_reject_delete
BEFORE DELETE ON events BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
CREATE TRIGGER artifacts_reject_update
BEFORE UPDATE ON artifacts BEGIN
  SELECT RAISE(ABORT, 'artifact records are immutable');
END;
CREATE TRIGGER artifacts_reject_delete
BEFORE DELETE ON artifacts BEGIN
  SELECT RAISE(ABORT, 'artifact records are immutable');
END;
`,
};
