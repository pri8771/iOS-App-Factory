import type { SqlMigration } from "../migration-types.js";

/**
 * Studio settings (Architecture decision 4): a small, cross-client preference table, deliberately
 * separate from the machine-local provider config JSON file -- "which configured instance is the
 * default" is a preference a human sets once and expects to follow them across every client, not a
 * fact about one daemon's filesystem. See `packages/contracts/src/v1/settings.ts`
 * (`StudioSettingEntryV1Schema`) for the wire shape this projects.
 *
 * `key` is CHECK-constrained to the live enum (today: only `default-provider`), matching this
 * repository's convention of hard-checking every enum column (`signals.status`,
 * `room_messages.system_code`, ...); a new settings key is a migration, exactly like a new signal
 * status would be. There is no "unset" row: `settings.get` for a key with no row answers
 * `{value: null, updatedAt: null}` rather than storing a NULL value, so `value` stays NOT NULL.
 * `value` is CHECK-constrained to `RoomProviderSchema`'s shape (a lowercase provider instance key)
 * because that is what the only key today holds; widening this table to a key whose value has a
 * different shape is deferred to whichever migration introduces that key.
 */
export const studioSettingsMigration: SqlMigration = {
  version: 16,
  name: "studio-settings",
  sql: String.raw`
CREATE TABLE studio_settings (
  key TEXT PRIMARY KEY CHECK(key IN ('default-provider')),
  value TEXT NOT NULL CHECK(length(value) BETWEEN 1 AND 64 AND value = lower(value)),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z')
) STRICT;
`,
};
