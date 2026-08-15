import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CommandRequestV1 } from "@app-factory/contracts";
import {
  computeTaskSpecDigest,
  createEffectRepository,
  createFactoryRepositories,
  type EffectRepository,
  type FactoryRepositories,
} from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";

// Read-only surface: nothing here runs the pump, so effects only ever need
// to reach "planned" (never claimed). Fixed historical timestamps are safe
// throughout -- unlike apps/daemon/test/effect-pump.test.ts, which drives a
// real claim/dispatch cycle and therefore needs its clock aligned with the
// approval's validity window.

const T0 = "2026-08-11T12:00:00.000Z";
const T1 = "2026-08-11T12:00:01.000Z";
const T2 = "2026-08-11T12:00:02.000Z";
const EXPIRES = "2026-08-11T13:00:00.000Z";
const REQUEST_ID = "74000000-0000-4000-8000-000000000001";

const PROJECT_ID = "74000000-0000-4000-8000-000000000010";
const REPOSITORY_ID = "74000000-0000-4000-8000-000000000011";
const TASK_ID = "74000000-0000-4000-8000-000000000012";
const COMMAND_ID = "74000000-0000-4000-8000-000000000013";
const ATTEMPT_ID = "74000000-0000-4000-8000-000000000014";
const EVENT_ID = "74000000-0000-4000-8000-000000000015";
const FENCE_EVENT_ID = "74000000-0000-4000-8000-000000000016";
const RUNNING_EVENT_ID = "74000000-0000-4000-8000-000000000017";
const STEP_ID = "74000000-0000-4000-8000-000000000018";
const STEP_CREATED_EVENT_ID = "74000000-0000-4000-8000-000000000019";
const STEP_RUNNING_EVENT_ID = "74000000-0000-4000-8000-00000000001a";
const CHECKPOINT_ID = "74000000-0000-4000-8000-00000000001b";
const SECOND_CHECKPOINT_ID = "74000000-0000-4000-8000-00000000001c";
const APPROVAL_1 = "74000000-0000-4000-8000-000000000020";
const APPROVAL_2 = "74000000-0000-4000-8000-000000000021";
const EFFECT_1 = "74000000-0000-4000-8000-000000000030";
const EFFECT_2 = "74000000-0000-4000-8000-000000000031";
const RELEASE_ID = "74000000-0000-4000-8000-000000000040";

const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const PAYLOAD_DIGEST = `sha256:${"b".repeat(64)}`;
const PLAN_DIGEST = `sha256:${"c".repeat(64)}`;
const DIFF_DIGEST = `sha256:${"d".repeat(64)}`;
const BUILD_DIGEST = `sha256:${"e".repeat(64)}`;
const APPROVAL_ATTESTATION_DIGEST = `sha256:${"6".repeat(64)}`;
const BASE_COMMIT = "2".repeat(40);
const EFFECT_COMMIT = "3".repeat(40);

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

function request(operation: CommandRequestV1["operation"], commandId: string, payload: unknown) {
  return {
    schemaVersion: 1,
    commandId,
    issuedAt: T0,
    origin: "cli",
    operation,
    payload,
  } as CommandRequestV1;
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-effects-surface-"));
  roots.push(root);
  return root;
}

function seedAttempt(repositories: FactoryRepositories): void {
  const taskSpec = {
    schemaVersion: 1,
    taskId: TASK_ID,
    projectId: PROJECT_ID,
    createdAt: T0,
    title: "Exercise the effects operator surface",
    objective: "Verify effects.status/effects.list read the kernel's durable state.",
    acceptanceCriteria: [
      {
        id: "read-only",
        statement: "Counts and pages reflect planned effects.",
        verification: "automated",
      },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: BASE_COMMIT },
    requestedScope: { paths: ["Factory/Effect.swift"] },
    policyDigest: POLICY_DIGEST,
  } as const;
  const taskSpecDigest = computeTaskSpecDigest(taskSpec);
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
    leaseKey: `attempt:${ATTEMPT_ID}`,
    attemptId: ATTEMPT_ID,
    ownerId: "worker.effect",
    expectedAttemptRevision: 0,
    acquiredAt: "2026-08-11T12:00:00.100Z",
    expiresAt: EXPIRES,
    event: {
      schemaVersion: 1,
      eventId: FENCE_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 2,
      occurredAt: "2026-08-11T12:00:00.100Z",
      commandId: null,
      causationEventId: EVENT_ID,
      fence: 1,
      type: "attempt.fence-claimed",
      data: { previousFence: 0, newFence: 1, ownerId: "worker.effect" },
    },
  });
  repositories.transitionAttemptState({
    leaseKey: `attempt:${ATTEMPT_ID}`,
    ownerId: "worker.effect",
    observedAt: "2026-08-11T12:00:00.200Z",
    expectedRevision: 1,
    attempt: {
      ...claimed.attempt,
      state: "running",
      revision: 2,
      updatedAt: "2026-08-11T12:00:00.200Z",
    },
    event: {
      schemaVersion: 1,
      eventId: RUNNING_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 3,
      occurredAt: "2026-08-11T12:00:00.200Z",
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
    operation: "external.plan",
    state: "pending",
    revision: 0,
    lastFence: 1,
    runCount: 0,
    inputDigest: PAYLOAD_DIGEST,
    outputDigest: null,
    blocker: null,
    failure: null,
    startedAt: null,
    finishedAt: null,
  } as const;
  repositories.steps.create({
    leaseKey: `attempt:${ATTEMPT_ID}`,
    ownerId: "worker.effect",
    observedAt: "2026-08-11T12:00:00.300Z",
    step: pendingStep,
    event: {
      schemaVersion: 1,
      eventId: STEP_CREATED_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 4,
      occurredAt: "2026-08-11T12:00:00.300Z",
      commandId: null,
      causationEventId: RUNNING_EVENT_ID,
      fence: 1,
      type: "step.created",
      data: {
        stepId: STEP_ID,
        ordinal: 0,
        operation: "external.plan",
        inputDigest: PAYLOAD_DIGEST,
      },
    },
  });
  repositories.steps.transition({
    leaseKey: `attempt:${ATTEMPT_ID}`,
    ownerId: "worker.effect",
    observedAt: "2026-08-11T12:00:00.400Z",
    expectedRevision: 0,
    fence: 1,
    step: {
      ...pendingStep,
      state: "running",
      revision: 1,
      runCount: 1,
      startedAt: "2026-08-11T12:00:00.400Z",
    },
    event: {
      schemaVersion: 1,
      eventId: STEP_RUNNING_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 5,
      occurredAt: "2026-08-11T12:00:00.400Z",
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

function subject() {
  return {
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    attemptId: ATTEMPT_ID,
    releaseId: RELEASE_ID,
  };
}

function approval(approvalId: string, resourceKey: string) {
  return {
    schemaVersion: 1,
    approvalId,
    action: "github.merge-pr",
    resourceType: "github.pull-request",
    resourceKey,
    subject: subject(),
    binding: {
      planDigest: PLAN_DIGEST,
      diffDigest: DIFF_DIGEST,
      commit: EFFECT_COMMIT,
      buildIdentityDigest: BUILD_DIGEST,
      policyDigest: POLICY_DIGEST,
    },
    actorId: "owner@example.com",
    mode: "single-use",
    standingScope: null,
    issuedAt: T0,
    expiresAt: EXPIRES,
    status: "active",
    revokedAt: null,
    consumedAt: null,
    consumedByEffectId: null,
  } as const;
}

function effect(effectId: string, approvalId: string, resourceKey: string) {
  return {
    schemaVersion: 1,
    effectId,
    attemptId: ATTEMPT_ID,
    action: "github.merge-pr",
    operationMarker: `app-factory:v1:github:merge:${effectId}`,
    target: { provider: "github", resourceType: "github.pull-request", resourceKey },
    subject: subject(),
    payloadDigest: PAYLOAD_DIGEST,
    policyDigest: POLICY_DIGEST,
    approvalId,
    state: "planned",
    revision: 0,
    sendCount: 0,
    providerCorrelationKey: null,
    createdAt: T1,
    updatedAt: T1,
    lastObservedAt: null,
    nextReconcileAt: null,
    detailDigest: null,
  } as const;
}

function planEffect(
  effects: EffectRepository,
  effectId: string,
  approvalId: string,
  resourceKey: string,
  checkpointId: string,
  expectedCheckpointRevision: number,
): void {
  effects.registerApproval({
    issuance: {
      approval: approval(approvalId, resourceKey),
      payloadDigest: PAYLOAD_DIGEST,
      issuerId: "trusted.approval-service",
      authenticatedAt: T0,
      attestationDigest: APPROVAL_ATTESTATION_DIGEST,
    },
  });
  effects.planExternalEffect({
    effect: effect(effectId, approvalId, resourceKey),
    binding: {
      planDigest: PLAN_DIGEST,
      diffDigest: DIFF_DIGEST,
      commit: EFFECT_COMMIT,
      buildIdentityDigest: BUILD_DIGEST,
    },
    authorizedAt: T1,
    availableAt: T1,
    standingScope: null,
    origin: {
      checkpointId,
      leaseKey: `attempt:${ATTEMPT_ID}`,
      ownerId: "worker.effect",
      fence: 1,
      stepId: STEP_ID,
      expectedAttemptRevision: 3,
      expectedStepRevision: 1,
      expectedCheckpointRevision,
    },
  });
}

async function openRuntimeWithEffects(): Promise<{
  runtime: DaemonCommandRuntime;
  effects: EffectRepository;
}> {
  let effects!: EffectRepository;
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: await makeRoot(),
    daemonVersion: "0.1.0-test",
    startedAt: T0,
    now: () => T2,
    initializeDatabase: (database) => {
      const repositories = createFactoryRepositories(database);
      seedAttempt(repositories);
      effects = createEffectRepository(database, {
        verifyApprovalIssuance: (issuance) =>
          issuance.issuerId === "trusted.approval-service" &&
          issuance.attestationDigest === APPROVAL_ATTESTATION_DIGEST &&
          issuance.payloadDigest === PAYLOAD_DIGEST,
        verifyObservationAttestation: () => false,
      });
    },
  });
  runtimes.push(runtime);
  return { runtime, effects };
}

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("effects.status and effects.list", () => {
  it("reports zero-filled counts, zero pending outbox, and a disabled pump when nothing is planned", async () => {
    const { runtime } = await openRuntimeWithEffects();
    const result = await runtime.handler(
      request("effects.status", "74000000-0000-4000-8000-0000000000f0", {}),
      {
        requestId: REQUEST_ID,
      },
    );
    if (result.operation !== "effects.status") throw new Error("Unexpected effects.status result");
    expect(result.status).toEqual({
      counts: {
        planned: 0,
        sent: 0,
        observed: 0,
        confirmed: 0,
        unknown: 0,
        "manual-intervention": 0,
        rejected: 0,
      },
      pendingOutbox: 0,
      pump: { enabled: false, lastActivityAt: null, lastErrorMessage: null },
    });
  });

  it("counts a planned effect and includes it in the pending outbox", async () => {
    const { runtime, effects } = await openRuntimeWithEffects();
    planEffect(effects, EFFECT_1, APPROVAL_1, "owner/repository#101", CHECKPOINT_ID, 0);

    const result = await runtime.handler(
      request("effects.status", "74000000-0000-4000-8000-0000000000f1", {}),
      {
        requestId: REQUEST_ID,
      },
    );
    if (result.operation !== "effects.status") throw new Error("Unexpected effects.status result");
    expect(result.status.counts.planned).toBe(1);
    expect(result.status.pendingOutbox).toBe(1);
    expect(result.status.pump).toEqual({
      enabled: false,
      lastActivityAt: null,
      lastErrorMessage: null,
    });
  });

  it("lists planned effects newest-first with state, marker, and provider intact, and supports pagination", async () => {
    const { runtime, effects } = await openRuntimeWithEffects();
    planEffect(effects, EFFECT_1, APPROVAL_1, "owner/repository#101", CHECKPOINT_ID, 0);
    planEffect(effects, EFFECT_2, APPROVAL_2, "owner/repository#102", SECOND_CHECKPOINT_ID, 1);

    const firstPage = await runtime.handler(
      request("effects.list", "74000000-0000-4000-8000-0000000000f2", {
        state: null,
        provider: null,
        after: null,
        limit: 1,
      }),
      { requestId: REQUEST_ID },
    );
    if (firstPage.operation !== "effects.list") throw new Error("Unexpected effects.list result");
    expect(firstPage.page.effects).toHaveLength(1);
    const [firstItem] = firstPage.page.effects;
    expect(firstItem?.effect.effectId).toBe(EFFECT_2);
    expect(firstItem?.effect.state).toBe("planned");
    expect(firstItem?.effect.operationMarker).toBe(`app-factory:v1:github:merge:${EFFECT_2}`);
    expect(firstItem?.effect.target.provider).toBe("github");
    expect(firstPage.page.hasMore).toBe(true);
    expect(firstPage.page.nextAfter).not.toBeNull();

    const secondPage = await runtime.handler(
      request("effects.list", "74000000-0000-4000-8000-0000000000f3", {
        state: null,
        provider: null,
        after: firstPage.page.nextAfter,
        limit: 1,
      }),
      { requestId: REQUEST_ID },
    );
    if (secondPage.operation !== "effects.list") throw new Error("Unexpected effects.list result");
    expect(secondPage.page.effects.map(({ effect: item }) => item.effectId)).toEqual([EFFECT_1]);
    expect(secondPage.page.hasMore).toBe(false);
    expect(secondPage.page.nextAfter).toBeNull();
  });

  it("filters effects.list by state and provider", async () => {
    const { runtime, effects } = await openRuntimeWithEffects();
    planEffect(effects, EFFECT_1, APPROVAL_1, "owner/repository#101", CHECKPOINT_ID, 0);
    planEffect(effects, EFFECT_2, APPROVAL_2, "owner/repository#102", SECOND_CHECKPOINT_ID, 1);

    const filtered = await runtime.handler(
      request("effects.list", "74000000-0000-4000-8000-0000000000f4", {
        state: "planned",
        provider: "github",
        after: null,
        limit: 50,
      }),
      { requestId: REQUEST_ID },
    );
    if (filtered.operation !== "effects.list") throw new Error("Unexpected effects.list result");
    expect(filtered.page.effects).toHaveLength(2);

    const none = await runtime.handler(
      request("effects.list", "74000000-0000-4000-8000-0000000000f5", {
        state: "confirmed",
        provider: null,
        after: null,
        limit: 50,
      }),
      { requestId: REQUEST_ID },
    );
    if (none.operation !== "effects.list") throw new Error("Unexpected effects.list result");
    expect(none.page.effects).toHaveLength(0);
    expect(none.page.hasMore).toBe(false);
  });
});
