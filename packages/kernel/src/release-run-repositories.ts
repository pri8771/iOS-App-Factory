import { randomUUID } from "node:crypto";

import {
  CommandIdSchema,
  CommandOriginV1Schema,
  IsoInstantSchema,
  ProjectIdSchema,
  ReleaseBuildNumberAllocationV1Schema,
  ReleaseRunIdSchema,
  ReleaseRunV1Schema,
  assertBuildNumberAllocationV1,
  assertReleaseRunAdvancement,
  type ReleaseBuildNumberAllocationV1,
  type ReleaseRunV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

/**
 * Release Rail Wave 2 persistence (`packages/contracts/src/v1/release-run.ts`). Two independent
 * repositories:
 *
 * - `ReleaseRunRepository` -- `release_runs` (CAS head) / `release_run_revisions` (append-only
 *   history), migration 0020. Mirrors `ProjectPlanRepository`'s compare-and-set-upsert-plus-append-
 *   only-revision-history pattern, with one difference driven by the contract itself:
 *   `ReleaseRunV1.revision` starts at 1 (`PositiveSafeIntegerSchema`), not 0, and `upsert` takes the
 *   FULL next-state `ReleaseRunV1` snapshot the caller has already computed (mirroring
 *   `PhaseRunRepository.transitionState`'s "the full next snapshot" convention) rather than a
 *   separate business-content "draft" shape -- Wave 1 did not define a `ReleaseRunDraftV1`, and
 *   `assertReleaseRunAdvancement` (contracts) already validates a full previous/next pair directly
 *   (identity immutable, revision increments by exactly one, stage holds or advances by exactly one
 *   stage), so re-deriving those invariants from a narrower draft shape here would only duplicate
 *   what that pure function already guarantees. `command_id` stays the idempotency key: a replayed
 *   `commandId` whose resulting run is byte-identical to what is already journaled returns that
 *   revision (`duplicate: true`) rather than re-validating advancement against a head that may have
 *   moved on since.
 *
 * - `ReleaseBuildNumberRepository` -- `release_build_numbers`, the append-only allocation ledger.
 *   `allocateNext` reuses `assertBuildNumberAllocationV1` (contracts) as the single source of truth
 *   for "monotonic, no duplicate, per bundle" rather than re-deriving that invariant in SQL -- see
 *   migration 0020's module doc comment for why `buildNumber` is stored as `TEXT`, not `INTEGER`
 *   (values can exceed `Number.MAX_SAFE_INTEGER`, and `assertBuildNumberAllocationV1` already
 *   compares via `BigInt`). `ReleaseBuildNumberAllocationV1` (contracts) has no id field of its own
 *   -- allocation identity is fully carried by `UNIQUE(bundle_id, build_number)` -- so `allocation_id`
 *   is a SQL-only surrogate primary key with no wire representation; unlike every caller-supplied id
 *   elsewhere in this package, `allocateNext` generates it itself (`node:crypto`'s `randomUUID`)
 *   since there is no domain value for a caller to supply.
 */

function failInvariant(message: string): never {
  throw new Error(`Factory persistence invariant failed: ${message}`);
}

function assertSame(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failInvariant(
      `${label} must be ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`,
    );
  }
}

function parseStoredJson<T>(
  table: string,
  identifier: string,
  payloadJson: string,
  parse: (value: unknown) => T,
): T {
  let value: unknown;
  try {
    value = JSON.parse(payloadJson) as unknown;
  } catch (error) {
    throw new Error(`${table} ${identifier} contains invalid JSON`, { cause: error });
  }
  try {
    return parse(value);
  } catch (error) {
    throw new Error(`${table} ${identifier} violates the current runtime contract`, {
      cause: error,
    });
  }
}

// ---------------------------------------------------------------------------
// ReleaseRunRepository
// ---------------------------------------------------------------------------

type ReleaseRunRow = Readonly<{
  release_run_id: string;
  project_id: string;
  repository_id: string;
  release_id: string;
  source_commit: string;
  branch: string;
  stage: string;
  revision: number;
  created_at: string;
  updated_at: string;
  payload_json: string;
}>;

function decodeReleaseRun(row: ReleaseRunRow): ReleaseRunV1 {
  const run = parseStoredJson("release_runs", row.release_run_id, row.payload_json, (value) =>
    ReleaseRunV1Schema.parse(value),
  );
  assertSame("release_runs release_run_id projection", row.release_run_id, run.releaseRunId);
  assertSame("release_runs project_id projection", row.project_id, run.projectId);
  assertSame("release_runs repository_id projection", row.repository_id, run.repositoryId);
  assertSame("release_runs release_id projection", row.release_id, run.releaseId);
  assertSame("release_runs source_commit projection", row.source_commit, run.sourceCommit);
  assertSame("release_runs branch projection", row.branch, run.branch);
  assertSame("release_runs stage projection", row.stage, run.stage);
  assertSame("release_runs revision projection", row.revision, run.revision);
  assertSame("release_runs created_at projection", row.created_at, run.createdAt);
  assertSame("release_runs updated_at projection", row.updated_at, run.updatedAt);
  return run;
}

const RELEASE_RUN_SELECT = `SELECT
  release_run_id, project_id, repository_id, release_id, source_commit, branch,
  stage, revision, created_at, updated_at, payload_json
FROM release_runs`;

export type UpsertReleaseRunInput = Readonly<{
  commandId: unknown;
  origin: unknown;
  issuedAt: unknown;
  /** The full next-state `ReleaseRunV1` snapshot; parsed at this boundary. On create (no existing
   *  row for `releaseRunId`) it must already be a fresh run at revision 1 with `createdAt ===
   *  updatedAt === recordedAt`; on update, `assertReleaseRunAdvancement` (contracts) validates the
   *  transition against the current head. */
  run: unknown;
  /** The trusted daemon-observed instant that becomes the row's `updatedAt` (and `createdAt` on
   *  create) -- must equal `run`'s own `createdAt`/`updatedAt`, checked below. */
  recordedAt: unknown;
}>;

export type UpsertedReleaseRun = Readonly<{
  run: ReleaseRunV1;
  created: boolean;
  duplicate: boolean;
}>;

export class ReleaseRunUpsertError extends Error {
  public constructor(
    public readonly code: "release-run.not-found" | "release-run.identity-conflict",
    message: string,
  ) {
    super(message);
    this.name = "ReleaseRunUpsertError";
  }
}

export class ReleaseRunRepository {
  public constructor(private readonly database: Database.Database) {}

  public get(releaseRunIdInput: unknown): ReleaseRunV1 | null {
    const releaseRunId = ReleaseRunIdSchema.parse(releaseRunIdInput);
    const row = this.database
      .prepare(`${RELEASE_RUN_SELECT} WHERE release_run_id = ?`)
      .get(releaseRunId) as ReleaseRunRow | undefined;
    return row === undefined ? null : decodeReleaseRun(row);
  }

  /** Every run for one project, most recently updated first. Bounded, unpaginated: release runs are
   *  operator-initiated and few, exactly like `ProjectPlanRepository.listByProject`. */
  public listByProject(projectIdInput: unknown): readonly ReleaseRunV1[] {
    const projectId = ProjectIdSchema.parse(projectIdInput);
    const rows = this.database
      .prepare(
        `${RELEASE_RUN_SELECT} WHERE project_id = ? ORDER BY updated_at DESC, release_run_id DESC LIMIT 1000`,
      )
      .all(projectId) as readonly ReleaseRunRow[];
    return rows.map(decodeReleaseRun);
  }

  public findRevisionByCommandId(commandIdInput: unknown): ReleaseRunV1 | null {
    const commandId = CommandIdSchema.parse(commandIdInput);
    const row = this.database
      .prepare(`SELECT payload_json FROM release_run_revisions WHERE command_id = ?`)
      .get(commandId) as Readonly<{ payload_json: string }> | undefined;
    if (row === undefined) return null;
    return parseStoredJson("release_run_revisions", commandId, row.payload_json, (value) =>
      ReleaseRunV1Schema.parse(value),
    );
  }

  /**
   * Creates (no existing row for `run.releaseRunId`) or compare-and-set advances a release run and
   * journals the driving command as one immutable revision, atomically. Idempotent by `commandId`:
   * replaying the same command ID with a byte-identical resulting run returns the revision already
   * written (`duplicate: true`); a different resulting run under the same ID is
   * `release-run.identity-conflict`.
   */
  public upsert(input: UpsertReleaseRunInput): UpsertedReleaseRun {
    const commandId = CommandIdSchema.parse(input.commandId);
    const origin = CommandOriginV1Schema.parse(input.origin);
    const issuedAt = IsoInstantSchema.parse(input.issuedAt);
    const recordedAt = IsoInstantSchema.parse(input.recordedAt);
    const candidate = ReleaseRunV1Schema.parse(input.run);

    const persist = this.database.transaction((): UpsertedReleaseRun => {
      const stored = this.findRevisionByCommandId(commandId);
      if (stored !== null) {
        if (JSON.stringify(stored) !== JSON.stringify(candidate)) {
          throw new ReleaseRunUpsertError(
            "release-run.identity-conflict",
            `command ${commandId} is already bound to a different release run mutation`,
          );
        }
        return { run: stored, created: stored.revision === 1, duplicate: true };
      }

      const headRow = this.database
        .prepare(`${RELEASE_RUN_SELECT} WHERE release_run_id = ?`)
        .get(candidate.releaseRunId) as ReleaseRunRow | undefined;
      const head = headRow === undefined ? null : decodeReleaseRun(headRow);

      if (head === null) {
        if (candidate.revision !== 1) {
          failInvariant(`release run ${candidate.releaseRunId} must start at revision 1`);
        }
        if (candidate.createdAt !== candidate.updatedAt) {
          failInvariant(
            `release run ${candidate.releaseRunId} must have updatedAt equal createdAt at revision 1`,
          );
        }
        if (candidate.createdAt !== recordedAt) {
          failInvariant(
            `release run ${candidate.releaseRunId} createdAt/updatedAt must equal recordedAt on create`,
          );
        }
        this.database
          .prepare(
            `INSERT INTO release_runs(
               release_run_id, schema_version, project_id, repository_id, release_id, source_commit,
               branch, stage, revision, created_at, updated_at, payload_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            candidate.releaseRunId,
            candidate.schemaVersion,
            candidate.projectId,
            candidate.repositoryId,
            candidate.releaseId,
            candidate.sourceCommit,
            candidate.branch,
            candidate.stage,
            candidate.revision,
            candidate.createdAt,
            candidate.updatedAt,
            JSON.stringify(candidate),
          );
      } else {
        const next = assertReleaseRunAdvancement(head, candidate);
        if (next.updatedAt !== recordedAt) {
          failInvariant(`release run ${next.releaseRunId} updatedAt must equal recordedAt`);
        }
        const result = this.database
          .prepare(
            `UPDATE release_runs SET stage = ?, revision = ?, updated_at = ?, payload_json = ?
             WHERE release_run_id = ? AND revision = ?`,
          )
          .run(
            next.stage,
            next.revision,
            next.updatedAt,
            JSON.stringify(next),
            next.releaseRunId,
            head.revision,
          );
        if (result.changes !== 1) {
          throw new Error(`Release run revision conflict: ${next.releaseRunId}`);
        }
      }

      this.database
        .prepare(
          `INSERT INTO release_run_revisions(
             release_run_id, revision, command_id, origin, issued_at, recorded_at, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          candidate.releaseRunId,
          candidate.revision,
          commandId,
          origin,
          issuedAt,
          recordedAt,
          JSON.stringify(candidate),
        );
      return { run: candidate, created: head === null, duplicate: false };
    });
    return persist.immediate();
  }
}

// ---------------------------------------------------------------------------
// ReleaseBuildNumberRepository
// ---------------------------------------------------------------------------

const MIN_BUNDLE_ID_LENGTH = 3;
const MAX_BUNDLE_ID_LENGTH = 255;

/**
 * Hand-parsed rather than a zod schema: `BundleIdSchema` (release-run.ts) is a private schema
 * literal, not exported from `@app-factory/contracts` -- only the composite
 * `ReleaseBuildNumberAllocationV1Schema` is. Full reverse-DNS format validation happens for free
 * below, when the constructed candidate allocation is parsed through that schema; this only bounds
 * length so a plainly malformed value fails fast with a clear message before the SQL query runs.
 */
function parseBundleId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < MIN_BUNDLE_ID_LENGTH ||
    value.length > MAX_BUNDLE_ID_LENGTH
  ) {
    throw new TypeError(
      `bundleId must be a string between ${String(MIN_BUNDLE_ID_LENGTH)} and ${String(MAX_BUNDLE_ID_LENGTH)} characters`,
    );
  }
  return value;
}

type BuildNumberRow = Readonly<{
  allocation_id: string;
  bundle_id: string;
  build_number: string;
  release_run_id: string;
  allocated_at: string;
}>;

const BUILD_NUMBER_SELECT = `SELECT allocation_id, bundle_id, build_number, release_run_id, allocated_at
FROM release_build_numbers`;

function decodeAllocation(row: BuildNumberRow): ReleaseBuildNumberAllocationV1 {
  return ReleaseBuildNumberAllocationV1Schema.parse({
    schemaVersion: 1,
    bundleId: row.bundle_id,
    buildNumber: row.build_number,
    releaseRunId: row.release_run_id,
    allocatedAt: row.allocated_at,
  });
}

export class ReleaseBuildNumberRepository {
  public constructor(private readonly database: Database.Database) {}

  /** Every allocation for one bundle, oldest first (allocation order -- `buildNumber` itself must be
   *  compared numerically, not lexicographically, to learn the highest; see
   *  `assertBuildNumberAllocationV1`). */
  public list(bundleIdInput: unknown): readonly ReleaseBuildNumberAllocationV1[] {
    const bundleId = parseBundleId(bundleIdInput);
    const rows = this.database
      .prepare(`${BUILD_NUMBER_SELECT} WHERE bundle_id = ? ORDER BY allocated_at, allocation_id`)
      .all(bundleId) as readonly BuildNumberRow[];
    return rows.map(decodeAllocation);
  }

  /**
   * Allocates and durably records the next build number for `bundleId` in one transaction: reads
   * every existing allocation for the bundle, computes one strictly greater than the highest
   * (`BigInt`-compared -- `buildNumber` can be up to 18 decimal digits, beyond
   * `Number.MAX_SAFE_INTEGER`), then re-validates that candidate against
   * `assertBuildNumberAllocationV1` (contracts) before persisting -- belt-and-suspenders around the
   * arithmetic above, not a substitute for it. The first allocation for a bundle starts at "1".
   * `UNIQUE(bundle_id, build_number)` (migration 0020) is the final backstop: the same number can
   * never be handed out twice for a bundle even if this method's own logic were ever wrong.
   */
  public allocateNext(
    bundleIdInput: unknown,
    releaseRunIdInput: unknown,
    nowInput: unknown,
  ): ReleaseBuildNumberAllocationV1 {
    const bundleId = parseBundleId(bundleIdInput);
    const releaseRunId = ReleaseRunIdSchema.parse(releaseRunIdInput);
    const allocatedAt = IsoInstantSchema.parse(nowInput);

    const persist = this.database.transaction((): ReleaseBuildNumberAllocationV1 => {
      const existingRows = this.database
        .prepare(`${BUILD_NUMBER_SELECT} WHERE bundle_id = ?`)
        .all(bundleId) as readonly BuildNumberRow[];
      const existing = existingRows.map(decodeAllocation);
      const highest = existing.reduce((max, allocation) => {
        const value = BigInt(allocation.buildNumber);
        return value > max ? value : max;
      }, 0n);
      const candidate = ReleaseBuildNumberAllocationV1Schema.parse({
        schemaVersion: 1,
        bundleId,
        buildNumber: (highest + 1n).toString(),
        releaseRunId,
        allocatedAt,
      });
      assertBuildNumberAllocationV1(existing, candidate);

      this.database
        .prepare(
          `INSERT INTO release_build_numbers(
             allocation_id, schema_version, bundle_id, build_number, release_run_id, allocated_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          candidate.schemaVersion,
          candidate.bundleId,
          candidate.buildNumber,
          candidate.releaseRunId,
          candidate.allocatedAt,
        );
      return candidate;
    });
    return persist.immediate();
  }
}
