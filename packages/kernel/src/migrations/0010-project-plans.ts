import type { SqlMigration } from "../migration-types.js";

/**
 * The Planner: durable, revisioned `project_plans` (`plan.propose`/`plan.edit`/`plan.approve`/
 * `plan.execute`/`plan.approve-gate`/`plan.tick`/`plan.status`). Mirrors migration 0009's
 * `phase_presets` compare-and-set-upsert-plus-append-only-revision-history pattern exactly: every
 * mutation (propose, edit, approve, an execute/tick advancing an item, a gate approval) writes a
 * brand-new whole-plan revision rather than mutating individual item rows, so the append-only
 * `project_plan_revisions` table is always a complete, replayable history of the plan.
 */
export const projectPlansMigration: SqlMigration = {
  version: 10,
  name: "project-plans",
  sql: String.raw`
CREATE TABLE project_plans (
  plan_id TEXT PRIMARY KEY CHECK(length(plan_id) = 36 AND plan_id = lower(plan_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  project_id TEXT CHECK(project_id IS NULL OR (length(project_id) = 36 AND project_id = lower(project_id))),
  preset_id TEXT NOT NULL CHECK(length(preset_id) BETWEEN 1 AND 96),
  state TEXT NOT NULL CHECK(state IN ('draft', 'approved', 'executing', 'complete')),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK(updated_at >= created_at),
  CHECK((revision = 0 AND updated_at = created_at) OR (revision > 0 AND updated_at > created_at))
) STRICT;

CREATE INDEX project_plans_updated_at_idx ON project_plans(updated_at, plan_id);
CREATE INDEX project_plans_project_id_idx ON project_plans(project_id, updated_at);

CREATE TABLE project_plan_revisions (
  plan_id TEXT NOT NULL REFERENCES project_plans(plan_id),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  command_id TEXT NOT NULL UNIQUE CHECK(length(command_id) = 36 AND command_id = lower(command_id)),
  origin TEXT NOT NULL CHECK(origin IN ('cli', 'mcp', 'dashboard', 'system')),
  issued_at TEXT NOT NULL CHECK(length(issued_at) = 24 AND substr(issued_at, 24, 1) = 'Z'),
  expected_revision INTEGER CHECK(expected_revision IS NULL OR expected_revision >= 0),
  recorded_at TEXT NOT NULL CHECK(length(recorded_at) = 24 AND substr(recorded_at, 24, 1) = 'Z'),
  command_json TEXT NOT NULL CHECK(json_valid(command_json) AND json_type(command_json) = 'object'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  PRIMARY KEY(plan_id, revision),
  CHECK(
    (revision = 0 AND expected_revision IS NULL)
    OR (revision > 0 AND expected_revision = revision - 1)
  )
) STRICT;

CREATE INDEX project_plan_revisions_recorded_at_idx
  ON project_plan_revisions(recorded_at, plan_id);

CREATE TRIGGER project_plans_start_at_revision_zero
BEFORE INSERT ON project_plans WHEN NEW.revision <> 0 BEGIN
  SELECT RAISE(ABORT, 'a new project plan starts at revision 0');
END;
CREATE TRIGGER project_plans_identity_immutable
BEFORE UPDATE OF plan_id, schema_version, project_id, preset_id, created_at ON project_plans BEGIN
  SELECT RAISE(ABORT, 'project plan identity is immutable');
END;
CREATE TRIGGER project_plans_revision_monotonic
BEFORE UPDATE ON project_plans WHEN NOT (
  NEW.revision = OLD.revision + 1 AND NEW.updated_at > OLD.updated_at
) BEGIN
  SELECT RAISE(ABORT, 'project plan revision or updated_at is not monotonic');
END;
CREATE TRIGGER project_plans_reject_delete
BEFORE DELETE ON project_plans BEGIN
  SELECT RAISE(ABORT, 'project plans are retained');
END;

CREATE TRIGGER project_plan_revisions_match_head
BEFORE INSERT ON project_plan_revisions WHEN NOT EXISTS (
  SELECT 1 FROM project_plans p
  WHERE p.plan_id = NEW.plan_id
    AND p.revision = NEW.revision
    AND p.updated_at = NEW.recorded_at
    AND p.payload_json = NEW.payload_json
) BEGIN
  SELECT RAISE(ABORT, 'project plan revision does not match the project plan head');
END;
CREATE TRIGGER project_plan_revisions_reject_update
BEFORE UPDATE ON project_plan_revisions BEGIN
  SELECT RAISE(ABORT, 'project plan revisions are append-only');
END;
CREATE TRIGGER project_plan_revisions_reject_delete
BEFORE DELETE ON project_plan_revisions BEGIN
  SELECT RAISE(ABORT, 'project plan revisions are append-only');
END;
`,
};
