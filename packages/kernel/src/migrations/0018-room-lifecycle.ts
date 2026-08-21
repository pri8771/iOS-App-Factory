import type { SqlMigration } from "../migration-types.js";

/**
 * Room mutability (Architecture decision 7): `room.update` -- a CAS patch over the fields the
 * moderator allows to change post-creation. `roomId`, `projectId`, `flavor`, `createdAt`, and the
 * transcript itself stay immutable.
 *
 * `rooms.flavor` backfills every pre-existing row to `'room'` via `DEFAULT 'room'` on the `ADD
 * COLUMN` -- SQLite applies a column's default to every existing row when the column is added, so
 * a room created before this migration keeps parsing as `RoomFlavorV1Schema`'s own
 * `.default("room")` would already have inferred. `rooms.archived_at` mirrors `RoomV1Schema`'s
 * `archivedAt` (Architecture decision 7: archive is soft -- the room, its transcript, and its
 * history stay intact; only `room.list` hides it by default).
 *
 * `room_participants.removed_at` makes participant removal soft too: the FK from `room_grants` to
 * `room_participants(room_id, persona)` stays valid for a removed participant's historical grants;
 * "at least one active participant" and "a `direct` room's removal is only ever an atomic swap" are
 * daemon-side invariants, not something this column alone enforces.
 *
 * `room_updates` is the append-only audit trail for every `room.update`: NOT a transcript system
 * line, because a transcript `system_code` lives in a SQL CHECK enum (`room_messages`) that cannot
 * be altered without a migration, and an update's patch shape will keep growing.
 * `command_id` is UNIQUE so a replayed `room.update` command is recognizable as a duplicate rather
 * than a second audit entry.
 */
export const roomLifecycleMigration: SqlMigration = {
  version: 18,
  name: "room-lifecycle",
  sql: String.raw`
ALTER TABLE rooms ADD COLUMN flavor TEXT NOT NULL DEFAULT 'room' CHECK(flavor IN ('room', 'direct'));

ALTER TABLE rooms ADD COLUMN archived_at TEXT
  CHECK(archived_at IS NULL OR (length(archived_at) = 24 AND substr(archived_at, 24, 1) = 'Z'));

ALTER TABLE room_participants ADD COLUMN removed_at TEXT
  CHECK(removed_at IS NULL OR (length(removed_at) = 24 AND substr(removed_at, 24, 1) = 'Z'));

CREATE TABLE room_updates (
  update_id TEXT PRIMARY KEY CHECK(length(update_id) = 36 AND update_id = lower(update_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  room_id TEXT NOT NULL REFERENCES rooms(room_id),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at) = 24 AND substr(occurred_at, 24, 1) = 'Z'),
  command_id TEXT NOT NULL UNIQUE CHECK(length(command_id) = 36 AND command_id = lower(command_id)),
  patch_json TEXT NOT NULL CHECK(json_valid(patch_json) AND json_type(patch_json) = 'object')
) STRICT;

CREATE INDEX room_updates_room_idx ON room_updates(room_id, occurred_at, update_id);

CREATE TRIGGER room_updates_reject_update
BEFORE UPDATE ON room_updates BEGIN
  SELECT RAISE(ABORT, 'a room update audit row is a dated fact and is never rewritten');
END;
CREATE TRIGGER room_updates_reject_delete
BEFORE DELETE ON room_updates BEGIN
  SELECT RAISE(ABORT, 'room update audit rows are retained');
END;
`,
};
