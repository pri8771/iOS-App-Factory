import type { SqlMigration } from "../migration-types.js";

/**
 * Studio Phase 4: user-editable Phase Presets (`docs/roadmap/STUDIO_PHASES.md` Phase 4). Two
 * aggregates, each following the exact immutable-history pattern migration 0007
 * (`project-milestones`) established:
 *
 * - `phase_definitions` / `phase_definition_revisions` — the durable, independently-revisioned
 *   library of reusable phase definitions (`phase.upsert`). `phase_id` is a stable, operator-
 *   chosen key (`contract`, `ready`, ...), not a generated UUID.
 * - `phase_presets` / `phase_preset_revisions` — durable, independently-revisioned ordered
 *   bundles of phases (`preset.upsert`/`preset.list`). A preset embeds each phase's full,
 *   already-durable `PhaseDefinitionV1` value in `payload_json` at save time (a snapshot, not a
 *   live reference), so a preset stays self-contained even as the `phase_definitions` library
 *   changes later.
 *
 * Both parent tables are updatable only through a repository's compare-and-set upsert: identity
 * columns are immutable, `revision` must advance by exactly one with a strictly later
 * `updated_at`, and rows are never deleted. Both revision tables are append-only, keyed by the
 * client-issued `command_id` (UNIQUE) so a replayed command is idempotent.
 */
export const phasePresetsMigration: SqlMigration = {
  version: 9,
  name: "phase-presets",
  sql: String.raw`
CREATE TABLE phase_definitions (
  phase_id TEXT PRIMARY KEY CHECK(length(phase_id) BETWEEN 1 AND 64 AND phase_id = lower(phase_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  purpose TEXT NOT NULL CHECK(length(purpose) BETWEEN 1 AND 2000),
  mode TEXT NOT NULL CHECK(mode IN ('solo', 'panel', 'debate', 'chat')),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK(updated_at >= created_at),
  CHECK((revision = 0 AND updated_at = created_at) OR (revision > 0 AND updated_at > created_at))
) STRICT;

CREATE INDEX phase_definitions_updated_at_idx ON phase_definitions(updated_at, phase_id);

CREATE TABLE phase_definition_revisions (
  phase_id TEXT NOT NULL REFERENCES phase_definitions(phase_id),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  command_id TEXT NOT NULL UNIQUE CHECK(length(command_id) = 36 AND command_id = lower(command_id)),
  origin TEXT NOT NULL CHECK(origin IN ('cli', 'mcp', 'dashboard', 'system')),
  issued_at TEXT NOT NULL CHECK(length(issued_at) = 24 AND substr(issued_at, 24, 1) = 'Z'),
  expected_revision INTEGER CHECK(expected_revision IS NULL OR expected_revision >= 0),
  recorded_at TEXT NOT NULL CHECK(length(recorded_at) = 24 AND substr(recorded_at, 24, 1) = 'Z'),
  command_json TEXT NOT NULL CHECK(json_valid(command_json) AND json_type(command_json) = 'object'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  PRIMARY KEY(phase_id, revision),
  CHECK(
    (revision = 0 AND expected_revision IS NULL)
    OR (revision > 0 AND expected_revision = revision - 1)
  )
) STRICT;

CREATE INDEX phase_definition_revisions_recorded_at_idx
  ON phase_definition_revisions(recorded_at, phase_id);

CREATE TRIGGER phase_definitions_start_at_revision_zero
BEFORE INSERT ON phase_definitions WHEN NEW.revision <> 0 BEGIN
  SELECT RAISE(ABORT, 'a new phase definition starts at revision 0');
END;
CREATE TRIGGER phase_definitions_identity_immutable
BEFORE UPDATE OF phase_id, schema_version, created_at ON phase_definitions BEGIN
  SELECT RAISE(ABORT, 'phase definition identity is immutable');
END;
CREATE TRIGGER phase_definitions_revision_monotonic
BEFORE UPDATE ON phase_definitions WHEN NOT (
  NEW.revision = OLD.revision + 1 AND NEW.updated_at > OLD.updated_at
) BEGIN
  SELECT RAISE(ABORT, 'phase definition revision or updated_at is not monotonic');
END;
CREATE TRIGGER phase_definitions_reject_delete
BEFORE DELETE ON phase_definitions BEGIN
  SELECT RAISE(ABORT, 'phase definitions are retained');
END;

CREATE TRIGGER phase_definition_revisions_match_head
BEFORE INSERT ON phase_definition_revisions WHEN NOT EXISTS (
  SELECT 1 FROM phase_definitions d
  WHERE d.phase_id = NEW.phase_id
    AND d.revision = NEW.revision
    AND d.updated_at = NEW.recorded_at
    AND d.payload_json = NEW.payload_json
) BEGIN
  SELECT RAISE(ABORT, 'phase definition revision does not match the phase definition head');
END;
CREATE TRIGGER phase_definition_revisions_reject_update
BEFORE UPDATE ON phase_definition_revisions BEGIN
  SELECT RAISE(ABORT, 'phase definition revisions are append-only');
END;
CREATE TRIGGER phase_definition_revisions_reject_delete
BEFORE DELETE ON phase_definition_revisions BEGIN
  SELECT RAISE(ABORT, 'phase definition revisions are append-only');
END;

CREATE TABLE phase_presets (
  preset_id TEXT PRIMARY KEY CHECK(length(preset_id) BETWEEN 1 AND 96 AND preset_id = lower(preset_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK(updated_at >= created_at),
  CHECK((revision = 0 AND updated_at = created_at) OR (revision > 0 AND updated_at > created_at))
) STRICT;

CREATE INDEX phase_presets_updated_at_idx ON phase_presets(updated_at, preset_id);

CREATE TABLE phase_preset_revisions (
  preset_id TEXT NOT NULL REFERENCES phase_presets(preset_id),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  command_id TEXT NOT NULL UNIQUE CHECK(length(command_id) = 36 AND command_id = lower(command_id)),
  origin TEXT NOT NULL CHECK(origin IN ('cli', 'mcp', 'dashboard', 'system')),
  issued_at TEXT NOT NULL CHECK(length(issued_at) = 24 AND substr(issued_at, 24, 1) = 'Z'),
  expected_revision INTEGER CHECK(expected_revision IS NULL OR expected_revision >= 0),
  recorded_at TEXT NOT NULL CHECK(length(recorded_at) = 24 AND substr(recorded_at, 24, 1) = 'Z'),
  command_json TEXT NOT NULL CHECK(json_valid(command_json) AND json_type(command_json) = 'object'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  PRIMARY KEY(preset_id, revision),
  CHECK(
    (revision = 0 AND expected_revision IS NULL)
    OR (revision > 0 AND expected_revision = revision - 1)
  )
) STRICT;

CREATE INDEX phase_preset_revisions_recorded_at_idx
  ON phase_preset_revisions(recorded_at, preset_id);

CREATE TRIGGER phase_presets_start_at_revision_zero
BEFORE INSERT ON phase_presets WHEN NEW.revision <> 0 BEGIN
  SELECT RAISE(ABORT, 'a new phase preset starts at revision 0');
END;
CREATE TRIGGER phase_presets_identity_immutable
BEFORE UPDATE OF preset_id, schema_version, created_at ON phase_presets BEGIN
  SELECT RAISE(ABORT, 'phase preset identity is immutable');
END;
CREATE TRIGGER phase_presets_revision_monotonic
BEFORE UPDATE ON phase_presets WHEN NOT (
  NEW.revision = OLD.revision + 1 AND NEW.updated_at > OLD.updated_at
) BEGIN
  SELECT RAISE(ABORT, 'phase preset revision or updated_at is not monotonic');
END;
CREATE TRIGGER phase_presets_reject_delete
BEFORE DELETE ON phase_presets BEGIN
  SELECT RAISE(ABORT, 'phase presets are retained');
END;

CREATE TRIGGER phase_preset_revisions_match_head
BEFORE INSERT ON phase_preset_revisions WHEN NOT EXISTS (
  SELECT 1 FROM phase_presets p
  WHERE p.preset_id = NEW.preset_id
    AND p.revision = NEW.revision
    AND p.updated_at = NEW.recorded_at
    AND p.payload_json = NEW.payload_json
) BEGIN
  SELECT RAISE(ABORT, 'phase preset revision does not match the phase preset head');
END;
CREATE TRIGGER phase_preset_revisions_reject_update
BEFORE UPDATE ON phase_preset_revisions BEGIN
  SELECT RAISE(ABORT, 'phase preset revisions are append-only');
END;
CREATE TRIGGER phase_preset_revisions_reject_delete
BEFORE DELETE ON phase_preset_revisions BEGIN
  SELECT RAISE(ABORT, 'phase preset revisions are append-only');
END;
`,
};
