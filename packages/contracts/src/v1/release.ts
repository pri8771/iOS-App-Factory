import { z } from "zod";

import {
  ApprovalIdSchema,
  EvidenceIdSchema,
  FindingIdSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  NonNegativeSafeIntegerSchema,
  ProjectIdSchema,
  ReleaseIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
} from "./primitives.js";

export const ReleaseStageV1Schema = z.enum([
  "candidate",
  "certified",
  "archived",
  "upload-approved",
  "uploaded",
  "processing",
  "internal-testflight-available",
  "device-smoke-passed",
]);
export type ReleaseStageV1 = z.infer<typeof ReleaseStageV1Schema>;

export const QualityCheckResultV1Schema = z.strictObject({
  checkId: NamespacedCodeSchema,
  status: z.enum(["passed", "failed", "blocked"]),
  durationMs: NonNegativeSafeIntegerSchema,
  evidenceDigests: z.array(Sha256DigestSchema).max(1_000),
  summary: z.string().min(1).max(2_000),
});

export const QualityReportV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    reportId: EvidenceIdSchema,
    releaseId: ReleaseIdSchema,
    projectId: ProjectIdSchema,
    candidateCommit: GitObjectIdSchema,
    policyDigest: Sha256DigestSchema,
    experienceManifestDigest: Sha256DigestSchema,
    checks: z.array(QualityCheckResultV1Schema).min(1).max(500),
    findingIds: z.array(FindingIdSchema).max(10_000),
    unresolvedP0: NonNegativeSafeIntegerSchema,
    unresolvedP1: NonNegativeSafeIntegerSchema,
    verdict: z.enum(["passed", "failed", "blocked"]),
    generatedAt: IsoInstantSchema,
  })
  .superRefine((report, context) => {
    if (new Set(report.checks.map((check) => check.checkId)).size !== report.checks.length) {
      context.addIssue({ code: "custom", message: "quality check IDs must be unique" });
    }
    if (new Set(report.findingIds).size !== report.findingIds.length) {
      context.addIssue({ code: "custom", message: "finding IDs must be unique" });
    }
    const failed = report.checks.some((check) => check.status === "failed");
    const blocked = report.checks.some((check) => check.status === "blocked");
    if (
      report.verdict === "passed" &&
      (failed || blocked || report.unresolvedP0 + report.unresolvedP1 > 0)
    ) {
      context.addIssue({ code: "custom", message: "a passing report cannot contain blockers" });
    }
    if (report.verdict === "failed" && !failed && report.unresolvedP0 + report.unresolvedP1 === 0) {
      context.addIssue({
        code: "custom",
        message: "a failed report needs a failed check or finding",
      });
    }
    if (report.verdict === "blocked" && !blocked) {
      context.addIssue({ code: "custom", message: "a blocked report needs a blocked check" });
    }
  });
export type QualityReportV1 = z.infer<typeof QualityReportV1Schema>;

export const ReleaseManifestV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    releaseId: ReleaseIdSchema,
    projectId: ProjectIdSchema,
    profile: NamespacedCodeSchema,
    target: z.literal("ios-internal-testflight"),
    stage: ReleaseStageV1Schema,
    candidate: z.strictObject({
      commit: GitObjectIdSchema,
      cleanTree: z.literal(true),
      policyDigest: Sha256DigestSchema,
      experienceManifestDigest: Sha256DigestSchema,
      qualityReportDigest: Sha256DigestSchema,
      evidenceManifestDigest: Sha256DigestSchema,
    }),
    ios: z.strictObject({
      bundleId: z
        .string()
        .min(3)
        .max(255)
        .regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/),
      marketingVersion: z.string().min(1).max(100),
      buildNumber: z.string().regex(/^[1-9][0-9]{0,17}$/),
      testerGroup: z.string().min(1).max(500),
    }),
    metadataDigest: Sha256DigestSchema,
    archiveDigest: Sha256DigestSchema.nullable(),
    exportedArtifactDigest: Sha256DigestSchema.nullable(),
    appStoreBuildId: z.string().min(1).max(500).nullable(),
    approvals: z.array(ApprovalIdSchema).max(100),
    lifecycleEventKeys: z.array(StableKeySchema).max(100),
    createdAt: IsoInstantSchema,
    updatedAt: IsoInstantSchema,
  })
  .superRefine((release, context) => {
    const stages = [
      "candidate",
      "certified",
      "archived",
      "upload-approved",
      "uploaded",
      "processing",
      "internal-testflight-available",
      "device-smoke-passed",
    ] as const;
    const rank = stages.indexOf(release.stage);
    if (rank >= stages.indexOf("archived") && release.archiveDigest === null) {
      context.addIssue({
        code: "custom",
        path: ["archiveDigest"],
        message: "archive digest is required",
      });
    }
    if (rank >= stages.indexOf("uploaded") && release.appStoreBuildId === null) {
      context.addIssue({
        code: "custom",
        path: ["appStoreBuildId"],
        message: "App Store build ID is required",
      });
    }
    if (release.updatedAt < release.createdAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt precedes createdAt",
      });
    }
    if (new Set(release.approvals).size !== release.approvals.length) {
      context.addIssue({ code: "custom", message: "release approvals must be unique" });
    }
  });
export type ReleaseManifestV1 = z.infer<typeof ReleaseManifestV1Schema>;
