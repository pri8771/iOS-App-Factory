import type { SqlMigration } from "../migration-types.js";

/**
 * The room factory-event bridge's durable high-water mark: one row (`cursor_id = 1`) naming the
 * kernel `events` ledger position the daemon-composed bridge has scanned through and turned into
 * `factory-event` room lines. The bridge advances it in the SAME transaction that appends the
 * lines, so a daemon restart can never bridge one kernel attempt transition into a room twice, and
 * never skips one either.
 *
 * `ledger_position` is the `events` table's rowid (append-only, never deleted, single writer);
 * `event_id` is the kernel event at that position, kept so a future rebuild of `events` (which may
 * renumber rowids -- migration 0006 did exactly that) can be re-anchored by id instead of trusting
 * a stale number. `last_delivered_*` and `delivered_count` are operator visibility only.
 *
 * Append-only history is deliberately NOT kept here: the transcript lines themselves
 * (`room_messages` with `system_code = 'factory-event'`) are the durable record of every delivery.
 */
export const roomFactoryEventCursorMigration: SqlMigration = {
  version: 13,
  name: "room-factory-event-cursor",
  sql: String.raw`
CREATE TABLE room_factory_event_cursor (
  cursor_id INTEGER PRIMARY KEY CHECK(cursor_id = 1),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  ledger_position INTEGER NOT NULL CHECK(ledger_position >= 0),
  event_id TEXT CHECK(event_id IS NULL OR (length(event_id) = 36 AND event_id = lower(event_id))),
  event_occurred_at TEXT CHECK(event_occurred_at IS NULL OR (length(event_occurred_at) = 24 AND substr(event_occurred_at, 24, 1) = 'Z')),
  last_delivered_event_id TEXT CHECK(last_delivered_event_id IS NULL OR (length(last_delivered_event_id) = 36 AND last_delivered_event_id = lower(last_delivered_event_id))),
  last_delivered_at TEXT CHECK(last_delivered_at IS NULL OR (length(last_delivered_at) = 24 AND substr(last_delivered_at, 24, 1) = 'Z')),
  delivered_count INTEGER NOT NULL DEFAULT 0 CHECK(delivered_count >= 0),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  CHECK((event_id IS NULL) = (event_occurred_at IS NULL)),
  CHECK((last_delivered_event_id IS NULL) = (last_delivered_at IS NULL)),
  CHECK((ledger_position = 0) = (event_id IS NULL))
) STRICT;

CREATE TRIGGER room_factory_event_cursor_reject_delete
BEFORE DELETE ON room_factory_event_cursor BEGIN
  SELECT RAISE(ABORT, 'the room factory-event cursor is retained');
END;
CREATE TRIGGER room_factory_event_cursor_delivered_count_monotonic
BEFORE UPDATE ON room_factory_event_cursor WHEN NEW.delivered_count < OLD.delivered_count BEGIN
  SELECT RAISE(ABORT, 'the room factory-event delivered count never decreases');
END;
`,
};
