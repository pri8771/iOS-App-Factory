import { z } from "zod";

import {
  ApprovalIdSchema,
  AttemptIdSchema,
  EffectIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  ProjectIdSchema,
  ReleaseIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  TaskIdSchema,
} from "./primitives.js";

export const ApprovalModeV1Schema = z.enum(["single-use", "standing"]);
export type ApprovalModeV1 = z.infer<typeof ApprovalModeV1Schema>;

export const ApprovalStatusV1Schema = z.enum(["active", "consumed", "revoked", "expired"]);
export type ApprovalStatusV1 = z.infer<typeof ApprovalStatusV1Schema>;

export const ApprovalSubjectV1Schema = z.strictObject({
  projectId: ProjectIdSchema.nullable(),
  taskId: TaskIdSchema.nullable(),
  attemptId: AttemptIdSchema.nullable(),
  releaseId: ReleaseIdSchema.nullable(),
});
export type ApprovalSubjectV1 = z.infer<typeof ApprovalSubjectV1Schema>;

export const ApprovalBindingV1Schema = z.strictObject({
  planDigest: Sha256DigestSchema.nullable(),
  diffDigest: Sha256DigestSchema.nullable(),
  commit: GitObjectIdSchema.nullable(),
  buildIdentityDigest: Sha256DigestSchema.nullable(),
  policyDigest: Sha256DigestSchema,
});
export type ApprovalBindingV1 = z.infer<typeof ApprovalBindingV1Schema>;

export const ApprovalV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  approvalId: ApprovalIdSchema,
  action: NamespacedCodeSchema,
  resourceType: NamespacedCodeSchema,
  resourceKey: z.string().min(1).max(1_000),
  subject: ApprovalSubjectV1Schema,
  binding: ApprovalBindingV1Schema,
  actorId: z.string().min(1).max(320),
  mode: ApprovalModeV1Schema,
  standingScope: z.array(NamespacedCodeSchema).max(100).nullable(),
  issuedAt: IsoInstantSchema,
  expiresAt: IsoInstantSchema,
  status: ApprovalStatusV1Schema,
  revokedAt: IsoInstantSchema.nullable(),
  consumedAt: IsoInstantSchema.nullable(),
  consumedByEffectId: EffectIdSchema.nullable(),
});
export type ApprovalV1 = z.infer<typeof ApprovalV1Schema>;
