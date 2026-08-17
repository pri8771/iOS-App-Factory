import type { SqlMigration } from "../migration-types.js";

/**
 * Phase Runner (`docs/roadmap/STUDIO_PHASES.md`'s "run my Analyze phase" command): the durable,
 * attempt-shaped `phase_runs` table backing `PhaseRunV1` (`phase.run`/`phase.status`/`phase.list`/
 * `phase.approve`/`phase.reject`).
 *
 * This is the `attempts` pattern (migration 0001), not the `phase_definitions`/`phase_presets`
 * revisioned-document pattern (migration 0009): a run is a finite state machine
 * (`queued -> running -> {awaiting-human ->} succeeded|failed|cancelled`), not an arbitrarily-
 * editable document, so there is no `*_revisions` append-only history table here — the single row
 * mutates in place under `revision`-gated compare-and-set, exactly like `attempts`. `command_id` is
 * the creating `phase.run` command only (immutable, `UNIQUE` — the same idempotency-by-replay key
 * `task_snapshots.submitted_by_command_id` gives `createTaskAttempt`); the later `phase.approve`/
 * `phase.reject` transitions rely on the daemon's own command-result ledger for replay idempotency
 * (`DURABLE_COMMAND_RESULT_OPERATIONS`, `apps/daemon/src/command-runtime.ts`) rather than a second
 * inner ledger here, mirroring `FactoryRepositories.transitionAttemptState`'s own plain-CAS
 * precedent (no per-transition commandId dedup either).
 *
 * `phase_snapshot_digest` is content-addressed, computed once at creation
 * (`computePhaseDefinitionDigest`, `canonical-json.ts`) from the exact `PhaseDefinitionV1` bytes
 * embedded in `payload_json.phaseSnapshot` — not a foreign key to `phase_definitions`, so a later
 * edit to the live phase definition never changes a past run's snapshot.
 */
export const phaseRunsMigration: SqlMigration = {
  version: 11,
  name: "phase-runs",
  sql: String.raw`
CREATE TABLE phase_runs (
  phase_run_id TEXT PRIMARY KEY CHECK(length(phase_run_id) = 36 AND phase_run_id = lower(phase_run_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  command_id TEXT NOT NULL UNIQUE CHECK(length(command_id) = 36 AND command_id = lower(command_id)),
  origin TEXT NOT NULL CHECK(origin IN ('cli', 'mcp', 'dashboard', 'system')),
  issued_at TEXT NOT NULL CHECK(length(issued_at) = 24 AND substr(issued_at, 24, 1) = 'Z'),
  preset_id TEXT CHECK(preset_id IS NULL OR length(preset_id) BETWEEN 1 AND 96),
  phase_id TEXT NOT NULL CHECK(length(phase_id) BETWEEN 1 AND 64),
  project_id TEXT NOT NULL CHECK(length(project_id) = 36 AND project_id = lower(project_id)),
  phase_snapshot_digest TEXT NOT NULL CHECK(
    length(phase_snapshot_digest) = 71
    AND substr(phase_snapshot_digest, 1, 7) = 'sha256:'
    AND phase_snapshot_digest = lower(phase_snapshot_digest)
  ),
  state TEXT NOT NULL CHECK(
    state IN ('queued', 'running', 'awaiting-human', 'succeeded', 'failed', 'cancelled')
  ),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  room_id TEXT CHECK(room_id IS NULL OR (length(room_id) = 36 AND room_id = lower(room_id))),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  started_at TEXT CHECK(started_at IS NULL OR (length(started_at) = 24 AND substr(started_at, 24, 1) = 'Z')),
  finished_at TEXT CHECK(finished_at IS NULL OR (length(finished_at) = 24 AND substr(finished_at, 24, 1) = 'Z')),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK(updated_at >= created_at),
  CHECK(started_at IS NULL OR started_at >= created_at),
  CHECK(finished_at IS NULL OR (started_at IS NOT NULL AND finished_at >= started_at)),
  CHECK(
    (state = 'queued' AND started_at IS NULL)
    OR (state <> 'queued' AND started_at IS NOT NULL)
  ),
  CHECK(
    (state IN ('succeeded', 'failed', 'cancelled') AND finished_at IS NOT NULL)
    OR (state NOT IN ('succeeded', 'failed', 'cancelled') AND finished_at IS NULL)
  )
) STRICT;

CREATE INDEX phase_runs_project_updated_at_idx ON phase_runs(project_id, updated_at);
CREATE INDEX phase_runs_project_state_idx ON phase_runs(project_id, state);
CREATE INDEX phase_runs_state_updated_at_idx ON phase_runs(state, updated_at);
CREATE INDEX phase_runs_phase_id_created_at_idx ON phase_runs(phase_id, created_at);

CREATE TRIGGER phase_runs_start_at_revision_zero
BEFORE INSERT ON phase_runs WHEN NEW.revision <> 0 BEGIN
  SELECT RAISE(ABORT, 'a new phase run starts at revision 0');
END;
CREATE TRIGGER phase_runs_identity_immutable
BEFORE UPDATE OF
  phase_run_id, schema_version, command_id, origin, issued_at,
  preset_id, phase_id, project_id, phase_snapshot_digest, created_at
ON phase_runs BEGIN
  SELECT RAISE(ABORT, 'phase run identity is immutable');
END;
CREATE TRIGGER phase_runs_reject_delete
BEFORE DELETE ON phase_runs BEGIN
  SELECT RAISE(ABORT, 'phase runs are retained');
END;
`,
};
