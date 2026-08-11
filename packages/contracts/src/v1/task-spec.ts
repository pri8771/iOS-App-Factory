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
