import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  PortfolioReadModelV1Schema,
  canonicalPortfolioReadModelDigestInputV1,
  CommandResponseV1Schema,
} from "../../../packages/contracts/dist/index.js";

const projectA = {
  projectId: "0f7d3b2e-6c1a-4b7e-9d1f-2a3b4c5d6e7f",
  slug: "anjali",
  displayName: "Anjali — Journal",
  metadataSource: "task-derived",
  lifecycleStage: "building",
  attemptCount: 7,
  activeAttemptCount: 2,
  blockerCount: 1,
  lastActivityAt: "2026-08-16T20:15:04.512Z",
  lastDeliveryAt: "2026-08-15T09:00:00.000Z",
  openPullRequestCount: 3,
  jiraTodoCount: 12,
  jiraInProgressCount: 4,
  unresolvedP0: 0,
  unresolvedP1: 2,
  releaseStage: "internal-testflight",
  analyticsFreshness: "stale",
  sources: {
    localExecution: "available",
    jira: "available",
    github: "available",
    quality: "available",
    release: "available",
    analytics: "available",
  },
  health: "blocked",
  healthReasons: ["delivery-blocker", "unresolved-p1", "analytics-stale"],
};

const projectB = {
  projectId: "9c8b7a6f-5e4d-4c3b-8a19-0f1e2d3c4b5a",
  slug: "hindsight",
  displayName: "Hindsight",
  metadataSource: "task-derived",
  lifecycleStage: null,
  attemptCount: 3,
  activeAttemptCount: 0,
  blockerCount: 0,
  lastActivityAt: "2026-08-16T18:30:00.000Z",
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
  health: "unknown",
  healthReasons: [
    "jira-unavailable",
    "github-unavailable",
    "quality-unavailable",
    "release-unavailable",
    "analytics-unavailable",
  ],
};

const projectC = {
  projectId: "1a2b3c4d-5e6f-4a7b-9c8d-0e1f2a3b4c5d",
  slug: "svara",
  displayName: "Svara \"Sound\" — ünïcödé / slash \\ backslash \t tab",
  metadataSource: "task-derived",
  lifecycleStage: "released",
  attemptCount: 0,
  activeAttemptCount: 0,
  blockerCount: 0,
  lastActivityAt: null,
  lastDeliveryAt: null,
  openPullRequestCount: 0,
  jiraTodoCount: 0,
  jiraInProgressCount: 0,
  unresolvedP0: 0,
  unresolvedP1: 0,
  releaseStage: "released",
  analyticsFreshness: "fresh",
  sources: {
    localExecution: "available",
    jira: "available",
    github: "available",
    quality: "available",
    release: "available",
    analytics: "available",
  },
  health: "healthy",
  healthReasons: [],
};

const projects = [projectA, projectB, projectC];
const totals = {
  projects: 3,
  attempts: 10,
  activeAttempts: 2,
  blockers: 1,
  openPullRequests: null,
  jiraTodo: null,
  jiraInProgress: null,
  unresolvedP0: null,
  unresolvedP1: null,
};
const digestInput = { schemaVersion: 1, generatedAt: "2026-08-16T21:00:00.000Z", projects, totals };
const canonical = canonicalPortfolioReadModelDigestInputV1(digestInput);
const digest = `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
const snapshot = { ...digestInput, sourceSnapshotDigest: digest };
const parsed = PortfolioReadModelV1Schema.parse(snapshot);
const response = CommandResponseV1Schema.parse({
  protocolVersion: 1,
  requestId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  ok: true,
  result: { operation: "portfolio.snapshot", snapshot: parsed },
});
const dir = new URL("../Tests/StudioKitTests/Fixtures/", import.meta.url).pathname;
// Deliberately non-canonical key order and pretty printing in the recorded wire fixture.
writeFileSync(dir + "portfolio-snapshot.response.json", JSON.stringify(response, null, 2) + "\n");
writeFileSync(dir + "portfolio-snapshot.canonical.txt", canonical);
writeFileSync(dir + "portfolio-snapshot.digest.txt", digest + "\n");

// localeCompare ordering fixture
const keys = ["schemaVersion","generatedAt","projects","totals","projectId","slug","displayName","metadataSource","lifecycleStage","attemptCount","activeAttemptCount","blockerCount","lastActivityAt","lastDeliveryAt","openPullRequestCount","jiraTodoCount","jiraInProgressCount","unresolvedP0","unresolvedP1","releaseStage","analyticsFreshness","sources","health","healthReasons","localExecution","jira","github","quality","release","analytics","attempts","activeAttempts","blockers","openPullRequests","jiraTodo","jiraInProgress","a","A","b","B","aB","Ab","ab","AB","a1","a10","a2","Z","z","zz","Zz","zZ","ZZ","item","Item","ITEM","x9","x10","x1"];
const sorted = [...keys].sort((l, r) => l.localeCompare(r));
writeFileSync(dir + "locale-compare-order.json", JSON.stringify(sorted) + "\n");

// number formatting fixture
// Two literals are deliberately beyond 2^53 (parsed from strings so eslint's no-loss-of-precision stays
// happy): they pin that the Swift side reproduces JavaScript's rounding, not the exact integer.
const numbers = [0, -0, 1, -1, 3, 42, 100, 1e21, 1e20, 123456789012345680000, 0.1, 0.5, 1.5, -2.25, 1e-7, 1e-6, 0.000001234, 1.7976931348623157e308, 5e-324, 9007199254740991, 9007199254740992, Number("9007199254740993"), 1234.5678, 1e300, Number("12345678901234567890"), 0.30000000000000004];
writeFileSync(dir + "number-format.json", JSON.stringify(numbers.map((n) => [String(n), JSON.stringify(n)])) + "\n");
console.log(digest);
console.log(canonical.length);

// ---- Additional authoritative response fixtures (validated with CommandResponseV1Schema) ----
const rid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ok = (result) => CommandResponseV1Schema.parse({ protocolVersion: 1, requestId: rid, ok: true, result });
const attempt = (n, state, extra = {}) => ({
  schemaVersion: 1,
  attemptId: `0000000${n}-0000-4000-8000-00000000000${n}`,
  taskId: `1000000${n}-0000-4000-8000-00000000000${n}`,
  taskSpecDigest: `sha256:${"ab".repeat(32)}`,
  attemptNumber: 1,
  state,
  desiredState: state === "cancelled" ? "cancelled" : "running",
  revision: 4,
  fence: 2,
  currentStepId: null,
  blocker: null,
  outcome: state === "succeeded" ? { kind: "succeeded" } : null,
  createdAt: `2026-08-16T1${n}:00:00.000Z`,
  updatedAt: `2026-08-16T1${n}:05:00.000Z`,
  terminalAt: state === "succeeded" ? `2026-08-16T1${n}:05:00.000Z` : null,
  ...extra,
});
const fixtures = {
  "doctor.response.json": ok({
    operation: "doctor",
    readiness: "ready",
    daemonVersion: "0.1.0-ui-demo",
    protocolVersion: 1,
    startedAt: "2026-08-16T16:00:00.000Z",
    issues: [],
  }),
  "attempt-list.response.json": ok({
    operation: "attempt.list",
    page: {
      attempts: [3, 2, 1].map((n) => ({
        schemaVersion: 1,
        projectId: "0f7d3b2e-6c1a-4b7e-9d1f-2a3b4c5d6e7f",
        title: `Demo attempt ${n}`,
        attempt: attempt(n, "succeeded"),
      })),
      nextAfter: null,
      hasMore: false,
    },
  }),
  "attempt-status.response.json": ok({
    operation: "attempt.status",
    attempt: attempt(4, "blocked", {
      currentStepId: "20000004-0000-4000-8000-000000000004",
      blocker: {
        kind: "approval",
        code: "gate.testflight-upload",
        summary: "Waiting for approval to upload build 4 to TestFlight.",
        requiredAction: "Approve or decline in Studio.",
      },
    }),
  }),
  "attempt-events.response.json": ok({
    operation: "attempt.events",
    events: [
      {
        schemaVersion: 1,
        eventId: "30000001-0000-4000-8000-000000000001",
        attemptId: "00000001-0000-4000-8000-000000000001",
        sequence: 1,
        occurredAt: "2026-08-16T11:00:00.000Z",
        commandId: "40000001-0000-4000-8000-000000000001",
        causationEventId: null,
        fence: 0,
        type: "attempt.created",
        data: { taskId: "10000001-0000-4000-8000-000000000001", taskSpecDigest: `sha256:${"ab".repeat(32)}` },
      },
      {
        schemaVersion: 1,
        eventId: "30000001-0000-4000-8000-000000000002",
        attemptId: "00000001-0000-4000-8000-000000000001",
        sequence: 2,
        occurredAt: "2026-08-16T11:00:01.000Z",
        commandId: null,
        causationEventId: "30000001-0000-4000-8000-000000000001",
        fence: 1,
        type: "attempt.state-changed",
        data: { from: "queued", to: "running", blocker: null, outcome: null },
      },
      {
        schemaVersion: 1,
        eventId: "30000001-0000-4000-8000-000000000003",
        attemptId: "00000001-0000-4000-8000-000000000001",
        sequence: 3,
        occurredAt: "2026-08-16T11:00:02.000Z",
        commandId: null,
        causationEventId: null,
        fence: 1,
        type: "step.state-changed",
        data: {
          stepId: "20000001-0000-4000-8000-000000000001",
          from: "running",
          to: "failed",
          outputDigest: null,
          failureCode: "verify.tests-failed",
        },
      },
      {
        schemaVersion: 1,
        eventId: "30000001-0000-4000-8000-000000000004",
        attemptId: "00000001-0000-4000-8000-000000000001",
        sequence: 4,
        occurredAt: "2026-08-16T11:00:03.000Z",
        commandId: null,
        causationEventId: null,
        fence: 1,
        type: "commit.recorded",
        data: { commit: "a".repeat(40), tree: "b".repeat(40), attemptMarker: "app-factory:v1:attempt:1" },
      },
    ],
    nextAfterSequence: 4,
  }),
  "evidence-list.response.json": ok({
    operation: "evidence.list",
    manifests: [
      {
        attemptId: "00000001-0000-4000-8000-000000000001",
        createdAt: "2026-08-16T11:05:00.000Z",
        manifestDigest: `sha256:${"cd".repeat(32)}`,
        subject: {
          taskSpecDigest: `sha256:${"ab".repeat(32)}`,
          policyDigest: `sha256:${"ef".repeat(32)}`,
          baseCommit: "a".repeat(40),
          candidateTree: null,
          fence: 2,
        },
        entryCount: 4,
        requiredKinds: ["agent-run", "verification", "event-log"],
      },
    ],
    nextAfterAttemptId: null,
    hasMore: false,
  }),
  "project-scan.response.json": ok({
    operation: "project.scan",
    repositoryRoot: "/Users/example/code/hindsight",
    planDigest: `sha256:${"12".repeat(32)}`,
    sourceFingerprint: `sha256:${"34".repeat(32)}`,
    inventoryDigest: `sha256:${"56".repeat(32)}`,
    blocked: true,
    blockers: [
      { issueId: `esi-${"a1".repeat(12)}`, code: "enroll.secret-material", summary: "A .env file with credentials is tracked." },
    ],
  }),
  "failure.response.json": CommandResponseV1Schema.parse({
    protocolVersion: 1,
    requestId: rid,
    ok: false,
    error: { code: "daemon.handler-timeout-ambiguous", message: "Command completion is unknown after timeout; retry with the same command ID.", retryable: true },
  }),
};
for (const [name, value] of Object.entries(fixtures)) {
  writeFileSync(dir + name, JSON.stringify(value) + "\n");
}
console.log("wrote", Object.keys(fixtures).length, "extra fixtures");
