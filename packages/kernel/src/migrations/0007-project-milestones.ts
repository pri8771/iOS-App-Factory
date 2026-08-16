import type { SqlMigration } from "../migration-types.js";

/**
 * Studio project milestones: an operator-authored plan (`stage`/`gate`/
 * `release` markers per project phase) that the Studio timeline draws next
 * to the actuals derived from attempts. Two tables:
 *
 * - `project_milestones` holds the head revision of each milestone. It is
 *   updatable, but only through the repository's compare-and-set upsert:
 *   identity columns are immutable, `revision` must advance by exactly one
 *   with a strictly later `updated_at`, and rows are never deleted.
 * - `project_milestone_revisions` is the append-only history: one row per
 *   accepted upsert, keyed by the client-issued `command_id` (UNIQUE, so a
 *   replayed command is idempotent) and carrying the full milestone payload
 *   at that revision. An insert guard proves each history row mirrors the
 *   head row it was written alongside.
 *
 * `target_date` is nullable on purpose and NULL is a first-class value ("no
 * honest estimate"; Studio renders it as "won't guess"). Nothing here or in
 * the repository defaults, infers, or backfills a date. When present it must
 * be a real calendar day: SQLite's `date()` normalizes an overflow such as
 * `2026-02-30` to a different day and returns NULL for garbage, so `IS`
 * (rather than `=`, which a NULL would silently pass) pins the exact text.
 *
 * Milestones deliberately live outside the attempt-scoped `commands`/`events`
 * tables; they are a separate aggregate with its own ledger, so widening the
 * `commands.kind` CHECK constraint (a full table rebuild) is not needed.
 */
export const projectMilestonesMigration: SqlMigration = {
  version: 7,
  name: "project-milestones",
  sql: String.raw`
CREATE TABLE project_milestones (
  milestone_id TEXT PRIMARY KEY CHECK(length(milestone_id) = 36 AND milestone_id = lower(milestone_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  project_id TEXT NOT NULL CHECK(length(project_id) = 36 AND project_id = lower(project_id)),
  phase TEXT NOT NULL CHECK(length(phase) BETWEEN 1 AND 64 AND phase = lower(phase)),
  kind TEXT NOT NULL CHECK(kind IN ('stage', 'gate', 'release')),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 200),
  target_date TEXT CHECK(
    target_date IS NULL OR (length(target_date) = 10 AND date(target_date) IS target_date)
  ),
  owner TEXT NOT NULL CHECK(owner IN ('human', 'machine')),
  status TEXT NOT NULL CHECK(status IN ('planned', 'active', 'done', 'abandoned')),
  evidence_digest TEXT CHECK(
    evidence_digest IS NULL OR (
      length(evidence_digest) = 71
      AND substr(evidence_digest, 1, 7) = 'sha256:'
      AND evidence_digest = lower(evidence_digest)
    )
  ),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK(updated_at >= created_at),
  CHECK((revision = 0 AND updated_at = created_at) OR (revision > 0 AND updated_at > created_at))
) STRICT;

CREATE INDEX project_milestones_project_target_idx
  ON project_milestones(project_id, target_date, milestone_id);

CREATE TABLE project_milestone_revisions (
  milestone_id TEXT NOT NULL REFERENCES project_milestones(milestone_id),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  command_id TEXT NOT NULL UNIQUE CHECK(length(command_id) = 36 AND command_id = lower(command_id)),
  origin TEXT NOT NULL CHECK(origin IN ('cli', 'mcp', 'dashboard', 'system')),
  issued_at TEXT NOT NULL CHECK(length(issued_at) = 24 AND substr(issued_at, 24, 1) = 'Z'),
  expected_revision INTEGER CHECK(expected_revision IS NULL OR expected_revision >= 0),
  recorded_at TEXT NOT NULL CHECK(length(recorded_at) = 24 AND substr(recorded_at, 24, 1) = 'Z'),
  command_json TEXT NOT NULL CHECK(json_valid(command_json) AND json_type(command_json) = 'object'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  PRIMARY KEY(milestone_id, revision),
  CHECK(
    (revision = 0 AND expected_revision IS NULL)
    OR (revision > 0 AND expected_revision = revision - 1)
  )
) STRICT;

CREATE INDEX project_milestone_revisions_recorded_at_idx
  ON project_milestone_revisions(recorded_at, milestone_id);

CREATE TRIGGER project_milestones_start_at_revision_zero
BEFORE INSERT ON project_milestones WHEN NEW.revision <> 0 BEGIN
  SELECT RAISE(ABORT, 'a new milestone starts at revision 0');
END;
CREATE TRIGGER project_milestones_identity_immutable
BEFORE UPDATE OF milestone_id, schema_version, project_id, created_at ON project_milestones BEGIN
  SELECT RAISE(ABORT, 'milestone identity is immutable');
END;
CREATE TRIGGER project_milestones_revision_monotonic
BEFORE UPDATE ON project_milestones WHEN NOT (
  NEW.revision = OLD.revision + 1 AND NEW.updated_at > OLD.updated_at
) BEGIN
  SELECT RAISE(ABORT, 'milestone revision or updated_at is not monotonic');
END;
CREATE TRIGGER project_milestones_reject_delete
BEFORE DELETE ON project_milestones BEGIN
  SELECT RAISE(ABORT, 'project milestones are retained');
END;

CREATE TRIGGER project_milestone_revisions_match_head
BEFORE INSERT ON project_milestone_revisions WHEN NOT EXISTS (
  SELECT 1 FROM project_milestones m
  WHERE m.milestone_id = NEW.milestone_id
    AND m.revision = NEW.revision
    AND m.updated_at = NEW.recorded_at
    AND m.payload_json = NEW.payload_json
) BEGIN
  SELECT RAISE(ABORT, 'milestone revision does not match the milestone head');
END;
CREATE TRIGGER project_milestone_revisions_reject_update
BEFORE UPDATE ON project_milestone_revisions BEGIN
  SELECT RAISE(ABORT, 'milestone revisions are append-only');
END;
CREATE TRIGGER project_milestone_revisions_reject_delete
BEFORE DELETE ON project_milestone_revisions BEGIN
  SELECT RAISE(ABORT, 'milestone revisions are append-only');
END;
`,
};
