import { z } from "zod";

import { ApprovalSubjectV1Schema } from "./approval.js";
import {
  ApprovalIdSchema,
  AttemptIdSchema,
  EffectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "./primitives.js";

export const ExternalProviderV1Schema = z.enum([
  "jira",
  "github",
  "apple",
  "website",
  "email",
  "social",
  "analytics",
  "crm",
]);
export type ExternalProviderV1 = z.infer<typeof ExternalProviderV1Schema>;

export const ExternalEffectStateV1Schema = z.enum([
  "planned",
  "sent",
  "observed",
  "confirmed",
  "unknown",
  "manual-intervention",
]);
export type ExternalEffectStateV1 = z.infer<typeof ExternalEffectStateV1Schema>;

export const OperationMarkerV1Schema = z
  .string()
  .min(16)
  .max(500)
  .regex(/^app-factory:v1:[a-z0-9][a-z0-9:._-]+$/);
export type OperationMarkerV1 = z.infer<typeof OperationMarkerV1Schema>;

export const ExternalTargetV1Schema = z.strictObject({
  provider: ExternalProviderV1Schema,
  resourceType: NamespacedCodeSchema,
  resourceKey: z.string().min(1).max(1_000),
});
export type ExternalTargetV1 = z.infer<typeof ExternalTargetV1Schema>;

export const ExternalEffectV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  effectId: EffectIdSchema,
  attemptId: AttemptIdSchema,
  action: NamespacedCodeSchema,
  operationMarker: OperationMarkerV1Schema,
  target: ExternalTargetV1Schema,
  subject: ApprovalSubjectV1Schema,
  payloadDigest: Sha256DigestSchema,
  policyDigest: Sha256DigestSchema,
  approvalId: ApprovalIdSchema.nullable(),
  state: ExternalEffectStateV1Schema,
  revision: NonNegativeSafeIntegerSchema,
  sendCount: NonNegativeSafeIntegerSchema,
  providerCorrelationKey: z.string().min(1).max(1_000).nullable(),
  createdAt: IsoInstantSchema,
  updatedAt: IsoInstantSchema,
  lastObservedAt: IsoInstantSchema.nullable(),
  nextReconcileAt: IsoInstantSchema.nullable(),
  detailDigest: Sha256DigestSchema.nullable(),
});
export type ExternalEffectV1 = z.infer<typeof ExternalEffectV1Schema>;

export const ExternalResourceV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  effectId: EffectIdSchema,
  target: ExternalTargetV1Schema,
  providerResourceId: z.string().min(1).max(1_000),
  providerUrl: z.url().max(4_000).nullable(),
  providerVersion: z.string().min(1).max(500).nullable(),
  observedDigest: Sha256DigestSchema,
  observedAt: IsoInstantSchema,
});
export type ExternalResourceV1 = z.infer<typeof ExternalResourceV1Schema>;

export const OutboxRecordV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  effect: ExternalEffectV1Schema,
  availableAt: IsoInstantSchema,
  lockedBy: z.string().min(1).max(200).nullable(),
  lockedUntil: IsoInstantSchema.nullable(),
});
export type OutboxRecordV1 = z.infer<typeof OutboxRecordV1Schema>;
