import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  PortfolioReadModelV1Schema,
  canonicalPortfolioReadModelDigestInputV1,
  portfolioReadModelDigestInputV1,
} from "../src/index.js";

const NOW = "2026-08-10T12:00:00.000Z";
const PROJECT_A = "75000000-0000-4000-8000-000000000001";
const PROJECT_B = "75000000-0000-4000-8000-000000000002";
const PLACEHOLDER_DIGEST = `sha256:${"0".repeat(64)}`;

function project(projectId: string, slug: string, blockerCount = 0) {
  return {
    projectId,
    slug,
    displayName: slug === "alpha" ? "Alpha" : "Beta",
    metadataSource: "task-derived",
    lifecycleStage: null,
    attemptCount: 2,
    activeAttemptCount: 1,
    blockerCount,
    lastActivityAt: "2026-08-10T11:00:00.000Z",
    lastDeliveryAt: null,
    openPullRequestCount: null,
    jiraTodoCount: null,
    jiraInProgressCount: null,
    unresolvedP0: null,
    unresolvedP1: null,
    releaseStage: null,
    analyticsFreshness: "unavailable",
    sources: {
      localExecution: "available",
      jira: "unavailable",
      github: "unavailable",
      quality: "unavailable",
      release: "unavailable",
      analytics: "unavailable",
    },
    health: blockerCount > 0 ? "blocked" : "unknown",
    healthReasons: [
      ...(blockerCount > 0 ? ["delivery-blocker"] : []),
      "jira-unavailable",
      "github-unavailable",
      "quality-unavailable",
      "release-unavailable",
      "analytics-unavailable",
    ],
  } as const;
}

function localSnapshot() {
  const candidate = PortfolioReadModelV1Schema.parse({
    schemaVersion: 1,
    generatedAt: NOW,
    projects: [project(PROJECT_A, "alpha"), project(PROJECT_B, "beta", 1)],
    totals: {
      projects: 2,
      attempts: 4,
      activeAttempts: 2,
      blockers: 1,
      openPullRequests: null,
      jiraTodo: null,
      jiraInProgress: null,
      unresolvedP0: null,
      unresolvedP1: null,
    },
    sourceSnapshotDigest: PLACEHOLDER_DIGEST,
  });
  const digest = `sha256:${createHash("sha256")
    .update(canonicalPortfolioReadModelDigestInputV1(candidate), "utf8")
    .digest("hex")}`;
  return PortfolioReadModelV1Schema.parse({ ...candidate, sourceSnapshotDigest: digest });
}

describe("portfolio read model V1", () => {
  it("preserves unavailable provider values as null and defines one deterministic digest input", () => {
    const snapshot = localSnapshot();

    expect(snapshot.projects[0]).toMatchObject({
      lifecycleStage: null,
      openPullRequestCount: null,
      jiraTodoCount: null,
      unresolvedP0: null,
      analyticsFreshness: "unavailable",
      health: "unknown",
    });
    expect(snapshot.totals.openPullRequests).toBeNull();
    expect(portfolioReadModelDigestInputV1(snapshot)).not.toHaveProperty("sourceSnapshotDigest");
    expect(
      `sha256:${createHash("sha256")
        .update(canonicalPortfolioReadModelDigestInputV1(snapshot), "utf8")
        .digest("hex")}`,
    ).toBe(snapshot.sourceSnapshotDigest);
  });

  it("rejects fabricated zeroes for unavailable sources", () => {
    const snapshot = localSnapshot();
    expect(() =>
      PortfolioReadModelV1Schema.parse({
        ...snapshot,
        projects: [{ ...snapshot.projects[0], openPullRequestCount: 0 }, snapshot.projects[1]],
      }),
    ).toThrow("GitHub counts must be null exactly when GitHub is unavailable");
  });

  it("rejects noncanonical project order, inconsistent health, and incorrect totals", () => {
    const snapshot = localSnapshot();
    expect(() =>
      PortfolioReadModelV1Schema.parse({
        ...snapshot,
        projects: [...snapshot.projects].reverse(),
      }),
    ).toThrow("projects must be sorted by slug");
    expect(() =>
      PortfolioReadModelV1Schema.parse({
        ...snapshot,
        projects: [{ ...snapshot.projects[0], health: "healthy" }, snapshot.projects[1]],
      }),
    ).toThrow("health must match the available authoritative values");
    expect(() =>
      PortfolioReadModelV1Schema.parse({
        ...snapshot,
        totals: { ...snapshot.totals, attempts: 0 },
      }),
    ).toThrow("totals must match the project values");
  });
});
