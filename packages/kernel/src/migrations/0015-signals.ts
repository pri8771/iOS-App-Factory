import type { SqlMigration } from "../migration-types.js";

/**
 * The first slice of the Signal -> Insight -> Opportunity -> Product Bet -> Plan lifecycle: a
 * standing watch (`signals`, mutable -- a living config, not a dated fact: `status`,
 * `last_checked_at`, `check_count`, `insight_count` update in place as checks run) and its durably
 * recorded findings (`signal_insights`, append-only and retained, exactly like
 * `asc_release_observations` -- an Insight is a dated fact about what a Scout reported and when,
 * and is never rewritten). `insight_id` is derived deterministically from the `signal.run-now`
 * check that recorded it, so a replayed run-now is a no-op in the repository, not a duplicate row.
 */
export const signalsMigration: SqlMigration = {
  version: 15,
  name: "signals",
  sql: String.raw`
CREATE TABLE signals (
  signal_id TEXT PRIMARY KEY CHECK(length(signal_id) = 36 AND signal_id = lower(signal_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  watch_description TEXT NOT NULL CHECK(length(watch_description) BETWEEN 1 AND 2000),
  scout_provider TEXT NOT NULL CHECK(length(scout_provider) BETWEEN 1 AND 64),
  status TEXT NOT NULL CHECK(status IN ('active', 'paused')),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  last_checked_at TEXT CHECK(last_checked_at IS NULL OR (length(last_checked_at) = 24 AND substr(last_checked_at, 24, 1) = 'Z')),
  check_count INTEGER NOT NULL DEFAULT 0 CHECK(check_count >= 0),
  insight_count INTEGER NOT NULL DEFAULT 0 CHECK(insight_count >= 0)
) STRICT;

CREATE INDEX signals_status_idx ON signals(status, created_at, signal_id);

CREATE TABLE signal_insights (
  insight_id TEXT PRIMARY KEY CHECK(length(insight_id) = 36 AND insight_id = lower(insight_id)),
  signal_id TEXT NOT NULL REFERENCES signals(signal_id),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  discovered_at TEXT NOT NULL CHECK(length(discovered_at) = 24 AND substr(discovered_at, 24, 1) = 'Z'),
  headline TEXT NOT NULL CHECK(length(headline) BETWEEN 1 AND 300),
  confidence TEXT NOT NULL CHECK(confidence IN ('weak', 'moderate', 'strong')),
  insight_digest TEXT NOT NULL UNIQUE CHECK(
    length(insight_digest) = 71
    AND substr(insight_digest, 1, 7) = 'sha256:'
    AND insight_digest = lower(insight_digest)
  ),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object')
) STRICT;

CREATE INDEX signal_insights_signal_idx ON signal_insights(signal_id, discovered_at, insight_id);

CREATE TRIGGER signal_insights_reject_update
BEFORE UPDATE ON signal_insights BEGIN
  SELECT RAISE(ABORT, 'a signal insight is a dated fact and is never rewritten');
END;
CREATE TRIGGER signal_insights_reject_delete
BEFORE DELETE ON signal_insights BEGIN
  SELECT RAISE(ABORT, 'signal insights are retained');
END;
`,
};
