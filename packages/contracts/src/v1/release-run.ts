import { z } from "zod";

import { ApprovalSubjectV1Schema } from "./approval.js";
import {
  GitBranchNameSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  PositiveSafeIntegerSchema,
  ProjectIdSchema,
  ReleaseIdSchema,
  ReleaseRunIdSchema,
  RepositoryIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "./primitives.js";
import { RELEASE_STAGE_ORDER_V1, ReleaseStageV1Schema, type ReleaseStageV1 } from "./release.js";

// Release Rail Wave 1 (see docs/plans, "Release Rail"). This file adds the RUNTIME record that
// drives a `ReleaseManifestV1` (release.ts) through its eight stages -- `ReleaseManifestV1` itself
// is the durable, evidence-gated state; `ReleaseRunV1` is the process record a later wave's daemon
// command actually mutates step by step (start, promote, archive, upload, submit). Nothing
// constructs either one yet; this wave only adds the shapes and their pure invariants.

// iOS identity patterns, mirrored from `ReleaseManifestV1.ios` (release.ts) so a run's archive
// record validates a build number / bundle ID exactly the way the manifest it eventually feeds
// will. Not imported from release.ts: those patterns are private to that file's schema literals,
// and release.ts must not import back from this one.
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const BUILD_NUMBER_PATTERN = /^[1-9][0-9]{0,17}$/;
const APPLE_TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;

const BundleIdSchema = z
  .string()
  .min(3)
  .max(255)
  .regex(BUNDLE_ID_PATTERN, "Expected a reverse-DNS bundle ID");

const IosBuildNumberSchema = z
  .string()
  .regex(BUILD_NUMBER_PATTERN, "Expected a positive integer build number string");

// ---------------------------------------------------------------------------
// ReleaseRunV1
// ---------------------------------------------------------------------------

const ReleaseRunPromotionV1Schema = z.strictObject({
  promotedCommit: GitObjectIdSchema,
  branch: GitBranchNameSchema,
  at: IsoInstantSchema,
});

const ReleaseRunArchiveV1Schema = z.strictObject({
  buildNumber: IosBuildNumberSchema,
  marketingVersion: z.string().min(1).max(100),
  archiveDigest: Sha256DigestSchema,
  exportedArtifactDigest: Sha256DigestSchema,
  receiptDigest: Sha256DigestSchema,
  at: IsoInstantSchema,
});

const ReleaseRunUploadV1Schema = z.strictObject({
  submittedAt: IsoInstantSchema,
  // Nullable in shape (mirrors `ReleaseManifestV1`'s own nullable-then-gated fields, e.g.
  // `archiveDigest`): the `superRefine` below requires it non-null the moment `upload` itself is
  // required, i.e. Apple's build ID must already be known before the run's own `stage` advances to
  // "uploaded" (architecture decision 5 -- the rail polls `release.observe` until the build appears
  // before advancing past upload).
  ascBuildId: z.string().min(1).max(500).nullable(),
  confirmedAt: IsoInstantSchema.nullable(),
});

export const ReleaseRunV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    releaseRunId: ReleaseRunIdSchema,
    projectId: ProjectIdSchema,
    repositoryId: RepositoryIdSchema,
    releaseId: ReleaseIdSchema,
    // The verified broker commit this run is driving to release; immutable for the run's lifetime.
    sourceCommit: GitObjectIdSchema,
    branch: GitBranchNameSchema,
    stage: ReleaseStageV1Schema,
    // CAS revision: the same optimistic-concurrency convention `PhaseDefinitionV1.revision` /
    // `RoomV1.updatedAt`-guarded writes already use elsewhere in this package. Starts at 1.
    revision: PositiveSafeIntegerSchema,
    promotion: ReleaseRunPromotionV1Schema.nullable(),
    archive: ReleaseRunArchiveV1Schema.nullable(),
    upload: ReleaseRunUploadV1Schema.nullable(),
    // The honest disclosure channel (architecture decision 6): quality dimensions this run's
    // certification could not evaluate (see `CandidateCertificationV1.unevaluated` below, and
    // `KNOWN_UNEVALUATED_QUALITY_DIMENSIONS_V1` in `@app-factory/quality`) -- never silently
    // dropped, never counted as a pass. Empty before the run has been certified at all.
    unevaluated: z.array(NamespacedCodeSchema).max(20),
    notes: z.array(z.string().min(1).max(2_000)).max(50),
    createdAt: IsoInstantSchema,
    updatedAt: IsoInstantSchema,
  })
  .superRefine((run, context) => {
    const rank = RELEASE_STAGE_ORDER_V1.indexOf(run.stage);
    const gate = (
      field: "promotion" | "archive" | "upload",
      atOrAfterStage: ReleaseStageV1,
      label: string,
    ) => {
      const threshold = RELEASE_STAGE_ORDER_V1.indexOf(atOrAfterStage);
      const value = run[field];
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
    // Promotion must land before archiving: `xcodebuild archive` runs against the source
    // repository's promoted tree (architecture decisions 2 and 4).
    gate("promotion", "archived", "promotion record");
    gate("archive", "archived", "archive record");
    gate("upload", "uploaded", "upload record");
    if (
      run.upload !== null &&
      rank >= RELEASE_STAGE_ORDER_V1.indexOf("uploaded") &&
      run.upload.ascBuildId === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["upload", "ascBuildId"],
        message: "an App Store build ID is required once the run reaches uploaded",
      });
    }
    if (
      run.upload !== null &&
      rank >= RELEASE_STAGE_ORDER_V1.indexOf("internal-testflight-available") &&
      run.upload.confirmedAt === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["upload", "confirmedAt"],
        message:
          "upload confirmation is required once the run reaches internal-testflight-available",
      });
    }
    if (run.updatedAt < run.createdAt) {
      context.addIssue({
        code: "custom",
        path: ["updatedAt"],
        message: "updatedAt precedes createdAt",
      });
    }
  });
export type ReleaseRunV1 = z.infer<typeof ReleaseRunV1Schema>;

export class ReleaseRunAdvancementError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ReleaseRunAdvancementError";
  }
}

const RELEASE_RUN_IMMUTABLE_KEYS = [
  "releaseRunId",
  "projectId",
  "repositoryId",
  "releaseId",
  "sourceCommit",
  "branch",
  "createdAt",
] as const;

/**
 * Enforces the `ReleaseRunV1` state-machine invariants: a strictly incrementing CAS revision, an
 * unchanged run identity, and a stage that either holds (persisting an update -- e.g. refreshed
 * `notes`/`unevaluated` from a re-run status check -- without moving the run forward) or advances by
 * exactly one stage per `RELEASE_STAGE_ORDER_V1` (never skips, never regresses). Per-stage evidence
 * cannot be separately "cleared once settled" as its own rule here: `ReleaseRunV1Schema`'s own
 * `superRefine` already ties every evidence record's non-nullability directly to `stage` rank, so
 * once a stage transition is legal under this function, that gate alone guarantees evidence already
 * recorded for a rank at or below the new stage stays populated. This combination -- CAS-guarded
 * writes plus a stage that may legally hold across retries -- is what makes a release run RESUMABLE
 * PER STAGE (the release-rail plan's "item-level retry is still missing" risk note): a retried
 * caller replays the current stage's work and re-settles its own evidence without restarting the
 * whole run, the same way `assertReleaseAdvancement` (release.ts) does for the `ReleaseManifestV1`
 * this run drives -- except a `ReleaseRunV1` may also hold its stage steady across calls, which a
 * `ReleaseManifestV1` (always exactly one stage per write) does not.
 */
export function assertReleaseRunAdvancement(
  previousInput: unknown,
  nextInput: unknown,
): ReleaseRunV1 {
  const previous = ReleaseRunV1Schema.parse(previousInput);
  const next = ReleaseRunV1Schema.parse(nextInput);
  if (next.revision !== previous.revision + 1) {
    throw new ReleaseRunAdvancementError("Release run revision must increment by exactly one");
  }
  for (const key of RELEASE_RUN_IMMUTABLE_KEYS) {
    if (previous[key] !== next[key]) {
      throw new ReleaseRunAdvancementError(`Release run changed immutable field ${key}`);
    }
  }
  const previousIndex = RELEASE_STAGE_ORDER_V1.indexOf(previous.stage);
  const nextIndex = RELEASE_STAGE_ORDER_V1.indexOf(next.stage);
  if (nextIndex !== previousIndex && nextIndex !== previousIndex + 1) {
    throw new ReleaseRunAdvancementError(
      "Release run must hold its stage or advance exactly one stage",
    );
  }
  return next;
}

// ---------------------------------------------------------------------------
// ReleaseBuildNumberAllocationV1
// ---------------------------------------------------------------------------

export const ReleaseBuildNumberAllocationV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  bundleId: BundleIdSchema,
  buildNumber: IosBuildNumberSchema,
  releaseRunId: ReleaseRunIdSchema,
  allocatedAt: IsoInstantSchema,
});
export type ReleaseBuildNumberAllocationV1 = z.infer<typeof ReleaseBuildNumberAllocationV1Schema>;

export class ReleaseBuildNumberAllocationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ReleaseBuildNumberAllocationError";
  }
}

/**
 * The build-number allocator is append-only and monotonic per bundle ID (architecture decision 3;
 * risk note "upload is not naturally idempotent"): a re-upload must allocate a NEW, strictly larger
 * number for the same bundle rather than replaying an earlier one, and no two allocations for the
 * same bundle may ever collide. This validates one proposed `next` allocation against every
 * `existing` allocation already recorded for that bundle; it does not pick a number itself --
 * append-only durable storage (Wave 2) owns "the next number," this is the pure invariant that
 * storage must uphold.
 */
export function assertBuildNumberAllocationV1(
  existingInput: readonly unknown[],
  nextInput: unknown,
): ReleaseBuildNumberAllocationV1 {
  const existing = existingInput.map((value) => ReleaseBuildNumberAllocationV1Schema.parse(value));
  const next = ReleaseBuildNumberAllocationV1Schema.parse(nextInput);
  const sameBundle = existing.filter((allocation) => allocation.bundleId === next.bundleId);
  if (sameBundle.some((allocation) => allocation.buildNumber === next.buildNumber)) {
    throw new ReleaseBuildNumberAllocationError(
      `Build number ${next.buildNumber} is already allocated for bundle ${next.bundleId}`,
    );
  }
  const highestExisting = sameBundle.reduce(
    (max, allocation) =>
      BigInt(allocation.buildNumber) > max ? BigInt(allocation.buildNumber) : max,
    0n,
  );
  if (BigInt(next.buildNumber) <= highestExisting) {
    throw new ReleaseBuildNumberAllocationError(
      `Build number ${next.buildNumber} does not strictly increase for bundle ${next.bundleId}`,
    );
  }
  return next;
}

// ---------------------------------------------------------------------------
// ReleaseExportOptionsConfigV1
// ---------------------------------------------------------------------------

/**
 * Names/identifiers only -- NEVER secrets. The owner's proven recipe (memory, six apps):
 * `xcodebuild archive -destination "generic/platform=iOS" -allowProvisioningUpdates
 * CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=<teamId>`, then `-exportArchive` with an
 * ExportOptions plist built from this shape (`method: app-store-connect`, `destination: upload`,
 * `signingStyle: automatic`). The signing identity itself lives in the macOS Keychain and is never
 * represented here.
 */
export const ReleaseExportOptionsConfigV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  teamId: z
    .string()
    .regex(APPLE_TEAM_ID_PATTERN, "Expected a 10-character Apple Developer Team ID"),
  method: z.literal("app-store-connect"),
  destination: z.enum(["upload", "export"]),
  signingStyle: z.literal("automatic"),
  bundleIdOverride: BundleIdSchema.nullable(),
});
export type ReleaseExportOptionsConfigV1 = z.infer<typeof ReleaseExportOptionsConfigV1Schema>;

// ---------------------------------------------------------------------------
// Release-scoped approval subject (architecture decision 7)
// ---------------------------------------------------------------------------

/**
 * The intended invariant for a release-scoped approval (architecture decision 7): every
 * `ReleaseRunV1` stage advance that crosses a human gate consumes an approval bound to
 * `{projectId, releaseId}` with `taskId` and `attemptId` both null -- a release-rail action has no
 * backing task or attempt. `ApprovalSubjectV1Schema` (approval.ts) already permits this shape
 * structurally; what is missing is a writer that accepts it. `registerApproval`'s only live writer
 * (`assertSubjectMatchesAttempt`, packages/kernel/src/effect-repositories.ts) currently hard-
 * requires a non-null `attemptId` + `taskId` + `projectId`, so a release-scoped approval is
 * unrepresentable end-to-end today even though this schema allows it. Wave 2 relaxes that writer,
 * through a release-specific issuance path, to accept exactly the shape this predicate recognizes;
 * this function is that shape's exact, testable definition.
 */
export function isReleaseScopedApprovalSubjectV1(subjectInput: unknown): boolean {
  const subject = ApprovalSubjectV1Schema.parse(subjectInput);
  return (
    subject.projectId !== null &&
    subject.releaseId !== null &&
    subject.taskId === null &&
    subject.attemptId === null
  );
}

// ---------------------------------------------------------------------------
// CandidateCertificationV1 (architecture decision 6)
// ---------------------------------------------------------------------------

export const CandidateCertificationCheckV1Schema = z.strictObject({
  code: NamespacedCodeSchema,
  passed: z.boolean(),
  detail: z.string().min(1).max(1_000),
});
export type CandidateCertificationCheckV1 = z.infer<typeof CandidateCertificationCheckV1Schema>;

/**
 * The honest, checkable-today subset of `candidate -> certified` certification (architecture
 * decision 6). `checks` covers only what Wave 1 can genuinely verify without runtime UI
 * instrumentation: a clean tree at a verified broker commit, the plan's own verification passed,
 * the evidence manifest verifies, and no open blocking finding (see
 * `@app-factory/quality`'s `certifyCandidateSubsetV1`, the pure wiring function that produces this
 * shape). `unevaluated` names every quality dimension this record does NOT speak to -- coherence,
 * the presentation matrix, runtime lineage -- because the screenshot and route instrumentation they
 * need does not exist yet. A dimension in `unevaluated` is never counted as a pass, and it never
 * forces `certified` false either: it is disclosed, not silently stubbed as either outcome. The
 * `superRefine` below pins `certified` to exactly "every checkable-today check passed," so this
 * shape cannot itself be misused to report a certification that didn't actually happen. The full
 * quality engine (`packages/quality`'s `verifyCertification` / `CertificationV1`, release.ts's
 * `ReleaseManifestV1` projection) is the later, complete replacement once coherence's inputs exist;
 * this is deliberately narrower and says so about itself via `unevaluated`.
 */
export const CandidateCertificationV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    releaseId: ReleaseIdSchema,
    projectId: ProjectIdSchema,
    candidateCommit: GitObjectIdSchema,
    evaluatedAt: IsoInstantSchema,
    checks: z.array(CandidateCertificationCheckV1Schema).min(1).max(20),
    unevaluated: z.array(NamespacedCodeSchema).min(1).max(20),
    certified: z.boolean(),
  })
  .superRefine((value, context) => {
    if (new Set(value.checks.map((check) => check.code)).size !== value.checks.length) {
      context.addIssue({
        code: "custom",
        message: "candidate certification check codes must be unique",
      });
    }
    const allPassed = value.checks.every((check) => check.passed);
    if (value.certified !== allPassed) {
      context.addIssue({
        code: "custom",
        path: ["certified"],
        message: "certified must equal every checkable-today check having passed",
      });
    }
  });
export type CandidateCertificationV1 = z.infer<typeof CandidateCertificationV1Schema>;
