import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FACTORY_MIGRATIONS,
  computeTaskSpecDigest,
  createFactoryRepositories,
  listAppliedMigrations,
  openFactoryDatabase,
  openMigratedFactoryDatabase,
  runMigrations,
  type SqlMigration,
} from "../src/index.js";

const NOW = "2026-08-10T12:00:00.000Z";
const LATER = "2026-08-10T12:00:01.000Z";
const RUNNING_AT = "2026-08-10T12:00:02.000Z";
const LEASE_EXPIRES_AT = "2026-08-10T12:00:05.000Z";
const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "00000000-0000-4000-8000-000000000002";
const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const BASE_COMMIT = "d".repeat(40);

const IDS_A = {
  task: "00000000-0000-4000-8000-000000000003",
  command: "00000000-0000-4000-8000-000000000004",
  attempt: "00000000-0000-4000-8000-000000000005",
  event: "00000000-0000-4000-8000-000000000006",
  transitionEvent: "00000000-0000-4000-8000-000000000007",
  fenceEvent: "00000000-0000-4000-8000-000000000008",
} as const;

const IDS_B = {
  task: "00000000-0000-4000-8000-000000000013",
  command: "00000000-0000-4000-8000-000000000014",
  attempt: "00000000-0000-4000-8000-000000000015",
  event: "00000000-0000-4000-8000-000000000016",
  transitionEvent: "00000000-0000-4000-8000-000000000017",
  fenceEvent: "00000000-0000-4000-8000-000000000018",
} as const;

const FAILED_AT = "2026-08-10T12:00:03.000Z";
const RETRY_AT = "2026-08-10T12:00:04.000Z";
const STEP_RUNNING_AT = "2026-08-10T12:00:02.500Z";
const STEP_BLOCKED_AT = "2026-08-10T12:00:02.600Z";
const UNBLOCK_ANSWERED_AT = "2026-08-10T12:00:02.700Z";
const UNBLOCK_RESUMED_AT = "2026-08-10T12:00:02.800Z";
const UNBLOCK_ATTEMPT_RESUMED_AT = "2026-08-10T12:00:02.900Z";

const IDS_RETRY = {
  failedEvent: "00000000-0000-4000-8000-000000000021",
  retryCommand: "00000000-0000-4000-8000-000000000022",
  retryAttempt: "00000000-0000-4000-8000-000000000023",
  retryEvent: "00000000-0000-4000-8000-000000000024",
} as const;

const temporaryDirectories: string[] = [];

function makeDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-persistence-test-"));
  temporaryDirectories.push(directory);
  return join(directory, "factory.db");
}

function requireNonNull<T>(value: T | null, label: string): T {
  if (value === null) throw new Error(`Expected ${label} to exist`);
  return value;
}

function makeBundle(ids: typeof IDS_A | typeof IDS_B) {
  const taskSpec = {
    schemaVersion: 1,
    taskId: ids.task,
    projectId: PROJECT_ID,
    createdAt: NOW,
    title: "Add deterministic greeting",
    objective: "Implement the requested greeting without modifying protected tests.",
    acceptanceCriteria: [
      {
        id: "greeting-test",
        statement: "The deterministic greeting test passes.",
        verification: "automated",
      },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: BASE_COMMIT },
    requestedScope: { paths: ["Sources/Greeting.swift"] },
    policyDigest: POLICY_DIGEST,
  };
  const command = {
    schemaVersion: 1,
    commandId: ids.command,
    issuedAt: NOW,
    origin: "cli",
    kind: "task.submit",
    initialDesiredState: "running",
    taskSpec,
  };
  const taskSpecDigest = computeTaskSpecDigest(taskSpec);
  const attempt = {
    schemaVersion: 1,
    attemptId: ids.attempt,
    taskId: ids.task,
    taskSpecDigest,
    attemptNumber: 1,
    state: "queued",
    desiredState: "running",
    revision: 0,
    fence: 0,
    currentStepId: null,
    blocker: null,
    outcome: null,
    createdAt: NOW,
    updatedAt: NOW,
    terminalAt: null,
  };
  const event = {
    schemaVersion: 1,
    eventId: ids.event,
    attemptId: ids.attempt,
    sequence: 1,
    occurredAt: NOW,
    commandId: ids.command,
    causationEventId: null,
    fence: 0,
    type: "attempt.created",
    data: { taskId: ids.task, taskSpecDigest },
  };
  return { command, taskSpecDigest, attempt, event };
}

function makeRunningTransition(ids: typeof IDS_A | typeof IDS_B) {
  return {
    leaseKey: `attempt:${ids.attempt}`,
    ownerId: "worker.persistence",
    observedAt: RUNNING_AT,
    expectedRevision: 1,
    attempt: {
      ...makeBundle(ids).attempt,
      state: "running",
      revision: 2,
      fence: 1,
      updatedAt: RUNNING_AT,
    },
    event: {
      schemaVersion: 1,
      eventId: ids.transitionEvent,
      attemptId: ids.attempt,
      sequence: 3,
      occurredAt: RUNNING_AT,
      commandId: null,
      causationEventId: ids.fenceEvent,
      fence: 1,
      type: "attempt.state-changed",
      data: { from: "queued", to: "running", blocker: null, outcome: null },
    },
  };
}

function makeFailedTransition(ids: typeof IDS_A | typeof IDS_B, failedEventId: string) {
  const running = makeRunningTransition(ids).attempt;
  return {
    leaseKey: `attempt:${ids.attempt}`,
    ownerId: "worker.persistence",
    observedAt: FAILED_AT,
    expectedRevision: running.revision,
    attempt: {
      ...running,
      state: "failed",
      revision: running.revision + 1,
      currentStepId: null,
      outcome: {
        kind: "failed",
        failure: {
          code: "task.execution-failed",
          summary: "The attempt failed deterministically for this test.",
          retryable: true,
          detailArtifactDigest: null,
        },
      },
      updatedAt: FAILED_AT,
      terminalAt: FAILED_AT,
    },
    event: {
      schemaVersion: 1,
      eventId: failedEventId,
      attemptId: ids.attempt,
      sequence: 4,
      occurredAt: FAILED_AT,
      commandId: null,
      causationEventId: ids.transitionEvent,
      fence: 1,
      type: "attempt.state-changed",
      data: {
        from: "running",
        to: "failed",
        blocker: null,
        outcome: {
          kind: "failed",
          failure: {
            code: "task.execution-failed",
            summary: "The attempt failed deterministically for this test.",
            retryable: true,
            detailArtifactDigest: null,
          },
        },
      },
    },
  } as const;
}

function makeLeaseClaim(ids: typeof IDS_A | typeof IDS_B) {
  return {
    leaseKey: `attempt:${ids.attempt}`,
    attemptId: ids.attempt,
    ownerId: "worker.persistence",
    expectedAttemptRevision: 0,
    acquiredAt: LATER,
    expiresAt: LEASE_EXPIRES_AT,
    event: {
      schemaVersion: 1,
      eventId: ids.fenceEvent,
      attemptId: ids.attempt,
      sequence: 2,
      occurredAt: LATER,
      commandId: null,
      causationEventId: ids.event,
      fence: 1,
      type: "attempt.fence-claimed",
      data: { previousFence: 0, newFence: 1, ownerId: "worker.persistence" },
    },
  } as const;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("migration runner", () => {
  it("creates every initial STRICT table, records its checksum, and is idempotent", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    const first = runMigrations(database, { now: () => new Date(NOW) });
    const second = runMigrations(database, { now: () => new Date(LATER) });

    expect(first).toEqual({
      currentVersion: 15,
      newlyAppliedVersions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    });
    expect(second).toEqual({ currentVersion: 15, newlyAppliedVersions: [] });
    expect(database.pragma("user_version", { simple: true })).toBe(15);
    expect(listAppliedMigrations(database)).toEqual([
      {
        version: 1,
        name: "initial-control-plane",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 2,
        name: "approvals-outbox",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 3,
        name: "observed-manual-intervention",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 4,
        name: "project-execution-projections",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 5,
        name: "attempt-list-indexes",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 6,
        name: "retry-and-unblock-commands",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 7,
        name: "project-milestones",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 8,
        name: "studio-rooms",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 9,
        name: "phase-presets",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 10,
        name: "project-plans",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 11,
        name: "phase-runs",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 12,
        name: "project-registry",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 13,
        name: "room-factory-event-cursor",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 14,
        name: "asc-release-observations",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
      {
        version: 15,
        name: "signals",
        checksum: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        appliedAt: NOW,
      },
    ]);
    expect(
      database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'index' AND name IN (
             'attempts_active_updated_at_attempt_id_idx',
             'attempts_updated_at_attempt_id_idx',
             'task_snapshots_project_task_idx'
           )
           ORDER BY name`,
        )
        .all(),
    ).toEqual([
      { name: "attempts_active_updated_at_attempt_id_idx" },
      { name: "attempts_updated_at_attempt_id_idx" },
      { name: "task_snapshots_project_task_idx" },
    ]);

    const rows = database
      .prepare(
        `SELECT name, sql FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as readonly Readonly<{ name: string; sql: string }>[];
    expect(rows.map((row) => row.name)).toEqual([
      "approvals",
      "artifacts",
      "asc_release_observations",
      "attempts",
      "commands",
      "effect_observations",
      "effect_origin_checkpoints",
      "effect_outbox",
      "effect_reconciliation_attempts",
      "effect_rejections",
      "effect_send_attempts",
      "effect_transitions",
      "events",
      "external_effects",
      "external_resources",
      "leases",
      "phase_definition_revisions",
      "phase_definitions",
      "phase_preset_revisions",
      "phase_presets",
      "phase_runs",
      "project_execution_projections",
      "project_milestone_revisions",
      "project_milestones",
      "project_plan_revisions",
      "project_plans",
      "project_revisions",
      "projects",
      "room_budgets",
      "room_factory_event_cursor",
      "room_grants",
      "room_messages",
      "room_participants",
      "rooms",
      "schema_migrations",
      "signal_insights",
      "signals",
      "steps",
      "task_snapshots",
    ]);
    expect(rows.every((row) => row.sql.trimEnd().endsWith("STRICT"))).toBe(true);
    database.close();
  });

  it("rolls a failed migration back without advancing either ledger", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { now: () => new Date(NOW) });
    const brokenMigration: SqlMigration = {
      version: 16,
      name: "broken-probe",
      sql: `
        CREATE TABLE must_rollback (id INTEGER PRIMARY KEY) STRICT;
        INSERT INTO table_that_does_not_exist(id) VALUES (1);
      `,
    };

    expect(() =>
      runMigrations(database, {
        migrations: [...FACTORY_MIGRATIONS, brokenMigration],
        now: () => new Date(LATER),
      }),
    ).toThrow(/Migration 16 \(broken-probe\) failed/);
    expect(database.pragma("user_version", { simple: true })).toBe(15);
    expect(listAppliedMigrations(database).map((migration) => migration.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'must_rollback'")
        .get(),
    ).toBeUndefined();
    database.close();
  });

  it("upgrades a v5 database whose ledger was written by a pre-0006 build (legacy checksum formula)", () => {
    // Before migration 0006 (`retry-and-unblock-commands`) the runner recorded
    // `sha256(version\0name\0sql)`; 0006 added `\0<disableForeignKeysDuringApply>`
    // to the formula, which silently orphaned every runtime recorded earlier --
    // ~/.app-factory-a3-r2, the first real-model run's runtime, was rejected with
    // "Migration 1 does not match its recorded name/checksum" and became
    // unexportable. Rebuild exactly such a ledger and prove the current runner
    // accepts and upgrades it.
    const database = openFactoryDatabase(makeDatabasePath());
    const preSix = FACTORY_MIGRATIONS.slice(0, 5);
    expect(runMigrations(database, { migrations: preSix, now: () => new Date(NOW) })).toEqual({
      currentVersion: 5,
      newlyAppliedVersions: [1, 2, 3, 4, 5],
    });
    const legacyChecksum = (migration: SqlMigration): string =>
      `sha256:${createHash("sha256")
        .update(`${migration.version}\0${migration.name}\0${migration.sql}`, "utf8")
        .digest("hex")}`;
    const rewrite = database.prepare("UPDATE schema_migrations SET checksum = ? WHERE version = ?");
    for (const migration of preSix) {
      rewrite.run(legacyChecksum(migration), migration.version);
    }
    expect(listAppliedMigrations(database).map((migration) => migration.checksum)).toEqual(
      preSix.map(legacyChecksum),
    );

    expect(runMigrations(database, { now: () => new Date(LATER) })).toEqual({
      currentVersion: 15,
      newlyAppliedVersions: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    });
    // Recognised, never rewritten: the legacy rows stay as recorded and every
    // row from 0006 onwards carries the current formula (idempotent re-open).
    expect(
      listAppliedMigrations(database)
        .slice(0, 5)
        .map((migration) => migration.checksum),
    ).toEqual(preSix.map(legacyChecksum));
    expect(runMigrations(database, { now: () => new Date(LATER) })).toEqual({
      currentVersion: 15,
      newlyAppliedVersions: [],
    });
    expect(database.pragma("foreign_key_check")).toEqual([]);
    database.close();
  });

  it("still rejects a legacy-formula checksum for a migration that disables foreign keys", () => {
    // The legacy formula could not encode `disableForeignKeysDuringApply`, so it
    // is only ever accepted where that flag is unset. Migration 0006 is the first
    // (and currently only) flagged migration; a ledger row for it carrying the
    // legacy formula cannot have been written by any real build and must fail.
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { now: () => new Date(NOW) });
    const six = FACTORY_MIGRATIONS[5];
    if (six === undefined || six.disableForeignKeysDuringApply !== true) {
      throw new Error("Expected migration 0006 to disable foreign keys during apply");
    }
    const legacy = `sha256:${createHash("sha256")
      .update(`${six.version}\0${six.name}\0${six.sql}`, "utf8")
      .digest("hex")}`;
    database.prepare("UPDATE schema_migrations SET checksum = ? WHERE version = 6").run(legacy);
    expect(() => runMigrations(database, { now: () => new Date(LATER) })).toThrow(
      /Migration 6 does not match its recorded name\/checksum/,
    );
    database.close();
  });

  it("upgrades an existing v1 database and leaves every new foreign key valid", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    const v1 = FACTORY_MIGRATIONS[0];
    if (v1 === undefined) throw new Error("Expected v1 migration fixture");
    expect(runMigrations(database, { migrations: [v1], now: () => new Date(NOW) })).toEqual({
      currentVersion: 1,
      newlyAppliedVersions: [1],
    });
    expect(database.pragma("user_version", { simple: true })).toBe(1);

    expect(runMigrations(database, { now: () => new Date(LATER) })).toEqual({
      currentVersion: 15,
      newlyAppliedVersions: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    });
    expect(database.pragma("user_version", { simple: true })).toBe(15);
    const stepColumns = database.pragma("table_info(steps)") as readonly Readonly<{
      name: string;
    }>[];
    expect(stepColumns.map(({ name }) => name)).toContain("effect_checkpoint_revision");
    expect(database.pragma("foreign_key_check")).toEqual([]);
    database.close();
  });

  it("upgrades an existing v2 database with the observed manual-intervention transition", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    const v1 = FACTORY_MIGRATIONS[0];
    const v2 = FACTORY_MIGRATIONS[1];
    if (v1 === undefined || v2 === undefined) throw new Error("Expected v1/v2 migrations");
    expect(runMigrations(database, { migrations: [v1, v2], now: () => new Date(NOW) })).toEqual({
      currentVersion: 2,
      newlyAppliedVersions: [1, 2],
    });

    expect(runMigrations(database, { now: () => new Date(LATER) })).toEqual({
      currentVersion: 15,
      newlyAppliedVersions: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    });
    const trigger = database
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'external_effects_legal_state_transition'",
      )
      .get() as Readonly<{ sql: string }>;
    expect(trigger.sql).toContain("NEW.state IN ('confirmed', 'manual-intervention')");
    expect(database.pragma("user_version", { simple: true })).toBe(15);
    expect(database.pragma("foreign_key_check")).toEqual([]);
    database.close();
  });

  it("rolls a failed v1-to-v2 upgrade back, including ALTER TABLE changes", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    const v1 = FACTORY_MIGRATIONS[0];
    if (v1 === undefined) throw new Error("Expected v1 migration fixture");
    runMigrations(database, { migrations: [v1], now: () => new Date(NOW) });
    const failingUpgrade: SqlMigration = {
      version: 2,
      name: "failing-upgrade-probe",
      sql: `
        ALTER TABLE steps ADD COLUMN must_rollback INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE upgrade_must_rollback (id INTEGER PRIMARY KEY) STRICT;
        INSERT INTO table_that_does_not_exist(id) VALUES (1);
      `,
    };

    expect(() =>
      runMigrations(database, {
        migrations: [v1, failingUpgrade],
        now: () => new Date(LATER),
      }),
    ).toThrow(/Migration 2 \(failing-upgrade-probe\) failed/);
    expect(database.pragma("user_version", { simple: true })).toBe(1);
    expect(listAppliedMigrations(database).map(({ version }) => version)).toEqual([1]);
    const stepColumns = database.pragma("table_info(steps)") as readonly Readonly<{
      name: string;
    }>[];
    expect(stepColumns.map(({ name }) => name)).not.toContain("must_rollback");
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'upgrade_must_rollback'",
        )
        .get(),
    ).toBeUndefined();
    expect(database.pragma("foreign_key_check")).toEqual([]);
    database.close();
  });

  it("widens the commands and events CHECK constraints for retry and unblock while preserving every prior invariant", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    runMigrations(database, { now: () => new Date(NOW) });

    const commandId0 = "00000000-0000-4000-8000-000000000200";
    const commandId1 = "00000000-0000-4000-8000-000000000201";
    const commandId2 = "00000000-0000-4000-8000-000000000202";
    const commandId3 = "00000000-0000-4000-8000-000000000203";
    const commandId4 = "00000000-0000-4000-8000-000000000204";
    const commandId5 = "00000000-0000-4000-8000-000000000205";
    const commandId6 = "00000000-0000-4000-8000-000000000206";
    const commandId7 = "00000000-0000-4000-8000-000000000207";
    const taskId = "00000000-0000-4000-8000-000000000102";
    const attemptId = "00000000-0000-4000-8000-000000000103";
    const insertCommand = (
      commandIdValue: string,
      kind: string,
      taskIdValue: string | null,
      attemptIdValue: string | null,
    ) =>
      database
        .prepare(
          `INSERT INTO commands(command_id, schema_version, kind, origin, issued_at, task_id, attempt_id, payload_json)
           VALUES (?, 1, ?, 'cli', ?, ?, ?, '{}')`,
        )
        .run(commandIdValue, kind, NOW, taskIdValue, attemptIdValue);

    // The new kinds are accepted only with the lineage shape the compound CHECK requires.
    expect(() => insertCommand(commandId0, "task.retry", taskId, attemptId)).not.toThrow();
    expect(() => insertCommand(commandId1, "task.retry", taskId, null)).toThrow(
      /CHECK constraint failed/,
    );
    expect(() => insertCommand(commandId2, "task.retry", null, attemptId)).toThrow(
      /CHECK constraint failed/,
    );
    expect(() => insertCommand(commandId3, "attempt.unblock", null, attemptId)).not.toThrow();
    expect(() => insertCommand(commandId4, "attempt.unblock", taskId, attemptId)).toThrow(
      /CHECK constraint failed/,
    );
    expect(() => insertCommand(commandId5, "attempt.unblock", null, null)).toThrow(
      /CHECK constraint failed/,
    );
    expect(() => insertCommand(commandId6, "bogus.kind", null, attemptId)).toThrow(
      /CHECK constraint failed/,
    );

    // The rebuilt table keeps its immutability triggers.
    const commandId = commandId7;
    insertCommand(commandId, "attempt.unblock", null, attemptId);
    expect(() =>
      database.prepare("UPDATE commands SET origin = 'system' WHERE command_id = ?").run(commandId),
    ).toThrow(/commands are immutable/);
    expect(() =>
      database.prepare("DELETE FROM commands WHERE command_id = ?").run(commandId),
    ).toThrow(/commands are immutable/);

    // The rebuilt events table accepts the new domain event type and keeps its own invariants.
    const insertAttempt = (id: string) =>
      database
        .prepare(
          `INSERT INTO attempts(
             attempt_id, schema_version, task_id, task_spec_digest, attempt_number, state,
             desired_state, revision, fence, current_step_id, blocker_json, outcome_json,
             created_at, updated_at, terminal_at, payload_json
           ) VALUES (?, 1, ?, ?, 1, 'blocked', 'running', 0, 0, NULL, ?, NULL, ?, ?, NULL, '{}')`,
        )
        .run(
          id,
          taskId,
          `sha256:${"a".repeat(64)}`,
          JSON.stringify({
            kind: "clarification",
            code: "x.y",
            summary: "s",
            requiredAction: null,
          }),
          NOW,
          NOW,
        );
    // Fails closed either on the attempts->task_snapshots foreign key or the
    // project-projection trigger added by migration 4, depending on statement
    // ordering; either is an acceptable fail-closed outcome here.
    expect(() => insertAttempt(attemptId)).toThrow();
    database
      .prepare(
        `INSERT INTO task_snapshots(
           task_id, schema_version, project_id, repository_id, base_commit, task_spec_digest,
           submitted_by_command_id, created_at, payload_json
         ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, '{}')`,
      )
      .run(
        taskId,
        PROJECT_ID,
        REPOSITORY_ID,
        BASE_COMMIT,
        `sha256:${"b".repeat(64)}`,
        commandId,
        NOW,
      );
    expect(() => insertAttempt(attemptId)).not.toThrow();

    const eventId = "00000000-0000-4000-8000-000000000104";
    expect(() =>
      database
        .prepare(
          `INSERT INTO events(
             event_id, schema_version, attempt_id, sequence, type, occurred_at, command_id,
             causation_event_id, fence, payload_json
           ) VALUES (?, 1, ?, 1, 'attempt.unblock-answered', ?, ?, NULL, 0, '{}')`,
        )
        .run(eventId, attemptId, NOW, commandId),
    ).not.toThrow();
    expect(() =>
      database.prepare("UPDATE events SET occurred_at = ? WHERE event_id = ?").run(NOW, eventId),
    ).toThrow(/events are append-only/);
    expect(() => database.prepare("DELETE FROM events WHERE event_id = ?").run(eventId)).toThrow(
      /events are append-only/,
    );
    expect(() =>
      database
        .prepare(
          `INSERT INTO events(
             event_id, schema_version, attempt_id, sequence, type, occurred_at, command_id,
             causation_event_id, fence, payload_json
           ) VALUES (?, 1, ?, 2, 'bogus.type', ?, NULL, NULL, 0, '{}')`,
        )
        .run("00000000-0000-4000-8000-000000000106", attemptId, NOW),
    ).toThrow(/CHECK constraint failed/);

    // Every index and index-backed query plan from the original migrations survives the rebuild.
    const indexNames = database
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'index' AND tbl_name IN ('commands', 'events') AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as readonly Readonly<{ name: string }>[];
    expect(indexNames.map((row) => row.name)).toEqual([
      "commands_attempt_id_idx",
      "commands_kind_issued_at_idx",
      "events_attempt_occurred_at_idx",
      "events_command_id_idx",
      "events_type_occurred_at_idx",
    ]);

    expect(database.pragma("foreign_key_check")).toEqual([]);
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    database.close();
  });

  it("is idempotent across a rebuild-carrying replay of the full migration plan", () => {
    const database = openFactoryDatabase(makeDatabasePath());
    const first = runMigrations(database, { now: () => new Date(NOW) });
    const second = runMigrations(database, { now: () => new Date(LATER) });
    expect(first.newlyAppliedVersions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(second.newlyAppliedVersions).toEqual([]);
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database.pragma("foreign_key_check")).toEqual([]);
    database.close();
  });
});

describe("Factory repositories", () => {
  it("replays the original task submission after a lost response and rejects command collisions", () => {
    const databasePath = makeDatabasePath();
    let database = openMigratedFactoryDatabase(databasePath);
    let repositories = createFactoryRepositories(database);
    const original = makeBundle(IDS_A);
    expect(repositories.createTaskAttempt(original)).toMatchObject({ duplicate: false });
    database.close();

    database = openMigratedFactoryDatabase(databasePath, { fileMustExist: true });
    repositories = createFactoryRepositories(database);
    const retriedWithFreshGeneratedIds = {
      ...original,
      attempt: { ...original.attempt, attemptId: IDS_B.attempt },
      event: {
        ...original.event,
        eventId: IDS_B.event,
        attemptId: IDS_B.attempt,
      },
    };
    expect(repositories.createTaskAttempt(retriedWithFreshGeneratedIds)).toMatchObject({
      command: original.command,
      attempt: original.attempt,
      event: original.event,
      duplicate: true,
    });

    const changedTaskSpec = {
      ...original.command.taskSpec,
      objective: "A conflicting objective under the same command ID.",
    };
    const changedDigest = computeTaskSpecDigest(changedTaskSpec);
    expect(() =>
      repositories.createTaskAttempt({
        command: { ...original.command, taskSpec: changedTaskSpec },
        taskSpecDigest: changedDigest,
        attempt: {
          ...original.attempt,
          taskSpecDigest: changedDigest,
          attemptId: IDS_B.attempt,
        },
        event: {
          ...original.event,
          eventId: IDS_B.event,
          attemptId: IDS_B.attempt,
          data: { taskId: IDS_A.task, taskSpecDigest: changedDigest },
        },
      }),
    ).toThrow(/duplicate task-submit command/);
    expect(database.prepare("SELECT COUNT(*) AS count FROM attempts").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM events").get()).toEqual({ count: 1 });
    database.close();
  });

  it("persists an atomic submission and state transition across close/reopen", () => {
    const databasePath = makeDatabasePath();
    let database = openMigratedFactoryDatabase(databasePath, { now: () => new Date(NOW) });
    let repositories = createFactoryRepositories(database);
    const bundle = makeBundle(IDS_A);

    expect(repositories.createTaskAttempt(bundle)).toMatchObject({
      command: bundle.command,
      taskSpec: bundle.command.taskSpec,
      attempt: bundle.attempt,
      event: bundle.event,
    });
    repositories.leases.claim(makeLeaseClaim(IDS_A));
    repositories.transitionAttemptState(makeRunningTransition(IDS_A));
    database.close();

    database = openMigratedFactoryDatabase(databasePath, {
      fileMustExist: true,
      now: () => new Date(LATER),
    });
    repositories = createFactoryRepositories(database);
    expect(repositories.commands.findById(IDS_A.command)).toEqual(bundle.command);
    expect(repositories.taskSnapshots.findById(IDS_A.task)).toEqual(bundle.command.taskSpec);
    expect(repositories.attempts.findById(IDS_A.attempt)).toMatchObject({
      state: "running",
      revision: 2,
      fence: 1,
      updatedAt: RUNNING_AT,
    });
    expect(repositories.events.listByAttempt(IDS_A.attempt).map((event) => event.type)).toEqual([
      "attempt.created",
      "attempt.fence-claimed",
      "attempt.state-changed",
    ]);
    database.close();
  });

  it("rolls command, task, and attempt creation back when the event insert fails", () => {
    const database = openMigratedFactoryDatabase(makeDatabasePath());
    const repositories = createFactoryRepositories(database);
    repositories.createTaskAttempt(makeBundle(IDS_A));
    const second = makeBundle(IDS_B);

    expect(() =>
      repositories.createTaskAttempt({
        ...second,
        event: { ...second.event, eventId: IDS_A.event },
      }),
    ).toThrow();
    expect(repositories.commands.findById(IDS_B.command)).toBeNull();
    expect(repositories.taskSnapshots.findById(IDS_B.task)).toBeNull();
    expect(repositories.attempts.findById(IDS_B.attempt)).toBeNull();
    database.close();
  });

  it("rolls the attempt update back when its event insert fails", () => {
    const database = openMigratedFactoryDatabase(makeDatabasePath());
    const repositories = createFactoryRepositories(database);
    repositories.createTaskAttempt(makeBundle(IDS_A));
    repositories.leases.claim(makeLeaseClaim(IDS_A));
    const transition = makeRunningTransition(IDS_A);

    expect(() =>
      repositories.transitionAttemptState({
        ...transition,
        event: { ...transition.event, eventId: IDS_A.event },
      }),
    ).toThrow();
    expect(repositories.attempts.findById(IDS_A.attempt)).toMatchObject({
      state: "queued",
      revision: 1,
      fence: 1,
      updatedAt: LATER,
    });
    expect(repositories.events.listByAttempt(IDS_A.attempt)).toHaveLength(2);
    database.close();
  });

  it("validates complete contracts before the first write", () => {
    const database = openMigratedFactoryDatabase(makeDatabasePath());
    const repositories = createFactoryRepositories(database);
    const invalid = makeBundle(IDS_A);

    expect(() =>
      repositories.createTaskAttempt({
        ...invalid,
        command: { ...invalid.command, origin: "untrusted-origin" },
      }),
    ).toThrow();
    expect(database.prepare("SELECT COUNT(*) AS count FROM commands").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM task_snapshots").get()).toEqual({
      count: 0,
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM attempts").get()).toEqual({ count: 0 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM events").get()).toEqual({ count: 0 });
    database.close();
  });

  it("enforces append-only records and artifact validation", () => {
    const database = openMigratedFactoryDatabase(makeDatabasePath());
    const repositories = createFactoryRepositories(database);
    repositories.createTaskAttempt(makeBundle(IDS_A));

    expect(() =>
      database.prepare("UPDATE events SET sequence = 2 WHERE event_id = ?").run(IDS_A.event),
    ).toThrow(/append-only/);
    expect(() =>
      database.prepare("DELETE FROM commands WHERE command_id = ?").run(IDS_A.command),
    ).toThrow(/immutable/);
    expect(() =>
      repositories.artifacts.record({
        artifact: {
          digest: `sha256:${"e".repeat(64)}`,
          byteLength: -1,
          mediaType: "text/plain",
          logicalName: "invalid.txt",
        },
        storagePath: "/tmp/invalid.txt",
        recordedAt: NOW,
      }),
    ).toThrow();
    expect(database.prepare("SELECT COUNT(*) AS count FROM artifacts").get()).toEqual({ count: 0 });
    database.close();
  });
});

function makeFailedAttemptFixture() {
  const database = openMigratedFactoryDatabase(makeDatabasePath());
  const repositories = createFactoryRepositories(database);
  const bundle = makeBundle(IDS_A);
  repositories.createTaskAttempt(bundle);
  repositories.leases.claim(makeLeaseClaim(IDS_A));
  repositories.transitionAttemptState(makeRunningTransition(IDS_A));
  const failed = repositories.transitionAttemptState(
    makeFailedTransition(IDS_A, IDS_RETRY.failedEvent),
  );
  return { database, repositories, bundle, failed };
}

function makeRetryInput(priorAttemptId: string, taskSpecDigest: string) {
  return {
    command: {
      schemaVersion: 1,
      commandId: IDS_RETRY.retryCommand,
      issuedAt: RETRY_AT,
      origin: "cli",
      kind: "task.retry",
      taskId: IDS_A.task,
      priorAttemptId,
      initialDesiredState: "running",
    },
    attempt: {
      schemaVersion: 1,
      attemptId: IDS_RETRY.retryAttempt,
      taskId: IDS_A.task,
      taskSpecDigest,
      attemptNumber: 2,
      state: "queued",
      desiredState: "running",
      revision: 0,
      fence: 0,
      currentStepId: null,
      blocker: null,
      outcome: null,
      createdAt: RETRY_AT,
      updatedAt: RETRY_AT,
      terminalAt: null,
    },
    event: {
      schemaVersion: 1,
      eventId: IDS_RETRY.retryEvent,
      attemptId: IDS_RETRY.retryAttempt,
      sequence: 1,
      occurredAt: RETRY_AT,
      commandId: IDS_RETRY.retryCommand,
      causationEventId: null,
      fence: 0,
      type: "attempt.created",
      data: { taskId: IDS_A.task, taskSpecDigest },
    },
  } as const;
}

describe("task.retry", () => {
  it("creates attempt N+1 from a failed prior attempt and is idempotent by commandId", () => {
    const { database, repositories, bundle, failed } = makeFailedAttemptFixture();
    expect(failed.state).toBe("failed");

    const input = makeRetryInput(IDS_A.attempt, bundle.taskSpecDigest);
    const created = repositories.retryTaskAttempt(input);
    expect(created.duplicate).toBe(false);
    expect(created.priorAttempt.attemptId).toBe(IDS_A.attempt);
    expect(created.attempt).toMatchObject({
      attemptId: IDS_RETRY.retryAttempt,
      taskId: IDS_A.task,
      attemptNumber: 2,
      state: "queued",
      desiredState: "running",
    });
    expect(repositories.attempts.findById(IDS_RETRY.retryAttempt)).toMatchObject({
      attemptNumber: 2,
      state: "queued",
    });

    const replayed = repositories.retryTaskAttempt(input);
    expect(replayed).toMatchObject({
      command: created.command,
      priorAttempt: created.priorAttempt,
      attempt: created.attempt,
      event: created.event,
      duplicate: true,
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM attempts").get()).toEqual({ count: 2 });
    database.close();
  });

  it("refuses to retry a non-terminal prior attempt", () => {
    const database = openMigratedFactoryDatabase(makeDatabasePath());
    const repositories = createFactoryRepositories(database);
    const bundle = makeBundle(IDS_A);
    repositories.createTaskAttempt(bundle);

    expect(() =>
      repositories.retryTaskAttempt(makeRetryInput(IDS_A.attempt, bundle.taskSpecDigest)),
    ).toThrow(/requires a failed or cancelled prior attempt/);
    database.close();
  });

  it("refuses to retry an attempt that has already been retried", () => {
    const { database, repositories, bundle } = makeFailedAttemptFixture();
    const input = makeRetryInput(IDS_A.attempt, bundle.taskSpecDigest);
    repositories.retryTaskAttempt(input);

    const secondRetryCommandId = "00000000-0000-4000-8000-000000000025";
    const secondRetryAttemptId = "00000000-0000-4000-8000-000000000026";
    expect(() =>
      repositories.retryTaskAttempt({
        command: {
          ...input.command,
          commandId: secondRetryCommandId,
        },
        attempt: {
          ...input.attempt,
          attemptId: secondRetryAttemptId,
        },
        event: {
          ...input.event,
          eventId: "00000000-0000-4000-8000-000000000027",
          commandId: secondRetryCommandId,
          attemptId: secondRetryAttemptId,
        },
      }),
    ).toThrow(/has already been retried/);
    database.close();
  });
});

function makeBlockedAttemptFixture() {
  const database = openMigratedFactoryDatabase(makeDatabasePath());
  const repositories = createFactoryRepositories(database);
  const bundle = makeBundle(IDS_A);
  repositories.createTaskAttempt(bundle);
  const claimed = repositories.leases.claim(makeLeaseClaim(IDS_A));
  repositories.transitionAttemptState(makeRunningTransition(IDS_A));

  const stepId = "00000000-0000-4000-8000-000000000031";
  const stepCreatedEventId = "00000000-0000-4000-8000-000000000032";
  const stepInputDigest = `sha256:${"c".repeat(64)}`;
  const step = repositories.steps.create({
    leaseKey: claimed.lease.leaseKey,
    ownerId: claimed.lease.ownerId,
    observedAt: RUNNING_AT,
    step: {
      schemaVersion: 1,
      stepId,
      attemptId: IDS_A.attempt,
      ordinal: 0,
      operation: "factory.execute",
      state: "pending",
      revision: 0,
      lastFence: 1,
      runCount: 0,
      inputDigest: stepInputDigest,
      outputDigest: null,
      blocker: null,
      failure: null,
      startedAt: null,
      finishedAt: null,
    },
    event: {
      schemaVersion: 1,
      eventId: stepCreatedEventId,
      attemptId: IDS_A.attempt,
      sequence: 4,
      occurredAt: RUNNING_AT,
      commandId: null,
      causationEventId: IDS_A.transitionEvent,
      fence: 1,
      type: "step.created",
      data: { stepId, ordinal: 0, operation: "factory.execute", inputDigest: stepInputDigest },
    },
  });

  const stepRunningEventId = "00000000-0000-4000-8000-000000000033";
  const runningStep = repositories.steps.transition({
    leaseKey: claimed.lease.leaseKey,
    ownerId: claimed.lease.ownerId,
    observedAt: STEP_RUNNING_AT,
    expectedRevision: step.revision,
    fence: 1,
    step: {
      ...step,
      state: "running",
      revision: step.revision + 1,
      runCount: 1,
      startedAt: STEP_RUNNING_AT,
    },
    event: {
      schemaVersion: 1,
      eventId: stepRunningEventId,
      attemptId: IDS_A.attempt,
      sequence: 5,
      occurredAt: STEP_RUNNING_AT,
      commandId: null,
      causationEventId: stepCreatedEventId,
      fence: 1,
      type: "step.state-changed",
      data: { stepId, from: "pending", to: "running", outputDigest: null, failureCode: null },
    },
  });

  // The pending->running transition above projected the step onto the
  // attempt's currentStepId, which advances the attempt's own revision.
  const runningAttempt = requireNonNull(
    repositories.attempts.findById(IDS_A.attempt),
    "running attempt",
  );
  expect(runningAttempt.currentStepId).toBe(stepId);

  const blockedEventId = "00000000-0000-4000-8000-000000000034";
  const blockedStep = repositories.steps.transition({
    leaseKey: claimed.lease.leaseKey,
    ownerId: claimed.lease.ownerId,
    observedAt: STEP_BLOCKED_AT,
    expectedRevision: runningStep.revision,
    fence: 1,
    step: {
      ...runningStep,
      state: "blocked",
      revision: runningStep.revision + 1,
      blocker: {
        kind: "clarification",
        code: "task.needs-input",
        summary: "Which environment should this target?",
        requiredAction: "Answer the question and unblock the attempt.",
      },
    },
    event: {
      schemaVersion: 1,
      eventId: blockedEventId,
      attemptId: IDS_A.attempt,
      sequence: 6,
      occurredAt: STEP_BLOCKED_AT,
      commandId: null,
      causationEventId: stepRunningEventId,
      fence: 1,
      type: "step.state-changed",
      data: { stepId, from: "running", to: "blocked", outputDigest: null, failureCode: null },
    },
  });

  const attemptBlockedEventId = "00000000-0000-4000-8000-000000000035";
  const blockedAttempt = repositories.transitionAttemptState({
    leaseKey: claimed.lease.leaseKey,
    ownerId: claimed.lease.ownerId,
    observedAt: UNBLOCK_ANSWERED_AT,
    expectedRevision: runningAttempt.revision,
    attempt: {
      ...runningAttempt,
      state: "blocked",
      revision: runningAttempt.revision + 1,
      updatedAt: UNBLOCK_ANSWERED_AT,
      blocker: blockedStep.blocker,
    },
    event: {
      schemaVersion: 1,
      eventId: attemptBlockedEventId,
      attemptId: IDS_A.attempt,
      sequence: 7,
      occurredAt: UNBLOCK_ANSWERED_AT,
      commandId: null,
      causationEventId: blockedEventId,
      fence: 1,
      type: "attempt.state-changed",
      data: { from: "running", to: "blocked", blocker: blockedStep.blocker, outcome: null },
    },
  });
  repositories.leases.release({
    leaseKey: claimed.lease.leaseKey,
    ownerId: claimed.lease.ownerId,
    fence: 1,
  });

  return { database, repositories, stepId, blockedAttempt, blockedStep };
}

describe("attempt.unblock", () => {
  it("moves a blocked attempt and its step back to running with the operator answer recorded", () => {
    const { database, repositories, stepId, blockedAttempt } = makeBlockedAttemptFixture();
    expect(blockedAttempt.state).toBe("blocked");

    const commandId = "00000000-0000-4000-8000-000000000041";
    const answer = "Target the staging environment.";
    const command = {
      schemaVersion: 1,
      commandId,
      issuedAt: UNBLOCK_RESUMED_AT,
      origin: "cli",
      kind: "attempt.unblock",
      attemptId: IDS_A.attempt,
      answer,
    } as const;

    const claim = repositories.leases.claim({
      leaseKey: `attempt:${IDS_A.attempt}`,
      attemptId: IDS_A.attempt,
      ownerId: "operator.unblock",
      expectedAttemptRevision: blockedAttempt.revision,
      acquiredAt: UNBLOCK_RESUMED_AT,
      expiresAt: LEASE_EXPIRES_AT,
      event: {
        schemaVersion: 1,
        eventId: "00000000-0000-4000-8000-000000000042",
        attemptId: IDS_A.attempt,
        sequence: 8,
        occurredAt: UNBLOCK_RESUMED_AT,
        commandId: null,
        causationEventId: null,
        fence: 2,
        type: "attempt.fence-claimed",
        data: { previousFence: 1, newFence: 2, ownerId: "operator.unblock" },
      },
    });

    const answered = repositories.unblocks.apply({
      command,
      leaseKey: claim.lease.leaseKey,
      ownerId: claim.lease.ownerId,
      observedAt: UNBLOCK_RESUMED_AT,
      event: {
        schemaVersion: 1,
        eventId: "00000000-0000-4000-8000-000000000043",
        attemptId: IDS_A.attempt,
        sequence: 9,
        occurredAt: UNBLOCK_RESUMED_AT,
        commandId,
        causationEventId: claim.event.eventId,
        fence: 2,
        type: "attempt.unblock-answered",
        data: { stepId, answer },
      },
    });
    expect(answered.duplicate).toBe(false);
    expect(answered.event.data).toEqual({ stepId, answer });

    const replayedAnswer = repositories.unblocks.apply({
      command,
      leaseKey: claim.lease.leaseKey,
      ownerId: claim.lease.ownerId,
      observedAt: UNBLOCK_RESUMED_AT,
      event: {
        schemaVersion: 1,
        eventId: "00000000-0000-4000-8000-000000000043",
        attemptId: IDS_A.attempt,
        sequence: 9,
        occurredAt: UNBLOCK_RESUMED_AT,
        commandId,
        causationEventId: claim.event.eventId,
        fence: 2,
        type: "attempt.unblock-answered",
        data: { stepId, answer },
      },
    });
    expect(replayedAnswer).toMatchObject({
      command: answered.command,
      event: answered.event,
      duplicate: true,
    });

    const currentStep = requireNonNull(repositories.steps.findById(stepId), "blocked step");
    const resumedStep = repositories.steps.transition({
      leaseKey: claim.lease.leaseKey,
      ownerId: claim.lease.ownerId,
      observedAt: UNBLOCK_RESUMED_AT,
      expectedRevision: currentStep.revision,
      fence: 2,
      step: {
        ...currentStep,
        state: "running",
        revision: currentStep.revision + 1,
        lastFence: 2,
        runCount: currentStep.runCount + 1,
        blocker: null,
      },
      event: {
        schemaVersion: 1,
        eventId: "00000000-0000-4000-8000-000000000044",
        attemptId: IDS_A.attempt,
        sequence: 10,
        occurredAt: UNBLOCK_RESUMED_AT,
        commandId: null,
        causationEventId: answered.event.eventId,
        fence: 2,
        type: "step.state-changed",
        data: { stepId, from: "blocked", to: "running", outputDigest: null, failureCode: null },
      },
    });
    expect(resumedStep.state).toBe("running");
    expect(resumedStep.runCount).toBe(2);

    const resumedAttempt = repositories.transitionAttemptState({
      leaseKey: claim.lease.leaseKey,
      ownerId: claim.lease.ownerId,
      observedAt: UNBLOCK_ATTEMPT_RESUMED_AT,
      expectedRevision: blockedAttempt.revision + 1,
      attempt: {
        ...requireNonNull(repositories.attempts.findById(IDS_A.attempt), "claimed attempt"),
        state: "running",
        revision: blockedAttempt.revision + 2,
        updatedAt: UNBLOCK_ATTEMPT_RESUMED_AT,
        blocker: null,
      },
      event: {
        schemaVersion: 1,
        eventId: "00000000-0000-4000-8000-000000000045",
        attemptId: IDS_A.attempt,
        sequence: 11,
        occurredAt: UNBLOCK_ATTEMPT_RESUMED_AT,
        commandId: null,
        causationEventId: "00000000-0000-4000-8000-000000000044",
        fence: 2,
        type: "attempt.state-changed",
        data: { from: "blocked", to: "running", blocker: null, outcome: null },
      },
    });
    expect(resumedAttempt.state).toBe("running");
    expect(resumedAttempt.blocker).toBeNull();

    repositories.leases.release({
      leaseKey: claim.lease.leaseKey,
      ownerId: claim.lease.ownerId,
      fence: 2,
    });
    database.close();
  });

  it("refuses to record an unblock answer for an attempt that is not blocked", () => {
    const database = openMigratedFactoryDatabase(makeDatabasePath());
    const repositories = createFactoryRepositories(database);
    repositories.createTaskAttempt(makeBundle(IDS_A));
    const claim = repositories.leases.claim(makeLeaseClaim(IDS_A));

    expect(() =>
      repositories.unblocks.apply({
        command: {
          schemaVersion: 1,
          commandId: "00000000-0000-4000-8000-000000000051",
          issuedAt: LATER,
          origin: "cli",
          kind: "attempt.unblock",
          attemptId: IDS_A.attempt,
          answer: "Not applicable.",
        },
        leaseKey: claim.lease.leaseKey,
        ownerId: claim.lease.ownerId,
        observedAt: LATER,
        event: {
          schemaVersion: 1,
          eventId: "00000000-0000-4000-8000-000000000052",
          attemptId: IDS_A.attempt,
          sequence: 3,
          occurredAt: LATER,
          commandId: "00000000-0000-4000-8000-000000000051",
          causationEventId: null,
          fence: 1,
          type: "attempt.unblock-answered",
          data: { stepId: "00000000-0000-4000-8000-000000000053", answer: "Not applicable." },
        },
      }),
    ).toThrow(/is not blocked/);
    database.close();
  });
});
