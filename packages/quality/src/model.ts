import { z } from "zod";

import {
  ApprovalIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  ProjectIdSchema,
  ReleaseIdSchema,
  RelativePathSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "@app-factory/contracts";

const StableExperienceIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/);

export const QualitySeverityV1Schema = z.enum(["p0", "p1", "p2", "p3"]);
export type QualitySeverityV1 = z.infer<typeof QualitySeverityV1Schema>;

export const RequiredEvidenceKindV1Schema = z.enum([
  "screenshot",
  "ui-test",
  "accessibility",
  "runtime-lineage",
  "persistence",
  "privacy",
  "migration",
  "device-smoke",
]);

export const ReleaseDeviceV1Schema = z.strictObject({
  id: StableExperienceIdSchema,
  platform: z.literal("ios"),
  model: z.string().min(1).max(100),
  osVersion: z.string().min(1).max(50),
});

export const ReleaseContractV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  profile: z.literal("ios-internal-testflight-v1"),
  projectId: ProjectIdSchema,
  productAuthorityDigest: Sha256DigestSchema,
  policyDigest: Sha256DigestSchema,
  activeDesignGeneration: StableExperienceIdSchema,
  devices: z.array(ReleaseDeviceV1Schema).min(2).max(20),
  appearances: z
    .array(z.enum(["light", "dark"]))
    .min(2)
    .max(2),
  contentSizeCategories: z.array(StableExperienceIdSchema).min(2).max(20),
  requiredJourneyIds: z.array(StableExperienceIdSchema).min(1).max(500),
  requiredEvidenceKinds: z.array(RequiredEvidenceKindV1Schema).min(1).max(8),
  blockingSeverities: z.array(QualitySeverityV1Schema).min(1).max(4),
  requiredHumanGates: z
    .array(
      z.enum([
        "product-authority",
        "visual-baseline",
        "release-scope",
        "candidate",
        "testflight-upload",
        "device-smoke",
      ]),
    )
    .min(1)
    .max(6),
});
export type ReleaseContractV1 = z.infer<typeof ReleaseContractV1Schema>;

export const ExperienceStateV1Schema = z.strictObject({
  stateId: StableExperienceIdSchema,
  fixtureId: StableExperienceIdSchema,
  journeyIds: z.array(StableExperienceIdSchema).min(1).max(100),
  requiredEvidenceKinds: z.array(RequiredEvidenceKindV1Schema).min(1).max(8),
  accessibility: z.strictObject({
    semanticsRequired: z.boolean(),
    dynamicTypeRequired: z.boolean(),
    reduceMotionRequired: z.boolean(),
    increasedContrastRequired: z.boolean(),
  }),
});

export const ExperienceRouteV1Schema = z.strictObject({
  routeId: StableExperienceIdSchema,
  public: z.boolean(),
  designGeneration: StableExperienceIdSchema,
  sourcePaths: z.array(RelativePathSchema).min(1).max(100),
  states: z.array(ExperienceStateV1Schema).min(1).max(500),
});

export const ExperienceJourneyV1Schema = z.strictObject({
  journeyId: StableExperienceIdSchema,
  title: z.string().min(1).max(200),
  orderedStates: z
    .array(
      z.strictObject({
        routeId: StableExperienceIdSchema,
        stateId: StableExperienceIdSchema,
      }),
    )
    .min(2)
    .max(500),
});

export const LegacyExceptionV1Schema = z.strictObject({
  path: RelativePathSchema,
  issueKey: z.string().min(1).max(100),
  owner: z.string().min(1).max(320),
  rationale: z.string().min(1).max(2_000),
  expiresAt: IsoInstantSchema,
  public: z.literal(false),
});

export const ExperienceManifestV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  projectId: ProjectIdSchema,
  releaseContractDigest: Sha256DigestSchema,
  routes: z.array(ExperienceRouteV1Schema).min(1).max(2_000),
  journeys: z.array(ExperienceJourneyV1Schema).min(1).max(1_000),
  legacyExceptions: z.array(LegacyExceptionV1Schema).max(1_000),
});
export type ExperienceManifestV1 = z.infer<typeof ExperienceManifestV1Schema>;

export const RuntimeLineageObservationV1Schema = z.strictObject({
  routeId: StableExperienceIdSchema,
  stateId: StableExperienceIdSchema,
  renderedGenerations: z.array(StableExperienceIdSchema).min(1).max(100),
  screenshotDigest: Sha256DigestSchema,
});
export type RuntimeLineageObservationV1 = z.infer<typeof RuntimeLineageObservationV1Schema>;

export const StaticUiObservationV1Schema = z.strictObject({
  path: RelativePathSchema,
  legacyReferences: z.array(z.string().min(1).max(200)).max(1_000),
  rawTokenReferences: z.array(z.string().min(1).max(200)).max(1_000),
});
export type StaticUiObservationV1 = z.infer<typeof StaticUiObservationV1Schema>;

export const QualityFindingV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  findingId: z.string().regex(/^qf-[0-9a-f]{24}$/),
  fingerprint: Sha256DigestSchema,
  ruleId: z.string().regex(/^quality\.[a-z0-9.-]+$/),
  severity: QualitySeverityV1Schema,
  routeId: StableExperienceIdSchema.nullable(),
  stateId: StableExperienceIdSchema.nullable(),
  path: RelativePathSchema.nullable(),
  summary: z.string().min(1).max(1_000),
  rootCause: z.string().min(1).max(4_000).nullable(),
  escapedGate: z.string().min(1).max(500).nullable(),
  regressionId: StableExperienceIdSchema.nullable(),
  lessonScope: z.enum(["project", "shared-component", "template", "factory"]).nullable(),
  evidenceDigests: z.array(Sha256DigestSchema).max(100),
  status: z.enum(["open", "accepted", "fixed", "deferred"]),
});
export type QualityFindingV1 = z.infer<typeof QualityFindingV1Schema>;

// `profile` intentionally reuses contracts' general NamespacedCodeSchema
// (not a fixed literal): this shape is always produced by projecting a
// `ReleaseManifestV1`, whose own `profile` is a NamespacedCode, so the
// projection must accept whatever contracts allows.
const CertificationEnvelopeV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  releaseId: ReleaseIdSchema,
  projectId: ProjectIdSchema,
  profile: NamespacedCodeSchema,
  gitCommit: GitObjectIdSchema,
  gitTree: GitObjectIdSchema,
  cleanTree: z.literal(true),
  policyDigest: Sha256DigestSchema,
  releaseContractDigest: Sha256DigestSchema,
  experienceManifestDigest: Sha256DigestSchema,
  evidenceManifestDigest: Sha256DigestSchema,
  findingLedgerDigest: Sha256DigestSchema,
  approvalIds: z.array(ApprovalIdSchema).min(1).max(100),
  generatedAt: IsoInstantSchema,
};

// One arm per `ReleaseStageV1` value in `@app-factory/contracts`
// (packages/contracts/src/v1/release.ts). CertificationV1 is a read
// projection of a ReleaseManifestV1 (see certification.ts,
// `projectCertificationV1`): it must keep exactly the same eight stages, in
// the same order, with a nullability signature for archiveDigest /
// appStoreBuildId / testFlightInstalledAt / deviceSmokeEvidenceDigest that
// matches the source schema's per-stage evidence gate. If contracts' stage
// list ever changes, this union must change with it.
export const CertificationV1Schema = z.discriminatedUnion("stage", [
  z.strictObject({
    ...CertificationEnvelopeV1Shape,
    stage: z.literal("candidate"),
    archiveDigest: z.null(),
    appStoreBuildId: z.null(),
    testFlightInstalledAt: z.null(),
    deviceSmokeEvidenceDigest: z.null(),
  }),
  z.strictObject({
    ...CertificationEnvelopeV1Shape,
    stage: z.literal("certified"),
    archiveDigest: z.null(),
    appStoreBuildId: z.null(),
    testFlightInstalledAt: z.null(),
    deviceSmokeEvidenceDigest: z.null(),
  }),
  z.strictObject({
    ...CertificationEnvelopeV1Shape,
    stage: z.literal("archived"),
    archiveDigest: Sha256DigestSchema,
    appStoreBuildId: z.null(),
    testFlightInstalledAt: z.null(),
    deviceSmokeEvidenceDigest: z.null(),
  }),
  z.strictObject({
    ...CertificationEnvelopeV1Shape,
    stage: z.literal("upload-approved"),
    archiveDigest: Sha256DigestSchema,
    appStoreBuildId: z.null(),
    testFlightInstalledAt: z.null(),
    deviceSmokeEvidenceDigest: z.null(),
  }),
  z.strictObject({
    ...CertificationEnvelopeV1Shape,
    stage: z.literal("uploaded"),
    archiveDigest: Sha256DigestSchema,
    appStoreBuildId: z.string().min(1).max(500),
    testFlightInstalledAt: z.null(),
    deviceSmokeEvidenceDigest: z.null(),
  }),
  z.strictObject({
    ...CertificationEnvelopeV1Shape,
    stage: z.literal("processing"),
    archiveDigest: Sha256DigestSchema,
    appStoreBuildId: z.string().min(1).max(500),
    testFlightInstalledAt: z.null(),
    deviceSmokeEvidenceDigest: z.null(),
  }),
  z.strictObject({
    ...CertificationEnvelopeV1Shape,
    stage: z.literal("internal-testflight-available"),
    archiveDigest: Sha256DigestSchema,
    appStoreBuildId: z.string().min(1).max(500),
    testFlightInstalledAt: IsoInstantSchema,
    deviceSmokeEvidenceDigest: z.null(),
  }),
  z.strictObject({
    ...CertificationEnvelopeV1Shape,
    stage: z.literal("device-smoke-passed"),
    archiveDigest: Sha256DigestSchema,
    appStoreBuildId: z.string().min(1).max(500),
    testFlightInstalledAt: IsoInstantSchema,
    deviceSmokeEvidenceDigest: Sha256DigestSchema,
  }),
]);
export type CertificationV1 = z.infer<typeof CertificationV1Schema>;
