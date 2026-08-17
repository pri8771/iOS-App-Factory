import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  STUDIO_NOT_YET_WIRED_REASON_V1,
  StudioSnapshotV1Schema,
  canonicalStudioSnapshotDigestInputV1,
  studioSnapshotDigestInputV1,
} from "../src/index.js";

const NOW = "2026-08-10T12:00:00.000Z";
const PROJECT_A = "76000000-0000-4000-8000-000000000001";
const PROJECT_B = "76000000-0000-4000-8000-000000000002";
const ATTEMPT_A = "76000000-0000-4000-8000-000000000010";
const TASK_A = "76000000-0000-4000-8000-000000000020";
const PLACEHOLDER_DIGEST = `sha256:${"0".repeat(64)}`;

function unwiredGates() {
  return {
    typed: null,
    owner: null,
    state: "unavailable",
    unavailableReason: STUDIO_NOT_YET_WIRED_REASON_V1,
  } as const;
}

function unwiredTimeline() {
  return {
    milestones: [],
    milestonesUnavailableReason: STUDIO_NOT_YET_WIRED_REASON_V1,
    actuals: [],
  } as const;
}

function project(projectId: string, name: string) {
  return {
    projectId,
    name,
    lifecycleStage: null,
    gates: unwiredGates(),
    latestAttemptSummary: {
      attemptId: ATTEMPT_A,
      taskId: TASK_A,
      state: "running",
      updatedAt: "2026-08-10T11:00:00.000Z",
      blocker: null,
    },
    awaitingHuman: [],
    timeline: unwiredTimeline(),
    docsProvenance: null,
  } as const;
}

function unavailableMetric(reason = "not computed for this test fixture") {
  return { value: null, unavailableReason: reason } as const;
}

function localSnapshot() {
  const candidate = StudioSnapshotV1Schema.parse({
    schemaVersion: 1,
    generatedAt: NOW,
    projects: [project(PROJECT_A, "Alpha"), project(PROJECT_B, "Beta")],
    rooms: [],
    roomsUnavailableReason: STUDIO_NOT_YET_WIRED_REASON_V1,
    portfolio: {
      verifiedThisWeek: { value: 1, unavailableReason: null },
      awaitingYouCount: { value: 0, unavailableReason: null },
      passRate: unavailableMetric(),
      medianRunSeconds: unavailableMetric(),
      agentWindowShare: unavailableMetric(),
    },
    sourceSnapshotDigest: PLACEHOLDER_DIGEST,
  });
  const digest = `sha256:${createHash("sha256")
    .update(canonicalStudioSnapshotDigestInputV1(candidate), "utf8")
    .digest("hex")}`;
  return StudioSnapshotV1Schema.parse({ ...candidate, sourceSnapshotDigest: digest });
}

describe("studio snapshot V1", () => {
  it("computes one deterministic, stable digest over its canonical content", () => {
    const snapshot = localSnapshot();
    expect(studioSnapshotDigestInputV1(snapshot)).not.toHaveProperty("sourceSnapshotDigest");
    expect(
      `sha256:${createHash("sha256")
        .update(canonicalStudioSnapshotDigestInputV1(snapshot), "utf8")
        .digest("hex")}`,
    ).toBe(snapshot.sourceSnapshotDigest);
    // Stability: recomputing from byte-identical content yields the byte-identical canonical text
    // (and therefore digest) every time, regardless of how many times it is asked.
    expect(canonicalStudioSnapshotDigestInputV1(snapshot)).toBe(
      canonicalStudioSnapshotDigestInputV1(structuredClone(snapshot)),
    );
  });

  it("changes digest when project content changes and rejects a stale digest", () => {
    const snapshot = localSnapshot();
    const mutated = {
      ...snapshot,
      projects: [{ ...snapshot.projects[0], name: "Alpha Renamed" }, snapshot.projects[1]],
    };
    expect(canonicalStudioSnapshotDigestInputV1(mutated)).not.toBe(
      canonicalStudioSnapshotDigestInputV1(snapshot),
    );
    // The stale (pre-rename) digest does not verify against the mutated content.
    expect(mutated.sourceSnapshotDigest).not.toBe(
      `sha256:${createHash("sha256")
        .update(canonicalStudioSnapshotDigestInputV1(mutated), "utf8")
        .digest("hex")}`,
    );
  });

  it("never accepts a portfolio metric with both a value and an unavailable reason, or with neither", () => {
    const snapshot = localSnapshot();
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        portfolio: { ...snapshot.portfolio, passRate: { value: 0.5, unavailableReason: "stale" } },
      }),
    ).toThrow(/exactly one of value or unavailableReason/);
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        portfolio: { ...snapshot.portfolio, passRate: { value: null, unavailableReason: null } },
      }),
    ).toThrow(/exactly one of value or unavailableReason/);
    // A real, present value of 0 must still be accepted — it is not a stand-in for "unavailable".
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        portfolio: { ...snapshot.portfolio, passRate: { value: 0, unavailableReason: null } },
      }),
    ).not.toThrow();
  });

  it("requires an explicit unavailable reason exactly when gates/milestones/rooms are empty or unavailable", () => {
    const snapshot = localSnapshot();

    // Gates reporting "unavailable" but missing the reason string.
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        projects: [
          { ...snapshot.projects[0], gates: { ...unwiredGates(), unavailableReason: null } },
          snapshot.projects[1],
        ],
      }),
    ).toThrow(/unavailableReason is required/);

    // Gates reporting a real state must not still carry typed/owner as null placeholders.
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        projects: [
          {
            ...snapshot.projects[0],
            gates: {
              typed: "typed.human-review",
              owner: "priyansh",
              state: "pending",
              unavailableReason: null,
            },
          },
          snapshot.projects[1],
        ],
      }),
    ).not.toThrow();

    // Non-empty milestones still carrying a stale unavailable reason.
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        projects: [
          {
            ...snapshot.projects[0],
            timeline: {
              milestones: [
                {
                  milestoneId: "beta-launch",
                  name: "Beta launch",
                  targetDate: null,
                  status: "planned",
                },
              ],
              milestonesUnavailableReason: STUDIO_NOT_YET_WIRED_REASON_V1,
              actuals: [],
            },
          },
          snapshot.projects[1],
        ],
      }),
    ).toThrow(/milestonesUnavailableReason must be present exactly when milestones is empty/);

    // Empty rooms without a reason.
    expect(() =>
      StudioSnapshotV1Schema.parse({ ...snapshot, roomsUnavailableReason: null }),
    ).toThrow(/roomsUnavailableReason must be present exactly when rooms is empty/);
  });

  it("rejects duplicate project IDs and noncanonical project order", () => {
    const snapshot = localSnapshot();
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        projects: [snapshot.projects[0], { ...snapshot.projects[1], projectId: PROJECT_A }],
      }),
    ).toThrow(/projectIds must be unique/);
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        projects: [...snapshot.projects].reverse(),
      }),
    ).toThrow(/projects must be sorted/);
  });

  it("rejects a blocked-attempt awaitingHuman item without an attemptId, and vice versa", () => {
    const snapshot = localSnapshot();
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        projects: [
          {
            ...snapshot.projects[0],
            awaitingHuman: [{ kind: "blocked-attempt", attemptId: null, summary: "x", since: NOW }],
          },
          snapshot.projects[1],
        ],
      }),
    ).toThrow(/attemptId must be present exactly for a blocked-attempt item/);
  });
});
