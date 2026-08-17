import {
  CommandIdSchema,
  CommandOriginV1Schema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  PhaseDefinitionV1Schema,
  PhaseIdSchema,
  PhasePresetIdSchema,
  PhaseRunIdSchema,
  PhaseRunListQueryV1Schema,
  PhaseRunListPageV1Schema,
  PhaseRunV1Schema,
  ProjectIdSchema,
  type PhaseRunListPageV1,
  type PhaseRunV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

import { canonicalJson, computePhaseDefinitionDigest } from "./canonical-json.js";
import {
  assertLegalPhaseRunStateTransition,
  assertPhaseRunSnapshotCoherence,
} from "./state-machine.js";

/**
 * Phase Runner persistence. `PhaseRunV1` is attempt-shaped (a finite state machine over one row),
 * not a revisioned document — see migration `0010-phase-runs.ts`'s module doc comment for why this
 * mirrors `AttemptRepository`/`FactoryRepositories.createTaskAttempt`/`.transitionAttemptState`
 * rather than `PhaseDefinitionRepository`'s compare-and-set-upsert-plus-history pattern.
 */

export type CreatePhaseRunInput = Readonly<{
  commandId: unknown;
  origin: unknown;
  issuedAt: unknown;
  phaseRunId: unknown;
  presetId: unknown;
  phaseId: unknown;
  projectId: unknown;
  /** The full, already-durable `PhaseDefinitionV1` this run is bound to (embedded verbatim). */
  phaseSnapshot: unknown;
  /** The trusted daemon-observed instant that becomes `createdAt`/`updatedAt` at revision 0. */
  recordedAt: unknown;
}>;

export type CreatedPhaseRun = Readonly<{ run: PhaseRunV1; duplicate: boolean }>;

export type TransitionPhaseRunStateInput = Readonly<{
  expectedRevision: unknown;
  /** The full next `PhaseRunV1` snapshot; every identity field must match the current row. */
  run: unknown;
}>;

type PhaseRunRow = Readonly<{
  phase_run_id: string;
  command_id: string;
  origin: string;
  issued_at: string;
  preset_id: string | null;
  phase_id: string;
  project_id: string;
  phase_snapshot_digest: string;
  state: string;
  revision: number;
  room_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  payload_json: string;
}>;

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
  identifier: string,
  payloadJson: string,
  parse: (value: unknown) => T,
): T {
  let value: unknown;
  try {
    value = JSON.parse(payloadJson) as unknown;
  } catch (error) {
    throw new Error(`phase_runs ${identifier} contains invalid JSON`, { cause: error });
  }
  try {
    return parse(value);
  } catch (error) {
    throw new Error(`phase_runs ${identifier} violates the current runtime contract`, {
      cause: error,
    });
  }
}

function decodePhaseRun(row: PhaseRunRow): PhaseRunV1 {
  const run = parseStoredJson(row.phase_run_id, row.payload_json, (value) =>
    PhaseRunV1Schema.parse(value),
  );
  assertSame("phase_runs phase_run_id projection", row.phase_run_id, run.phaseRunId);
  assertSame("phase_runs preset_id projection", row.preset_id, run.presetId);
  assertSame("phase_runs phase_id projection", row.phase_id, run.phaseId);
  assertSame("phase_runs project_id projection", row.project_id, run.projectId);
  assertSame(
    "phase_runs phase_snapshot_digest projection",
    row.phase_snapshot_digest,
    run.phaseSnapshotDigest,
  );
  assertSame("phase_runs state projection", row.state, run.state);
  assertSame("phase_runs revision projection", row.revision, run.revision);
  assertSame("phase_runs room_id projection", row.room_id, run.roomId);
  assertSame("phase_runs created_at projection", row.created_at, run.createdAt);
  assertSame("phase_runs started_at projection", row.started_at, run.startedAt);
  assertSame("phase_runs finished_at projection", row.finished_at, run.finishedAt);
  assertSame("phase_runs updated_at projection", row.updated_at, run.updatedAt);
  assertSame(
    "phase_runs phase_snapshot_digest recomputation",
    row.phase_snapshot_digest,
    computePhaseDefinitionDigest(run.phaseSnapshot),
  );
  return assertPhaseRunSnapshotCoherence(run);
}

const PHASE_RUN_SELECT = "SELECT * FROM phase_runs";

export class PhaseRunRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(phaseRunIdInput: unknown): PhaseRunV1 | null {
    const phaseRunId = PhaseRunIdSchema.parse(phaseRunIdInput);
    const row = this.database
      .prepare(`${PHASE_RUN_SELECT} WHERE phase_run_id = ?`)
      .get(phaseRunId) as PhaseRunRow | undefined;
    return row === undefined ? null : decodePhaseRun(row);
  }

  public findByCommandId(commandIdInput: unknown): PhaseRunV1 | null {
    const commandId = CommandIdSchema.parse(commandIdInput);
    const row = this.database.prepare(`${PHASE_RUN_SELECT} WHERE command_id = ?`).get(commandId) as
      PhaseRunRow | undefined;
    return row === undefined ? null : decodePhaseRun(row);
  }

  /** Every run in `awaiting-human`, most recently updated first, scoped to one project. */
  public listAwaitingHumanByProject(projectIdInput: unknown): readonly PhaseRunV1[] {
    const projectId = ProjectIdSchema.parse(projectIdInput);
    const rows = this.database
      .prepare(
        `${PHASE_RUN_SELECT} WHERE project_id = ? AND state = 'awaiting-human'
         ORDER BY updated_at DESC, phase_run_id DESC LIMIT 100`,
      )
      .all(projectId) as readonly PhaseRunRow[];
    return rows.map(decodePhaseRun);
  }

  /** Bounded navigation page ordered by the authoritative run update tuple, newest first. */
  public list(inputValue: unknown): PhaseRunListPageV1 {
    const input = PhaseRunListQueryV1Schema.parse(inputValue);
    const conditions: string[] = [];
    const parameters: Array<number | string> = [];

    if (input.projectId !== null) {
      conditions.push("project_id = ?");
      parameters.push(input.projectId);
    }
    if (input.state !== null) {
      conditions.push("state = ?");
      parameters.push(input.state);
    }
    if (input.after !== null) {
      conditions.push("(updated_at < ? OR (updated_at = ? AND phase_run_id < ?))");
      parameters.push(input.after.updatedAt, input.after.updatedAt, input.after.phaseRunId);
    }

    const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
    const rows = this.database
      .prepare(`${PHASE_RUN_SELECT} ${where} ORDER BY updated_at DESC, phase_run_id DESC LIMIT ?`)
      .all(...parameters, input.limit + 1) as readonly PhaseRunRow[];
    const decoded = rows.map(decodePhaseRun);
    const hasMore = decoded.length > input.limit;
    const runs = decoded.slice(0, input.limit);
    const cursorSource = hasMore ? runs.at(-1) : undefined;
    return PhaseRunListPageV1Schema.parse({
      runs,
      nextAfter:
        cursorSource === undefined
          ? null
          : { updatedAt: cursorSource.updatedAt, phaseRunId: cursorSource.phaseRunId },
      hasMore,
    });
  }

  /**
   * Creates the run at revision 0, state `queued`. Idempotent by `commandId`: replaying the same
   * command ID with byte-identical content returns the run it already created; a different content
   * under the same ID is an invariant failure (the daemon's own command-identity guard is expected
   * to have refused that before ever reaching here — see `phase-run-command-runtime.ts`).
   */
  public create(input: CreatePhaseRunInput): CreatedPhaseRun {
    const commandId = CommandIdSchema.parse(input.commandId);
    const origin = CommandOriginV1Schema.parse(input.origin);
    const issuedAt = IsoInstantSchema.parse(input.issuedAt);
    const phaseRunId = PhaseRunIdSchema.parse(input.phaseRunId);
    const presetId = input.presetId === null ? null : PhasePresetIdSchema.parse(input.presetId);
    const phaseId = PhaseIdSchema.parse(input.phaseId);
    const projectId = ProjectIdSchema.parse(input.projectId);
    const phaseSnapshot = PhaseDefinitionV1Schema.parse(input.phaseSnapshot);
    const recordedAt = IsoInstantSchema.parse(input.recordedAt);
    const phaseSnapshotDigest = computePhaseDefinitionDigest(phaseSnapshot);

    const run = assertPhaseRunSnapshotCoherence(
      PhaseRunV1Schema.parse({
        schemaVersion: 1,
        phaseRunId,
        presetId,
        phaseId,
        projectId,
        phaseSnapshotDigest,
        phaseSnapshot,
        state: "queued",
        revision: 0,
        roomId: null,
        outputs: [],
        graderVerdict: null,
        tokenUsage: { totalTokens: 0 },
        outcome: null,
        createdAt: recordedAt,
        startedAt: null,
        finishedAt: null,
        updatedAt: recordedAt,
      }),
    );

    const persist = this.database.transaction((): CreatedPhaseRun => {
      const existingRow = this.database
        .prepare(`${PHASE_RUN_SELECT} WHERE command_id = ?`)
        .get(commandId) as PhaseRunRow | undefined;
      if (existingRow !== undefined) {
        const existing = decodePhaseRun(existingRow);
        // Only the identity fields a create command fixes forever are compared here — not the
        // whole current row. By the time a replay reaches this branch the run may already have
        // progressed well past `queued` (a `phase.run` command executes the run synchronously, so
        // a replay after the first call completed is common, not just a crash-recovery edge case),
        // and comparing full current state against a freshly-built "queued, revision 0" snapshot
        // would spuriously reject every such replay. This mirrors `createTaskAttempt`
        // (`repositories.ts`) comparing only the stored *command*, never the attempt's current
        // mutated state, against a replay.
        if (
          existing.phaseRunId !== run.phaseRunId ||
          existing.presetId !== run.presetId ||
          existing.phaseId !== run.phaseId ||
          existing.projectId !== run.projectId ||
          existing.phaseSnapshotDigest !== run.phaseSnapshotDigest ||
          existing.createdAt !== run.createdAt ||
          canonicalJson(existing.phaseSnapshot) !== canonicalJson(run.phaseSnapshot)
        ) {
          failInvariant(`command ${commandId} is already bound to a different phase run`);
        }
        return { run: existing, duplicate: true };
      }
      this.database
        .prepare(
          `INSERT INTO phase_runs(
             phase_run_id, schema_version, command_id, origin, issued_at,
             preset_id, phase_id, project_id, phase_snapshot_digest,
             state, revision, room_id, created_at, started_at, finished_at, updated_at, payload_json
           ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, NULL, ?, ?)`,
        )
        .run(
          run.phaseRunId,
          commandId,
          origin,
          issuedAt,
          run.presetId,
          run.phaseId,
          run.projectId,
          run.phaseSnapshotDigest,
          run.state,
          run.createdAt,
          run.updatedAt,
          JSON.stringify(run),
        );
      return { run, duplicate: false };
    });
    return persist.immediate();
  }

  /**
   * Advances a run's state under `revision`-gated compare-and-set. `input.run` is the full next
   * snapshot; every identity field (`phaseRunId`, `presetId`, `phaseId`, `projectId`,
   * `phaseSnapshotDigest`, `phaseSnapshot`, `createdAt`) must match the current row exactly, and the
   * transition itself must be legal (`assertLegalPhaseRunStateTransition`). No inner idempotency
   * ledger here — see the module doc comment for why plain CAS (mirroring
   * `FactoryRepositories.transitionAttemptState`) is sufficient.
   */
  public transitionState(input: TransitionPhaseRunStateInput): PhaseRunV1 {
    const expectedRevision = NonNegativeSafeIntegerSchema.parse(input.expectedRevision);
    const next = assertPhaseRunSnapshotCoherence(PhaseRunV1Schema.parse(input.run));

    const currentRow = this.database
      .prepare(`${PHASE_RUN_SELECT} WHERE phase_run_id = ?`)
      .get(next.phaseRunId) as PhaseRunRow | undefined;
    if (currentRow === undefined) {
      throw new Error(`Phase run does not exist: ${next.phaseRunId}`);
    }
    const current = decodePhaseRun(currentRow);
    if (current.revision !== expectedRevision) {
      throw new Error(
        `Phase run revision conflict: ${next.phaseRunId} is at revision ${String(current.revision)}, not ${String(expectedRevision)}`,
      );
    }
    assertLegalPhaseRunStateTransition(current.state, next.state);
    assertSame("transition phaseRunId", next.phaseRunId, current.phaseRunId);
    assertSame("transition presetId", next.presetId, current.presetId);
    assertSame("transition phaseId", next.phaseId, current.phaseId);
    assertSame("transition projectId", next.projectId, current.projectId);
    assertSame(
      "transition phaseSnapshotDigest",
      next.phaseSnapshotDigest,
      current.phaseSnapshotDigest,
    );
    assertSame("transition createdAt", next.createdAt, current.createdAt);
    if (canonicalJson(next.phaseSnapshot) !== canonicalJson(current.phaseSnapshot)) {
      failInvariant("transition phaseSnapshot must not change");
    }
    assertSame("transition revision", next.revision, current.revision + 1);
    if (next.updatedAt <= current.updatedAt) {
      failInvariant(
        `phase run ${next.phaseRunId} updatedAt ${next.updatedAt} must follow ${current.updatedAt}`,
      );
    }

    const persist = this.database.transaction((): PhaseRunV1 => {
      const result = this.database
        .prepare(
          `UPDATE phase_runs SET
             state = ?, revision = ?, room_id = ?, started_at = ?, finished_at = ?,
             updated_at = ?, payload_json = ?
           WHERE phase_run_id = ? AND revision = ?`,
        )
        .run(
          next.state,
          next.revision,
          next.roomId,
          next.startedAt,
          next.finishedAt,
          next.updatedAt,
          JSON.stringify(next),
          next.phaseRunId,
          current.revision,
        );
      if (result.changes !== 1) {
        throw new Error(`Phase run revision conflict: ${next.phaseRunId}`);
      }
      return next;
    });
    return persist.immediate();
  }
}
