import { createHash } from "node:crypto";

import {
  CommandIdSchema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  ProjectIdSchema,
  ProjectPlanCommandV1Schema,
  ProjectPlanDraftV1Schema,
  ProjectPlanIdSchema,
  ProjectPlanV1Schema,
  Sha256DigestSchema,
  canonicalProjectPlanDigestInputV1,
  type ProjectPlanCommandV1,
  type ProjectPlanDraftV1,
  type ProjectPlanV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

/**
 * The Planner's durable persistence (`packages/contracts/src/v1/project-plan.ts`'s module doc
 * comment). Mirrors `PhasePresetRepository`'s compare-and-set-upsert-plus-append-only-revision-
 * history pattern exactly (migration 0010 mirrors migration 0009): every one of `plan.propose`,
 * `plan.edit`, `plan.approve`, `plan.execute`, `plan.approve-gate`, and `plan.tick` computes a full
 * next-state `ProjectPlanDraftV1` (business content only) at the daemon layer
 * (`apps/daemon/src/project-plan-command-runtime.ts`) and hands it to this repository's single
 * `upsert`, which assigns `revision`/`createdAt`/`updatedAt` from the current head and
 * `recordedAt`, computes `digest`, and journals the driving command as one immutable revision row.
 * Idempotent by `command.commandId`, like every other CAS-upsert repository here.
 */

function computeProjectPlanDigest(plan: {
  schemaVersion: 1;
  planId: string;
  projectId: string | null;
  repositoryId: string | null;
  brief: unknown;
  presetId: string;
  items: unknown;
  state: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}): string {
  return `sha256:${createHash("sha256")
    .update(canonicalProjectPlanDigestInputV1(plan as never), "utf8")
    .digest("hex")}`;
}

export type UpsertProjectPlanInput = Readonly<{
  /** A `ProjectPlanCommandV1`; parsed at this boundary. */
  command: unknown;
  /** The full next-state business content; parsed at this boundary. */
  draft: unknown;
  /** `null` creates the plan (rejected if one already exists); a number is compare-and-set. */
  expectedRevision: unknown;
  recordedAt: unknown;
}>;

export type UpsertedProjectPlan = Readonly<{
  plan: ProjectPlanV1;
  created: boolean;
  duplicate: boolean;
}>;

export type ProjectPlanRevisionRecord = Readonly<{
  plan: ProjectPlanV1;
  command: ProjectPlanCommandV1;
}>;

export class ProjectPlanUpsertError extends Error {
  public constructor(
    public readonly code:
      | "plan.not-found"
      | "plan.already-exists"
      | "plan.revision-conflict"
      | "plan.identity-conflict",
    message: string,
  ) {
    super(message);
    this.name = "ProjectPlanUpsertError";
  }
}

type ProjectPlanRow = Readonly<{
  plan_id: string;
  project_id: string | null;
  preset_id: string;
  state: string;
  revision: number;
  created_at: string;
  updated_at: string;
  payload_json: string;
}>;

type ProjectPlanRevisionRow = Readonly<{
  plan_id: string;
  revision: number;
  command_id: string;
  origin: string;
  issued_at: string;
  expected_revision: number | null;
  recorded_at: string;
  command_json: string;
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

function decodeProjectPlan(row: ProjectPlanRow): ProjectPlanV1 {
  const plan = parseStoredJson("project_plans", row.plan_id, row.payload_json, (value) =>
    ProjectPlanV1Schema.parse(value),
  );
  assertSame("project_plans plan_id projection", row.plan_id, plan.planId);
  assertSame("project_plans project_id projection", row.project_id, plan.projectId);
  assertSame("project_plans preset_id projection", row.preset_id, plan.presetId);
  assertSame("project_plans state projection", row.state, plan.state);
  assertSame("project_plans revision projection", row.revision, plan.revision);
  assertSame("project_plans created_at projection", row.created_at, plan.createdAt);
  assertSame("project_plans updated_at projection", row.updated_at, plan.updatedAt);
  return plan;
}

function decodeProjectPlanRevision(row: ProjectPlanRevisionRow): ProjectPlanRevisionRecord {
  const plan = parseStoredJson(
    "project_plan_revisions",
    `${row.plan_id}@${String(row.revision)}`,
    row.payload_json,
    (value) => ProjectPlanV1Schema.parse(value),
  );
  const command = parseStoredJson(
    "project_plan_revisions",
    row.command_id,
    row.command_json,
    (value) => ProjectPlanCommandV1Schema.parse(value),
  );
  assertSame("revision plan_id projection", row.plan_id, plan.planId);
  assertSame("revision projection", row.revision, plan.revision);
  assertSame("revision updated_at projection", row.recorded_at, plan.updatedAt);
  assertSame("revision command_id projection", row.command_id, command.commandId);
  assertSame("revision origin projection", row.origin, command.origin);
  assertSame("revision issued_at projection", row.issued_at, command.issuedAt);
  return { plan, command };
}

const PROJECT_PLAN_SELECT = `SELECT
  plan_id, project_id, preset_id, state, revision, created_at, updated_at, payload_json
FROM project_plans`;

const PROJECT_PLAN_REVISION_SELECT = `SELECT
  plan_id, revision, command_id, origin, issued_at, expected_revision,
  recorded_at, command_json, payload_json
FROM project_plan_revisions`;

/** Durable, revisioned project plans. See the module doc comment. */
export class ProjectPlanRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(planIdInput: unknown): ProjectPlanV1 | null {
    const planId = ProjectPlanIdSchema.parse(planIdInput);
    const row = this.database.prepare(`${PROJECT_PLAN_SELECT} WHERE plan_id = ?`).get(planId) as
      ProjectPlanRow | undefined;
    return row === undefined ? null : decodeProjectPlan(row);
  }

  /** Every plan for one project, most recently updated first. Bounded, unpaginated: plans are
   * operator-initiated and few compared to attempts or events. */
  public listByProject(projectIdInput: unknown): readonly ProjectPlanV1[] {
    const projectId = ProjectIdSchema.parse(projectIdInput);
    const rows = this.database
      .prepare(`${PROJECT_PLAN_SELECT} WHERE project_id = ? ORDER BY updated_at DESC, plan_id`)
      .all(projectId) as readonly ProjectPlanRow[];
    return rows.map(decodeProjectPlan);
  }

  public findRevisionByCommandId(commandIdInput: unknown): ProjectPlanRevisionRecord | null {
    const commandId = CommandIdSchema.parse(commandIdInput);
    const row = this.database
      .prepare(`${PROJECT_PLAN_REVISION_SELECT} WHERE command_id = ?`)
      .get(commandId) as ProjectPlanRevisionRow | undefined;
    return row === undefined ? null : decodeProjectPlanRevision(row);
  }

  /**
   * Creates (`expectedRevision: null`) or compare-and-set updates a plan and journals the driving
   * command as one immutable revision, atomically. Replaying the same command ID with identical
   * content returns the revision it already wrote (`duplicate: true`).
   */
  public upsert(input: UpsertProjectPlanInput): UpsertedProjectPlan {
    const command = ProjectPlanCommandV1Schema.parse(input.command);
    const draft: ProjectPlanDraftV1 = ProjectPlanDraftV1Schema.parse(input.draft);
    const expectedRevision = NonNegativeSafeIntegerSchema.nullable().parse(input.expectedRevision);
    const recordedAt = IsoInstantSchema.parse(input.recordedAt);

    const persist = this.database.transaction((): UpsertedProjectPlan => {
      const stored = this.findRevisionByCommandId(command.commandId);
      if (stored !== null) {
        if (JSON.stringify(stored.command) !== JSON.stringify(command)) {
          throw new ProjectPlanUpsertError(
            "plan.identity-conflict",
            `command ${command.commandId} is already bound to a different plan mutation`,
          );
        }
        return { plan: stored.plan, created: stored.plan.revision === 0, duplicate: true };
      }

      const headRow = this.database
        .prepare(`${PROJECT_PLAN_SELECT} WHERE plan_id = ?`)
        .get(draft.planId) as ProjectPlanRow | undefined;
      const head = headRow === undefined ? null : decodeProjectPlan(headRow);

      if (expectedRevision === null && head !== null) {
        throw new ProjectPlanUpsertError(
          "plan.already-exists",
          `plan ${draft.planId} already exists at revision ${String(head.revision)}`,
        );
      }
      if (expectedRevision !== null && head === null) {
        throw new ProjectPlanUpsertError("plan.not-found", `plan ${draft.planId} does not exist`);
      }
      if (head !== null && expectedRevision !== null) {
        if (head.revision !== expectedRevision) {
          throw new ProjectPlanUpsertError(
            "plan.revision-conflict",
            `plan ${draft.planId} is at revision ${String(head.revision)}, not ${String(expectedRevision)}`,
          );
        }
        if (recordedAt <= head.updatedAt) {
          failInvariant(
            `plan ${draft.planId} recordedAt ${recordedAt} must follow ${head.updatedAt}`,
          );
        }
      }
      if (head !== null && draft.projectId !== head.projectId) {
        failInvariant(`plan ${draft.planId} projectId is immutable`);
      }
      if (head !== null && draft.presetId !== head.presetId) {
        failInvariant(`plan ${draft.planId} presetId is immutable`);
      }

      const revision = head === null ? 0 : head.revision + 1;
      const createdAt = head === null ? recordedAt : head.createdAt;
      const withoutDigest = {
        schemaVersion: 1 as const,
        planId: draft.planId,
        projectId: draft.projectId,
        repositoryId: draft.repositoryId,
        brief: draft.brief,
        presetId: draft.presetId,
        items: draft.items,
        state: draft.state,
        revision,
        createdAt,
        updatedAt: recordedAt,
      };
      const digest = Sha256DigestSchema.parse(computeProjectPlanDigest(withoutDigest));
      const plan: ProjectPlanV1 = ProjectPlanV1Schema.parse({ ...withoutDigest, digest });
      const payloadJson = JSON.stringify(plan);

      if (head === null) {
        this.database
          .prepare(
            `INSERT INTO project_plans(
               plan_id, schema_version, project_id, preset_id, state, revision, created_at, updated_at, payload_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            plan.planId,
            plan.schemaVersion,
            plan.projectId,
            plan.presetId,
            plan.state,
            plan.revision,
            plan.createdAt,
            plan.updatedAt,
            payloadJson,
          );
      } else {
        const result = this.database
          .prepare(
            `UPDATE project_plans SET
               state = ?, revision = ?, updated_at = ?, payload_json = ?
             WHERE plan_id = ? AND revision = ?`,
          )
          .run(plan.state, plan.revision, plan.updatedAt, payloadJson, plan.planId, head.revision);
        if (result.changes !== 1) {
          throw new Error(`Project plan revision conflict: ${plan.planId}`);
        }
      }
      this.database
        .prepare(
          `INSERT INTO project_plan_revisions(
             plan_id, revision, command_id, origin, issued_at, expected_revision,
             recorded_at, command_json, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          plan.planId,
          plan.revision,
          command.commandId,
          command.origin,
          command.issuedAt,
          expectedRevision,
          plan.updatedAt,
          JSON.stringify(command),
          payloadJson,
        );
      return { plan, created: head === null, duplicate: false };
    });
    return persist.immediate();
  }
}
