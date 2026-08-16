import {
  CommandIdSchema,
  MAX_PROJECT_MILESTONES_V1,
  MAX_TIMELINE_PHASES_V1,
  MilestoneIdSchema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  ProjectIdSchema,
  ProjectMilestoneUpsertCommandV1Schema,
  ProjectMilestoneV1Schema,
  ProjectPhaseActualsV1Schema,
  StableKeySchema,
  type MilestoneId,
  type ProjectId,
  type ProjectMilestoneUpsertCommandV1,
  type ProjectMilestoneV1,
  type ProjectPhaseActualsV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

export type UpsertProjectMilestoneInput = Readonly<{
  /** A `ProjectMilestoneUpsertCommandV1`; parsed at this boundary. */
  command: unknown;
  /** The trusted daemon-observed instant that becomes `updatedAt` (and `createdAt` on create). */
  recordedAt: unknown;
}>;

export type UpsertedProjectMilestone = Readonly<{
  milestone: ProjectMilestoneV1;
  created: boolean;
  duplicate: boolean;
}>;

/**
 * One append-only history row: the milestone as it stood after `command`
 * wrote it. `milestone.updatedAt` is the instant the revision was recorded.
 */
export type ProjectMilestoneRevisionRecord = Readonly<{
  milestone: ProjectMilestoneV1;
  command: ProjectMilestoneUpsertCommandV1;
}>;

/**
 * Thrown for a rejected upsert whose cause is the caller's, not a persistence
 * invariant: a stale expected revision, a missing dependency, and so on. The
 * daemon maps `code` onto its command protocol error codes.
 */
export class ProjectMilestoneUpsertError extends Error {
  public constructor(
    public readonly code:
      | "milestone.not-found"
      | "milestone.already-exists"
      | "milestone.revision-conflict"
      | "milestone.project-mismatch"
      | "milestone.dependency-not-found"
      | "milestone.dependency-cycle"
      | "milestone.identity-conflict",
    message: string,
  ) {
    super(message);
    this.name = "ProjectMilestoneUpsertError";
  }
}

type MilestoneRow = Readonly<{
  milestone_id: string;
  project_id: string;
  phase: string;
  kind: string;
  label: string;
  target_date: string | null;
  owner: string;
  status: string;
  evidence_digest: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  payload_json: string;
}>;

type MilestoneRevisionRow = Readonly<{
  milestone_id: string;
  revision: number;
  command_id: string;
  origin: string;
  issued_at: string;
  expected_revision: number | null;
  recorded_at: string;
  command_json: string;
  payload_json: string;
}>;

type PhaseActualsRow = Readonly<{
  phase: string | null;
  attempt_count: number;
  active_attempt_count: number;
  blocker_count: number;
  succeeded_attempt_count: number;
  first_attempt_at: string;
  last_activity_at: string;
  last_succeeded_at: string | null;
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

function decodeMilestone(row: MilestoneRow): ProjectMilestoneV1 {
  const milestone = parseStoredJson(
    "project_milestones",
    row.milestone_id,
    row.payload_json,
    (value) => ProjectMilestoneV1Schema.parse(value),
  );
  assertSame("milestone_id projection", row.milestone_id, milestone.milestoneId);
  assertSame("milestone project_id projection", row.project_id, milestone.projectId);
  assertSame("milestone phase projection", row.phase, milestone.phase);
  assertSame("milestone kind projection", row.kind, milestone.kind);
  assertSame("milestone label projection", row.label, milestone.label);
  assertSame("milestone target_date projection", row.target_date, milestone.targetDate);
  assertSame("milestone owner projection", row.owner, milestone.owner);
  assertSame("milestone status projection", row.status, milestone.status);
  assertSame("milestone evidence_digest projection", row.evidence_digest, milestone.evidenceDigest);
  assertSame("milestone revision projection", row.revision, milestone.revision);
  assertSame("milestone created_at projection", row.created_at, milestone.createdAt);
  assertSame("milestone updated_at projection", row.updated_at, milestone.updatedAt);
  return milestone;
}

function decodeRevision(row: MilestoneRevisionRow): ProjectMilestoneRevisionRecord {
  const milestone = parseStoredJson(
    "project_milestone_revisions",
    `${row.milestone_id}@${String(row.revision)}`,
    row.payload_json,
    (value) => ProjectMilestoneV1Schema.parse(value),
  );
  const command = parseStoredJson(
    "project_milestone_revisions",
    row.command_id,
    row.command_json,
    (value) => ProjectMilestoneUpsertCommandV1Schema.parse(value),
  );
  assertSame("revision milestone_id projection", row.milestone_id, milestone.milestoneId);
  assertSame("revision projection", row.revision, milestone.revision);
  assertSame("revision updated_at projection", row.recorded_at, milestone.updatedAt);
  assertSame("revision command_id projection", row.command_id, command.commandId);
  assertSame("revision origin projection", row.origin, command.origin);
  assertSame("revision issued_at projection", row.issued_at, command.issuedAt);
  assertSame(
    "revision expected_revision projection",
    row.expected_revision,
    command.upsert.expectedRevision,
  );
  assertSame(
    "revision command milestone",
    command.upsert.milestone.milestoneId,
    milestone.milestoneId,
  );
  return { milestone, command };
}

const REVISION_SELECT = `SELECT
  milestone_id, revision, command_id, origin, issued_at, expected_revision,
  recorded_at, command_json, payload_json
FROM project_milestone_revisions`;

const MILESTONE_SELECT = `SELECT
  milestone_id, project_id, phase, kind, label, target_date, owner, status,
  evidence_digest, revision, created_at, updated_at, payload_json
FROM project_milestones`;

/**
 * Durable, revisioned project milestones. Every write is a compare-and-set
 * upsert journaled to an append-only revision history and idempotent by the
 * client-issued command ID. Reads return the head revision only; history is
 * available separately so a consumer never confuses the two.
 */
export class ProjectMilestoneRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(milestoneIdInput: unknown): ProjectMilestoneV1 | null {
    const milestoneId = MilestoneIdSchema.parse(milestoneIdInput);
    const row = this.database
      .prepare(`${MILESTONE_SELECT} WHERE milestone_id = ?`)
      .get(milestoneId) as MilestoneRow | undefined;
    return row === undefined ? null : decodeMilestone(row);
  }

  /**
   * Every milestone of one project in the timeline's canonical order: dated
   * milestones by calendar date, then undated ("won't guess") ones, ties by
   * milestone ID. Bounded; a project beyond the bound is an error, not a
   * silently truncated plan.
   */
  public listByProject(projectIdInput: unknown): readonly ProjectMilestoneV1[] {
    const projectId = ProjectIdSchema.parse(projectIdInput);
    const rows = this.database
      .prepare(
        `${MILESTONE_SELECT}
         WHERE project_id = ?
         ORDER BY (target_date IS NULL), target_date, milestone_id
         LIMIT ?`,
      )
      .all(projectId, MAX_PROJECT_MILESTONES_V1 + 1) as readonly MilestoneRow[];
    if (rows.length > MAX_PROJECT_MILESTONES_V1) {
      throw new RangeError(
        `project ${projectId} has more than ${String(MAX_PROJECT_MILESTONES_V1)} milestones`,
      );
    }
    return rows.map(decodeMilestone);
  }

  /** The complete append-only history of one milestone, oldest revision first. */
  public listRevisions(milestoneIdInput: unknown): readonly ProjectMilestoneRevisionRecord[] {
    const milestoneId = MilestoneIdSchema.parse(milestoneIdInput);
    const rows = this.database
      .prepare(`${REVISION_SELECT} WHERE milestone_id = ? ORDER BY revision`)
      .all(milestoneId) as readonly MilestoneRevisionRow[];
    return rows.map(decodeRevision);
  }

  /** The revision a command wrote, if this command ID has already been accepted. */
  public findRevisionByCommandId(commandIdInput: unknown): ProjectMilestoneRevisionRecord | null {
    const commandId = CommandIdSchema.parse(commandIdInput);
    const row = this.database.prepare(`${REVISION_SELECT} WHERE command_id = ?`).get(commandId) as
      MilestoneRevisionRow | undefined;
    return row === undefined ? null : decodeRevision(row);
  }

  /**
   * Observed per-phase execution facts for a project, derived from the
   * attempts of tasks whose snapshot carries that `phase` (`null` collects
   * tasks that declared none). Named phases first in key order, the unphased
   * bucket last. Nothing here is projected: every instant is an attempt
   * timestamp the kernel already recorded.
   */
  public listPhaseActuals(projectIdInput: unknown): readonly ProjectPhaseActualsV1[] {
    const projectId = ProjectIdSchema.parse(projectIdInput);
    const rows = this.database
      .prepare(
        `SELECT
           json_extract(task.payload_json, '$.phase') AS phase,
           COUNT(*) AS attempt_count,
           SUM(CASE WHEN attempt.state NOT IN ('succeeded', 'failed', 'cancelled') THEN 1 ELSE 0 END)
             AS active_attempt_count,
           SUM(CASE WHEN attempt.state = 'blocked' THEN 1 ELSE 0 END) AS blocker_count,
           SUM(CASE WHEN attempt.state = 'succeeded' THEN 1 ELSE 0 END) AS succeeded_attempt_count,
           MIN(attempt.created_at) AS first_attempt_at,
           MAX(attempt.updated_at) AS last_activity_at,
           MAX(CASE WHEN attempt.state = 'succeeded' THEN attempt.terminal_at ELSE NULL END)
             AS last_succeeded_at
         FROM attempts AS attempt
         JOIN task_snapshots AS task ON task.task_id = attempt.task_id
         WHERE task.project_id = ?
         GROUP BY phase
         ORDER BY (phase IS NULL), phase
         LIMIT ?`,
      )
      .all(projectId, MAX_TIMELINE_PHASES_V1 + 1) as readonly PhaseActualsRow[];
    if (rows.length > MAX_TIMELINE_PHASES_V1) {
      throw new RangeError(
        `project ${projectId} has more than ${String(MAX_TIMELINE_PHASES_V1)} phases`,
      );
    }
    return rows.map((row) =>
      ProjectPhaseActualsV1Schema.parse({
        phase: row.phase === null ? null : StableKeySchema.parse(row.phase),
        attemptCount: PositiveSafeIntegerSchema.parse(row.attempt_count),
        activeAttemptCount: NonNegativeSafeIntegerSchema.parse(row.active_attempt_count),
        blockerCount: NonNegativeSafeIntegerSchema.parse(row.blocker_count),
        succeededAttemptCount: NonNegativeSafeIntegerSchema.parse(row.succeeded_attempt_count),
        firstAttemptAt: IsoInstantSchema.parse(row.first_attempt_at),
        lastActivityAt: IsoInstantSchema.parse(row.last_activity_at),
        lastSucceededAt:
          row.last_succeeded_at === null ? null : IsoInstantSchema.parse(row.last_succeeded_at),
      }),
    );
  }

  /**
   * Creates (`expectedRevision: null`) or compare-and-set updates a milestone
   * and journals the command as one immutable revision, atomically. Replaying
   * the same command ID with identical content returns the revision it
   * already wrote (`duplicate: true`); the same command ID with different
   * content is refused. `recordedAt` must strictly follow the head's
   * `updatedAt` so history timestamps are monotonic per milestone.
   */
  public upsert(input: UpsertProjectMilestoneInput): UpsertedProjectMilestone {
    const command = ProjectMilestoneUpsertCommandV1Schema.parse(input.command);
    const recordedAt = IsoInstantSchema.parse(input.recordedAt);
    const draft = command.upsert.milestone;
    const expectedRevision = command.upsert.expectedRevision;

    const persist = this.database.transaction((): UpsertedProjectMilestone => {
      const stored = this.findRevisionByCommandId(command.commandId);
      if (stored !== null) {
        if (JSON.stringify(stored.command) !== JSON.stringify(command)) {
          throw new ProjectMilestoneUpsertError(
            "milestone.identity-conflict",
            `command ${command.commandId} is already bound to a different milestone upsert`,
          );
        }
        return {
          milestone: stored.milestone,
          created: stored.milestone.revision === 0,
          duplicate: true,
        };
      }

      const headRow = this.database
        .prepare(`${MILESTONE_SELECT} WHERE milestone_id = ?`)
        .get(draft.milestoneId) as MilestoneRow | undefined;
      const head = headRow === undefined ? null : decodeMilestone(headRow);

      if (expectedRevision === null && head !== null) {
        throw new ProjectMilestoneUpsertError(
          "milestone.already-exists",
          `milestone ${draft.milestoneId} already exists at revision ${String(head.revision)}`,
        );
      }
      if (expectedRevision !== null && head === null) {
        throw new ProjectMilestoneUpsertError(
          "milestone.not-found",
          `milestone ${draft.milestoneId} does not exist`,
        );
      }
      if (head !== null && expectedRevision !== null) {
        if (head.revision !== expectedRevision) {
          throw new ProjectMilestoneUpsertError(
            "milestone.revision-conflict",
            `milestone ${draft.milestoneId} is at revision ${String(head.revision)}, not ${String(expectedRevision)}`,
          );
        }
        if (head.projectId !== draft.projectId) {
          throw new ProjectMilestoneUpsertError(
            "milestone.project-mismatch",
            `milestone ${draft.milestoneId} belongs to project ${head.projectId}`,
          );
        }
        if (recordedAt <= head.updatedAt) {
          failInvariant(
            `milestone ${draft.milestoneId} recordedAt ${recordedAt} must follow ${head.updatedAt}`,
          );
        }
      }
      this.assertDependenciesResolvable(draft.projectId, draft.milestoneId, draft.dependsOn);

      const milestone: ProjectMilestoneV1 = ProjectMilestoneV1Schema.parse({
        schemaVersion: 1,
        ...draft,
        revision: head === null ? 0 : head.revision + 1,
        createdAt: head === null ? recordedAt : head.createdAt,
        updatedAt: recordedAt,
      });
      const payloadJson = JSON.stringify(milestone);

      if (head === null) {
        this.database
          .prepare(
            `INSERT INTO project_milestones(
               milestone_id, schema_version, project_id, phase, kind, label, target_date,
               owner, status, evidence_digest, revision, created_at, updated_at, payload_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            milestone.milestoneId,
            milestone.schemaVersion,
            milestone.projectId,
            milestone.phase,
            milestone.kind,
            milestone.label,
            milestone.targetDate,
            milestone.owner,
            milestone.status,
            milestone.evidenceDigest,
            milestone.revision,
            milestone.createdAt,
            milestone.updatedAt,
            payloadJson,
          );
      } else {
        const result = this.database
          .prepare(
            `UPDATE project_milestones SET
               phase = ?, kind = ?, label = ?, target_date = ?, owner = ?, status = ?,
               evidence_digest = ?, revision = ?, updated_at = ?, payload_json = ?
             WHERE milestone_id = ? AND revision = ?`,
          )
          .run(
            milestone.phase,
            milestone.kind,
            milestone.label,
            milestone.targetDate,
            milestone.owner,
            milestone.status,
            milestone.evidenceDigest,
            milestone.revision,
            milestone.updatedAt,
            payloadJson,
            milestone.milestoneId,
            head.revision,
          );
        if (result.changes !== 1) {
          throw new Error(`Milestone revision conflict: ${milestone.milestoneId}`);
        }
      }
      this.database
        .prepare(
          `INSERT INTO project_milestone_revisions(
             milestone_id, revision, command_id, origin, issued_at, expected_revision,
             recorded_at, command_json, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          milestone.milestoneId,
          milestone.revision,
          command.commandId,
          command.origin,
          command.issuedAt,
          expectedRevision,
          milestone.updatedAt,
          JSON.stringify(command),
          payloadJson,
        );
      return { milestone, created: head === null, duplicate: false };
    });
    return persist.immediate();
  }

  /**
   * Every dependency must be an existing milestone of the same project, and
   * following dependencies from any of them must never lead back to this
   * milestone: a cyclic plan cannot be drawn or scheduled, so it is refused.
   */
  private assertDependenciesResolvable(
    projectId: ProjectId,
    milestoneId: MilestoneId,
    dependsOn: readonly MilestoneId[],
  ): void {
    if (dependsOn.length === 0) return;
    const rows = this.database
      .prepare(
        `SELECT milestone_id, payload_json FROM project_milestones WHERE project_id = ? LIMIT ?`,
      )
      .all(projectId, MAX_PROJECT_MILESTONES_V1 + 1) as readonly Readonly<{
      milestone_id: string;
      payload_json: string;
    }>[];
    if (rows.length > MAX_PROJECT_MILESTONES_V1) {
      throw new RangeError(
        `project ${projectId} has more than ${String(MAX_PROJECT_MILESTONES_V1)} milestones`,
      );
    }
    const graph = new Map<string, readonly string[]>();
    for (const row of rows) {
      const stored = parseStoredJson(
        "project_milestones",
        row.milestone_id,
        row.payload_json,
        (value) => ProjectMilestoneV1Schema.parse(value),
      );
      graph.set(stored.milestoneId, stored.dependsOn);
    }
    for (const dependency of dependsOn) {
      if (!graph.has(dependency)) {
        throw new ProjectMilestoneUpsertError(
          "milestone.dependency-not-found",
          `dependency ${dependency} is not a milestone of project ${projectId}`,
        );
      }
    }
    // The candidate's own edges replace whatever the head row had.
    graph.set(milestoneId, dependsOn);
    const visited = new Set<string>();
    const stack: string[] = [...dependsOn];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined || visited.has(current)) continue;
      if (current === milestoneId) {
        throw new ProjectMilestoneUpsertError(
          "milestone.dependency-cycle",
          `milestone ${milestoneId} would depend on itself through its dependencies`,
        );
      }
      visited.add(current);
      for (const next of graph.get(current) ?? []) stack.push(next);
    }
  }
}
