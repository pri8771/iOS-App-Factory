import { z } from "zod";

import { ApprovalSubjectV1Schema } from "./approval.js";
import {
  ApprovalIdSchema,
  AttemptIdSchema,
  EffectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  RunIdSchema,
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
  "rejected",
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

export const ExternalObservationSourceV1Schema = z.enum([
  "provider-send",
  "provider-reconciliation",
]);
export type ExternalObservationSourceV1 = z.infer<typeof ExternalObservationSourceV1Schema>;

/**
 * A provider observation is a separately attested invocation whose raw result
 * is retained as immutable evidence. Merely advancing a timestamp is not an
 * independent observation.
 */
export const ExternalObservationV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  invocationId: RunIdSchema,
  source: ExternalObservationSourceV1Schema,
  adapterId: NamespacedCodeSchema,
  adapterVersion: z.string().min(1).max(200),
  evidenceDigest: Sha256DigestSchema,
  attestationDigest: Sha256DigestSchema,
  observedAt: IsoInstantSchema,
});
export type ExternalObservationV1 = z.infer<typeof ExternalObservationV1Schema>;

/**
 * External effects are either attempt-scoped (legacy task outbox path: non-null `attemptId` matching
 * an attempt-scoped `subject`) or release-scoped (protected Apple upload path: null `attemptId` with
 * a release-scoped `subject`). Mixed shapes fail closed. Kernel action policy decides which actions
 * may use which scope; this schema only enforces internal coherence.
 */
export const ExternalEffectV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    effectId: EffectIdSchema,
    attemptId: AttemptIdSchema.nullable(),
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
  })
  .superRefine((effect, context) => {
    const { subject, attemptId } = effect;
    if (attemptId !== null) {
      if (subject.attemptId !== attemptId || subject.taskId === null || subject.projectId === null) {
        context.addIssue({
          code: "custom",
          path: ["attemptId"],
          message: "attempt-scoped effect requires matching attempt/task/project subject",
        });
      }
      return;
    }
    if (
      subject.attemptId !== null ||
      subject.taskId !== null ||
      subject.projectId === null ||
      subject.releaseId === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["attemptId"],
        message:
          "release-scoped effect requires null attemptId/taskId and non-null projectId/releaseId",
      });
    }
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
