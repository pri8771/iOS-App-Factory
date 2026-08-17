// Regenerates the Studio Phase 4 fixtures (preset.*/phase.*/plan.*/project.seed, plus the two
// propose-plan/execute-plan assistant-intent fixtures) through the real, built `@app-factory/contracts`
// — same "record through the real contracts, never hand-author" discipline as
// `record-fixtures.mjs`/`record-studio-snapshot-fixture.mjs`. This worktree's `packages/contracts`
// already has `phase.ts`/`phase-run.ts`/`project-plan.ts` merged (studio/phase-runner and
// studio/planner both landed on `integration/studio-wave1`), so — unlike those two scripts — this one
// imports the CURRENT worktree's own build, not another branch's.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  CommandResponseV1Schema,
  PhasePresetV1Schema,
  PhaseDefinitionV1Schema,
  PhaseRunV1Schema,
  PhaseRunListPageV1Schema,
  ProjectPlanV1Schema,
  canonicalProjectPlanDigestInputV1,
  ProjectSeedCommandResultV1Schema,
  AssistantIntentV1Schema,
} from "../../../packages/contracts/dist/index.js";

const rid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ok = (result) =>
  CommandResponseV1Schema.parse({ protocolVersion: 1, requestId: rid, ok: true, result });
const dir = new URL("../Tests/StudioKitTests/Fixtures/", import.meta.url).pathname;
const T = "2026-08-16T22:00:00.000Z";
const sha = (byte) => `sha256:${byte.repeat(32)}`;
const uuid = (n) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---------------------------------------------------------------------------
// Phase definitions + the seeded preset — a faithful subset of the real
// `ios-app-standard-0.4.0` seed in apps/daemon/src/phase-command-runtime.ts (solo, debate-with-grader,
// chat-gate, and panel modes; standard + yours rules; typed gates; budgets with and without an
// estimate), not the full 10-phase seed.
// ---------------------------------------------------------------------------

function phase(overrides) {
  return PhaseDefinitionV1Schema.parse({
    schemaVersion: 1,
    mode: "panel",
    cast: {
      participants: [
        { provider: "codex", persona: `${overrides.phaseId}-lead`, readOnly: true },
        { provider: "claude", persona: `${overrides.phaseId}-reviewer`, readOnly: true },
      ],
      coordinator: null,
      grader: null,
    },
    inputs: ["docs"],
    rules: { standard: [], yours: [], requiredOutput: [], acceptanceChecks: [] },
    outputs: [],
    gates: [],
    budget: { estimateMinutes: 30, timeoutSeconds: 2_700 },
    revision: 0,
    createdAt: T,
    updatedAt: T,
    ...overrides,
  });
}

const contractPhase = phase({
  phaseId: "contract",
  name: "Contract",
  purpose: "Define the user outcome, MVP boundary, constraints, and Definition of Done.",
  mode: "solo",
  cast: {
    participants: [{ provider: "claude", persona: "contract-writer", readOnly: true }],
    coordinator: null,
    grader: null,
  },
  inputs: ["docs", "issues"],
  rules: {
    standard: ["rule.new.scope-before-breadth"],
    yours: ["Keep the MVP boundary to a single core loop."],
    requiredOutput: ["State the user outcome, MVP boundary, and Definition of Done."],
    acceptanceChecks: ["Contract names a concrete user outcome and explicit MVP boundary."],
  },
  outputs: [{ path: "docs/product/contract.md", schema: null }],
  budget: { estimateMinutes: 20, timeoutSeconds: 1_800 },
});

const architecturePhase = phase({
  phaseId: "architecture",
  name: "Architecture",
  purpose: "Decide the technical approach; a distinct grader breaks ties between proposals.",
  mode: "debate",
  cast: {
    participants: [
      { provider: "codex", persona: "architecture-proposer-a", readOnly: true },
      { provider: "cursor", persona: "architecture-proposer-b", readOnly: true },
    ],
    coordinator: null,
    grader: { provider: "claude", persona: "architecture-grader" },
  },
  inputs: ["docs", "source-readonly", "evidence"],
  rules: {
    standard: ["rule.existing.no-rescaffold-without-decision", "rule.dependencies.justified"],
    yours: [],
    requiredOutput: [],
    acceptanceChecks: [],
  },
  outputs: [{ path: "docs/architecture/decision.md", schema: null }],
  budget: { estimateMinutes: 45, timeoutSeconds: 3_600 },
});

const buildPhase = phase({
  phaseId: "build",
  name: "Build",
  purpose: "Implement the planned change and its required non-happy-path coverage.",
  inputs: ["docs", "source-readonly", "issues"],
  rules: {
    standard: [
      "rule.dod.verification",
      "rule.data.no-fake-fallback",
      "rule.ui.no-decorative-controls",
    ],
    yours: [],
    requiredOutput: [],
    acceptanceChecks: [],
  },
  outputs: [{ path: "docs/progress/build-notes.md", schema: null }],
  budget: { estimateMinutes: 60, timeoutSeconds: 7_200 },
});

const readyPhase = phase({
  phaseId: "ready",
  name: "Ready",
  purpose: "Human gate: confirm the plan and design are ready before implementation begins.",
  mode: "chat",
  cast: { participants: [], coordinator: null, grader: null },
  inputs: ["docs", "evidence"],
  rules: {
    standard: ["rule.dod.verification", "rule.dod.experience-coverage"],
    yours: [],
    requiredOutput: [],
    acceptanceChecks: [],
  },
  outputs: [],
  gates: ["build", "tests"],
  budget: { estimateMinutes: null, timeoutSeconds: 900 },
});

const seedPreset = PhasePresetV1Schema.parse({
  schemaVersion: 1,
  presetId: "ios-app-standard-0.4.0",
  name: "iOS App Standard 0.4.0",
  phases: [contractPhase, architecturePhase, readyPhase, buildPhase],
  appliesTo: ["ios"],
  revision: 0,
  createdAt: T,
  updatedAt: T,
});

writeFileSync(
  dir + "preset-list.response.json",
  JSON.stringify(ok({ operation: "preset.list", presets: [seedPreset] }), null, 2) + "\n",
);
writeFileSync(
  dir + "phase-upsert.response.json",
  JSON.stringify(ok({ operation: "phase.upsert", phase: buildPhase, created: false }), null, 2) +
    "\n",
);

// ---------------------------------------------------------------------------
// Phase Runner
// ---------------------------------------------------------------------------

const projectId = "0f7d3b2e-6c1a-4b7e-9d1f-2a3b4c5d6e7f";

const awaitingRun = PhaseRunV1Schema.parse({
  schemaVersion: 1,
  phaseRunId: uuid(101),
  presetId: "ios-app-standard-0.4.0",
  phaseId: "ready",
  projectId,
  phaseSnapshotDigest: sha("11"),
  phaseSnapshot: readyPhase,
  state: "awaiting-human",
  revision: 3,
  roomId: null,
  outputs: [],
  graderVerdict: null,
  tokenUsage: { totalTokens: 4_200 },
  outcome: null,
  createdAt: "2026-08-16T20:00:00.000Z",
  startedAt: "2026-08-16T20:00:05.000Z",
  finishedAt: null,
  updatedAt: "2026-08-16T20:04:00.000Z",
});

const succeededRun = PhaseRunV1Schema.parse({
  schemaVersion: 1,
  phaseRunId: uuid(102),
  presetId: "ios-app-standard-0.4.0",
  phaseId: "architecture",
  projectId,
  phaseSnapshotDigest: sha("22"),
  phaseSnapshot: architecturePhase,
  state: "succeeded",
  revision: 6,
  roomId: null,
  outputs: [
    {
      path: "docs/architecture/decision.md",
      digest: sha("33"),
      evidence: {
        commit: "a".repeat(40),
        tree: "b".repeat(40),
        branch: "factory/phase/architecture/run-2",
      },
    },
  ],
  graderVerdict: {
    verdict: "pass",
    findings: ["Proposal A chosen: fits the existing module boundary."],
  },
  tokenUsage: { totalTokens: 18_400 },
  outcome: { kind: "succeeded" },
  createdAt: "2026-08-16T18:00:00.000Z",
  startedAt: "2026-08-16T18:00:05.000Z",
  finishedAt: "2026-08-16T18:41:00.000Z",
  updatedAt: "2026-08-16T18:41:00.000Z",
});

const queuedRun = PhaseRunV1Schema.parse({
  schemaVersion: 1,
  phaseRunId: uuid(103),
  presetId: "ios-app-standard-0.4.0",
  phaseId: "build",
  projectId,
  phaseSnapshotDigest: sha("44"),
  phaseSnapshot: buildPhase,
  state: "queued",
  revision: 0,
  roomId: null,
  outputs: [],
  graderVerdict: null,
  tokenUsage: { totalTokens: 0 },
  outcome: null,
  createdAt: T,
  startedAt: null,
  finishedAt: null,
  updatedAt: T,
});

writeFileSync(
  dir + "phase-run.response.json",
  JSON.stringify(ok({ operation: "phase.run", run: queuedRun }), null, 2) + "\n",
);
writeFileSync(
  dir + "phase-status.response.json",
  JSON.stringify(ok({ operation: "phase.status", run: awaitingRun }), null, 2) + "\n",
);
writeFileSync(
  dir + "phase-list.response.json",
  JSON.stringify(
    ok({
      operation: "phase.list",
      page: PhaseRunListPageV1Schema.parse({
        runs: [awaitingRun, succeededRun],
        nextAfter: null,
        hasMore: false,
      }),
    }),
    null,
    2,
  ) + "\n",
);

const approvedRun = {
  ...awaitingRun,
  state: "running",
  revision: 4,
  updatedAt: "2026-08-16T20:10:00.000Z",
};
writeFileSync(
  dir + "phase-approve.response.json",
  JSON.stringify(
    ok({ operation: "phase.approve", run: PhaseRunV1Schema.parse(approvedRun) }),
    null,
    2,
  ) + "\n",
);
const rejectedRun = {
  ...awaitingRun,
  state: "failed",
  revision: 4,
  outcome: {
    kind: "failed",
    code: "rejected",
    summary: "Declined: needs a legal review pass first.",
  },
  finishedAt: "2026-08-16T20:10:00.000Z",
  updatedAt: "2026-08-16T20:10:00.000Z",
};
writeFileSync(
  dir + "phase-reject.response.json",
  JSON.stringify(
    ok({ operation: "phase.reject", run: PhaseRunV1Schema.parse(rejectedRun) }),
    null,
    2,
  ) + "\n",
);

// ---------------------------------------------------------------------------
// The Planner
// ---------------------------------------------------------------------------

function planItem(kind, overrides) {
  const base = { detail: null, dependsOn: [] };
  return { kind, ...base, ...overrides };
}

function stampPlan(fields) {
  const draftInput = {
    schemaVersion: 1,
    planId: fields.planId,
    projectId: fields.projectId ?? null,
    repositoryId: fields.repositoryId ?? null,
    brief: fields.brief,
    presetId: "ios-app-standard-0.4.0",
    items: fields.items,
    state: fields.state,
    revision: fields.revision,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt,
  };
  const canonical = canonicalProjectPlanDigestInputV1(draftInput);
  const digest = `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
  return ProjectPlanV1Schema.parse({ ...draftInput, digest });
}

const planId = uuid(201);
const brief = {
  title: "Workout Tracker",
  oneLiner: "A minimal iOS app for logging sets and rest timers.",
  constraints: ["local-only", "xcodegen"],
};

const taskSpecDraft = (phaseKey, objective) => ({
  objective,
  acceptanceCriteria: [
    { id: "correctness", statement: "Behaves as described.", verification: "review" },
  ],
  scope: { paths: ["Sources"] },
  phase: phaseKey,
});

const proposedPlan = stampPlan({
  planId,
  brief,
  state: "draft",
  revision: 0,
  createdAt: T,
  updatedAt: T,
  items: [
    planItem("task", {
      itemId: "contract",
      phase: "contract",
      title: "Contract",
      taskSpecDraft: taskSpecDraft("contract", "Write the contract doc."),
      status: "proposed",
      taskId: null,
      attemptId: null,
    }),
    planItem("task", {
      itemId: "architecture",
      phase: "architecture",
      title: "Architecture",
      dependsOn: ["contract"],
      taskSpecDraft: taskSpecDraft("architecture", "Decide the technical approach."),
      status: "proposed",
      taskId: null,
      attemptId: null,
    }),
    planItem("gate", {
      itemId: "ready",
      phase: "ready",
      title: "Ready",
      dependsOn: ["architecture"],
      gate: { owner: "human", reason: "Confirm plan and design before implementation begins." },
      status: "proposed",
    }),
    planItem("task", {
      itemId: "build",
      phase: "build",
      title: "Build",
      dependsOn: ["ready"],
      taskSpecDraft: taskSpecDraft("build", "Implement the planned change."),
      status: "proposed",
      taskId: null,
      attemptId: null,
    }),
  ],
});
writeFileSync(
  dir + "plan-propose.response.json",
  JSON.stringify(ok({ operation: "plan.propose", plan: proposedPlan }), null, 2) + "\n",
);

const repositoryId = "a1b2c3d4-5e6f-4a7b-9c8d-0e1f2a3b4c5d";
const executingItems = [
  planItem("task", {
    itemId: "contract",
    phase: "contract",
    title: "Contract",
    taskSpecDraft: taskSpecDraft("contract", "Write the contract doc."),
    status: "done",
    taskId: uuid(311),
    attemptId: uuid(411),
  }),
  planItem("task", {
    itemId: "architecture",
    phase: "architecture",
    title: "Architecture",
    dependsOn: ["contract"],
    taskSpecDraft: taskSpecDraft("architecture", "Decide the technical approach."),
    status: "running",
    taskId: uuid(312),
    attemptId: uuid(412),
  }),
  planItem("gate", {
    itemId: "ready",
    phase: "ready",
    title: "Ready",
    dependsOn: ["architecture"],
    gate: { owner: "human", reason: "Confirm plan and design before implementation begins." },
    status: "proposed",
  }),
  planItem("task", {
    itemId: "build",
    phase: "build",
    title: "Build",
    dependsOn: ["ready"],
    taskSpecDraft: taskSpecDraft("build", "Implement the planned change."),
    status: "proposed",
    taskId: null,
    attemptId: null,
  }),
  planItem("task", {
    itemId: "review",
    phase: "review",
    title: "Review",
    dependsOn: ["build"],
    detail: "Deferred until after the beta.",
    taskSpecDraft: taskSpecDraft("review", "Independently review the build."),
    status: "deferred",
    taskId: null,
    attemptId: null,
  }),
];
const executingPlan = stampPlan({
  planId,
  projectId,
  repositoryId,
  brief,
  state: "executing",
  revision: 4,
  createdAt: T,
  updatedAt: "2026-08-16T22:40:00.000Z",
  items: executingItems,
});
writeFileSync(
  dir + "plan-status.response.json",
  JSON.stringify(ok({ operation: "plan.status", plan: executingPlan }), null, 2) + "\n",
);

const editedPlan = stampPlan({
  planId,
  brief,
  state: "draft",
  revision: 1,
  createdAt: T,
  updatedAt: "2026-08-16T22:05:00.000Z",
  items: [
    proposedPlan.items[0],
    proposedPlan.items[1],
    proposedPlan.items[2],
    { ...proposedPlan.items[3], status: "deferred" },
  ],
});
writeFileSync(
  dir + "plan-edit.response.json",
  JSON.stringify(ok({ operation: "plan.edit", plan: editedPlan }), null, 2) + "\n",
);

const approvedPlan = stampPlan({
  planId,
  brief,
  state: "approved",
  revision: 2,
  createdAt: T,
  updatedAt: "2026-08-16T22:06:00.000Z",
  items: proposedPlan.items,
});
writeFileSync(
  dir + "plan-approve.response.json",
  JSON.stringify(ok({ operation: "plan.approve", plan: approvedPlan }), null, 2) + "\n",
);

const executeItems = [
  { ...proposedPlan.items[0], status: "running", taskId: uuid(311), attemptId: uuid(411) },
  proposedPlan.items[1],
  proposedPlan.items[2],
  proposedPlan.items[3],
];
const executedPlan = stampPlan({
  planId,
  projectId,
  repositoryId,
  brief,
  state: "executing",
  revision: 3,
  createdAt: T,
  updatedAt: "2026-08-16T22:10:00.000Z",
  items: executeItems,
});
writeFileSync(
  dir + "plan-execute.response.json",
  JSON.stringify(ok({ operation: "plan.execute", plan: executedPlan }), null, 2) + "\n",
);

const gateApprovedItems = executingItems.map((item) =>
  item.itemId === "ready" ? { ...item, status: "approved" } : item,
);
const gateApprovedPlan = stampPlan({
  planId,
  projectId,
  repositoryId,
  brief,
  state: "executing",
  revision: 5,
  createdAt: T,
  updatedAt: "2026-08-16T22:45:00.000Z",
  items: gateApprovedItems,
});
writeFileSync(
  dir + "plan-approve-gate.response.json",
  JSON.stringify(ok({ operation: "plan.approve-gate", plan: gateApprovedPlan }), null, 2) + "\n",
);

const tickedItems = gateApprovedItems.map((item) =>
  item.itemId === "build"
    ? { ...item, status: "running", taskId: uuid(313), attemptId: uuid(413) }
    : item,
);
const tickedPlan = stampPlan({
  planId,
  projectId,
  repositoryId,
  brief,
  state: "executing",
  revision: 6,
  createdAt: T,
  updatedAt: "2026-08-16T22:50:00.000Z",
  items: tickedItems,
});
writeFileSync(
  dir + "plan-tick.response.json",
  JSON.stringify(ok({ operation: "plan.tick", plan: tickedPlan, advanced: true }), null, 2) + "\n",
);

// ---------------------------------------------------------------------------
// project.seed
// ---------------------------------------------------------------------------

// Registration is minted at project.seed time now: repositoryId always equals projectId for a
// freshly registered project (project-registry-command-runtime.ts's own minting convention).
const seededProjectId = uuid(199);
const seedResult = ProjectSeedCommandResultV1Schema.parse({
  operation: "project.seed",
  repositoryRoot: "/Users/example/code/workout-tracker",
  scaffoldCommitSha: "c".repeat(40),
  planDigest: sha("55"),
  enrollment: {
    branchName: "factory/enroll/workout-tracker",
    commitSha: "d".repeat(40),
    appliedActionKinds: [
      "declare-project",
      "create-xcode-container",
      "add-test-target",
      "add-ci-verification",
    ],
    convergence: {
      blocked: false,
      blockerIssueIds: [],
      openIssueCount: 0,
      sourceFingerprint: sha("66"),
    },
  },
  xcodegen: {
    available: true,
    generated: true,
    built: true,
    detail: "xcodegen generate succeeded; xcodebuild build succeeded.",
  },
  registered: true,
  projectId: seededProjectId,
  repositoryId: seededProjectId,
  slug: "workout-tracker",
});
writeFileSync(dir + "project-seed.response.json", JSON.stringify(ok(seedResult), null, 2) + "\n");

// ---------------------------------------------------------------------------
// Assistant intents: propose-plan / execute-plan
// ---------------------------------------------------------------------------

const proposePlanIntent = AssistantIntentV1Schema.parse({
  schemaVersion: 1,
  intentId: uuid(521),
  utterance: `propose ${brief.title}`,
  payload: {
    kind: "propose-plan",
    brief,
    presetId: "ios-app-standard-0.4.0",
    projectId: null,
    repositoryId: null,
  },
  summary: `Propose a plan "${brief.title}" using preset ios-app-standard-0.4.0.`,
  requiresConfirmation: true,
  proposedAt: T,
});
writeFileSync(
  dir + "assistant-intent-propose-plan.response.json",
  JSON.stringify(
    ok({ operation: "studio.assistant.intent.propose", intent: proposePlanIntent }),
    null,
    2,
  ) + "\n",
);

writeFileSync(
  dir + "assistant-intent-execute-plan.response.json",
  JSON.stringify(
    ok({
      operation: "studio.assistant.intent.execute",
      intentId: proposePlanIntent.intentId,
      outcome: { kind: "plan.propose", result: { operation: "plan.propose", plan: proposedPlan } },
    }),
    null,
    2,
  ) + "\n",
);

console.log("wrote 16 phase4 fixtures");
