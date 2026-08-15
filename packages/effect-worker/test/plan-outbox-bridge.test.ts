import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  computeTaskSpecDigest,
  createEffectRepository,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
  type EffectRepository,
} from "@app-factory/kernel";
import { EvidenceStore } from "@app-factory/evidence-store";
import {
  createProjectProvisionPlan,
  type ProjectProvisionPlanV1,
} from "@app-factory/work-tracking-integrations";
import { afterEach, describe, expect, it } from "vitest";

import {
  createKernelEffectPayloadPort,
  PlanOutboxBridge,
  PlanOutboxBridgeError,
  provisionEffectId,
  type ApplyProvisionPlanInput,
  type ProvisionEffectSubjectV1,
} from "../src/index.js";

const T0 = "2026-08-10T12:00:00.000Z";

const PROJECT_ID = "72000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "72000000-0000-4000-8000-000000000002";
const TASK_ID = "72000000-0000-4000-8000-000000000003";
const COMMAND_ID = "72000000-0000-4000-8000-000000000004";
const ATTEMPT_ID = "72000000-0000-4000-8000-000000000005";
const EVENT_ID = "72000000-0000-4000-8000-000000000006";
const FENCE_EVENT_ID = "72000000-0000-4000-8000-000000000007";
const RUNNING_EVENT_ID = "72000000-0000-4000-8000-000000000008";
const STEP_ID = "72000000-0000-4000-8000-000000000009";
const STEP_CREATED_EVENT_ID = "72000000-0000-4000-8000-00000000000a";
const STEP_RUNNING_EVENT_ID = "72000000-0000-4000-8000-00000000000b";

const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const APPROVAL_ATTESTATION_DIGEST = `sha256:${"6".repeat(64)}`;
const OBSERVATION_ATTESTATION_DIGEST = `sha256:${"9".repeat(64)}`;
const EVIDENCE_DIGEST = `sha256:${"d".repeat(64)}`;
const BASE_COMMIT = "2".repeat(40);
const LEASE_KEY = `attempt:${ATTEMPT_ID}`;
const WORKER_OWNER = "worker.effect";

const temporaryDirectories: string[] = [];

function makeDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-plan-outbox-bridge-"));
  temporaryDirectories.push(directory);
  return join(directory, "factory.db");
}

function makeEvidenceRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-plan-outbox-bridge-evidence-"));
  temporaryDirectories.push(directory);
  return directory;
}

function iso(offsetMs: number): string {
  return new Date(Date.parse(T0) + offsetMs).toISOString();
}

// The seeded lease is acquired at iso(100) and the step becomes running at
// iso(400); every plan-authorization timestamp in the tests below must be at
// or after that point for the kernel's live-lease/live-step checks to pass.
const AUTHORIZED_AT = iso(500);

function seedAttempt(database: Parameters<typeof createFactoryRepositories>[0]): void {
  const taskSpec = {
    schemaVersion: 1,
    taskId: TASK_ID,
    projectId: PROJECT_ID,
    createdAt: T0,
    title: "Bootstrap project provisioning",
    objective: "Exercise the plan-outbox bridge against the real kernel.",
    acceptanceCriteria: [
      {
        id: "provisioning-safe",
        statement: "Provisioning operations are planned only in dependency order.",
        verification: "automated",
      },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: BASE_COMMIT },
    requestedScope: { paths: ["provisioning/plan.json"] },
    policyDigest: POLICY_DIGEST,
  } as const;
  const taskSpecDigest = computeTaskSpecDigest(taskSpec);
  const repositories = createFactoryRepositories(database);
  repositories.artifacts.record({
    artifact: {
      digest: EVIDENCE_DIGEST,
      byteLength: 16,
      mediaType: "application/json",
      logicalName: "provider-evidence.json",
    },
    storagePath: "/private/tmp/app-factory-plan-outbox-bridge-evidence.json",
    recordedAt: T0,
  });
  repositories.createTaskAttempt({
    command: {
      schemaVersion: 1,
      commandId: COMMAND_ID,
      issuedAt: T0,
      origin: "system",
      kind: "task.submit",
      initialDesiredState: "running",
      taskSpec,
    },
    taskSpecDigest,
    attempt: {
      schemaVersion: 1,
      attemptId: ATTEMPT_ID,
      taskId: TASK_ID,
      taskSpecDigest,
      attemptNumber: 1,
      state: "queued",
      desiredState: "running",
      revision: 0,
      fence: 0,
      currentStepId: null,
      blocker: null,
      outcome: null,
      createdAt: T0,
      updatedAt: T0,
      terminalAt: null,
    },
    event: {
      schemaVersion: 1,
      eventId: EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 1,
      occurredAt: T0,
      commandId: COMMAND_ID,
      causationEventId: null,
      fence: 0,
      type: "attempt.created",
      data: { taskId: TASK_ID, taskSpecDigest },
    },
  });
  const claimed = repositories.leases.claim({
    leaseKey: LEASE_KEY,
    attemptId: ATTEMPT_ID,
    ownerId: WORKER_OWNER,
    expectedAttemptRevision: 0,
    acquiredAt: iso(100),
    expiresAt: iso(10 * 60 * 60 * 1_000),
    event: {
      schemaVersion: 1,
      eventId: FENCE_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 2,
      occurredAt: iso(100),
      commandId: null,
      causationEventId: EVENT_ID,
      fence: 1,
      type: "attempt.fence-claimed",
      data: { previousFence: 0, newFence: 1, ownerId: WORKER_OWNER },
    },
  });
  const runningAttempt = {
    ...claimed.attempt,
    state: "running",
    revision: 2,
    updatedAt: iso(200),
  } as const;
  repositories.transitionAttemptState({
    leaseKey: LEASE_KEY,
    ownerId: WORKER_OWNER,
    observedAt: iso(200),
    expectedRevision: 1,
    attempt: runningAttempt,
    event: {
      schemaVersion: 1,
      eventId: RUNNING_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 3,
      occurredAt: iso(200),
      commandId: null,
      causationEventId: FENCE_EVENT_ID,
      fence: 1,
      type: "attempt.state-changed",
      data: { from: "queued", to: "running", blocker: null, outcome: null },
    },
  });
  const pendingStep = {
    schemaVersion: 1,
    stepId: STEP_ID,
    attemptId: ATTEMPT_ID,
    ordinal: 0,
    operation: "provisioning.plan",
    state: "pending",
    revision: 0,
    lastFence: 1,
    runCount: 0,
    inputDigest: EVIDENCE_DIGEST,
    outputDigest: null,
    blocker: null,
    failure: null,
    startedAt: null,
    finishedAt: null,
  } as const;
  repositories.steps.create({
    leaseKey: LEASE_KEY,
    ownerId: WORKER_OWNER,
    observedAt: iso(300),
    step: pendingStep,
    event: {
      schemaVersion: 1,
      eventId: STEP_CREATED_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 4,
      occurredAt: iso(300),
      commandId: null,
      causationEventId: RUNNING_EVENT_ID,
      fence: 1,
      type: "step.created",
      data: {
        stepId: STEP_ID,
        ordinal: 0,
        operation: "provisioning.plan",
        inputDigest: EVIDENCE_DIGEST,
      },
    },
  });
  repositories.steps.transition({
    leaseKey: LEASE_KEY,
    ownerId: WORKER_OWNER,
    observedAt: iso(400),
    expectedRevision: 0,
    fence: 1,
    step: {
      ...pendingStep,
      state: "running",
      revision: 1,
      runCount: 1,
      startedAt: iso(400),
    },
    event: {
      schemaVersion: 1,
      eventId: STEP_RUNNING_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 5,
      occurredAt: iso(400),
      commandId: null,
      causationEventId: STEP_CREATED_EVENT_ID,
      fence: 1,
      type: "step.state-changed",
      data: {
        stepId: STEP_ID,
        from: "pending",
        to: "running",
        outputDigest: null,
        failureCode: null,
      },
    },
  });
}

function openFixture() {
  const database = openMigratedFactoryDatabase(makeDatabasePath());
  seedAttempt(database);
  const repositories = createFactoryRepositories(database);
  const effects = createEffectRepository(database, {
    verifyApprovalIssuance: (issuance) => issuance.issuerId === "trusted.approval-service",
    verifyObservationAttestation: ({ observation }) =>
      observation.attestationDigest === OBSERVATION_ATTESTATION_DIGEST,
  });
  const evidenceStore = new EvidenceStore(makeEvidenceRoot());
  const bridge = new PlanOutboxBridge({
    kernel: effects,
    artifacts: repositories.artifacts,
    evidenceStore,
  });
  return { database, repositories, effects, evidenceStore, bridge };
}

function testSpec() {
  return {
    schemaVersion: 1 as const,
    projectId: PROJECT_ID,
    projectSlug: "bridge-fixture",
    displayName: "Bridge Fixture",
    jira: {
      siteId: "cloud-site-1",
      projectKey: "BRDG",
      projectName: "Bridge Fixture",
      projectType: "software" as const,
    },
    github: {
      owner: "app-factory",
      repository: "bridge-fixture",
      visibility: "private" as const,
      defaultBranch: "main" as const,
    },
    epics: [
      {
        logicalId: "epic-1",
        summary: "Only epic",
        description: "The only epic in this fixture.",
        tasks: [
          {
            logicalId: "task-a",
            summary: "First task",
            description: "Has no dependencies.",
            issueType: "task" as const,
            estimatePoints: 1,
            acceptanceCriteria: ["Task A exists"],
            dependsOn: [],
          },
          {
            logicalId: "task-b",
            summary: "Second task",
            description: "Depends on task A.",
            issueType: "task" as const,
            estimatePoints: 1,
            acceptanceCriteria: ["Task B exists"],
            dependsOn: ["task-a"],
          },
        ],
      },
    ],
  };
}

function testSubject(): ProvisionEffectSubjectV1 {
  return { projectId: PROJECT_ID, taskId: TASK_ID, attemptId: ATTEMPT_ID, releaseId: null };
}

function testOrigin(startingCheckpointRevision?: number) {
  return {
    leaseKey: LEASE_KEY,
    ownerId: WORKER_OWNER,
    fence: 1,
    stepId: STEP_ID,
    expectedAttemptRevision: 3,
    expectedStepRevision: 1,
    ...(startingCheckpointRevision === undefined ? {} : { startingCheckpointRevision }),
  };
}

function registerApprovalsForAllOperations(
  effects: EffectRepository,
  plan: ProjectProvisionPlanV1,
  authorizedAt: string,
  expiresAt = iso(24 * 60 * 60 * 1_000),
): Map<string, string> {
  const approvalIds = new Map<string, string>();
  for (const operation of plan.operations) {
    const approvalId = randomUUID();
    approvalIds.set(operation.operationId, approvalId);
    effects.registerApproval({
      issuance: {
        approval: {
          schemaVersion: 1,
          approvalId,
          action: operation.action,
          resourceType: operation.correlation.resourceType,
          resourceKey: operation.resourceKey,
          subject: testSubject(),
          binding: {
            planDigest: plan.planId,
            diffDigest: null,
            commit: null,
            buildIdentityDigest: null,
            policyDigest: POLICY_DIGEST,
          },
          actorId: "owner@example.com",
          mode: "single-use",
          standingScope: null,
          issuedAt: authorizedAt,
          expiresAt,
          status: "active",
          revokedAt: null,
          consumedAt: null,
          consumedByEffectId: null,
        },
        payloadDigest: operation.payloadDigest,
        issuerId: "trusted.approval-service",
        authenticatedAt: authorizedAt,
        attestationDigest: APPROVAL_ATTESTATION_DIGEST,
      },
    });
  }
  return approvalIds;
}

function buildInput(
  plan: ProjectProvisionPlanV1,
  approvals: ReadonlyMap<string, string>,
  authorizedAt: string,
  startingCheckpointRevision?: number,
): ApplyProvisionPlanInput {
  return {
    plan,
    approvals,
    subject: testSubject(),
    policyDigest: POLICY_DIGEST,
    origin: testOrigin(startingCheckpointRevision),
    authorizedAt,
  };
}

/**
 * Claims whatever effect is next eligible for send (there is no way to
 * target a specific effect ID - `claimNextSend` picks its own candidate) and
 * drives it all the way through the real outbox state machine to
 * `confirmed`: send -> observed (a single provider round trip observes the
 * resource directly) -> reconcile -> confirmed. Returns the effect ID it
 * confirmed, or null if nothing was send-eligible. `fromMs` must leave room
 * for four strictly-increasing timestamps (the kernel's
 * `external_effects_legal_state_transition` trigger requires `updated_at` to
 * strictly increase on every state-changing call) before the caller's next
 * budget begins.
 */
function confirmNextPlannedEffect(effects: EffectRepository, fromMs: number): string | null {
  const beginAt = new Date(fromMs).toISOString();
  const sendObservedAt = new Date(fromMs + 100).toISOString();
  const reconcileClaimAt = new Date(fromMs + 200).toISOString();
  const confirmedAt = new Date(fromMs + 300).toISOString();

  const sendClaim = effects.claimNextSend({
    ownerId: WORKER_OWNER,
    observedAt: beginAt,
    lockedUntil: new Date(fromMs + 60_000).toISOString(),
  });
  if (sendClaim === null) return null;
  const { effectId, target } = sendClaim.effect;
  const adapterId = `${target.provider}.rest`;
  const correlationKey = `provision-confirm:${effectId}`;
  const providerResourceId = `resource-${effectId}`;

  effects.beginSend({
    effectId,
    ownerId: WORKER_OWNER,
    fence: sendClaim.fence,
    expectedOutboxRevision: sendClaim.revision,
    expectedEffectRevision: 0,
    observedAt: beginAt,
  });
  const sendResource = {
    schemaVersion: 1,
    effectId,
    target,
    providerResourceId,
    providerUrl: null,
    providerVersion: "1",
    observedDigest: `sha256:${"1".repeat(63)}${sendResourceParity(effectId)}`,
    observedAt: sendObservedAt,
  };
  effects.recordSendOutcome({
    effectId,
    ownerId: WORKER_OWNER,
    fence: sendClaim.fence,
    expectedOutboxRevision: sendClaim.revision,
    expectedEffectRevision: 1,
    observedAt: sendObservedAt,
    outcome: {
      kind: "observed",
      providerCorrelationKey: correlationKey,
      resource: sendResource,
      observation: {
        schemaVersion: 1,
        invocationId: randomUUID(),
        source: "provider-send",
        adapterId,
        adapterVersion: "1.0.0",
        evidenceDigest: EVIDENCE_DIGEST,
        attestationDigest: OBSERVATION_ATTESTATION_DIGEST,
        observedAt: sendObservedAt,
      },
      detailDigest: EVIDENCE_DIGEST,
    },
  });

  // Nothing else is ever mid-flight at this point (this helper always runs
  // an effect all the way to the terminal `confirmed` state before starting
  // the next one, and `confirmed` is never reconciliation-eligible again),
  // so the very next reconciliation claim is guaranteed to be this effect.
  const reconciliationClaim = effects.claimNextReconciliation({
    ownerId: WORKER_OWNER,
    observedAt: reconcileClaimAt,
    lockedUntil: new Date(fromMs + 60_000).toISOString(),
  });
  if (reconciliationClaim === null || reconciliationClaim.effect.effectId !== effectId) {
    throw new Error(`expected to reconcile the effect just sent: ${effectId}`);
  }
  const confirmResource = {
    ...sendResource,
    observedDigest: `sha256:${"2".repeat(63)}${sendResourceParity(effectId)}`,
    observedAt: confirmedAt,
  };
  effects.confirmObserved({
    effectId,
    ownerId: WORKER_OWNER,
    fence: reconciliationClaim.fence,
    expectedOutboxRevision: reconciliationClaim.revision,
    expectedEffectRevision: 2,
    observedAt: confirmedAt,
    providerCorrelationKey: correlationKey,
    resource: confirmResource,
    observation: {
      schemaVersion: 1,
      invocationId: randomUUID(),
      source: "provider-reconciliation",
      adapterId,
      adapterVersion: "1.0.0",
      evidenceDigest: EVIDENCE_DIGEST,
      attestationDigest: OBSERVATION_ATTESTATION_DIGEST,
      observedAt: confirmedAt,
    },
    confirmationEvidenceDigest: EVIDENCE_DIGEST,
  });
  return effectId;
}

/** Confirms every effect currently planned-and-unconfirmed, in whatever order the outbox offers them. */
function confirmAllCurrentlyPlanned(effects: EffectRepository, fromMs: number): readonly string[] {
  const confirmed: string[] = [];
  let cursor = fromMs;
  for (;;) {
    const effectId = confirmNextPlannedEffect(effects, cursor);
    if (effectId === null) return confirmed;
    confirmed.push(effectId);
    cursor += 1_000;
  }
}

function sendResourceParity(effectId: string): string {
  // A single stable hex digit derived from the effect ID, just to keep
  // synthetic digests distinguishable across effects without pulling in a
  // real hashing dependency in the test.
  const code = effectId.replace(/-/g, "").at(-1) ?? "0";
  return /^[0-9a-f]$/i.test(code) ? code.toLowerCase() : "0";
}

function outboxCounts(database: ReturnType<typeof openFixture>["database"]) {
  const effectCount = (
    database.prepare("SELECT COUNT(*) AS count FROM external_effects").get() as { count: number }
  ).count;
  const checkpointCount = (
    database.prepare("SELECT COUNT(*) AS count FROM effect_origin_checkpoints").get() as {
      count: number;
    }
  ).count;
  return { effectCount, checkpointCount };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("PlanOutboxBridge against the real migrated SQLite kernel", () => {
  it("plans only ready operations and unblocks dependents as their dependencies are confirmed", () => {
    const fixture = openFixture();
    const plan = createProjectProvisionPlan(testSpec());
    expect(plan.operations).toHaveLength(5);
    const approvals = registerApprovalsForAllOperations(fixture.effects, plan, AUTHORIZED_AT);

    const projectOperation = plan.operations.find((op) => op.action === "jira.project.ensure");
    const repositoryOperation = plan.operations.find(
      (op) => op.action === "github.repository.ensure",
    );
    const epicOperation = plan.operations.find((op) => op.action === "jira.epic.ensure");
    const taskAOperation = plan.operations.find(
      (op) => op.action === "jira.issue.ensure" && op.resourceKey.endsWith(":task-a"),
    );
    const taskBOperation = plan.operations.find(
      (op) => op.action === "jira.issue.ensure" && op.resourceKey.endsWith(":task-b"),
    );
    if (
      projectOperation === undefined ||
      repositoryOperation === undefined ||
      epicOperation === undefined ||
      taskAOperation === undefined ||
      taskBOperation === undefined
    ) {
      throw new Error("fixture plan is missing an expected operation");
    }

    // Call 1: only the two dependency-free roots are ready.
    const first = fixture.bridge.applyPlan(buildInput(plan, approvals, AUTHORIZED_AT));
    expect(first.plannedCount).toBe(2);
    expect(first.blockedCount).toBe(3);
    const firstByOperation = new Map(
      first.outcomes.map((outcome) => [outcome.operationId, outcome]),
    );
    expect(firstByOperation.get(projectOperation.operationId)).toMatchObject({
      status: "planned",
      duplicate: false,
    });
    expect(firstByOperation.get(repositoryOperation.operationId)).toMatchObject({
      status: "planned",
      duplicate: false,
    });
    expect(firstByOperation.get(epicOperation.operationId)).toMatchObject({
      status: "blocked",
      blockedOnOperationIds: [projectOperation.operationId],
    });
    expect(firstByOperation.get(taskAOperation.operationId)).toMatchObject({ status: "blocked" });
    expect(firstByOperation.get(taskBOperation.operationId)).toMatchObject({ status: "blocked" });

    // Confirm both dependency-free roots all the way through the real
    // outbox state machine (repository confirmation is inert here - nothing
    // in this plan depends on it - but claimNextSend does not let a test
    // target one specific effect, so this drains everything eligible).
    const confirmedAfterFirst = confirmAllCurrentlyPlanned(fixture.effects, Date.parse(iso(1_000)));
    expect([...confirmedAfterFirst].sort()).toEqual(
      [
        provisionEffectId(projectOperation.operationId),
        provisionEffectId(repositoryOperation.operationId),
      ].sort(),
    );

    // Call 2 (same plan/approvals/origin): project and repository replay as
    // duplicates; the epic is now ready because its one dependency is
    // confirmed; the issues remain blocked on the epic.
    const second = fixture.bridge.applyPlan(buildInput(plan, approvals, AUTHORIZED_AT));
    expect(second.plannedCount).toBe(3);
    expect(second.blockedCount).toBe(2);
    const secondByOperation = new Map(
      second.outcomes.map((outcome) => [outcome.operationId, outcome]),
    );
    expect(secondByOperation.get(projectOperation.operationId)).toMatchObject({
      status: "planned",
      duplicate: true,
    });
    expect(secondByOperation.get(repositoryOperation.operationId)).toMatchObject({
      status: "planned",
      duplicate: true,
    });
    expect(secondByOperation.get(epicOperation.operationId)).toMatchObject({
      status: "planned",
      duplicate: false,
    });
    expect(secondByOperation.get(taskAOperation.operationId)).toMatchObject({
      status: "blocked",
      blockedOnOperationIds: [epicOperation.operationId],
    });
    expect(secondByOperation.get(taskBOperation.operationId)).toMatchObject({ status: "blocked" });

    const confirmedAfterSecond = confirmAllCurrentlyPlanned(
      fixture.effects,
      Date.parse(iso(3_000)),
    );
    expect(confirmedAfterSecond).toEqual([provisionEffectId(epicOperation.operationId)]);

    // Call 3: task A becomes ready (its only dependency, the epic, is now
    // confirmed); task B stays blocked because task A is planned but not
    // yet confirmed.
    const third = fixture.bridge.applyPlan(buildInput(plan, approvals, AUTHORIZED_AT));
    const thirdByOperation = new Map(
      third.outcomes.map((outcome) => [outcome.operationId, outcome]),
    );
    expect(thirdByOperation.get(taskAOperation.operationId)).toMatchObject({
      status: "planned",
      duplicate: false,
    });
    expect(thirdByOperation.get(taskBOperation.operationId)).toMatchObject({
      status: "blocked",
      blockedOnOperationIds: [taskAOperation.operationId],
    });

    const confirmedAfterThird = confirmAllCurrentlyPlanned(fixture.effects, Date.parse(iso(5_000)));
    expect(confirmedAfterThird).toEqual([provisionEffectId(taskAOperation.operationId)]);

    // Call 4: everything is now planned.
    const fourth = fixture.bridge.applyPlan(buildInput(plan, approvals, AUTHORIZED_AT));
    expect(fourth.plannedCount).toBe(5);
    expect(fourth.blockedCount).toBe(0);
    const fourthByOperation = new Map(
      fourth.outcomes.map((outcome) => [outcome.operationId, outcome]),
    );
    expect(fourthByOperation.get(taskBOperation.operationId)).toMatchObject({
      status: "planned",
      duplicate: false,
    });

    // Four calls, five distinct operations: no operation was ever planned
    // (inserted into external_effects) more than once, regardless of how
    // many times the bridge replayed it as a duplicate.
    expect(outboxCounts(fixture.database)).toEqual({ effectCount: 5, checkpointCount: 5 });
    fixture.database.close();
  });

  it("persists each operation's payload as a kernel artifact the real EffectPayloadPort can read back", () => {
    const fixture = openFixture();
    const plan = createProjectProvisionPlan(testSpec());
    const approvals = registerApprovalsForAllOperations(fixture.effects, plan, AUTHORIZED_AT);
    fixture.bridge.applyPlan(buildInput(plan, approvals, AUTHORIZED_AT));

    const projectOperation = plan.operations.find((op) => op.action === "jira.project.ensure");
    if (projectOperation === undefined)
      throw new Error("fixture plan is missing jira.project.ensure");

    const payloadPort = createKernelEffectPayloadPort({
      artifacts: fixture.repositories.artifacts,
      evidenceStore: fixture.evidenceStore,
    });
    const bytes = payloadPort.read({
      payloadDigest: projectOperation.payloadDigest,
      deadline: iso(60_000),
      signal: new AbortController().signal,
    });
    expect(JSON.parse(Buffer.from(bytes).toString("utf8"))).toEqual(projectOperation.payload);
    fixture.database.close();
  });

  it("is idempotent by marker: replanning an already-planned operation neither errors nor duplicates it", () => {
    const fixture = openFixture();
    const plan = createProjectProvisionPlan(testSpec());
    const approvals = registerApprovalsForAllOperations(fixture.effects, plan, AUTHORIZED_AT);

    fixture.bridge.applyPlan(buildInput(plan, approvals, AUTHORIZED_AT));
    const before = outboxCounts(fixture.database);
    const replay = fixture.bridge.applyPlan(buildInput(plan, approvals, AUTHORIZED_AT));
    const after = outboxCounts(fixture.database);

    expect(after).toEqual(before);
    for (const outcome of replay.outcomes) {
      if (outcome.status === "planned") expect(outcome.duplicate).toBe(true);
    }
    fixture.database.close();
  });

  it("fails closed and plans nothing further when a ready operation has no mapped approval", () => {
    const fixture = openFixture();
    const plan = createProjectProvisionPlan(testSpec());
    const approvals = registerApprovalsForAllOperations(fixture.effects, plan, AUTHORIZED_AT);
    const repositoryOperation = plan.operations.find(
      (op) => op.action === "github.repository.ensure",
    );
    if (repositoryOperation === undefined)
      throw new Error("fixture plan is missing github.repository.ensure");
    const incompleteApprovals = new Map(approvals);
    incompleteApprovals.delete(repositoryOperation.operationId);

    expect(() =>
      fixture.bridge.applyPlan(buildInput(plan, incompleteApprovals, AUTHORIZED_AT)),
    ).toThrow(PlanOutboxBridgeError);
    expect(() =>
      fixture.bridge.applyPlan(buildInput(plan, incompleteApprovals, AUTHORIZED_AT)),
    ).toThrow(/missing approval.*github\.repository\.ensure/);
    expect(
      fixture.effects.getEffect(provisionEffectId(repositoryOperation.operationId)),
    ).toBeNull();
    fixture.database.close();
  });

  it("fails closed on an expired approval", () => {
    const fixture = openFixture();
    const plan = createProjectProvisionPlan(testSpec());
    // Approvals expire one second after they are issued at AUTHORIZED_AT; authorize the
    // plan a full day later so every approval is already expired.
    const approvals = registerApprovalsForAllOperations(
      fixture.effects,
      plan,
      AUTHORIZED_AT,
      iso(1_000),
    );

    expect(() =>
      fixture.bridge.applyPlan(buildInput(plan, approvals, iso(24 * 60 * 60 * 1_000))),
    ).toThrow(/expired or not yet valid/);
    fixture.database.close();
  });

  it("fails closed when an operation's declared payload digest does not match its own payload", () => {
    const fixture = openFixture();
    const plan = createProjectProvisionPlan(testSpec());
    const approvals = registerApprovalsForAllOperations(fixture.effects, plan, AUTHORIZED_AT);
    const tamperedIndex = plan.operations.findIndex((op) => op.action === "jira.project.ensure");
    const tamperedOperations = plan.operations.map((operation, index) =>
      index === tamperedIndex
        ? { ...operation, payload: { ...operation.payload, name: "Tampered" } }
        : operation,
    );
    const tamperedPlan: ProjectProvisionPlanV1 = { ...plan, operations: tamperedOperations };

    expect(() =>
      fixture.bridge.applyPlan(buildInput(tamperedPlan, approvals, AUTHORIZED_AT)),
    ).toThrow(/payload digest mismatch/);
    fixture.database.close();
  });

  it("resumes a partial plan application after a simulated crash without duplicating planned operations", () => {
    const fixture = openFixture();
    const plan = createProjectProvisionPlan(testSpec());
    const approvals = registerApprovalsForAllOperations(fixture.effects, plan, AUTHORIZED_AT);

    let callCount = 0;
    const crashingKernel: typeof fixture.effects = {
      ...fixture.effects,
      planExternalEffect: (input) => {
        callCount += 1;
        if (callCount === 2) throw new Error("simulated crash mid-plan");
        return fixture.effects.planExternalEffect(input);
      },
    };
    const crashingBridge = new PlanOutboxBridge({
      kernel: crashingKernel,
      artifacts: fixture.repositories.artifacts,
      evidenceStore: fixture.evidenceStore,
    });

    expect(() => crashingBridge.applyPlan(buildInput(plan, approvals, AUTHORIZED_AT))).toThrow(
      "simulated crash mid-plan",
    );
    const afterCrash = outboxCounts(fixture.database);
    expect(afterCrash).toEqual({ effectCount: 1, checkpointCount: 1 });

    // A fresh bridge instance (as if a new process started) against the same
    // underlying kernel database resumes cleanly: the one operation planned
    // before the crash replays as a duplicate, and the other ready operation
    // is planned for the first time. Both dependent operations remain
    // blocked, exactly as in an uninterrupted run.
    const resumedBridge = new PlanOutboxBridge({
      kernel: fixture.effects,
      artifacts: fixture.repositories.artifacts,
      evidenceStore: fixture.evidenceStore,
    });
    const resumed = resumedBridge.applyPlan(buildInput(plan, approvals, AUTHORIZED_AT));
    expect(resumed.plannedCount).toBe(2);
    expect(resumed.blockedCount).toBe(3);
    const duplicateCount = resumed.outcomes.filter(
      (outcome) => outcome.status === "planned" && outcome.duplicate,
    ).length;
    expect(duplicateCount).toBe(1);
    expect(outboxCounts(fixture.database)).toEqual({ effectCount: 2, checkpointCount: 2 });
    fixture.database.close();
  });

  it("rejects a subject whose projectId does not match the plan's projectId", () => {
    const fixture = openFixture();
    const plan = createProjectProvisionPlan(testSpec());
    const approvals = registerApprovalsForAllOperations(fixture.effects, plan, AUTHORIZED_AT);
    const input = buildInput(plan, approvals, AUTHORIZED_AT);

    expect(() =>
      fixture.bridge.applyPlan({
        ...input,
        subject: { ...input.subject, projectId: "72000000-0000-4000-8000-0000000000ff" },
      }),
    ).toThrow(/does not match plan projectId/);
    fixture.database.close();
  });
});
