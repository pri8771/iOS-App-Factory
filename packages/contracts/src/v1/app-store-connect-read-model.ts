import { z } from "zod";

import { IsoInstantSchema, SchemaVersionV1Schema } from "./primitives.js";
import { ReleaseStageV1Schema } from "./release.js";

/**
 * Provider-neutral, read-only App Store Connect observations.
 *
 * These are *observations*, not release state: nothing here advances a
 * `ReleaseManifestV1`. `AscReleaseProjectionV1` reads an app's latest build and
 * latest App Store version onto the single 8-stage `RELEASE_STAGE_ORDER_V1`
 * vocabulary (ADR 0003) so a Studio release rail can surface what Apple can
 * currently prove — and only that. Stages before `uploaded` are never
 * inferable from App Store Connect and are therefore never projected; nor is
 * `device-smoke-passed`, which is a local human gate. Every instant is either
 * a normalized Apple-provided timestamp or `null` — never guessed.
 */

export const MAX_ASC_LIST_ITEMS_V1 = 200 as const;

/** Apple's own resource identifiers are opaque strings; keep them bounded. */
export const AscResourceIdSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/);
export type AscResourceId = z.infer<typeof AscResourceIdSchema>;

/**
 * Apple state enumerations (`appStoreState`, `appVersionState`,
 * `internalBuildState`, `platform`, ...) are transported as bounded
 * upper-case tokens rather than closed enums: Apple extends these lists
 * between API revisions, and an observer must not turn a newly-added state
 * into an ambiguous observation. Consumers that need to reason about a
 * specific value compare against it explicitly.
 */
export const AscStateTokenSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/);
export type AscStateToken = z.infer<typeof AscStateTokenSchema>;

/** `builds.processingState` is a stable, closed set in the v1 API. */
export const AscBuildProcessingStateV1Schema = z.enum(["PROCESSING", "FAILED", "INVALID", "VALID"]);
export type AscBuildProcessingStateV1 = z.infer<typeof AscBuildProcessingStateV1Schema>;

export const AscBundleIdSchema = z
  .string()
  .min(3)
  .max(255)
  .regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/);

export const AscAppV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  appId: AscResourceIdSchema,
  bundleId: AscBundleIdSchema,
  name: z.string().min(1).max(500),
  sku: z.string().min(1).max(500).nullable(),
  primaryLocale: z.string().min(1).max(50).nullable(),
});
export type AscAppV1 = z.infer<typeof AscAppV1Schema>;

export const AscBuildV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  buildId: AscResourceIdSchema,
  appId: AscResourceIdSchema,
  /** Apple's `builds.version` — the CFBundleVersion build number. */
  buildNumber: z.string().min(1).max(100),
  /** From the included `preReleaseVersion.version` (CFBundleShortVersionString); null when not included. */
  marketingVersion: z.string().min(1).max(100).nullable(),
  uploadedDate: IsoInstantSchema.nullable(),
  processingState: AscBuildProcessingStateV1Schema,
  expired: z.boolean(),
  /** From the included `buildBetaDetail`; null when not included. */
  internalBuildState: AscStateTokenSchema.nullable(),
  externalBuildState: AscStateTokenSchema.nullable(),
});
export type AscBuildV1 = z.infer<typeof AscBuildV1Schema>;

export const AscAppStoreVersionV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  appStoreVersionId: AscResourceIdSchema,
  appId: AscResourceIdSchema,
  versionString: z.string().min(1).max(100),
  platform: AscStateTokenSchema,
  /** Deprecated by Apple in favour of `appVersionState`; still transported when present. */
  appStoreState: AscStateTokenSchema.nullable(),
  appVersionState: AscStateTokenSchema.nullable(),
  createdDate: IsoInstantSchema.nullable(),
});
export type AscAppStoreVersionV1 = z.infer<typeof AscAppStoreVersionV1Schema>;

/**
 * Why a projected stage was (or was not) assigned. Each value names exactly
 * one observable Apple fact; the projection never combines two facts into a
 * stage neither of them supports.
 */
export const AscProjectionBasisV1Schema = z.enum([
  "no-build-observed",
  "build-processing",
  "build-processing-failed",
  "build-processed-not-in-internal-testing",
  "build-in-internal-testing",
  "build-expired",
]);
export type AscProjectionBasisV1 = z.infer<typeof AscProjectionBasisV1Schema>;

export const AscReleaseProjectionV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    app: AscAppV1Schema,
    latestBuild: AscBuildV1Schema.nullable(),
    latestAppStoreVersion: AscAppStoreVersionV1Schema.nullable(),
    /**
     * The highest `RELEASE_STAGE_ORDER_V1` stage App Store Connect can
     * currently prove for this app's latest build, or `null` when Apple has
     * no build (everything before `uploaded` is local and unobservable here).
     * Only `processing` and `internal-testflight-available` are ever produced.
     */
    projectedStage: ReleaseStageV1Schema.nullable(),
    projectionBasis: AscProjectionBasisV1Schema,
    /** Apple's `uploadedDate` for the latest build — never synthesized. */
    uploadedAt: IsoInstantSchema.nullable(),
    /**
     * App Store Connect does not report *when* a build became available to
     * internal testers, so this is always `null` from this observer; it exists
     * so a consumer merging with `ReleaseManifestV1.internalTestFlightAvailableAt`
     * has a like-typed slot rather than inventing one.
     */
    internalTestFlightAvailableAt: IsoInstantSchema.nullable(),
    observedAt: IsoInstantSchema,
  })
  .superRefine((projection, context) => {
    if (projection.latestBuild === null) {
      if (
        projection.projectedStage !== null ||
        projection.projectionBasis !== "no-build-observed"
      ) {
        context.addIssue({
          code: "custom",
          path: ["projectedStage"],
          message: "a projection without a build cannot claim a stage",
        });
      }
    } else if (projection.projectedStage === null) {
      context.addIssue({
        code: "custom",
        path: ["projectedStage"],
        message: "a projection with a build must name the stage it proves",
      });
    }
    if (
      projection.projectedStage !== null &&
      projection.projectedStage !== "processing" &&
      projection.projectedStage !== "internal-testflight-available"
    ) {
      context.addIssue({
        code: "custom",
        path: ["projectedStage"],
        message: "App Store Connect can only prove processing or internal-testflight-available",
      });
    }
    if (projection.internalTestFlightAvailableAt !== null) {
      context.addIssue({
        code: "custom",
        path: ["internalTestFlightAvailableAt"],
        message: "App Store Connect does not report TestFlight availability time",
      });
    }
    if (
      projection.latestBuild !== null &&
      projection.uploadedAt !== projection.latestBuild.uploadedDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["uploadedAt"],
        message: "uploadedAt must equal the latest build's Apple-provided uploadedDate",
      });
    }
  });
export type AscReleaseProjectionV1 = z.infer<typeof AscReleaseProjectionV1Schema>;

/**
 * Pure projection of Apple's observed build/version state onto the release
 * stage vocabulary. Lives with the schema so the enum, the projection, and
 * the `superRefine` guarantees above cannot drift apart. `observedAt` is the
 * caller's clock reading, passed in — this function never reads a clock.
 */
export function projectAscReleaseStageV1(input: {
  app: AscAppV1;
  latestBuild: AscBuildV1 | null;
  latestAppStoreVersion: AscAppStoreVersionV1 | null;
  observedAt: string;
}): AscReleaseProjectionV1 {
  const build = input.latestBuild;
  let projectedStage: AscReleaseProjectionV1["projectedStage"] = null;
  let projectionBasis: AscProjectionBasisV1 = "no-build-observed";
  if (build !== null) {
    if (build.expired) {
      // An expired build was processed once, but Apple no longer serves it to
      // testers; the highest stage still provable is that processing happened.
      projectedStage = "processing";
      projectionBasis = "build-expired";
    } else if (build.processingState === "PROCESSING") {
      projectedStage = "processing";
      projectionBasis = "build-processing";
    } else if (build.processingState === "FAILED" || build.processingState === "INVALID") {
      projectedStage = "processing";
      projectionBasis = "build-processing-failed";
    } else if (build.internalBuildState === "IN_BETA_TESTING") {
      projectedStage = "internal-testflight-available";
      projectionBasis = "build-in-internal-testing";
    } else {
      projectedStage = "processing";
      projectionBasis = "build-processed-not-in-internal-testing";
    }
  }
  return AscReleaseProjectionV1Schema.parse({
    schemaVersion: 1,
    app: input.app,
    latestBuild: build,
    latestAppStoreVersion: input.latestAppStoreVersion,
    projectedStage,
    projectionBasis,
    uploadedAt: build?.uploadedDate ?? null,
    internalTestFlightAvailableAt: null,
    observedAt: input.observedAt,
  });
}
