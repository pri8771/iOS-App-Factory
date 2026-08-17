import type { SqlMigration } from "../migration-types.js";

/**
 * The Project Registry (Seam (a) of the project-registry task): the daemon's durable
 * `ProjectId -> {sourceRepositoryPath, mirror binding ref}` mapping. Two tables, mirroring
 * migration 0007 (`project_milestones`/`project_milestone_revisions`) exactly:
 *
 * - `projects` holds the head revision of each registered project. Updatable only through the
 *   repository's compare-and-set upsert: identity columns are immutable, `revision` must advance by
 *   exactly one with a strictly later `updated_at`, and rows are never deleted.
 * - `project_revisions` is the append-only history: one row per accepted `project.register`,
 *   keyed by the client-issued `command_id` (UNIQUE, so a replayed command is idempotent) and
 *   carrying the full project payload at that revision. An insert guard proves each history row
 *   mirrors the head row it was written alongside.
 *
 * `slug` and `repository_id` are each unique: two registered projects can never share a slug (the
 * operator-facing short name) or a mirror binding (two projects pointing at the same
 * `GitWorkspaceManager` mirror would silently cross-contaminate each other's phase output commits).
 *
 * Projects deliberately live outside the attempt-scoped `commands`/`events` tables; they are a
 * separate aggregate with their own ledger, so widening the `commands.kind` CHECK constraint (a full
 * table rebuild) is not needed.
 */
export const projectRegistryMigration: SqlMigration = {
  version: 12,
  name: "project-registry",
  sql: String.raw`
CREATE TABLE projects (
  project_id TEXT PRIMARY KEY CHECK(length(project_id) = 36 AND project_id = lower(project_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  slug TEXT NOT NULL CHECK(length(slug) BETWEEN 1 AND 64 AND slug = lower(slug)),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 200),
  source_repository_path TEXT NOT NULL CHECK(length(source_repository_path) >= 2),
  repository_id TEXT NOT NULL CHECK(length(repository_id) = 36 AND repository_id = lower(repository_id)),
  standard_version TEXT CHECK(standard_version IS NULL OR length(standard_version) BETWEEN 1 AND 100),
  policy_lock_digest TEXT CHECK(
    policy_lock_digest IS NULL OR (
      length(policy_lock_digest) = 71
      AND substr(policy_lock_digest, 1, 7) = 'sha256:'
      AND policy_lock_digest = lower(policy_lock_digest)
    )
  ),
  docs_dir TEXT NOT NULL CHECK(docs_dir IN ('docs', 'Docs')),
  enrolled_at TEXT NOT NULL CHECK(length(enrolled_at) = 24 AND substr(enrolled_at, 24, 1) = 'Z'),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK(updated_at >= enrolled_at),
  CHECK((revision = 0 AND updated_at = enrolled_at) OR (revision > 0 AND updated_at > enrolled_at))
) STRICT;

CREATE UNIQUE INDEX projects_slug_idx ON projects(slug);
CREATE UNIQUE INDEX projects_repository_id_idx ON projects(repository_id);
CREATE INDEX projects_updated_at_idx ON projects(updated_at, project_id);

CREATE TABLE project_revisions (
  project_id TEXT NOT NULL REFERENCES projects(project_id),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  command_id TEXT NOT NULL UNIQUE CHECK(length(command_id) = 36 AND command_id = lower(command_id)),
  origin TEXT NOT NULL CHECK(origin IN ('cli', 'mcp', 'dashboard', 'system')),
  issued_at TEXT NOT NULL CHECK(length(issued_at) = 24 AND substr(issued_at, 24, 1) = 'Z'),
  expected_revision INTEGER CHECK(expected_revision IS NULL OR expected_revision >= 0),
  recorded_at TEXT NOT NULL CHECK(length(recorded_at) = 24 AND substr(recorded_at, 24, 1) = 'Z'),
  command_json TEXT NOT NULL CHECK(json_valid(command_json) AND json_type(command_json) = 'object'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  PRIMARY KEY(project_id, revision),
  CHECK(
    (revision = 0 AND expected_revision IS NULL)
    OR (revision > 0 AND expected_revision = revision - 1)
  )
) STRICT;

CREATE INDEX project_revisions_recorded_at_idx ON project_revisions(recorded_at, project_id);

CREATE TRIGGER projects_start_at_revision_zero
BEFORE INSERT ON projects WHEN NEW.revision <> 0 BEGIN
  SELECT RAISE(ABORT, 'a new project starts at revision 0');
END;
CREATE TRIGGER projects_identity_immutable
BEFORE UPDATE OF
  project_id, schema_version, slug, source_repository_path, repository_id, enrolled_at
ON projects BEGIN
  SELECT RAISE(ABORT, 'project registry identity is immutable');
END;
CREATE TRIGGER projects_revision_monotonic
BEFORE UPDATE ON projects WHEN NOT (
  NEW.revision = OLD.revision + 1 AND NEW.updated_at > OLD.updated_at
) BEGIN
  SELECT RAISE(ABORT, 'project revision or updated_at is not monotonic');
END;
CREATE TRIGGER projects_reject_delete
BEFORE DELETE ON projects BEGIN
  SELECT RAISE(ABORT, 'registered projects are retained');
END;

CREATE TRIGGER project_revisions_match_head
BEFORE INSERT ON project_revisions WHEN NOT EXISTS (
  SELECT 1 FROM projects p
  WHERE p.project_id = NEW.project_id
    AND p.revision = NEW.revision
    AND p.updated_at = NEW.recorded_at
    AND p.payload_json = NEW.payload_json
) BEGIN
  SELECT RAISE(ABORT, 'project revision does not match the project head');
END;
CREATE TRIGGER project_revisions_reject_update
BEFORE UPDATE ON project_revisions BEGIN
  SELECT RAISE(ABORT, 'project revisions are append-only');
END;
CREATE TRIGGER project_revisions_reject_delete
BEFORE DELETE ON project_revisions BEGIN
  SELECT RAISE(ABORT, 'project revisions are append-only');
END;
`,
};
