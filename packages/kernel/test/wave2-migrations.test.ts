import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FACTORY_MIGRATIONS, openFactoryDatabase, runMigrations } from "../src/index.js";

const roots: string[] = [];

function makeDatabasePath(): string {
  const root = mkdtempSync(join(tmpdir(), "app-factory-wave2-migrations-"));
  roots.push(root);
  return join(root, "factory.sqlite");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("migration 0016 studio-settings", () => {
  it("creates studio_settings with a CHECK-constrained key and no unset row by default", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { migrations: FACTORY_MIGRATIONS.slice(0, 16) });
    expect(database.prepare("SELECT count(*) AS total FROM studio_settings").get()).toEqual({
      total: 0,
    });
    expect(() =>
      database
        .prepare(
          `INSERT INTO studio_settings (key, value, updated_at)
           VALUES ('unknown', 'x', '2026-08-19T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
    database.close();
  });
});

describe("migration 0017 token-usage", () => {
  it("creates the append-only token_usage ledger with its reject triggers", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { migrations: FACTORY_MIGRATIONS.slice(0, 17) });
    const triggers = database
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'token_usage' ORDER BY name`,
      )
      .all();
    expect(triggers).toEqual([
      { name: "token_usage_reject_delete" },
      { name: "token_usage_reject_update" },
    ]);
    database.close();
  });
});

describe("migration 0018 room-lifecycle", () => {
  const OLD_ROOM_INSERT = `
    INSERT INTO rooms (
      room_id, schema_version, title, project_id, created_at, updated_at, unattended_enabled,
      agent_cooldown_events, head_sequence, head_message_id, last_human_at, human_typing_until,
      round_counter, active_grant_id, pending_trigger_json, create_spec_json
    ) VALUES (?, 1, 'Legacy room', NULL, ?, ?, 0, 3, 0, NULL, NULL, NULL, 0, NULL, NULL, '{}')
  `;

  it("backfills every pre-existing room to flavor='room' and archived_at=NULL, and participants to removed_at=NULL", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { migrations: FACTORY_MIGRATIONS.slice(0, 17) });

    const roomId = "8c000000-0000-4000-8000-000000000001";
    const createdAt = "2026-08-10T00:00:00.000Z";
    database.prepare(OLD_ROOM_INSERT).run(roomId, createdAt, createdAt);
    database
      .prepare(
        `INSERT INTO room_participants (room_id, persona, provider, display_name, position)
         VALUES (?, 'scout', 'codex', 'Scout', 0)`,
      )
      .run(roomId);

    expect(runMigrations(database, { migrations: FACTORY_MIGRATIONS.slice(0, 18) })).toEqual({
      currentVersion: 18,
      newlyAppliedVersions: [18],
    });

    const room = database
      .prepare("SELECT flavor, archived_at AS archivedAt FROM rooms WHERE room_id = ?")
      .get(roomId);
    expect(room).toEqual({ flavor: "room", archivedAt: null });

    const participant = database
      .prepare(
        "SELECT removed_at AS removedAt FROM room_participants WHERE room_id = ? AND persona = 'scout'",
      )
      .get(roomId);
    expect(participant).toEqual({ removedAt: null });
    database.close();
  });

  it("keeps flavor CHECK-constrained and archived_at instant-shaped for new rows", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { migrations: FACTORY_MIGRATIONS.slice(0, 18) });
    const roomId = "8c000000-0000-4000-8000-000000000002";
    const createdAt = "2026-08-19T00:00:00.000Z";
    expect(() =>
      database
        .prepare(
          `INSERT INTO rooms (
             room_id, schema_version, title, project_id, flavor, created_at, updated_at,
             unattended_enabled, agent_cooldown_events, head_sequence, head_message_id,
             last_human_at, human_typing_until, round_counter, active_grant_id,
             pending_trigger_json, create_spec_json, archived_at
           ) VALUES (?, 1, 'Room', NULL, 'not-a-flavor', ?, ?, 0, 3, 0, NULL, NULL, NULL, 0, NULL, NULL, '{}', NULL)`,
        )
        .run(roomId, createdAt, createdAt),
    ).toThrow(/CHECK constraint failed/);
    database.close();
  });

  it("creates room_updates append-only with a unique command_id and a JSON-object patch", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { migrations: FACTORY_MIGRATIONS.slice(0, 18) });
    const roomId = "8c000000-0000-4000-8000-000000000003";
    const createdAt = "2026-08-19T00:00:00.000Z";
    database.prepare(OLD_ROOM_INSERT).run(roomId, createdAt, createdAt);

    const updateId = "8g000000-0000-4000-8000-000000000001";
    const commandId = "8h000000-0000-4000-8000-000000000001";
    database
      .prepare(
        `INSERT INTO room_updates (update_id, schema_version, room_id, occurred_at, command_id, patch_json)
         VALUES (?, 1, ?, ?, ?, ?)`,
      )
      .run(updateId, roomId, createdAt, commandId, JSON.stringify({ title: "Renamed" }));

    expect(() =>
      database
        .prepare(
          `INSERT INTO room_updates (update_id, schema_version, room_id, occurred_at, command_id, patch_json)
           VALUES (?, 1, ?, ?, ?, ?)`,
        )
        .run("8g000000-0000-4000-8000-000000000002", roomId, createdAt, commandId, "{}"),
    ).toThrow(/UNIQUE constraint failed/);

    expect(() =>
      database
        .prepare("UPDATE room_updates SET patch_json = '{}' WHERE update_id = ?")
        .run(updateId),
    ).toThrow(/never rewritten/);
    expect(() =>
      database.prepare("DELETE FROM room_updates WHERE update_id = ?").run(updateId),
    ).toThrow(/retained/);
    database.close();
  });
});

describe("migration 0019 signal-schedule", () => {
  it("backfills every pre-existing signal to check_interval_minutes=NULL (manual-only, unchanged)", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { migrations: FACTORY_MIGRATIONS.slice(0, 18) });

    const signalId = "8a000000-0000-4000-8000-000000000099";
    database
      .prepare(
        `INSERT INTO signals (
           signal_id, schema_version, name, watch_description, scout_provider, status,
           created_at, last_checked_at, check_count, insight_count
         ) VALUES (?, 1, 'Legacy signal', 'Watch something.', 'codex', 'active', ?, NULL, 0, 0)`,
      )
      .run(signalId, "2026-08-10T00:00:00.000Z");

    expect(runMigrations(database, { migrations: FACTORY_MIGRATIONS.slice(0, 19) })).toEqual({
      currentVersion: 19,
      newlyAppliedVersions: [19],
    });

    const row = database
      .prepare(
        "SELECT check_interval_minutes AS checkIntervalMinutes FROM signals WHERE signal_id = ?",
      )
      .get(signalId);
    expect(row).toEqual({ checkIntervalMinutes: null });
    database.close();
  });

  it("enforces the 5..10080 bound and accepts NULL (manual-only)", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { migrations: FACTORY_MIGRATIONS.slice(0, 19) });

    const insert = (signalId: string, checkIntervalMinutes: number | null) =>
      database
        .prepare(
          `INSERT INTO signals (
             signal_id, schema_version, name, watch_description, scout_provider, status,
             created_at, last_checked_at, check_count, insight_count, check_interval_minutes
           ) VALUES (?, 1, 'Signal', 'Watch something.', 'codex', 'active', '2026-08-19T00:00:00.000Z', NULL, 0, 0, ?)`,
        )
        .run(signalId, checkIntervalMinutes);

    expect(() => insert("8a000000-0000-4000-8000-000000000100", 4)).toThrow(
      /CHECK constraint failed/,
    );
    expect(() => insert("8a000000-0000-4000-8000-000000000101", 10_081)).toThrow(
      /CHECK constraint failed/,
    );
    expect(() => insert("8a000000-0000-4000-8000-000000000102", 5)).not.toThrow();
    expect(() => insert("8a000000-0000-4000-8000-000000000103", 10_080)).not.toThrow();
    expect(() => insert("8a000000-0000-4000-8000-000000000104", null)).not.toThrow();
    database.close();
  });
});
