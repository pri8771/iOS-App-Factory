import type { SqlMigration } from "../migration-types.js";

/**
 * Signal scheduling (Architecture decision 11): `signals.check_interval_minutes` -- NULL means
 * manual-only (`signal.run-now`, the only mode until this migration), otherwise how often the
 * scheduler loop is willing to run this signal's Scout. Mirrors `SignalV1Schema.checkIntervalMinutes`
 * (`packages/contracts/src/v1/signal.ts`) and its bounds,
 * `MIN_SIGNAL_CHECK_INTERVAL_MINUTES_V1`..`MAX_SIGNAL_CHECK_INTERVAL_MINUTES_V1` (5..10080, i.e. one
 * week). Every signal created before this migration keeps `check_interval_minutes = NULL`
 * (SQLite's implicit column default for an `ADD COLUMN` with no `DEFAULT` clause), which is exactly
 * `SignalV1Schema`'s own `.nullable().default(null)` -- manual-only, unchanged behavior.
 */
export const signalScheduleMigration: SqlMigration = {
  version: 19,
  name: "signal-schedule",
  sql: String.raw`
ALTER TABLE signals ADD COLUMN check_interval_minutes INTEGER
  CHECK(check_interval_minutes IS NULL OR check_interval_minutes BETWEEN 5 AND 10080);
`,
};
