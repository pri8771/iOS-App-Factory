import type { SqlMigration } from "../migration-types.js";

/**
 * Studio rooms: a moderated, single-writer transcript per room plus the rows
 * the deterministic moderator resumes from after a restart (the room lock,
 * the outstanding budget reservation, the poll round counter, and the
 * pending trigger).
 *
 * - `rooms` carries the moderator state: `head_sequence` (the transcript
 *   head every grant is stamped against), `active_grant_id` (the room lock:
 *   the single generation in flight), `round_counter`, `pending_trigger_json`,
 *   `last_human_at`, and `human_typing_until`.
 * - `room_messages` is append-only and single-writer: a BEFORE INSERT trigger
 *   refuses any row whose sequence is not exactly `head_sequence + 1`, and an
 *   AFTER INSERT trigger advances the head in the same statement, so two
 *   writers can never both append at the same head. UPDATE/DELETE are
 *   rejected outright.
 * - `room_grants` are wall-clock leases with an owner pid; a partial unique
 *   index guarantees at most one active/held grant per room even if
 *   application code races.
 * - `room_budgets` are reservations (`reserved_tokens`) plus recorded spend
 *   for the current UTC day.
 */
export const studioRoomsMigration: SqlMigration = {
  version: 7,
  name: "studio-rooms",
  sql: String.raw`
CREATE TABLE rooms (
  room_id TEXT PRIMARY KEY CHECK(length(room_id) = 36 AND room_id = lower(room_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  project_id TEXT CHECK(project_id IS NULL OR (length(project_id) = 36 AND project_id = lower(project_id))),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  unattended_enabled INTEGER NOT NULL CHECK(unattended_enabled IN (0, 1)),
  agent_cooldown_events INTEGER NOT NULL CHECK(agent_cooldown_events BETWEEN 1 AND 1000),
  head_sequence INTEGER NOT NULL DEFAULT 0 CHECK(head_sequence >= 0),
  head_message_id TEXT CHECK(head_message_id IS NULL OR (length(head_message_id) = 36 AND head_message_id = lower(head_message_id))),
  last_human_at TEXT CHECK(last_human_at IS NULL OR (length(last_human_at) = 24 AND substr(last_human_at, 24, 1) = 'Z')),
  human_typing_until TEXT CHECK(human_typing_until IS NULL OR (length(human_typing_until) = 24 AND substr(human_typing_until, 24, 1) = 'Z')),
  round_counter INTEGER NOT NULL DEFAULT 0 CHECK(round_counter >= 0),
  active_grant_id TEXT CHECK(active_grant_id IS NULL OR (length(active_grant_id) = 36 AND active_grant_id = lower(active_grant_id))),
  pending_trigger_json TEXT CHECK(pending_trigger_json IS NULL OR (json_valid(pending_trigger_json) AND json_type(pending_trigger_json) = 'object')),
  create_spec_json TEXT NOT NULL CHECK(json_valid(create_spec_json) AND json_type(create_spec_json) = 'object'),
  CHECK((head_sequence = 0) = (head_message_id IS NULL))
) STRICT;

CREATE INDEX rooms_updated_at_room_id_idx ON rooms(updated_at DESC, room_id DESC);
CREATE INDEX rooms_pending_trigger_idx ON rooms(room_id) WHERE pending_trigger_json IS NOT NULL;

CREATE TABLE room_participants (
  room_id TEXT NOT NULL REFERENCES rooms(room_id),
  persona TEXT NOT NULL CHECK(length(persona) BETWEEN 1 AND 64 AND persona = lower(persona)),
  provider TEXT NOT NULL CHECK(length(provider) BETWEEN 1 AND 64 AND provider = lower(provider)),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 100),
  position INTEGER NOT NULL CHECK(position >= 0),
  benched_until TEXT CHECK(benched_until IS NULL OR (length(benched_until) = 24 AND substr(benched_until, 24, 1) = 'Z')),
  bench_reason TEXT CHECK(bench_reason IS NULL OR bench_reason IN ('limit', 'timeout', 'capacity', 'internal')),
  PRIMARY KEY (room_id, persona),
  UNIQUE (room_id, position),
  CHECK((benched_until IS NULL) = (bench_reason IS NULL))
) STRICT;

CREATE INDEX room_participants_provider_idx ON room_participants(provider);

CREATE TABLE room_messages (
  room_id TEXT NOT NULL REFERENCES rooms(room_id),
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  message_id TEXT NOT NULL UNIQUE CHECK(length(message_id) = 36 AND message_id = lower(message_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at) = 24 AND substr(occurred_at, 24, 1) = 'Z'),
  kind TEXT NOT NULL CHECK(kind IN ('message', 'system')),
  author_kind TEXT NOT NULL CHECK(author_kind IN ('human', 'agent', 'system')),
  author_handle TEXT CHECK(author_handle IS NULL OR length(author_handle) BETWEEN 1 AND 64),
  system_code TEXT CHECK(system_code IS NULL OR system_code IN (
    'all-passed', 'agent-passed', 'agent-error', 'factory-event', 'room-dormant', 'throttled',
    'budget-exhausted', 'chain-cap', 'grant-orphaned', 'contribution-dropped',
    'contribution-revised', 'scorer-unavailable'
  )),
  round_number INTEGER CHECK(round_number IS NULL OR round_number >= 0),
  grant_id TEXT CHECK(grant_id IS NULL OR (length(grant_id) = 36 AND grant_id = lower(grant_id))),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  PRIMARY KEY (room_id, sequence),
  CHECK((kind = 'message' AND author_kind IN ('human', 'agent') AND author_handle IS NOT NULL AND system_code IS NULL)
     OR (kind = 'system' AND author_kind = 'system' AND author_handle IS NULL AND system_code IS NOT NULL))
) STRICT;

CREATE INDEX room_messages_room_author_idx ON room_messages(room_id, author_kind, sequence);

CREATE TRIGGER room_messages_single_writer
BEFORE INSERT ON room_messages BEGIN
  SELECT CASE
    WHEN NEW.sequence IS NOT (SELECT head_sequence + 1 FROM rooms WHERE room_id = NEW.room_id)
      THEN RAISE(ABORT, 'room transcript head moved; append rejected')
  END;
END;

CREATE TRIGGER room_messages_advance_head
AFTER INSERT ON room_messages BEGIN
  UPDATE rooms
  SET head_sequence = NEW.sequence,
      head_message_id = NEW.message_id,
      updated_at = CASE WHEN NEW.occurred_at > updated_at THEN NEW.occurred_at ELSE updated_at END
  WHERE room_id = NEW.room_id;
END;

CREATE TRIGGER room_messages_reject_update
BEFORE UPDATE ON room_messages BEGIN
  SELECT RAISE(ABORT, 'room messages are append-only');
END;
CREATE TRIGGER room_messages_reject_delete
BEFORE DELETE ON room_messages BEGIN
  SELECT RAISE(ABORT, 'room messages are append-only');
END;

CREATE TABLE room_grants (
  grant_id TEXT PRIMARY KEY CHECK(length(grant_id) = 36 AND grant_id = lower(grant_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  room_id TEXT NOT NULL REFERENCES rooms(room_id),
  round_number INTEGER NOT NULL CHECK(round_number > 0),
  persona TEXT NOT NULL,
  head_sequence INTEGER NOT NULL CHECK(head_sequence >= 0),
  state TEXT NOT NULL CHECK(state IN ('active', 'held', 'committed', 'passed', 'failed', 'dropped', 'orphaned')),
  owner_pid INTEGER NOT NULL CHECK(owner_pid > 0),
  worker_pid INTEGER CHECK(worker_pid IS NULL OR worker_pid > 0),
  reserved_tokens INTEGER NOT NULL CHECK(reserved_tokens > 0),
  lease_expires_at TEXT NOT NULL CHECK(length(lease_expires_at) = 24 AND substr(lease_expires_at, 24, 1) = 'Z'),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  held_text TEXT CHECK(held_text IS NULL OR length(held_text) BETWEEN 1 AND 20000),
  outcome_json TEXT CHECK(outcome_json IS NULL OR (json_valid(outcome_json) AND json_type(outcome_json) = 'object')),
  FOREIGN KEY (room_id, persona) REFERENCES room_participants(room_id, persona),
  CHECK((state IN ('active', 'held')) = (outcome_json IS NULL)),
  CHECK((state = 'held') = (held_text IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX room_grants_single_generation_idx
  ON room_grants(room_id) WHERE state IN ('active', 'held');
CREATE INDEX room_grants_room_round_idx ON room_grants(room_id, round_number);
CREATE INDEX room_grants_open_owner_idx ON room_grants(owner_pid) WHERE state IN ('active', 'held');

CREATE TABLE room_budgets (
  room_id TEXT PRIMARY KEY REFERENCES rooms(room_id),
  day_key TEXT NOT NULL CHECK(length(day_key) = 10),
  daily_ceiling_tokens INTEGER NOT NULL CHECK(daily_ceiling_tokens > 0),
  unattended_daily_ceiling_tokens INTEGER NOT NULL CHECK(
    unattended_daily_ceiling_tokens >= 0 AND unattended_daily_ceiling_tokens <= daily_ceiling_tokens
  ),
  max_tokens_per_reply INTEGER NOT NULL CHECK(max_tokens_per_reply > 0 AND max_tokens_per_reply <= daily_ceiling_tokens),
  spent_tokens INTEGER NOT NULL DEFAULT 0 CHECK(spent_tokens >= 0),
  reserved_tokens INTEGER NOT NULL DEFAULT 0 CHECK(reserved_tokens >= 0),
  unattended_spent_tokens INTEGER NOT NULL DEFAULT 0 CHECK(unattended_spent_tokens >= 0 AND unattended_spent_tokens <= spent_tokens),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z')
) STRICT;
`,
};
