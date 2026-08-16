import { z } from "zod";

import {
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  ProjectIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
} from "./primitives.js";
import { LegacyProjectLifecycleStageV1Schema } from "./project.js";

export const MAX_PORTFOLIO_PROJECTS_V1 = 1_000 as const;

export const PortfolioSourceAvailabilityV1Schema = z.enum(["available", "unavailable"]);
export type PortfolioSourceAvailabilityV1 = z.infer<typeof PortfolioSourceAvailabilityV1Schema>;

export const PortfolioHealthV1Schema = z.enum(["healthy", "attention", "blocked", "unknown"]);
export type PortfolioHealthV1 = z.infer<typeof PortfolioHealthV1Schema>;

export const PortfolioHealthReasonV1Schema = z.enum([
  "unresolved-p0",
  "delivery-blocker",
  "unresolved-p1",
  "jira-unavailable",
  "github-unavailable",
  "quality-unavailable",
  "release-unavailable",
  "analytics-stale",
  "analytics-unavailable",
]);
export type PortfolioHealthReasonV1 = z.infer<typeof PortfolioHealthReasonV1Schema>;

const NullableCountV1Schema = NonNegativeSafeIntegerSchema.nullable();

export const PortfolioProjectSourceAvailabilityV1Schema = z.strictObject({
  localExecution: z.literal("available"),
  jira: PortfolioSourceAvailabilityV1Schema,
  github: PortfolioSourceAvailabilityV1Schema,
  quality: PortfolioSourceAvailabilityV1Schema,
  release: PortfolioSourceAvailabilityV1Schema,
  analytics: PortfolioSourceAvailabilityV1Schema,
});
export type PortfolioProjectSourceAvailabilityV1 = z.infer<
  typeof PortfolioProjectSourceAvailabilityV1Schema
>;

function matchesAvailability(
  availability: PortfolioSourceAvailabilityV1,
  values: readonly (number | null)[],
): boolean {
  return availability === "available"
    ? values.every((value) => value !== null)
    : values.every((value) => value === null);
}

function expectedHealthReasons(
  project: Readonly<{
    blockerCount: number;
    unresolvedP0: number | null;
    unresolvedP1: number | null;
    analyticsFreshness: "fresh" | "stale" | "unavailable";
    sources: PortfolioProjectSourceAvailabilityV1;
  }>,
): PortfolioHealthReasonV1[] {
  const reasons: PortfolioHealthReasonV1[] = [];
  if ((project.unresolvedP0 ?? 0) > 0) reasons.push("unresolved-p0");
  if (project.blockerCount > 0) reasons.push("delivery-blocker");
  if ((project.unresolvedP1 ?? 0) > 0) reasons.push("unresolved-p1");
  if (project.sources.jira === "unavailable") reasons.push("jira-unavailable");
  if (project.sources.github === "unavailable") reasons.push("github-unavailable");
  if (project.sources.quality === "unavailable") reasons.push("quality-unavailable");
  if (project.sources.release === "unavailable") reasons.push("release-unavailable");
  if (project.analyticsFreshness === "stale") reasons.push("analytics-stale");
  if (project.sources.analytics === "unavailable") reasons.push("analytics-unavailable");
  return reasons;
}

function expectedHealth(
  project: Readonly<{
    blockerCount: number;
    unresolvedP0: number | null;
    unresolvedP1: number | null;
    analyticsFreshness: "fresh" | "stale" | "unavailable";
    sources: PortfolioProjectSourceAvailabilityV1;
  }>,
): PortfolioHealthV1 {
  if (project.blockerCount > 0 || (project.unresolvedP0 ?? 0) > 0) return "blocked";
  if ((project.unresolvedP1 ?? 0) > 0 || project.analyticsFreshness === "stale") {
    return "attention";
  }
  if (Object.values(project.sources).includes("unavailable")) return "unknown";
  return "healthy";
}

export const PortfolioProjectReadModelV1Schema = z
  .strictObject({
    projectId: ProjectIdSchema,
    slug: StableKeySchema,
    displayName: z.string().min(1).max(200),
    metadataSource: z.literal("task-derived"),
    lifecycleStage: LegacyProjectLifecycleStageV1Schema.nullable(),
    attemptCount: NonNegativeSafeIntegerSchema,
    activeAttemptCount: NonNegativeSafeIntegerSchema,
    blockerCount: NonNegativeSafeIntegerSchema,
    lastActivityAt: IsoInstantSchema.nullable(),
    lastDeliveryAt: IsoInstantSchema.nullable(),
    openPullRequestCount: NullableCountV1Schema,
    jiraTodoCount: NullableCountV1Schema,
    jiraInProgressCount: NullableCountV1Schema,
    unresolvedP0: NullableCountV1Schema,
    unresolvedP1: NullableCountV1Schema,
    releaseStage: z.string().min(1).max(100).nullable(),
    analyticsFreshness: z.enum(["fresh", "stale", "unavailable"]),
    sources: PortfolioProjectSourceAvailabilityV1Schema,
    health: PortfolioHealthV1Schema,
    healthReasons: z.array(PortfolioHealthReasonV1Schema).max(9),
  })
  .superRefine((project, context) => {
    if (project.activeAttemptCount > project.attemptCount) {
      context.addIssue({
        code: "custom",
        path: ["activeAttemptCount"],
        message: "activeAttemptCount must not exceed attemptCount",
      });
    }
    if (project.blockerCount > project.attemptCount) {
      context.addIssue({
        code: "custom",
        path: ["blockerCount"],
        message: "blockerCount must not exceed attemptCount",
      });
    }
    if (!matchesAvailability(project.sources.github, [project.openPullRequestCount])) {
      context.addIssue({
        code: "custom",
        path: ["openPullRequestCount"],
        message: "GitHub counts must be null exactly when GitHub is unavailable",
      });
    }
    if (
      !matchesAvailability(project.sources.jira, [
        project.jiraTodoCount,
        project.jiraInProgressCount,
      ])
    ) {
      context.addIssue({
        code: "custom",
        path: ["jiraTodoCount"],
        message: "Jira counts must be null exactly when Jira is unavailable",
      });
    }
    if (
      !matchesAvailability(project.sources.quality, [project.unresolvedP0, project.unresolvedP1])
    ) {
      context.addIssue({
        code: "custom",
        path: ["unresolvedP0"],
        message: "quality counts must be null exactly when quality is unavailable",
      });
    }
    if (project.sources.release === "unavailable" && project.releaseStage !== null) {
      context.addIssue({
        code: "custom",
        path: ["releaseStage"],
        message: "releaseStage must be null when release data is unavailable",
      });
    }
    if (
      (project.sources.analytics === "unavailable") !==
      (project.analyticsFreshness === "unavailable")
    ) {
      context.addIssue({
        code: "custom",
        path: ["analyticsFreshness"],
        message:
          "analytics freshness must report unavailable exactly when its source is unavailable",
      });
    }
    const reasons = expectedHealthReasons(project);
    if (JSON.stringify(project.healthReasons) !== JSON.stringify(reasons)) {
      context.addIssue({
        code: "custom",
        path: ["healthReasons"],
        message: "healthReasons must be complete and canonically ordered",
      });
    }
    if (project.health !== expectedHealth(project)) {
      context.addIssue({
        code: "custom",
        path: ["health"],
        message: "health must match the available authoritative values",
      });
    }
  });
export type PortfolioProjectReadModelV1 = z.infer<typeof PortfolioProjectReadModelV1Schema>;

export const PortfolioReadModelTotalsV1Schema = z.strictObject({
  projects: NonNegativeSafeIntegerSchema,
  attempts: NonNegativeSafeIntegerSchema,
  activeAttempts: NonNegativeSafeIntegerSchema,
  blockers: NonNegativeSafeIntegerSchema,
  openPullRequests: NullableCountV1Schema,
  jiraTodo: NullableCountV1Schema,
  jiraInProgress: NullableCountV1Schema,
  unresolvedP0: NullableCountV1Schema,
  unresolvedP1: NullableCountV1Schema,
});
export type PortfolioReadModelTotalsV1 = z.infer<typeof PortfolioReadModelTotalsV1Schema>;

const PortfolioReadModelDigestInputV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  generatedAt: IsoInstantSchema,
  projects: z.array(PortfolioProjectReadModelV1Schema).max(MAX_PORTFOLIO_PROJECTS_V1),
  totals: PortfolioReadModelTotalsV1Schema,
};

export const PortfolioReadModelDigestInputV1Schema = z.strictObject(
  PortfolioReadModelDigestInputV1Shape,
);
export type PortfolioReadModelDigestInputV1 = z.infer<typeof PortfolioReadModelDigestInputV1Schema>;

function nullableTotal(values: readonly (number | null)[]): number | null {
  if (values.length === 0 || values.some((value) => value === null)) return null;
  const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return Number.isSafeInteger(total) ? total : null;
}

export const PortfolioReadModelV1Schema = z
  .strictObject({
    ...PortfolioReadModelDigestInputV1Shape,
    sourceSnapshotDigest: Sha256DigestSchema,
  })
  .superRefine((snapshot, context) => {
    const projectIds = snapshot.projects.map((project) => project.projectId);
    const slugs = snapshot.projects.map((project) => project.slug);
    if (new Set(projectIds).size !== projectIds.length) {
      context.addIssue({
        code: "custom",
        path: ["projects"],
        message: "projectIds must be unique",
      });
    }
    if (new Set(slugs).size !== slugs.length) {
      context.addIssue({ code: "custom", path: ["projects"], message: "slugs must be unique" });
    }
    const sortedSlugs = [...slugs].sort((left, right) => left.localeCompare(right));
    if (JSON.stringify(slugs) !== JSON.stringify(sortedSlugs)) {
      context.addIssue({
        code: "custom",
        path: ["projects"],
        message: "projects must be sorted by slug",
      });
    }
    const generatedAt = Date.parse(snapshot.generatedAt);
    for (const [index, project] of snapshot.projects.entries()) {
      if (project.lastActivityAt !== null && Date.parse(project.lastActivityAt) > generatedAt) {
        context.addIssue({
          code: "custom",
          path: ["projects", index, "lastActivityAt"],
          message: "lastActivityAt must not be after generatedAt",
        });
      }
      if (project.lastDeliveryAt !== null && Date.parse(project.lastDeliveryAt) > generatedAt) {
        context.addIssue({
          code: "custom",
          path: ["projects", index, "lastDeliveryAt"],
          message: "lastDeliveryAt must not be after generatedAt",
        });
      }
      if (
        project.lastActivityAt !== null &&
        project.lastDeliveryAt !== null &&
        Date.parse(project.lastDeliveryAt) > Date.parse(project.lastActivityAt)
      ) {
        context.addIssue({
          code: "custom",
          path: ["projects", index, "lastDeliveryAt"],
          message: "lastDeliveryAt must not be after lastActivityAt",
        });
      }
    }
    const totals: PortfolioReadModelTotalsV1 = {
      projects: snapshot.projects.length,
      attempts: snapshot.projects.reduce((sum, project) => sum + project.attemptCount, 0),
      activeAttempts: snapshot.projects.reduce(
        (sum, project) => sum + project.activeAttemptCount,
        0,
      ),
      blockers: snapshot.projects.reduce((sum, project) => sum + project.blockerCount, 0),
      openPullRequests: nullableTotal(
        snapshot.projects.map((project) => project.openPullRequestCount),
      ),
      jiraTodo: nullableTotal(snapshot.projects.map((project) => project.jiraTodoCount)),
      jiraInProgress: nullableTotal(
        snapshot.projects.map((project) => project.jiraInProgressCount),
      ),
      unresolvedP0: nullableTotal(snapshot.projects.map((project) => project.unresolvedP0)),
      unresolvedP1: nullableTotal(snapshot.projects.map((project) => project.unresolvedP1)),
    };
    if (Object.values(totals).some((value) => value !== null && !Number.isSafeInteger(value))) {
      context.addIssue({ code: "custom", path: ["totals"], message: "totals exceed safe bounds" });
    } else if (JSON.stringify(snapshot.totals) !== JSON.stringify(totals)) {
      context.addIssue({
        code: "custom",
        path: ["totals"],
        message: "totals must match the project values",
      });
    }
  });
export type PortfolioReadModelV1 = z.infer<typeof PortfolioReadModelV1Schema>;

/**
 * The returned object is the complete canonical SHA-256 input. Callers encode it
 * as recursively key-sorted JSON UTF-8 and exclude `sourceSnapshotDigest`.
 */
export function portfolioReadModelDigestInputV1(
  snapshot: PortfolioReadModelDigestInputV1 | PortfolioReadModelV1,
): PortfolioReadModelDigestInputV1 {
  return PortfolioReadModelDigestInputV1Schema.parse({
    schemaVersion: snapshot.schemaVersion,
    generatedAt: snapshot.generatedAt,
    projects: snapshot.projects,
    totals: snapshot.totals,
  });
}

/** Canonical UTF-8 text to hash for `sourceSnapshotDigest`. */
export function canonicalPortfolioReadModelDigestInputV1(
  snapshot: PortfolioReadModelDigestInputV1 | PortfolioReadModelV1,
): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return value;
  };
  return JSON.stringify(normalize(portfolioReadModelDigestInputV1(snapshot)));
}
