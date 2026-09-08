import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  FACTORY_MIGRATIONS,
  ReleaseBuildNumberRepository,
  ReleaseRunRepository,
  ReleaseRunUpsertError,
  computeTaskSpecDigest,
  createEffectRepository,
  createFactoryRepositories,
  openFactoryDatabase,
  openMigratedFactoryDatabase,
  runMigrations,
} from "../src/index.js";

const T0 = "2026-08-21T09:00:00.000Z";
const T1 = "2026-08-21T09:00:01.000Z";
const T2 = "2026-08-21T09:00:02.000Z";
const T3 = "2026-08-21T09:00:03.000Z";
const EXPIRES = "2026-08-21T10:00:00.000Z";

const PROJECT_ID = "9c000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "9c000000-0000-4000-8000-000000000002";
const RELEASE_ID = "9c000000-0000-4000-8000-000000000003";
const RELEASE_RUN_ID = "9c000000-0000-4000-8000-000000000004";
const OTHER_RELEASE_RUN_ID = "9c000000-0000-4000-8000-000000000005";
const COMMAND_1 = "9c000000-0000-4000-8000-0000000000a1";
const COMMAND_2 = "9c000000-0000-4000-8000-0000000000a2";
const COMMAND_3 = "9c000000-0000-4000-8000-0000000000a3";
const COMMAND_4 = "9c000000-0000-4000-8000-0000000000a4";
const COMMAND_5 = "9c000000-0000-4000-8000-0000000000a5";

const SOURCE_COMMIT = "1".repeat(40);
const OTHER_SOURCE_COMMIT = "2".repeat(40);
const PROMOTED_COMMIT = "3".repeat(40);
const ARCHIVE_DIGEST = `sha256:${"a".repeat(64)}`;
const EXPORTED_ARTIFACT_DIGEST = `sha256:${"b".repeat(64)}`;
const RECEIPT_DIGEST = `sha256:${"c".repeat(64)}`;

const BUNDLE_ID = "com.example.app";
const OTHER_BUNDLE_ID = "com.example.other";

const roots: string[] = [];

function makeDatabasePath(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `app-factory-${prefix}-`));
  roots.push(root);
  return join(root, "factory.sqlite");
}

function database(prefix = "release-runs") {
  return openMigratedFactoryDatabase(makeDatabasePath(prefix));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** A minimal, fully valid `ReleaseRunV1` at stage `candidate`, revision 1. */
function releaseRun(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    releaseRunId: RELEASE_RUN_ID,
    projectId: PROJECT_ID,
    repositoryId: REPOSITORY_ID,
    releaseId: RELEASE_ID,
    sourceCommit: SOURCE_COMMIT,
    branch: "main",
    stage: "candidate",
    revision: 1,
    promotion: null,
    archive: null,
    upload: null,
    unevaluated: [],
    notes: [],
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function promotionRecord(at = T1) {
  return { promotedCommit: PROMOTED_COMMIT, branch: "main", at };
}

function archiveRecord(at = T1) {
  return {
    buildNumber: "1",
    marketingVersion: "1.0.0",
    archiveDigest: ARCHIVE_DIGEST,
    exportedArtifactDigest: EXPORTED_ARTIFACT_DIGEST,
    receiptDigest: RECEIPT_DIGEST,
    at,
  };
}

describe("ReleaseRunRepository", () => {
  it("creates a release run at revision 1 and journals the driving command", () => {
    const db = database();
    const repo = new ReleaseRunRepository(db);
    const result = repo.upsert({
      commandId: COMMAND_1,
      origin: "system",
      issuedAt: T0,
      run: releaseRun(),
      recordedAt: T0,
    });
    expect(result).toEqual({ run: releaseRun(), created: true, duplicate: false });
    expect(repo.get(RELEASE_RUN_ID)).toEqual(releaseRun());
    expect(repo.listByProject(PROJECT_ID)).toEqual([releaseRun()]);
    expect(repo.findRevisionByCommandId(COMMAND_1)).toEqual(releaseRun());

    const revisionRows = db.prepare("SELECT count(*) AS total FROM release_run_revisions").get();
    expect(revisionRows).toEqual({ total: 1 });
    db.close();
  });

  it("is idempotent for a replayed commandId with byte-identical resulting content", () => {
    const db = database();
    const repo = new ReleaseRunRepository(db);
    repo.upsert({
      commandId: COMMAND_1,
      origin: "system",
      issuedAt: T0,
      run: releaseRun(),
      recordedAt: T0,
    });
    const replay = repo.upsert({
      commandId: COMMAND_1,
      origin: "system",
      issuedAt: T0,
      run: releaseRun(),
      recordedAt: T0,
    });
    expect(replay).toEqual({ run: releaseRun(), created: true, duplicate: true });
    expect(db.prepare("SELECT count(*) AS total FROM release_run_revisions").get()).toEqual({
      total: 1,
    });
    db.close();
  });

  it("rejects a replayed commandId whose resulting run differs (identity conflict)", () => {
    const db = database();
    const repo = new ReleaseRunRepository(db);
    repo.upsert({
      commandId: COMMAND_1,
      origin: "system",
      issuedAt: T0,
      run: releaseRun(),
      recordedAt: T0,
    });
    expect(() =>
      repo.upsert({
        commandId: COMMAND_1,
        origin: "system",
        issuedAt: T0,
        run: releaseRun({ branch: "release/1.0" }),
        recordedAt: T0,
      }),
    ).toThrow(ReleaseRunUpsertError);
    try {
      repo.upsert({
        commandId: COMMAND_1,
        origin: "system",
        issuedAt: T0,
        run: releaseRun({ branch: "release/1.0" }),
        recordedAt: T0,
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ReleaseRunUpsertError);
      expect((error as ReleaseRunUpsertError).code).toBe("release-run.identity-conflict");
    }
    db.close();
  });

  it("holds its stage across a resumed retry, then advances exactly one stage at a time (resume-per-stage)", () => {
    const db = database();
    const repo = new ReleaseRunRepository(db);
    repo.upsert({
      commandId: COMMAND_1,
      origin: "system",
      issuedAt: T0,
      run: releaseRun(),
      recordedAt: T0,
    });

    // A retry that re-settles the same stage's evidence without moving the run forward.
    const held = repo.upsert({
      commandId: COMMAND_2,
      origin: "system",
      issuedAt: T1,
      run: releaseRun({ revision: 2, updatedAt: T1, notes: ["re-checked candidate evidence"] }),
      recordedAt: T1,
    });
    expect(held).toMatchObject({ created: false, duplicate: false });
    expect(held.run.stage).toBe("candidate");
    expect(held.run.revision).toBe(2);

    // Advances exactly one stage (candidate -> certified).
    const certified = repo.upsert({
      commandId: COMMAND_3,
      origin: "system",
      issuedAt: T2,
      run: releaseRun({ revision: 3, updatedAt: T2, stage: "certified" }),
      recordedAt: T2,
    });
    expect(certified.run.stage).toBe("certified");
    expect(certified.run.revision).toBe(3);

    // Skipping a stage (certified -> upload-approved, jumping over archived) is illegal.
    expect(() =>
      repo.upsert({
        commandId: COMMAND_4,
        origin: "system",
        issuedAt: T3,
        run: releaseRun({
          revision: 4,
          updatedAt: T3,
          stage: "upload-approved",
          promotion: promotionRecord(),
          archive: archiveRecord(),
        }),
        recordedAt: T3,
      }),
    ).toThrow(/hold its stage or advance exactly one stage/);
    db.close();
  });

  it("rejects a CAS conflict: a candidate revision that does not follow the actual current head", () => {
    const db = database();
    const repo = new ReleaseRunRepository(db);
    repo.upsert({
      commandId: COMMAND_1,
      origin: "system",
      issuedAt: T0,
      run: releaseRun(),
      recordedAt: T0,
    });
    repo.upsert({
      commandId: COMMAND_2,
      origin: "system",
      issuedAt: T1,
      run: releaseRun({ revision: 2, updatedAt: T1, stage: "certified" }),
      recordedAt: T1,
    });
    // Head is now at revision 2. A caller still working off revision 1 (i.e. proposing "revision 2"
    // again as the next value) must be rejected, not silently accepted as another advance.
    expect(() =>
      repo.upsert({
        commandId: COMMAND_3,
        origin: "system",
        issuedAt: T2,
        run: releaseRun({ revision: 2, updatedAt: T2, stage: "certified" }),
        recordedAt: T2,
      }),
    ).toThrow(/revision must increment by exactly one/);
    db.close();
  });

  it("rejects a change to an immutable identity field mid-update", () => {
    const db = database();
    const repo = new ReleaseRunRepository(db);
    repo.upsert({
      commandId: COMMAND_1,
      origin: "system",
      issuedAt: T0,
      run: releaseRun(),
      recordedAt: T0,
    });
    expect(() =>
      repo.upsert({
        commandId: COMMAND_2,
        origin: "system",
        issuedAt: T1,
        run: releaseRun({ revision: 2, updatedAt: T1, sourceCommit: OTHER_SOURCE_COMMIT }),
        recordedAt: T1,
      }),
    ).toThrow(/changed immutable field sourceCommit/);
    db.close();
  });

  it("keeps two release runs independent under listByProject and CAS", () => {
    const db = database();
    const repo = new ReleaseRunRepository(db);
    repo.upsert({
      commandId: COMMAND_1,
      origin: "system",
      issuedAt: T0,
      run: releaseRun(),
      recordedAt: T0,
    });
    repo.upsert({
      commandId: COMMAND_5,
      origin: "system",
      issuedAt: T0,
      run: releaseRun({ releaseRunId: OTHER_RELEASE_RUN_ID }),
      recordedAt: T0,
    });
    const listed = repo.listByProject(PROJECT_ID);
    expect(listed.map((run) => run.releaseRunId).sort()).toEqual(
      [RELEASE_RUN_ID, OTHER_RELEASE_RUN_ID].sort(),
    );
    db.close();
  });
});

describe("release_runs SQL-level invariants (migration 0020)", () => {
  it("rejects an insert that does not start at revision 1", () => {
    const db = database("release-runs-sql");
    expect(() =>
      db
        .prepare(
          `INSERT INTO release_runs(
             release_run_id, schema_version, project_id, repository_id, release_id, source_commit,
             branch, stage, revision, created_at, updated_at, payload_json
           ) VALUES (?, 1, ?, ?, ?, ?, 'main', 'candidate', 2, ?, ?, '{}')`,
        )
        .run(RELEASE_RUN_ID, PROJECT_ID, REPOSITORY_ID, RELEASE_ID, SOURCE_COMMIT, T0, T0),
    ).toThrow(/starts at revision 1/);
    db.close();
  });

  it("rejects an update that changes an immutable identity column", () => {
    const db = database("release-runs-sql");
    db.prepare(
      `INSERT INTO release_runs(
         release_run_id, schema_version, project_id, repository_id, release_id, source_commit,
         branch, stage, revision, created_at, updated_at, payload_json
       ) VALUES (?, 1, ?, ?, ?, ?, 'main', 'candidate', 1, ?, ?, '{}')`,
    ).run(RELEASE_RUN_ID, PROJECT_ID, REPOSITORY_ID, RELEASE_ID, SOURCE_COMMIT, T0, T0);
    expect(() =>
      db
        .prepare(
          `UPDATE release_runs SET project_id = ?, revision = 2, updated_at = ? WHERE release_run_id = ?`,
        )
        .run(REPOSITORY_ID, T1, RELEASE_RUN_ID),
    ).toThrow(/identity is immutable/);
    db.close();
  });

  it("rejects an update whose revision or updated_at does not strictly advance", () => {
    const db = database("release-runs-sql");
    db.prepare(
      `INSERT INTO release_runs(
         release_run_id, schema_version, project_id, repository_id, release_id, source_commit,
         branch, stage, revision, created_at, updated_at, payload_json
       ) VALUES (?, 1, ?, ?, ?, ?, 'main', 'candidate', 1, ?, ?, '{}')`,
    ).run(RELEASE_RUN_ID, PROJECT_ID, REPOSITORY_ID, RELEASE_ID, SOURCE_COMMIT, T0, T0);
    expect(() =>
      db
        .prepare(`UPDATE release_runs SET revision = 3, updated_at = ? WHERE release_run_id = ?`)
        .run(T1, RELEASE_RUN_ID),
    ).toThrow(/revision or updated_at is not monotonic/);
    db.close();
  });

  it("rejects deleting a release run", () => {
    const db = database("release-runs-sql");
    db.prepare(
      `INSERT INTO release_runs(
         release_run_id, schema_version, project_id, repository_id, release_id, source_commit,
         branch, stage, revision, created_at, updated_at, payload_json
       ) VALUES (?, 1, ?, ?, ?, ?, 'main', 'candidate', 1, ?, ?, '{}')`,
    ).run(RELEASE_RUN_ID, PROJECT_ID, REPOSITORY_ID, RELEASE_ID, SOURCE_COMMIT, T0, T0);
    expect(() =>
      db.prepare(`DELETE FROM release_runs WHERE release_run_id = ?`).run(RELEASE_RUN_ID),
    ).toThrow(/release runs are retained/);
    db.close();
  });

  it("rejects updating or deleting a release_run_revisions row (append-only)", () => {
    const db = database("release-runs-sql");
    const repo = new ReleaseRunRepository(db);
    repo.upsert({
      commandId: COMMAND_1,
      origin: "system",
      issuedAt: T0,
      run: releaseRun(),
      recordedAt: T0,
    });
    expect(() =>
      db
        .prepare(`UPDATE release_run_revisions SET origin = 'cli' WHERE command_id = ?`)
        .run(COMMAND_1),
    ).toThrow(/append-only/);
    expect(() =>
      db.prepare(`DELETE FROM release_run_revisions WHERE command_id = ?`).run(COMMAND_1),
    ).toThrow(/append-only/);
    db.close();
  });
});

describe("ReleaseBuildNumberRepository", () => {
  function seedReleaseRun(db: ReturnType<typeof database>, releaseRunId = RELEASE_RUN_ID) {
    new ReleaseRunRepository(db).upsert({
      commandId: COMMAND_1,
      origin: "system",
      issuedAt: T0,
      run: releaseRun({ releaseRunId }),
      recordedAt: T0,
    });
  }

  it("allocates the first build number as 1", () => {
    const db = database("build-numbers");
    seedReleaseRun(db);
    const repo = new ReleaseBuildNumberRepository(db);
    const allocation = repo.allocateNext(BUNDLE_ID, RELEASE_RUN_ID, T0);
    expect(allocation).toEqual({
      schemaVersion: 1,
      bundleId: BUNDLE_ID,
      buildNumber: "1",
      releaseRunId: RELEASE_RUN_ID,
      allocatedAt: T0,
    });
    db.close();
  });

  it("allocates strictly increasing numbers per bundle, including the 9 -> 10 boundary", () => {
    const db = database("build-numbers");
    seedReleaseRun(db);
    const repo = new ReleaseBuildNumberRepository(db);
    const numbers: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      numbers.push(repo.allocateNext(BUNDLE_ID, RELEASE_RUN_ID, T0).buildNumber);
    }
    expect(numbers).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    db.close();
  });

  it("compares existing allocations numerically, not lexicographically", () => {
    // Seed allocations "2" and "10" directly: a naive string-max would pick "2" as highest (since
    // "2" > "10" lexicographically) and next-allocate "3", silently handing out a SMALLER build
    // number than one already recorded -- exactly the bug the BigInt comparison in
    // `assertBuildNumberAllocationV1` (and `allocateNext`) must avoid.
    const db = database("build-numbers");
    seedReleaseRun(db);
    db.prepare(
      `INSERT INTO release_build_numbers(
         allocation_id, schema_version, bundle_id, build_number, release_run_id, allocated_at
       ) VALUES (?, 1, ?, '2', ?, ?)`,
    ).run("9c000000-0000-4000-8000-0000000000b1", BUNDLE_ID, RELEASE_RUN_ID, T0);
    db.prepare(
      `INSERT INTO release_build_numbers(
         allocation_id, schema_version, bundle_id, build_number, release_run_id, allocated_at
       ) VALUES (?, 1, ?, '10', ?, ?)`,
    ).run("9c000000-0000-4000-8000-0000000000b2", BUNDLE_ID, RELEASE_RUN_ID, T0);

    const repo = new ReleaseBuildNumberRepository(db);
    const allocation = repo.allocateNext(BUNDLE_ID, RELEASE_RUN_ID, T1);
    expect(allocation.buildNumber).toBe("11");
    db.close();
  });

  it("keeps allocations isolated per bundle", () => {
    const db = database("build-numbers");
    seedReleaseRun(db);
    const repo = new ReleaseBuildNumberRepository(db);
    repo.allocateNext(BUNDLE_ID, RELEASE_RUN_ID, T0);
    repo.allocateNext(BUNDLE_ID, RELEASE_RUN_ID, T1);
    const other = repo.allocateNext(OTHER_BUNDLE_ID, RELEASE_RUN_ID, T2);
    expect(other.buildNumber).toBe("1");
    expect(repo.list(BUNDLE_ID).map((a) => a.buildNumber)).toEqual(["1", "2"]);
    expect(repo.list(OTHER_BUNDLE_ID).map((a) => a.buildNumber)).toEqual(["1"]);
    db.close();
  });

  it("UNIQUE(bundle_id, build_number) prevents the same number from ever being handed out twice", () => {
    const db = database("build-numbers");
    seedReleaseRun(db);
    db.prepare(
      `INSERT INTO release_build_numbers(
         allocation_id, schema_version, bundle_id, build_number, release_run_id, allocated_at
       ) VALUES (?, 1, ?, '1', ?, ?)`,
    ).run("9c000000-0000-4000-8000-0000000000c1", BUNDLE_ID, RELEASE_RUN_ID, T0);
    expect(() =>
      db
        .prepare(
          `INSERT INTO release_build_numbers(
             allocation_id, schema_version, bundle_id, build_number, release_run_id, allocated_at
           ) VALUES (?, 1, ?, '1', ?, ?)`,
        )
        .run("9c000000-0000-4000-8000-0000000000c2", BUNDLE_ID, RELEASE_RUN_ID, T1),
    ).toThrow(/UNIQUE constraint failed/);
    db.close();
  });

  it("rejects updating or deleting an allocation (append-only)", () => {
    const db = database("build-numbers");
    seedReleaseRun(db);
    const repo = new ReleaseBuildNumberRepository(db);
    repo.allocateNext(BUNDLE_ID, RELEASE_RUN_ID, T0);
    expect(() =>
      db
        .prepare(`UPDATE release_build_numbers SET build_number = '99' WHERE bundle_id = ?`)
        .run(BUNDLE_ID),
    ).toThrow(/append-only/);
    expect(() =>
      db.prepare(`DELETE FROM release_build_numbers WHERE bundle_id = ?`).run(BUNDLE_ID),
    ).toThrow(/append-only/);
    db.close();
  });

  it("OR-26 allocates above a fresh known-maximum provider observation", () => {
    const db = database("build-numbers-obs");
    seedReleaseRun(db);
    const repo = new ReleaseBuildNumberRepository(db);
    const allocation = repo.allocateNextAgainstObservation(
      BUNDLE_ID,
      RELEASE_RUN_ID,
      {
        schemaVersion: 1,
        observationId: "9c000000-0000-4000-8000-0000000000e1",
        bundleId: BUNDLE_ID,
        platform: "ios",
        observedAt: T0,
        freshnessDeadline: T3,
        kind: "known-maximum",
        maximumBuildNumber: "41",
        evidenceDigest: ARCHIVE_DIGEST,
      },
      T1,
    );
    expect(allocation.buildNumber).toBe("42");
    db.close();
  });

  it("OR-26 fails closed on stale or ambiguous provider observations", () => {
    const db = database("build-numbers-obs-fail");
    seedReleaseRun(db);
    const repo = new ReleaseBuildNumberRepository(db);
    expect(() =>
      repo.allocateNextAgainstObservation(
        BUNDLE_ID,
        RELEASE_RUN_ID,
        {
          schemaVersion: 1,
          observationId: "9c000000-0000-4000-8000-0000000000e2",
          bundleId: BUNDLE_ID,
          platform: "ios",
          observedAt: T0,
          freshnessDeadline: T1,
          kind: "known-maximum",
          maximumBuildNumber: "5",
          evidenceDigest: ARCHIVE_DIGEST,
        },
        T2,
      ),
    ).toThrow(/stale/);
    expect(() =>
      repo.allocateNextAgainstObservation(
        BUNDLE_ID,
        RELEASE_RUN_ID,
        {
          schemaVersion: 1,
          observationId: "9c000000-0000-4000-8000-0000000000e3",
          bundleId: BUNDLE_ID,
          platform: "ios",
          observedAt: T0,
          freshnessDeadline: T3,
          kind: "ambiguous",
          maximumBuildNumber: null,
          evidenceDigest: ARCHIVE_DIGEST,
        },
        T1,
      ),
    ).toThrow(/ambiguous/);
    db.close();
  });

  it("OR-26 respects the higher of local durable max and provider exclusive lower bound", () => {
    const db = database("build-numbers-obs-local");
    seedReleaseRun(db);
    const repo = new ReleaseBuildNumberRepository(db);
    repo.allocateNext(BUNDLE_ID, RELEASE_RUN_ID, T0); // "1"
    repo.allocateNext(BUNDLE_ID, RELEASE_RUN_ID, T1); // "2"
    const allocation = repo.allocateNextAgainstObservation(
      BUNDLE_ID,
      RELEASE_RUN_ID,
      {
        schemaVersion: 1,
        observationId: "9c000000-0000-4000-8000-0000000000e4",
        bundleId: BUNDLE_ID,
        platform: "ios",
        observedAt: T0,
        freshnessDeadline: T3,
        kind: "explicitly-empty",
        maximumBuildNumber: null,
        evidenceDigest: ARCHIVE_DIGEST,
      },
      T2,
    );
    expect(allocation.buildNumber).toBe("3");
    db.close();
  });
});

describe("migration 0020 (release-runs) application", () => {
  const TASK_ID = "9c000000-0000-4000-8000-0000000000d1";
  const ATTEMPT_ID = "9c000000-0000-4000-8000-0000000000d2";
  const COMMAND_ID = "9c000000-0000-4000-8000-0000000000d3";
  const EVENT_ID = "9c000000-0000-4000-8000-0000000000d4";
  const LEGACY_APPROVAL_ID = "9c000000-0000-4000-8000-0000000000d5";
  const RELEASE_SCOPED_APPROVAL_ID = "9c000000-0000-4000-8000-0000000000d6";
  const POLICY_DIGEST = `sha256:${"1".repeat(64)}`;
  const PLAN_DIGEST = `sha256:${"2".repeat(64)}`;
  const DIFF_DIGEST = `sha256:${"3".repeat(64)}`;
  const COMMIT = "4".repeat(40);
  const PAYLOAD_DIGEST = `sha256:${"5".repeat(64)}`;
  const ATTESTATION_DIGEST = `sha256:${"6".repeat(64)}`;

  it("rebuilds approvals in place, preserving legacy attempt-scoped rows, and adds the release-run tables", () => {
    const db = openFactoryDatabase(makeDatabasePath("migration-0020"));
    // Pre-Wave-2 schema: only migrations 1 through 19.
    runMigrations(db, { migrations: FACTORY_MIGRATIONS.slice(0, 19), now: () => new Date(T0) });

    // Seed a real attempt/task through the ordinary repository path, under the OLD schema.
    const taskSpec = {
      schemaVersion: 1,
      taskId: TASK_ID,
      projectId: PROJECT_ID,
      createdAt: T0,
      title: "Legacy task",
      objective: "Prove the approvals rebuild preserves legacy rows.",
      acceptanceCriteria: [{ id: "ac-1", statement: "It still works.", verification: "automated" }],
      base: { repositoryId: REPOSITORY_ID, commit: SOURCE_COMMIT },
      requestedScope: { paths: ["src"] },
      policyDigest: POLICY_DIGEST,
    } as const;
    const taskSpecDigest = computeTaskSpecDigest(taskSpec);
    const repositories = createFactoryRepositories(db);
    repositories.createTaskAttempt({
      command: {
        schemaVersion: 1,
        commandId: COMMAND_ID,
        issuedAt: T0,
        origin: "system",
        kind: "task.submit",
        initialDesiredState: "running",
        taskSpec,
      },
      taskSpecDigest,
      attempt: {
        schemaVersion: 1,
        attemptId: ATTEMPT_ID,
        taskId: TASK_ID,
        taskSpecDigest,
        attemptNumber: 1,
        state: "queued",
        desiredState: "running",
        revision: 0,
        fence: 0,
        currentStepId: null,
        blocker: null,
        outcome: null,
        createdAt: T0,
        updatedAt: T0,
        terminalAt: null,
      },
      event: {
        schemaVersion: 1,
        eventId: EVENT_ID,
        attemptId: ATTEMPT_ID,
        sequence: 1,
        occurredAt: T0,
        commandId: COMMAND_ID,
        causationEventId: null,
        fence: 0,
        type: "attempt.created",
        data: { taskId: TASK_ID, taskSpecDigest },
      },
    });

    // Register a legacy, attempt-scoped approval directly against the pre-Wave-2 table/trigger.
    const legacyEffects = createEffectRepository(db, { verifyApprovalIssuance: () => true });
    const legacyApproval = {
      schemaVersion: 1,
      approvalId: LEGACY_APPROVAL_ID,
      action: "github.merge-pr",
      resourceType: "github.pull-request",
      resourceKey: "owner/repository#7",
      subject: { projectId: PROJECT_ID, taskId: TASK_ID, attemptId: ATTEMPT_ID, releaseId: null },
      binding: {
        planDigest: PLAN_DIGEST,
        diffDigest: DIFF_DIGEST,
        commit: COMMIT,
        buildIdentityDigest: null,
        policyDigest: POLICY_DIGEST,
      },
      actorId: "owner@example.com",
      mode: "single-use",
      standingScope: null,
      issuedAt: T0,
      expiresAt: EXPIRES,
      status: "active",
      revokedAt: null,
      consumedAt: null,
      consumedByEffectId: null,
    };
    legacyEffects.registerApproval({
      issuance: {
        approval: legacyApproval,
        payloadDigest: PAYLOAD_DIGEST,
        issuerId: "trusted.approval-service",
        authenticatedAt: T0,
        attestationDigest: ATTESTATION_DIGEST,
      },
    });

    // Apply migration 0020.
    expect(runMigrations(db)).toEqual({ currentVersion: 20, newlyAppliedVersions: [20] });

    // The legacy row survived the rebuild byte-for-byte.
    const row = db
      .prepare(
        `SELECT subject_project_id AS projectId, subject_task_id AS taskId,
                subject_attempt_id AS attemptId, subject_release_id AS releaseId,
                action, resource_key AS resourceKey, status
         FROM approvals WHERE approval_id = ?`,
      )
      .get(LEGACY_APPROVAL_ID);
    expect(row).toEqual({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      releaseId: null,
      action: "github.merge-pr",
      resourceKey: "owner/repository#7",
      status: "active",
    });
    expect(legacyEffects.getApproval(LEGACY_APPROVAL_ID)?.approval.subject).toEqual({
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      releaseId: null,
    });

    // The new tables exist.
    const newTables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table'
           AND name IN ('release_runs', 'release_run_revisions', 'release_build_numbers')
         ORDER BY name`,
      )
      .all();
    expect(newTables).toEqual([
      { name: "release_build_numbers" },
      { name: "release_run_revisions" },
      { name: "release_runs" },
    ]);

    // The rebuilt table still enforces the unchanged attempt-scoped rule for a bogus subject...
    expect(() =>
      db
        .prepare(
          `INSERT INTO approvals (
             approval_id, schema_version, action, resource_type, resource_key,
             subject_project_id, subject_task_id, subject_attempt_id, subject_release_id,
             payload_digest, plan_digest, diff_digest, commit_id, build_identity_digest,
             policy_digest, actor_id, issuer_id, authenticated_at, issuance_envelope_digest,
             issuance_attestation_digest, issuance_json, mode, standing_scope_json, issued_at,
             expires_at, status, revoked_at, consumed_at, consumed_by_effect_id, payload_json
           ) VALUES (
             ?, 1, 'github.merge-pr', 'github.pull-request', 'owner/repository#9',
             ?, ?, ?, NULL,
             ?, ?, ?, ?, NULL,
             ?, 'owner@example.com', 'trusted.approval-service', ?, ?,
             ?, '{}', 'single-use', NULL, ?,
             ?, 'active', NULL, NULL, NULL, '{}'
           )`,
        )
        .run(
          "9c000000-0000-4000-8000-0000000000e1",
          PROJECT_ID,
          TASK_ID,
          "9c000000-0000-4000-8000-0000000000ff",
          PAYLOAD_DIGEST,
          PLAN_DIGEST,
          DIFF_DIGEST,
          COMMIT,
          POLICY_DIGEST,
          T0,
          ATTESTATION_DIGEST,
          ATTESTATION_DIGEST,
          T0,
          EXPIRES,
        ),
    ).toThrow(/approval subject does not match attempt task\/project, or is not release-scoped/);

    // ...and now also accepts a release-scoped row.
    const releaseEffects = createEffectRepository(db, { verifyApprovalIssuance: () => true });
    releaseEffects.registerApproval({
      issuance: {
        approval: {
          ...legacyApproval,
          approvalId: RELEASE_SCOPED_APPROVAL_ID,
          action: "apple.upload-build",
          resourceType: "apple.build",
          resourceKey: "com.example.app/1.0/7",
          subject: { projectId: PROJECT_ID, taskId: null, attemptId: null, releaseId: RELEASE_ID },
          binding: { ...legacyApproval.binding, buildIdentityDigest: PAYLOAD_DIGEST },
        },
        payloadDigest: PAYLOAD_DIGEST,
        issuerId: "trusted.approval-service",
        authenticatedAt: T0,
        attestationDigest: ATTESTATION_DIGEST,
      },
    });
    expect(releaseEffects.getApproval(RELEASE_SCOPED_APPROVAL_ID)?.approval.subject).toEqual({
      projectId: PROJECT_ID,
      taskId: null,
      attemptId: null,
      releaseId: RELEASE_ID,
    });

    expect(db.pragma("foreign_key_check")).toEqual([]);
    db.close();
  });
});
