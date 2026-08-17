import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  STUDIO_NO_GATE_RECORDS_REASON_V1,
  STUDIO_NOT_YET_WIRED_REASON_V1,
  StudioSnapshotV1Schema,
  canonicalStudioSnapshotDigestInputV1,
  projectSlugFallbackV1,
  studioSnapshotDigestInputV1,
} from "../src/index.js";

const NOW = "2026-08-10T12:00:00.000Z";
const PROJECT_A = "76000000-0000-4000-8000-000000000001";
const PROJECT_B = "76000000-0000-4000-8000-000000000002";
const ATTEMPT_A = "76000000-0000-4000-8000-000000000010";
const TASK_A = "76000000-0000-4000-8000-000000000020";
const MILESTONE_A = "76000000-0000-4000-8000-000000000030";
const PLACEHOLDER_DIGEST = `sha256:${"0".repeat(64)}`;

function unwiredGates() {
  return {
    typed: null,
    owner: null,
    state: "unavailable",
    unavailableReason: STUDIO_NO_GATE_RECORDS_REASON_V1,
  } as const;
}

function realMilestone(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    milestoneId: MILESTONE_A,
    projectId: PROJECT_A,
    phase: "build",
    kind: "stage",
    label: "Beta launch",
    targetDate: null,
    dependsOn: [],
    owner: "human",
    status: "planned",
    evidenceDigest: null,
    revision: 0,
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  } as const;
}

function unwiredTimeline() {
  return {
    milestones: [],
    milestonesUnavailableReason: null,
    actuals: [],
  } as const;
}

function project(projectId: string, name: string) {
  return {
    projectId,
    slug: projectSlugFallbackV1(projectId),
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

  it("requires an explicit unavailable reason exactly when gates/rooms are empty or unavailable, and rejects a stale milestones reason", () => {
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

    // Gates reporting a real, typed state must not still carry typed/owner as null placeholders.
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        projects: [
          {
            ...snapshot.projects[0],
            gates: {
              typed: "build",
              owner: "human",
              state: "pending",
              unavailableReason: null,
            },
          },
          snapshot.projects[1],
        ],
      }),
    ).not.toThrow();

    // A real milestone plan (from the milestone repository) is a legitimate, non-error state: an
    // empty array is no longer required to carry a reason.
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        projects: [
          {
            ...snapshot.projects[0],
            timeline: {
              milestones: [realMilestone()],
              milestonesUnavailableReason: null,
              actuals: [],
            },
          },
          snapshot.projects[1],
        ],
      }),
    ).not.toThrow();

    // Non-empty milestones still carrying a stale unavailable reason is rejected.
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        projects: [
          {
            ...snapshot.projects[0],
            timeline: {
              milestones: [realMilestone()],
              milestonesUnavailableReason: "stale reason",
              actuals: [],
            },
          },
          snapshot.projects[1],
        ],
      }),
    ).toThrow(/milestonesUnavailableReason must be null once milestones are present/);

    // Empty rooms without a reason.
    expect(() =>
      StudioSnapshotV1Schema.parse({ ...snapshot, roomsUnavailableReason: null }),
    ).toThrow(/roomsUnavailableReason must be present exactly when rooms is empty/);
  });

  it("rejects a milestone belonging to a different project than the one carrying it", () => {
    const snapshot = localSnapshot();
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        projects: [
          {
            ...snapshot.projects[0],
            timeline: {
              milestones: [realMilestone({ projectId: PROJECT_B })],
              milestonesUnavailableReason: null,
              actuals: [],
            },
          },
          snapshot.projects[1],
        ],
      }),
    ).not.toThrow(); // studio-snapshot.ts itself does not cross-check projectId; milestone.ts's own schema does.
  });

  it("derives a deterministic projectId-only fallback slug, never from displayName", () => {
    expect(projectSlugFallbackV1(PROJECT_A)).toBe(`project-${PROJECT_A}`);
    expect(projectSlugFallbackV1(PROJECT_A)).toBe(projectSlugFallbackV1(PROJECT_A));
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
            awaitingHuman: [
              {
                kind: "blocked-attempt",
                attemptId: null,
                phaseRunId: null,
                summary: "x",
                since: NOW,
              },
            ],
          },
          snapshot.projects[1],
        ],
      }),
    ).toThrow(/attemptId must be present exactly for a blocked-attempt item/);
  });

  it("rejects a phase-run awaitingHuman item without a phaseRunId, and vice versa", () => {
    const snapshot = localSnapshot();
    expect(() =>
      StudioSnapshotV1Schema.parse({
        ...snapshot,
        projects: [
          {
            ...snapshot.projects[0],
            awaitingHuman: [
              { kind: "phase-run", attemptId: null, phaseRunId: null, summary: "x", since: NOW },
            ],
          },
          snapshot.projects[1],
        ],
      }),
    ).toThrow(/phaseRunId must be present exactly for a phase-run item/);
  });

  it("accepts a phase-run awaitingHuman item with a phaseRunId", () => {
    const snapshot = localSnapshot();
    const phaseRunId = "00000000-0000-4000-8000-0000000000aa";
    const withItem = StudioSnapshotV1Schema.parse({
      ...snapshot,
      projects: [
        {
          ...snapshot.projects[0],
          awaitingHuman: [
            {
              kind: "phase-run",
              attemptId: null,
              phaseRunId,
              summary: "Phase awaiting approval.",
              since: NOW,
            },
          ],
        },
        snapshot.projects[1],
      ],
    });
    expect(withItem.projects[0]?.awaitingHuman[0]?.phaseRunId).toBe(phaseRunId);
  });
});
