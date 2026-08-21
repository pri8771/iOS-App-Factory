// Regenerates studio-snapshot.response.json (+ .canonical.txt / .digest.txt) through the real,
// built `@app-factory/contracts` — the seam fixes in apps/studio-mac/docs/architecture/
// 0003-studio-phase2-service-integration.md decisions 4-6 (unified ProjectMilestoneV1, a real
// `slug`, typed gates), and — as of the `studio/repo-docs-truth` merge — the real, canonical
// `ProjectLifecycleStageV1` on `lifecycleStage` (ADR 0005) plus the new `docsProvenance` field:
// Anjali carries a populated provenance (an "enrolled" repo-docs source backing its
// `lifecycleStage`), Hindsight carries `null` (no repo-docs source configured for it), exercising
// both shapes `StudioProjectDocsProvenanceV1Schema.nullable()` allows. As of Wave 8 (Architecture
// decision 12), `rooms` also carries real, non-placeholder rows instead of the old always-empty
// `STUDIO_NOT_YET_WIRED_REASON_V1` claim — see `STUDIO_NO_ROOMS_REASON_V1`'s doc comment in
// studio-snapshot.ts for when that reason (not used by this fixture, which has real rooms) applies
// instead. Kept as its own script rather than folded into record-fixtures.mjs for historical
// reasons (record-fixtures.mjs's own "attempt-list.response.json" generation once threw on a
// schema-drift issue, fixed in f63336c; that is no longer a reason to keep these separate, but
// splitting them back out is not this change's job).
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  CommandResponseV1Schema,
  StudioSnapshotV1Schema,
  canonicalStudioSnapshotDigestInputV1,
  STUDIO_NO_GATE_RECORDS_REASON_V1,
} from "../../../packages/contracts/dist/index.js";

const rid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const projectAId = "0f7d3b2e-6c1a-4b7e-9d1f-2a3b4c5d6e7f";
const projectBId = "9c8b7a6f-5e4d-4c3b-8a19-0f1e2d3c4b5a";

// Byte-identical to the milestones project-milestones-list.response.json and
// project-milestone-upsert.response.json already carry for this same projectId — proving the
// dashboard's studio.snapshot timeline and the project-detail milestone panel now read the exact
// same durable ProjectMilestoneV1 model, not two independently-drifting shapes.
const anjaliMilestones = [
  {
    schemaVersion: 1,
    milestoneId: "70000001-0000-4000-8000-000000000001",
    projectId: projectAId,
    phase: "beta",
    kind: "gate",
    label: "Beta review",
    targetDate: "2026-08-20",
    dependsOn: [],
    owner: "human",
    status: "planned",
    evidenceDigest: null,
    revision: 0,
    createdAt: "2026-08-10T09:00:00.000Z",
    updatedAt: "2026-08-10T09:00:00.000Z",
  },
  {
    schemaVersion: 1,
    milestoneId: "70000002-0000-4000-8000-000000000002",
    projectId: projectAId,
    phase: "launch",
    kind: "release",
    label: "Store listing + sign-off",
    targetDate: "2026-09-05",
    dependsOn: ["70000001-0000-4000-8000-000000000001"],
    owner: "human",
    status: "planned",
    evidenceDigest: null,
    revision: 1,
    createdAt: "2026-08-10T09:05:00.000Z",
    updatedAt: "2026-08-15T10:00:00.000Z",
  },
];

const envelope = {
  schemaVersion: 1,
  generatedAt: "2026-08-16T22:00:00.000Z",
  projects: [
    {
      projectId: projectAId,
      // Matches portfolio-snapshot.response.json's curated "anjali" slug exactly, on a real
      // manifest-wired daemon — the fix for the slugify("Anjali — Journal") != "anjali" merge
      // gap ADR 0003 decision 5 documented.
      slug: "anjali",
      name: "Anjali — Journal",
      lifecycleStage: "building",
      gates: { typed: "legal", owner: "human", state: "blocked", unavailableReason: null },
      latestAttemptSummary: {
        attemptId: "00000001-0000-4000-8000-000000000001",
        taskId: "10000001-0000-4000-8000-000000000001",
        state: "succeeded",
        updatedAt: "2026-08-16T11:05:00.000Z",
        blocker: null,
      },
      // StudioAwaitingHumanItemV1.phaseRunId (since 6d6a0fd): required (nullable), present exactly
      // for a "phase-run" item. One "blocked-attempt" row (phaseRunId null) and one "phase-run" row
      // (phaseRunId set) so the Swift decoder sees both branches.
      awaitingHuman: [
        {
          kind: "blocked-attempt",
          attemptId: "00000004-0000-4000-8000-000000000004",
          phaseRunId: null,
          summary: "Waiting for approval to upload build 4 to TestFlight.",
          since: "2026-08-16T14:05:00.000Z",
        },
        {
          kind: "phase-run",
          attemptId: null,
          phaseRunId: "80000001-0000-4000-8000-000000000001",
          summary: 'Phase "beta-review" is awaiting your approval.',
          since: "2026-08-16T15:00:00.000Z",
        },
      ],
      timeline: {
        milestones: anjaliMilestones,
        milestonesUnavailableReason: null,
        actuals: [
          {
            attemptId: "00000001-0000-4000-8000-000000000001",
            label: "attempt started",
            occurredAt: "2026-08-16T11:00:00.000Z",
          },
          {
            attemptId: "00000001-0000-4000-8000-000000000001",
            label: "attempt succeeded",
            occurredAt: "2026-08-16T11:05:00.000Z",
          },
        ],
      },
      docsProvenance: {
        sourceKind: "enrolled",
        repositoryRoot: "/Users/example/code/anjali",
        docsSnapshotDigest: `sha256:${"a".repeat(64)}`,
        lifecycleStageSource: "repo-docs",
        awaitingHumanFromDocsCount: 0,
      },
    },
    {
      projectId: projectBId,
      slug: "hindsight",
      name: "Hindsight",
      lifecycleStage: null,
      gates: {
        typed: null,
        owner: null,
        state: "unavailable",
        unavailableReason: STUDIO_NO_GATE_RECORDS_REASON_V1,
      },
      latestAttemptSummary: null,
      awaitingHuman: [],
      // A real, non-error empty state: Hindsight has no authored milestones yet.
      timeline: { milestones: [], milestonesUnavailableReason: null, actuals: [] },
      // No repo-docs source is configured for Hindsight — an honest `null`, not a fabricated
      // provenance record.
      docsProvenance: null,
    },
  ],
  // Rooms are now real (Architecture decision 12, `buildStudioRoomsV1`): one row bound to Anjali's
  // projectId ("project" kind), one unbound ("portfolio" kind) — exercising both `StudioRoom.Kind`
  // branches through the real, non-placeholder projection.
  rooms: [
    {
      roomId: "50000001-0000-4000-8000-000000000001",
      name: "Studio launch review",
      kind: "portfolio",
    },
    { roomId: "50000003-0000-4000-8000-000000000003", name: "Anjali build room", kind: "project" },
  ],
  roomsUnavailableReason: null,
  portfolio: {
    verifiedThisWeek: { value: 2, unavailableReason: null },
    awaitingYouCount: { value: 1, unavailableReason: null },
    passRate: { value: 0.8, unavailableReason: null },
    medianRunSeconds: { value: 185.5, unavailableReason: null },
    agentWindowShare: {
      value: null,
      unavailableReason:
        "not yet computed: step-level timing is not aggregated into an agent-active-window ratio",
    },
  },
};

const canonical = canonicalStudioSnapshotDigestInputV1(envelope);
const digest = `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
const snapshot = StudioSnapshotV1Schema.parse({ ...envelope, sourceSnapshotDigest: digest });
const response = CommandResponseV1Schema.parse({
  protocolVersion: 1,
  requestId: rid,
  ok: true,
  result: { operation: "studio.snapshot", snapshot },
});

const dir = new URL("../Tests/StudioKitTests/Fixtures/", import.meta.url).pathname;
writeFileSync(dir + "studio-snapshot.response.json", JSON.stringify(response, null, 2) + "\n");
writeFileSync(dir + "studio-snapshot.canonical.txt", canonical);
writeFileSync(dir + "studio-snapshot.digest.txt", digest + "\n");
console.log("studio.snapshot digest", digest);
