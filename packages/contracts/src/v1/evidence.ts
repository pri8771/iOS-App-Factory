import { z } from "zod";

import { AgentRunResultV1Schema } from "./agent-run.js";
import {
  AttemptIdSchema,
  EvidenceIdSchema,
  FindingIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  RelativePathSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "./primitives.js";

export const ArtifactRefV1Schema = z.strictObject({
  digest: Sha256DigestSchema,
  byteLength: NonNegativeSafeIntegerSchema,
  mediaType: z.string().min(1).max(200),
  logicalName: z.string().min(1).max(200),
});
export type ArtifactRefV1 = z.infer<typeof ArtifactRefV1Schema>;

export const FindingLocationV1Schema = z.strictObject({
  path: RelativePathSchema,
  lineStart: PositiveSafeIntegerSchema.nullable(),
  lineEnd: PositiveSafeIntegerSchema.nullable(),
});
export type FindingLocationV1 = z.infer<typeof FindingLocationV1Schema>;

export const FindingV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  findingId: FindingIdSchema,
  ruleId: NamespacedCodeSchema,
  category: NamespacedCodeSchema,
  severity: z.enum(["p0", "p1", "p2", "p3"]),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4_000),
  locations: z.array(FindingLocationV1Schema).max(50),
  supportingArtifactDigests: z.array(Sha256DigestSchema).max(50),
});
export type FindingV1 = z.infer<typeof FindingV1Schema>;

export const ReviewReportV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  reviewerId: NamespacedCodeSchema,
  reviewerVersion: z.string().min(1).max(100),
  reviewInputDigest: Sha256DigestSchema,
  verdict: z.enum(["pass", "changes-required", "blocked"]),
  findings: z.array(FindingV1Schema).max(500),
});
export type ReviewReportV1 = z.infer<typeof ReviewReportV1Schema>;

export const EvidenceSubjectV1Schema = z.strictObject({
  taskSpecDigest: Sha256DigestSchema,
  policyDigest: Sha256DigestSchema,
  baseCommit: GitObjectIdSchema,
  candidateTree: GitObjectIdSchema.nullable(),
  fence: NonNegativeSafeIntegerSchema,
});
export type EvidenceSubjectV1 = z.infer<typeof EvidenceSubjectV1Schema>;

const EvidenceEnvelopeV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  evidenceId: EvidenceIdSchema,
  attemptId: AttemptIdSchema,
  createdAt: IsoInstantSchema,
  producer: NamespacedCodeSchema,
  subject: EvidenceSubjectV1Schema,
  artifacts: z.array(ArtifactRefV1Schema).max(100),
};

export const AgentRunEvidenceV1Schema = z.strictObject({
  ...EvidenceEnvelopeV1Shape,
  kind: z.literal("agent-run"),
  claims: z.strictObject({
    runSpecDigest: Sha256DigestSchema,
    result: AgentRunResultV1Schema,
  }),
});

export const ToolVersionV1Schema = z.strictObject({
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(200),
});
export type ToolVersionV1 = z.infer<typeof ToolVersionV1Schema>;

const VerificationClaimsV1Shape = {
  checkId: NamespacedCodeSchema,
  argv: z.array(z.string().min(1).max(8_192)).min(1).max(64),
  checkoutTree: GitObjectIdSchema,
  startedAt: IsoInstantSchema,
  finishedAt: IsoInstantSchema,
  toolVersions: z.array(ToolVersionV1Schema).max(50),
};

export const VerificationClaimsV1Schema = z.discriminatedUnion("passed", [
  z.strictObject({
    ...VerificationClaimsV1Shape,
    passed: z.literal(true),
    exitCode: z.literal(0),
  }),
  z.strictObject({
    ...VerificationClaimsV1Shape,
    passed: z.literal(false),
    exitCode: z.number().int().min(1).max(255),
  }),
]);
export type VerificationClaimsV1 = z.infer<typeof VerificationClaimsV1Schema>;

export const VerificationEvidenceV1Schema = z.strictObject({
  ...EvidenceEnvelopeV1Shape,
  kind: z.literal("verification"),
  claims: VerificationClaimsV1Schema,
});

export const ReviewEvidenceV1Schema = z.strictObject({
  ...EvidenceEnvelopeV1Shape,
  kind: z.literal("review"),
  claims: z.strictObject({ report: ReviewReportV1Schema }),
});

export const CommitEvidenceV1Schema = z.strictObject({
  ...EvidenceEnvelopeV1Shape,
  kind: z.literal("commit"),
  claims: z.strictObject({
    commit: GitObjectIdSchema,
    tree: GitObjectIdSchema,
    attemptMarker: z.string().min(1).max(200),
  }),
});

export const EventLogEvidenceV1Schema = z.strictObject({
  ...EvidenceEnvelopeV1Shape,
  kind: z.literal("event-log"),
  claims: z.strictObject({
    firstSequence: NonNegativeSafeIntegerSchema,
    lastSequence: NonNegativeSafeIntegerSchema,
    eventCount: PositiveSafeIntegerSchema,
    eventLogDigest: Sha256DigestSchema,
  }),
});

export const EvidenceKindV1Schema = z.enum([
  "agent-run",
  "verification",
  "review",
  "commit",
  "event-log",
]);
export type EvidenceKindV1 = z.infer<typeof EvidenceKindV1Schema>;

export const EvidenceV1Schema = z.discriminatedUnion("kind", [
  AgentRunEvidenceV1Schema,
  VerificationEvidenceV1Schema,
  ReviewEvidenceV1Schema,
  CommitEvidenceV1Schema,
  EventLogEvidenceV1Schema,
]);
export type EvidenceV1 = z.infer<typeof EvidenceV1Schema>;

export const EvidenceManifestEntryV1Schema = z.strictObject({
  evidenceId: EvidenceIdSchema,
  digest: Sha256DigestSchema,
});
export type EvidenceManifestEntryV1 = z.infer<typeof EvidenceManifestEntryV1Schema>;

export const EvidenceManifestV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  attemptId: AttemptIdSchema,
  createdAt: IsoInstantSchema,
  subject: EvidenceSubjectV1Schema,
  entries: z.array(EvidenceManifestEntryV1Schema).min(1).max(1_000),
  requiredKinds: z.array(EvidenceKindV1Schema).min(1).max(5),
});
export type EvidenceManifestV1 = z.infer<typeof EvidenceManifestV1Schema>;
