import {
  IsoInstantSchema,
  RoomProviderSchema,
  StudioSettingEntryV1Schema,
  StudioSettingKeyV1Schema,
  type StudioSettingEntryV1,
  type StudioSettingKeyV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

/**
 * `studio_settings` (migration 0016, Architecture decision 4): a small, cross-client preference
 * table. There is no "unset" row -- `get` for a key with no stored row answers
 * `{key, value: null, updatedAt: null}`, matching `StudioSettingEntryV1Schema`'s own honest-null
 * discipline, rather than storing a NULL value in the table.
 */

type SettingRow = Readonly<{
  key: string;
  value: string;
  updated_at: string;
}>;

function decodeSetting(key: StudioSettingKeyV1, row: SettingRow | undefined): StudioSettingEntryV1 {
  if (row === undefined) {
    return StudioSettingEntryV1Schema.parse({ key, value: null, updatedAt: null });
  }
  return StudioSettingEntryV1Schema.parse({
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at,
  });
}

export class StudioSettingsRepository {
  public constructor(private readonly database: Database.Database) {}

  public get(keyInput: unknown): StudioSettingEntryV1 {
    const key = StudioSettingKeyV1Schema.parse(keyInput);
    const row = this.database
      .prepare(`SELECT key, value, updated_at FROM studio_settings WHERE key = ?`)
      .get(key) as SettingRow | undefined;
    return decodeSetting(key, row);
  }

  /** Bounded (`StudioSettingKeyV1Schema` is a small fixed enum) -- every setting, newest first. */
  public list(): readonly StudioSettingEntryV1[] {
    const rows = this.database
      .prepare(`SELECT key, value, updated_at FROM studio_settings ORDER BY key`)
      .all() as SettingRow[];
    const stored = new Map(rows.map((row) => [row.key, row]));
    return StudioSettingKeyV1Schema.options.map((key) => decodeSetting(key, stored.get(key)));
  }

  /** Upserts `key` to `value`, bumping `updatedAt`. Idempotent: setting the same value again still
   *  advances `updatedAt` to the call's `updatedAt`, exactly like any other write. */
  public set(input: { key: unknown; value: unknown; updatedAt: unknown }): StudioSettingEntryV1 {
    const key = StudioSettingKeyV1Schema.parse(input.key);
    const value = RoomProviderSchema.parse(input.value);
    const updatedAt = IsoInstantSchema.parse(input.updatedAt);
    this.database
      .prepare(
        `INSERT INTO studio_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, updatedAt);
    return this.get(key);
  }
}
