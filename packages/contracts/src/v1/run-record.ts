import { z } from "zod";

import { AgentUsageV1Schema } from "./agent-run.js";
import { ReviewReportV1Schema, VerificationClaimsV1Schema } from "./evidence.js";
import {
  AttemptIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  RepositoryIdSchema,
  RunIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  TaskIdSchema,
} from "./primitives.js";

/**
 * The canonical, digest-bound record of one verified Factory run, exported by
 * `run.export` (`factory run export <attemptId>`). Every field is re-derived
 * from durable state only -- the kernel attempt row, the immutable evidence
 * store, and the sealed Factory mirror -- never from in-memory daemon state,
 * so an exported record can be checked independently and committed as the
 * durable claim of what ran. `RunExportCommandResultV1.recordDigest` is the
 * SHA-256 of this record's canonical JSON encoding.
 */
export const RunRecordAgentV1Schema = z.strictObject({
  adapterId: NamespacedCodeSchema,
  /** Null when the run left no invocation descriptor (legacy or OCI protocols). */
  adapterVersion: z.string().min(1).max(100).nullable(),
  cliVersion: z.string().min(1).max(200).nullable(),
  model: z.string().min(1).max(200).nullable(),
  executableDigest: Sha256DigestSchema.nullable(),
  /** Null when the agent-run evidence recorded no usage or the run left no agent-run evidence. */
  usage: AgentUsageV1Schema.nullable(),
});
export type RunRecordAgentV1 = z.infer<typeof RunRecordAgentV1Schema>;

export const RunRecordBrokerCommitV1Schema = z.strictObject({
  commit: GitObjectIdSchema,
  tree: GitObjectIdSchema,
  commitDigest: Sha256DigestSchema,
  attemptMarker: z.string().min(1).max(200),
});
export type RunRecordBrokerCommitV1 = z.infer<typeof RunRecordBrokerCommitV1Schema>;

export const RunRecordReviewV1Schema = z.strictObject({
  reviewerId: NamespacedCodeSchema,
  reviewerVersion: z.string().min(1).max(100),
  reviewerRunId: RunIdSchema,
  verdict: ReviewReportV1Schema.shape.verdict,
  findingCount: NonNegativeSafeIntegerSchema,
  reviewInputDigest: Sha256DigestSchema,
});
export type RunRecordReviewV1 = z.infer<typeof RunRecordReviewV1Schema>;

export const RunRecordEvidenceV1Schema = z.strictObject({
  manifestDigest: Sha256DigestSchema,
  indexDigest: Sha256DigestSchema,
  entryCount: z.number().int().min(1).max(1_000),
  artifactCount: NonNegativeSafeIntegerSchema,
});
export type RunRecordEvidenceV1 = z.infer<typeof RunRecordEvidenceV1Schema>;

export const RunRecordTimingsV1Schema = z.strictObject({
  attemptCreatedAt: IsoInstantSchema,
  attemptTerminalAt: IsoInstantSchema,
  agentStartedAt: IsoInstantSchema,
  agentFinishedAt: IsoInstantSchema,
  evidenceCreatedAt: IsoInstantSchema,
});
export type RunRecordTimingsV1 = z.infer<typeof RunRecordTimingsV1Schema>;

export const RunRecordV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  attemptId: AttemptIdSchema,
  taskId: TaskIdSchema,
  attemptNumber: PositiveSafeIntegerSchema,
  /** Only a verified, committed run can be exported, so the state is always `succeeded`. */
  state: z.literal("succeeded"),
  implementingRunId: RunIdSchema,
  repositoryId: RepositoryIdSchema,
  taskSpecDigest: Sha256DigestSchema,
  policyDigest: Sha256DigestSchema,
  baseCommit: GitObjectIdSchema,
  candidateTree: GitObjectIdSchema,
  fence: NonNegativeSafeIntegerSchema,
  brokerCommit: RunRecordBrokerCommitV1Schema,
  verification: z.array(VerificationClaimsV1Schema).min(1).max(100),
  review: RunRecordReviewV1Schema,
  evidence: RunRecordEvidenceV1Schema,
  agent: RunRecordAgentV1Schema,
  timings: RunRecordTimingsV1Schema,
});
export type RunRecordV1 = z.infer<typeof RunRecordV1Schema>;
