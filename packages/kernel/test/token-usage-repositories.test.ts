import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { createFactoryRepositories, openMigratedFactoryDatabase } from "../src/index.js";

const roots: string[] = [];

function database(): Database.Database {
  const root = mkdtempSync(join(tmpdir(), "app-factory-token-usage-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function usageId(suffix: number): string {
  return `9a000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

/** Minimal valid room + one participant, inserted directly (no room repository exists in this
 *  wave -- rooms land in Wave 4). Just enough to satisfy `token_usage.room_id`'s foreign key. */
function insertRoom(db: Database.Database, roomId: string, createdAt: string): void {
  db.prepare(
    `INSERT INTO rooms (
       room_id, schema_version, title, project_id, created_at, updated_at, unattended_enabled,
       agent_cooldown_events, head_sequence, head_message_id, last_human_at, human_typing_until,
       round_counter, active_grant_id, pending_trigger_json, create_spec_json
     ) VALUES (?, 1, 'Room', NULL, ?, ?, 0, 3, 0, NULL, NULL, NULL, 0, NULL, NULL, '{}')`,
  ).run(roomId, createdAt, createdAt);
  db.prepare(
    `INSERT INTO room_participants (room_id, persona, provider, display_name, position)
     VALUES (?, 'scout', 'codex', 'Scout', 0)`,
  ).run(roomId);
}

function insertGrant(
  db: Database.Database,
  grantId: string,
  roomId: string,
  createdAt: string,
): void {
  db.prepare(
    `INSERT INTO room_grants (
       grant_id, schema_version, room_id, round_number, persona, head_sequence, state, owner_pid,
       worker_pid, reserved_tokens, lease_expires_at, created_at, updated_at, held_text,
       outcome_json
     ) VALUES (?, 1, ?, 1, 'scout', 0, 'committed', 1, NULL, 100, ?, ?, ?, NULL, '{}')`,
  ).run(grantId, roomId, createdAt, createdAt, createdAt);
}

function insertPhaseRun(
  db: Database.Database,
  phaseRunId: string,
  commandId: string,
  projectId: string,
  createdAt: string,
): void {
  db.prepare(
    `INSERT INTO phase_runs (
       phase_run_id, schema_version, command_id, origin, issued_at, preset_id, phase_id,
       project_id, phase_snapshot_digest, state, revision, room_id, created_at, updated_at,
       payload_json
     ) VALUES (?, 1, ?, 'cli', ?, NULL, 'analyze', ?, ?, 'queued', 0, NULL, ?, ?, '{}')`,
  ).run(
    phaseRunId,
    commandId,
    createdAt,
    projectId,
    `sha256:${"a".repeat(64)}`,
    createdAt,
    createdAt,
  );
}

describe("TokenUsageRepository", () => {
  it("appends a signal-sourced record and returns it validated", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    repositories.signals.create({
      signalId: "8a000000-0000-4000-8000-000000000001",
      name: "Watch",
      watchDescription: "Watch something.",
      scoutProvider: "codex",
      createdAt: "2026-08-19T00:00:00.000Z",
    });
    const record = {
      schemaVersion: 1,
      usageId: usageId(1),
      occurredAt: "2026-08-19T01:00:00.000Z",
      providerFamily: "codex",
      providerKey: "codex",
      model: "gpt-5-codex",
      source: "signal",
      roomId: null,
      phaseRunId: null,
      signalId: "8a000000-0000-4000-8000-000000000001",
      inputTokens: 120,
      outputTokens: 40,
      cachedInputTokens: null,
      costUsdMicros: null,
    };
    expect(repositories.tokenUsage.append(record)).toEqual(record);
    db.close();
  });

  it("accepts a room-sourced record with an optional SQL-only grantId", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const roomId = "8c000000-0000-4000-8000-000000000001";
    const grantId = "8d000000-0000-4000-8000-000000000001";
    insertRoom(db, roomId, "2026-08-19T00:00:00.000Z");
    insertGrant(db, grantId, roomId, "2026-08-19T00:00:00.000Z");
    const record = {
      schemaVersion: 1,
      usageId: usageId(2),
      occurredAt: "2026-08-19T00:05:00.000Z",
      providerFamily: "openrouter",
      providerKey: "openrouter-fast",
      model: "some/model",
      source: "room",
      roomId,
      phaseRunId: null,
      signalId: null,
      inputTokens: null,
      outputTokens: 55,
      cachedInputTokens: null,
      costUsdMicros: 1200,
    };
    expect(repositories.tokenUsage.append(record, grantId)).toEqual(record);
    const stored = db
      .prepare("SELECT grant_id AS grantId FROM token_usage WHERE usage_id = ?")
      .get(usageId(2)) as { grantId: string };
    expect(stored.grantId).toBe(grantId);
    db.close();
  });

  it("accepts a phase-sourced record", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    const projectId = "8e000000-0000-4000-8000-000000000001";
    const phaseRunId = "8f000000-0000-4000-8000-000000000001";
    insertPhaseRun(
      db,
      phaseRunId,
      "90000000-0000-4000-8000-000000000001",
      projectId,
      "2026-08-19T00:00:00.000Z",
    );
    const record = {
      schemaVersion: 1,
      usageId: usageId(3),
      occurredAt: "2026-08-19T00:10:00.000Z",
      providerFamily: "claude",
      providerKey: "claude",
      model: "claude-x",
      source: "phase",
      roomId: null,
      phaseRunId,
      signalId: null,
      inputTokens: 300,
      outputTokens: null,
      cachedInputTokens: 50,
      costUsdMicros: null,
    };
    expect(repositories.tokenUsage.append(record)).toEqual(record);
    db.close();
  });

  it("refuses a grantId unless source is 'room', and refuses a mismatched source/foreign-key combination", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    repositories.signals.create({
      signalId: "8a000000-0000-4000-8000-000000000002",
      name: "Watch",
      watchDescription: "Watch something.",
      scoutProvider: "codex",
      createdAt: "2026-08-19T00:00:00.000Z",
    });
    const signalRecord = {
      schemaVersion: 1,
      usageId: usageId(4),
      occurredAt: "2026-08-19T00:00:00.000Z",
      providerFamily: "codex",
      providerKey: "codex",
      model: "gpt-5-codex",
      source: "signal",
      roomId: null,
      phaseRunId: null,
      signalId: "8a000000-0000-4000-8000-000000000002",
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
      costUsdMicros: null,
    };
    expect(() =>
      repositories.tokenUsage.append(signalRecord, "8d000000-0000-4000-8000-000000000099"),
    ).toThrow(/grantId is only valid/);

    // roomId set but source declares 'phase' -- rejected by the contract's own superRefine,
    // never reaching SQL.
    expect(() =>
      repositories.tokenUsage.append({
        ...signalRecord,
        usageId: usageId(5),
        source: "phase",
        signalId: null,
        roomId: "8c000000-0000-4000-8000-000000000099",
      }),
    ).toThrow();

    // Neither roomId, phaseRunId, nor signalId set at all.
    expect(() =>
      repositories.tokenUsage.append({
        ...signalRecord,
        usageId: usageId(6),
        signalId: null,
      }),
    ).toThrow();
    db.close();
  });

  it("is append-only: never updates or deletes a recorded row", () => {
    const db = database();
    const repositories = createFactoryRepositories(db);
    repositories.signals.create({
      signalId: "8a000000-0000-4000-8000-000000000003",
      name: "Watch",
      watchDescription: "Watch something.",
      scoutProvider: "codex",
      createdAt: "2026-08-19T00:00:00.000Z",
    });
    repositories.tokenUsage.append({
      schemaVersion: 1,
      usageId: usageId(7),
      occurredAt: "2026-08-19T00:00:00.000Z",
      providerFamily: "codex",
      providerKey: "codex",
      model: "gpt-5-codex",
      source: "signal",
      roomId: null,
      phaseRunId: null,
      signalId: "8a000000-0000-4000-8000-000000000003",
      inputTokens: 10,
      outputTokens: 10,
      cachedInputTokens: null,
      costUsdMicros: null,
    });
    expect(() =>
      db.prepare("UPDATE token_usage SET output_tokens = 999 WHERE usage_id = ?").run(usageId(7)),
    ).toThrow(/never rewritten/);
    expect(() => db.prepare("DELETE FROM token_usage WHERE usage_id = ?").run(usageId(7))).toThrow(
      /retained/,
    );
    db.close();
  });

  describe("summarize", () => {
    function append(
      repositories: ReturnType<typeof createFactoryRepositories>,
      overrides: Readonly<{
        usageId: string;
        occurredAt: string;
        providerKey: string;
        model: string;
        signalId: string;
        inputTokens: number | null;
        outputTokens: number | null;
        cachedInputTokens: number | null;
        costUsdMicros: number | null;
      }>,
    ): void {
      repositories.tokenUsage.append({
        schemaVersion: 1,
        usageId: overrides.usageId,
        occurredAt: overrides.occurredAt,
        providerFamily: "codex",
        providerKey: overrides.providerKey,
        model: overrides.model,
        source: "signal",
        roomId: null,
        phaseRunId: null,
        signalId: overrides.signalId,
        inputTokens: overrides.inputTokens,
        outputTokens: overrides.outputTokens,
        cachedInputTokens: overrides.cachedInputTokens,
        costUsdMicros: overrides.costUsdMicros,
      });
    }

    it("sums null-honestly per (providerKey, model, day) and counts unreported rows", () => {
      const db = database();
      const repositories = createFactoryRepositories(db);
      repositories.signals.create({
        signalId: "8a000000-0000-4000-8000-000000000004",
        name: "Watch",
        watchDescription: "Watch something.",
        scoutProvider: "codex",
        createdAt: "2026-08-19T00:00:00.000Z",
      });
      const signalId = "8a000000-0000-4000-8000-000000000004";

      // Same bucket (codex/gpt-5-codex/2026-08-19): one fully-reported row, one with only
      // outputTokens null (the "unreported" signal), one with every field null.
      append(repositories, {
        usageId: usageId(10),
        occurredAt: "2026-08-19T01:00:00.000Z",
        providerKey: "codex",
        model: "gpt-5-codex",
        signalId,
        inputTokens: 100,
        outputTokens: 20,
        cachedInputTokens: 5,
        costUsdMicros: 300,
      });
      append(repositories, {
        usageId: usageId(11),
        occurredAt: "2026-08-19T02:00:00.000Z",
        providerKey: "codex",
        model: "gpt-5-codex",
        signalId,
        inputTokens: 50,
        outputTokens: null,
        cachedInputTokens: null,
        costUsdMicros: null,
      });
      append(repositories, {
        usageId: usageId(12),
        occurredAt: "2026-08-19T03:00:00.000Z",
        providerKey: "codex",
        model: "gpt-5-codex",
        signalId,
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        costUsdMicros: null,
      });
      // A different day -- separate bucket entirely.
      append(repositories, {
        usageId: usageId(13),
        occurredAt: "2026-08-20T01:00:00.000Z",
        providerKey: "codex",
        model: "gpt-5-codex",
        signalId,
        inputTokens: 10,
        outputTokens: 10,
        cachedInputTokens: null,
        costUsdMicros: null,
      });
      // Older than the lookback window -- excluded entirely.
      append(repositories, {
        usageId: usageId(14),
        occurredAt: "2026-07-01T00:00:00.000Z",
        providerKey: "codex",
        model: "gpt-5-codex",
        signalId,
        inputTokens: 999,
        outputTokens: 999,
        cachedInputTokens: null,
        costUsdMicros: null,
      });

      const summary = repositories.tokenUsage.summarize({
        sinceDays: 7,
        asOf: "2026-08-20T12:00:00.000Z",
      });
      expect(summary.sinceDays).toBe(7);
      expect(summary.rows).toEqual([
        {
          providerKey: "codex",
          model: "gpt-5-codex",
          dayKey: "2026-08-20",
          inputTokens: 10,
          outputTokens: 10,
          cachedInputTokens: null,
          costUsdMicros: null,
          unreportedCount: 0,
        },
        {
          providerKey: "codex",
          model: "gpt-5-codex",
          dayKey: "2026-08-19",
          inputTokens: 150,
          outputTokens: 20,
          cachedInputTokens: 5,
          costUsdMicros: 300,
          unreportedCount: 2,
        },
      ]);
      db.close();
    });

    it("rejects an out-of-range sinceDays", () => {
      const db = database();
      const repositories = createFactoryRepositories(db);
      expect(() =>
        repositories.tokenUsage.summarize({ sinceDays: 0, asOf: "2026-08-19T00:00:00.000Z" }),
      ).toThrow();
      expect(() =>
        repositories.tokenUsage.summarize({ sinceDays: 91, asOf: "2026-08-19T00:00:00.000Z" }),
      ).toThrow(RangeError);
      db.close();
    });

    it("returns no rows for an empty ledger", () => {
      const db = database();
      const repositories = createFactoryRepositories(db);
      expect(
        repositories.tokenUsage.summarize({ sinceDays: 30, asOf: "2026-08-19T00:00:00.000Z" }),
      ).toEqual({ sinceDays: 30, rows: [] });
      db.close();
    });
  });
});
