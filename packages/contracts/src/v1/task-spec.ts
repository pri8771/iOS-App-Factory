import { z } from "zod";

import {
  GitObjectIdSchema,
  IsoInstantSchema,
  ProjectIdSchema,
  RelativePathSchema,
  RepositoryIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
  TaskIdSchema,
} from "./primitives.js";

export const AcceptanceCriterionV1Schema = z.strictObject({
  id: StableKeySchema,
  statement: z.string().min(1).max(2_000),
  verification: z.enum(["automated", "review", "operator"]),
});
export type AcceptanceCriterionV1 = z.infer<typeof AcceptanceCriterionV1Schema>;

export const TaskSpecV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  taskId: TaskIdSchema,
  projectId: ProjectIdSchema,
  createdAt: IsoInstantSchema,
  title: z.string().min(1).max(200),
  objective: z.string().min(1).max(20_000),
  /**
   * The Studio phase this task belongs to (for example `build`, `research`,
   * or a user-defined phase key). It is the only optional field on a task
   * spec, deliberately: the task-spec digest is the canonical JSON of the
   * parsed spec, so a nullable-required field would change every existing
   * spec's bytes and digest. An absent `phase` produces no key at all, which
   * keeps every pre-existing spec, snapshot, and digest byte-identical.
   * Distinct from `AgentProgressEventV1.data.phase` (a free-form step label
   * inside one agent run) and `EnrollmentPlanActionV1.phase` (an enrollment
   * planning stage); neither of those is a Studio phase.
   */
  phase: StableKeySchema.optional(),
  acceptanceCriteria: z.array(AcceptanceCriterionV1Schema).min(1).max(50),
  base: z.strictObject({
    repositoryId: RepositoryIdSchema,
    commit: GitObjectIdSchema,
  }),
  requestedScope: z.strictObject({
    paths: z.array(RelativePathSchema).min(1).max(100),
  }),
  policyDigest: Sha256DigestSchema,
});
export type TaskSpecV1 = z.infer<typeof TaskSpecV1Schema>;
