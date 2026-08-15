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

/**
 * The single source of truth for release-stage sequencing. The per-stage
 * evidence gate below and `assertReleaseAdvancement` both derive from this
 * so the enum, the gate, and the transition rule cannot drift apart.
 */
export const RELEASE_STAGE_ORDER_V1: readonly ReleaseStageV1[] = ReleaseStageV1Schema.options;

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
      tree: GitObjectIdSchema,
      cleanTree: z.literal(true),
      policyDigest: Sha256DigestSchema,
      releaseContractDigest: Sha256DigestSchema,
      experienceManifestDigest: Sha256DigestSchema,
      qualityReportDigest: Sha256DigestSchema,
      evidenceManifestDigest: Sha256DigestSchema,
      findingLedgerDigest: Sha256DigestSchema,
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
    internalTestFlightAvailableAt: IsoInstantSchema.nullable(),
    deviceSmokeEvidenceDigest: Sha256DigestSchema.nullable(),
    approvals: z.array(ApprovalIdSchema).max(100),
    lifecycleEventKeys: z.array(StableKeySchema).max(100),
    createdAt: IsoInstantSchema,
    updatedAt: IsoInstantSchema,
  })
  .superRefine((release, context) => {
    const rank = RELEASE_STAGE_ORDER_V1.indexOf(release.stage);
    const gate = (
      field:
        | "archiveDigest"
        | "appStoreBuildId"
        | "internalTestFlightAvailableAt"
        | "deviceSmokeEvidenceDigest",
      atOrAfterStage: ReleaseStageV1,
      label: string,
    ) => {
      const threshold = RELEASE_STAGE_ORDER_V1.indexOf(atOrAfterStage);
      const value = release[field];
      if (rank >= threshold && value === null) {
        context.addIssue({ code: "custom", path: [field], message: `${label} is required` });
      }
      if (rank < threshold && value !== null) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${label} is not yet available`,
        });
      }
    };
    gate("archiveDigest", "archived", "archive digest");
    gate("appStoreBuildId", "uploaded", "App Store build ID");
    gate(
      "internalTestFlightAvailableAt",
      "internal-testflight-available",
      "TestFlight availability time",
    );
    gate("deviceSmokeEvidenceDigest", "device-smoke-passed", "device smoke evidence digest");
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

export class ReleaseAdvancementError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ReleaseAdvancementError";
  }
}

const RELEASE_IMMUTABLE_SCALAR_KEYS = [
  "releaseId",
  "projectId",
  "profile",
  "target",
  "metadataDigest",
] as const;

const RELEASE_IMMUTABLE_OBJECT_KEYS = ["candidate", "ios"] as const;

/**
 * Enforces the release state-machine transition invariants across all eight
 * stages: exactly one stage of advancement, an unchanged release identity
 * (candidate cut and iOS target), and strictly-growing approvals with at
 * least one new approval per stage. This is the canonical replacement for
 * quality's former, narrower `assertCertificationAdvancement`; downstream
 * packages project a read view from a `ReleaseManifestV1` rather than
 * tracking a second, independently advancing stage.
 */
export function assertReleaseAdvancement(
  previousInput: unknown,
  nextInput: unknown,
): ReleaseManifestV1 {
  const previous = ReleaseManifestV1Schema.parse(previousInput);
  const next = ReleaseManifestV1Schema.parse(nextInput);
  const previousIndex = RELEASE_STAGE_ORDER_V1.indexOf(previous.stage);
  const nextIndex = RELEASE_STAGE_ORDER_V1.indexOf(next.stage);
  if (nextIndex !== previousIndex + 1) {
    throw new ReleaseAdvancementError(
      `Release must advance exactly one stage from ${previous.stage}`,
    );
  }
  for (const key of RELEASE_IMMUTABLE_SCALAR_KEYS) {
    if (previous[key] !== next[key]) {
      throw new ReleaseAdvancementError(`Release changed immutable field ${key}`);
    }
  }
  for (const key of RELEASE_IMMUTABLE_OBJECT_KEYS) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      throw new ReleaseAdvancementError(`Release changed immutable field ${key}`);
    }
  }
  // `ReleaseManifestV1Schema.parse` above already rejects a duplicate entry
  // within a single object's `approvals`, so only the relational invariants
  // - nothing removed, and the count strictly grew - remain to check here.
  if (previous.approvals.some((approvalId) => !next.approvals.includes(approvalId))) {
    throw new ReleaseAdvancementError("Release advancement removed an earlier approval");
  }
  if (next.approvals.length <= previous.approvals.length) {
    throw new ReleaseAdvancementError("Each release stage requires a new approval");
  }
  return next;
}
