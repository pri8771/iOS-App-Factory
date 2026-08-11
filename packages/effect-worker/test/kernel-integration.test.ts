import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AdapterRegistry } from "@app-factory/adapter-sdk";
import {
  computeTaskSpecDigest,
  createEffectRepository,
  createFactoryRepositories,
  MAX_UNRESOLVED_RECONCILIATIONS,
  openMigratedFactoryDatabase,
} from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import { EffectWorker, createInMemorySanitizingEvidencePort } from "../src/index.js";

const T0 = "2026-08-10T12:00:00.000Z";
const T1 = "2026-08-10T12:00:01.000Z";
const T2 = "2026-08-10T12:00:02.000Z";
const T3 = "2026-08-10T12:00:03.000Z";
const T4 = "2026-08-10T12:00:04.000Z";
const T5 = "2026-08-10T12:00:05.000Z";
const T6 = "2026-08-10T12:00:06.000Z";
const T7 = "2026-08-10T12:00:07.000Z";
const T8 = "2026-08-10T12:00:08.000Z";
const T9 = "2026-08-10T12:00:09.000Z";
const T10 = "2026-08-10T12:00:10.000Z";
const T11 = "2026-08-10T12:00:11.000Z";
const T20 = "2026-08-10T12:00:20.000Z";
const EXPIRES = "2026-08-10T13:00:00.000Z";

const PROJECT_ID = "71000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "71000000-0000-4000-8000-000000000002";
const TASK_ID = "71000000-0000-4000-8000-000000000003";
const COMMAND_ID = "71000000-0000-4000-8000-000000000004";
const ATTEMPT_ID = "71000000-0000-4000-8000-000000000005";
const EVENT_ID = "71000000-0000-4000-8000-000000000006";
const FENCE_EVENT_ID = "71000000-0000-4000-8000-000000000007";
const RUNNING_EVENT_ID = "71000000-0000-4000-8000-000000000008";
const STEP_ID = "71000000-0000-4000-8000-000000000009";
const STEP_CREATED_EVENT_ID = "71000000-0000-4000-8000-00000000000a";
const STEP_RUNNING_EVENT_ID = "71000000-0000-4000-8000-00000000000b";
const CHECKPOINT_ID = "71000000-0000-4000-8000-00000000000c";
const APPROVAL_ID = "71000000-0000-4000-8000-000000000010";
const EFFECT_ID = "71000000-0000-4000-8000-000000000020";
const RELEASE_ID = "71000000-0000-4000-8000-000000000030";
const OBSERVATION_ID = "71000000-0000-4000-8000-000000000040";

const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const PAYLOAD_DIGEST = `sha256:${"b".repeat(64)}`;
const PLAN_DIGEST = `sha256:${"c".repeat(64)}`;
const DIFF_DIGEST = `sha256:${"d".repeat(64)}`;
const BUILD_DIGEST = `sha256:${"e".repeat(64)}`;
const DETAIL_DIGEST = `sha256:${"f".repeat(64)}`;
const OBSERVED_DIGEST = `sha256:${"1".repeat(64)}`;
const APPROVAL_ATTESTATION_DIGEST = `sha256:${"6".repeat(64)}`;
const OBSERVATION_ATTESTATION_DIGEST = `sha256:${"9".repeat(64)}`;
const BASE_COMMIT = "2".repeat(40);
const EFFECT_COMMIT = "3".repeat(40);

const temporaryDirectories: string[] = [];

function makeDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-effect-worker-kernel-"));
  temporaryDirectories.push(directory);
  return join(directory, "factory.db");
}

function seedAttempt(database: ReturnType<typeof openMigratedFactoryDatabase>): void {
  const taskSpec = {
    schemaVersion: 1,
    taskId: TASK_ID,
    projectId: PROJECT_ID,
    createdAt: T0,
    title: "Exercise the real effect repository",
    objective: "Verify worker routing against the durable kernel state machine.",
    acceptanceCriteria: [
      {
        id: "effect-safe",
        statement: "Ambiguous provider results preserve legal effect state.",
        verification: "automated",
      },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: BASE_COMMIT },
    requestedScope: { paths: ["Factory/Effect.swift"] },
    policyDigest: POLICY_DIGEST,
  } as const;
  const taskSpecDigest = computeTaskSpecDigest(taskSpec);
  const repositories = createFactoryRepositories(database);
  repositories.artifacts.record({
    artifact: {
      digest: DETAIL_DIGEST,
      byteLength: 16,
      mediaType: "application/json",
      logicalName: "provider-evidence.json",
    },
    storagePath: "/private/tmp/app-factory-effect-worker-evidence.json",
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
    leaseKey: `attempt:${ATTEMPT_ID}`,
    attemptId: ATTEMPT_ID,
    ownerId: "worker.effect",
    expectedAttemptRevision: 0,
    acquiredAt: "2026-08-10T12:00:00.100Z",
    expiresAt: EXPIRES,
    event: {
      schemaVersion: 1,
      eventId: FENCE_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 2,
      occurredAt: "2026-08-10T12:00:00.100Z",
      commandId: null,
      causationEventId: EVENT_ID,
      fence: 1,
      type: "attempt.fence-claimed",
      data: { previousFence: 0, newFence: 1, ownerId: "worker.effect" },
    },
  });
  const runningAttempt = {
    ...claimed.attempt,
    state: "running",
    revision: 2,
    updatedAt: "2026-08-10T12:00:00.200Z",
  } as const;
  repositories.transitionAttemptState({
    leaseKey: `attempt:${ATTEMPT_ID}`,
    ownerId: "worker.effect",
    observedAt: "2026-08-10T12:00:00.200Z",
    expectedRevision: 1,
    attempt: runningAttempt,
    event: {
      schemaVersion: 1,
      eventId: RUNNING_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 3,
      occurredAt: "2026-08-10T12:00:00.200Z",
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
    observedAt: "2026-08-10T12:00:00.300Z",
    step: pendingStep,
    event: {
      schemaVersion: 1,
      eventId: STEP_CREATED_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 4,
      occurredAt: "2026-08-10T12:00:00.300Z",
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
    observedAt: "2026-08-10T12:00:00.400Z",
    expectedRevision: 0,
    fence: 1,
    step: {
      ...pendingStep,
      state: "running",
      revision: 1,
      runCount: 1,
      startedAt: "2026-08-10T12:00:00.400Z",
    },
    event: {
      schemaVersion: 1,
      eventId: STEP_RUNNING_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 5,
      occurredAt: "2026-08-10T12:00:00.400Z",
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

function approval() {
  return {
    schemaVersion: 1,
    approvalId: APPROVAL_ID,
    action: "github.merge-pr",
    resourceType: "github.pull-request",
    resourceKey: "owner/repository#42",
    subject: {
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      releaseId: RELEASE_ID,
    },
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

function effect() {
  return {
    schemaVersion: 1,
    effectId: EFFECT_ID,
    attemptId: ATTEMPT_ID,
    action: "github.merge-pr",
    operationMarker: `app-factory:v1:github:merge:${EFFECT_ID}`,
    target: {
      provider: "github",
      resourceType: "github.pull-request",
      resourceKey: "owner/repository#42",
    },
    subject: approval().subject,
    payloadDigest: PAYLOAD_DIGEST,
    policyDigest: POLICY_DIGEST,
    approvalId: APPROVAL_ID,
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

function openFixture() {
  const database = openMigratedFactoryDatabase(makeDatabasePath());
  seedAttempt(database);
  const effects = createEffectRepository(database, {
    verifyApprovalIssuance: (issuance) =>
      issuance.issuerId === "trusted.approval-service" &&
      issuance.attestationDigest === APPROVAL_ATTESTATION_DIGEST &&
      issuance.payloadDigest === PAYLOAD_DIGEST,
    verifyObservationAttestation: ({ observation }) =>
      observation.adapterId === "github.rest" &&
      observation.adapterVersion === "1.0.0" &&
      observation.attestationDigest === OBSERVATION_ATTESTATION_DIGEST,
  });
  effects.registerApproval({
    issuance: {
      approval: approval(),
      payloadDigest: PAYLOAD_DIGEST,
      issuerId: "trusted.approval-service",
      authenticatedAt: T0,
      attestationDigest: APPROVAL_ATTESTATION_DIGEST,
    },
  });
  effects.planExternalEffect({
    effect: effect(),
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
      checkpointId: CHECKPOINT_ID,
      leaseKey: `attempt:${ATTEMPT_ID}`,
      ownerId: "worker.effect",
      fence: 1,
      stepId: STEP_ID,
      expectedAttemptRevision: 3,
      expectedStepRevision: 1,
      expectedCheckpointRevision: 0,
    },
  });
  return { database, effects };
}

function beginSentFixture() {
  const fixture = openFixture();
  const claim = fixture.effects.claimNextSend({
    ownerId: "dispatcher.integration",
    observedAt: T2,
    lockedUntil: T8,
  });
  if (claim === null) throw new Error("expected send claim");
  fixture.effects.beginSend({
    effectId: EFFECT_ID,
    ownerId: "dispatcher.integration",
    fence: claim.fence,
    expectedOutboxRevision: claim.revision,
    expectedEffectRevision: 0,
    observedAt: T3,
  });
  return fixture;
}

function beginObservedFixture() {
  const fixture = openFixture();
  const sendClaim = fixture.effects.claimNextSend({
    ownerId: "dispatcher.integration",
    observedAt: T2,
    lockedUntil: T5,
  });
  if (sendClaim === null) throw new Error("expected send claim");
  fixture.effects.beginSend({
    effectId: EFFECT_ID,
    ownerId: "dispatcher.integration",
    fence: sendClaim.fence,
    expectedOutboxRevision: sendClaim.revision,
    expectedEffectRevision: 0,
    observedAt: T3,
  });
  fixture.effects.recordSendOutcome({
    effectId: EFFECT_ID,
    ownerId: "dispatcher.integration",
    fence: sendClaim.fence,
    expectedOutboxRevision: sendClaim.revision,
    expectedEffectRevision: 1,
    observedAt: T4,
    outcome: {
      kind: "ambiguous",
      providerCorrelationKey: "github-pr-42",
      nextReconcileAt: T6,
      detailDigest: DETAIL_DIGEST,
    },
  });
  const reconciliation = fixture.effects.claimNextReconciliation({
    ownerId: "reconciler.integration",
    observedAt: T6,
    lockedUntil: T9,
  });
  if (reconciliation === null) throw new Error("expected reconciliation claim");
  const resource = {
    schemaVersion: 1,
    effectId: EFFECT_ID,
    target: effect().target,
    providerResourceId: "42",
    providerUrl: "https://github.example.invalid/owner/repository/pull/42",
    providerVersion: EFFECT_COMMIT,
    observedDigest: OBSERVED_DIGEST,
    observedAt: T7,
  } as const;
  fixture.effects.recordReconciliationObserved({
    effectId: EFFECT_ID,
    ownerId: "reconciler.integration",
    fence: reconciliation.fence,
    expectedOutboxRevision: reconciliation.revision,
    expectedEffectRevision: 2,
    observedAt: T7,
    providerCorrelationKey: "github-pr-42",
    resource,
    observation: {
      schemaVersion: 1,
      invocationId: OBSERVATION_ID,
      source: "provider-reconciliation",
      adapterId: "github.rest",
      adapterVersion: "1.0.0",
      evidenceDigest: DETAIL_DIGEST,
      attestationDigest: OBSERVATION_ATTESTATION_DIGEST,
      observedAt: T7,
    },
    detailDigest: DETAIL_DIGEST,
  });
  return fixture;
}

function workerClock(...times: readonly string[]) {
  let index = 0;
  return { now: () => new Date(times[Math.min(index++, times.length - 1)] ?? T11) };
}

function adaptersFor(kind: "ambiguous" | "manual-intervention") {
  const adapters = new AdapterRegistry();
  adapters.register({
    adapterId: "github.rest",
    adapterVersion: "1.0.0",
    provider: "github",
    async preflight() {
      return {
        schemaVersion: 1,
        adapterId: "github.rest",
        adapterVersion: "1.0.0",
        provider: "github",
        checkedAt: T8,
        credentialReference: null,
        capabilities: [],
      };
    },
    async send() {
      throw new Error("integration test only exercises reconciliation");
    },
    async reconcile(value) {
      if (kind === "manual-intervention") {
        return {
          kind,
          code: "github.operator-review",
          detail: new TextEncoder().encode('{"safe":"manual"}\n'),
        };
      }
      return {
        kind,
        correlationKey: value.effect.providerCorrelationKey,
        reconcileAfter: T20,
        detail: new TextEncoder().encode('{"safe":"ambiguous"}\n'),
      };
    },
  });
  return adapters;
}

function worker(
  repository: ReturnType<typeof openFixture>["effects"],
  adapters: AdapterRegistry,
  clock = workerClock(T8, T9, T10, T11),
) {
  return new EffectWorker({
    ownerId: "worker.kernel-integration",
    repository,
    adapters,
    payloads: {
      read: () => {
        throw new Error("reconciliation must not read a payload");
      },
    },
    evidence: createInMemorySanitizingEvidencePort(new Map()),
    observations: {
      issue: () => {
        throw new Error("non-observed reconciliation must not issue an observation");
      },
    },
    credentials: { referenceFor: () => null },
    clock,
    claimDurationMs: 60_000,
    adapterCallTimeoutMs: 10_000,
    reconcileDelayMs: 30_000,
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("effect worker with the real SQLite kernel", () => {
  it("routes manual intervention from sent through unknown", async () => {
    const fixture = beginSentFixture();
    await expect(
      worker(fixture.effects, adaptersFor("manual-intervention")).processNextReconciliation(
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ kind: "completed", state: "unknown" });
    expect(fixture.effects.getEffect(EFFECT_ID)?.effect).toMatchObject({
      state: "unknown",
      revision: 2,
    });
    fixture.database.close();
  });

  it("preserves observed when confirmation is ambiguous", async () => {
    const fixture = beginObservedFixture();
    await expect(
      worker(fixture.effects, adaptersFor("ambiguous")).processNextReconciliation(
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ kind: "completed", state: "observed" });
    expect(fixture.effects.getEffect(EFFECT_ID)?.effect).toMatchObject({
      state: "observed",
      revision: 4,
      providerCorrelationKey: "github-pr-42",
    });
    expect(
      fixture.database
        .prepare(
          "SELECT outcome, provider_correlation_key AS correlation FROM effect_reconciliation_attempts WHERE effect_id = ?",
        )
        .get(EFFECT_ID),
    ).toEqual({ outcome: "ambiguous", correlation: "github-pr-42" });
    fixture.database.close();
  });

  it("ends repeated observed deferrals at the durable manual-intervention threshold", async () => {
    const fixture = beginObservedFixture();
    const resourceBefore = fixture.effects.getExternalResource(EFFECT_ID);
    const observationBefore = fixture.database
      .prepare(
        "SELECT payload_json AS payloadJson FROM effect_observations WHERE effect_id = ? ORDER BY observed_at DESC LIMIT 1",
      )
      .get(EFFECT_ID);
    let effectRevision = 3;
    let nextAvailableAt = Date.parse(T8);

    for (let index = 0; index < MAX_UNRESOLVED_RECONCILIATIONS - 1; index += 1) {
      const claimAtMs = nextAvailableAt + (index === 0 ? 0 : 1_000);
      const observedAtMs = claimAtMs + 100;
      nextAvailableAt = claimAtMs + 500;
      const claimAt = new Date(claimAtMs).toISOString();
      const observedAt = new Date(observedAtMs).toISOString();
      const nextReconcileAt = new Date(nextAvailableAt).toISOString();
      const claim = fixture.effects.claimNextReconciliation({
        ownerId: `reconciler.observed-threshold-${String(index)}`,
        observedAt: claimAt,
        lockedUntil: new Date(claimAtMs + 30_000).toISOString(),
      });
      if (claim === null) throw new Error("expected observed reconciliation claim");
      const deferred = fixture.effects.deferObservedReconciliation({
        effectId: EFFECT_ID,
        ownerId: `reconciler.observed-threshold-${String(index)}`,
        fence: claim.fence,
        expectedOutboxRevision: claim.revision,
        expectedEffectRevision: effectRevision,
        observedAt,
        outcome: index % 2 === 0 ? "not-found" : "ambiguous",
        providerCorrelationKey: "github-pr-42",
        nextReconcileAt,
        detailDigest: DETAIL_DIGEST,
      });
      expect(deferred.effect.state).toBe("observed");
      effectRevision += 1;
    }

    const finalStartMs = nextAvailableAt + 1_000;
    const finalClock = workerClock(
      ...Array.from({ length: 8 }, (_, index) =>
        new Date(finalStartMs + index * 100).toISOString(),
      ),
    );
    await expect(
      worker(fixture.effects, adaptersFor("ambiguous"), finalClock).processNextReconciliation(
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ kind: "completed", state: "manual-intervention" });
    expect(fixture.effects.getEffect(EFFECT_ID)?.effect).toMatchObject({
      state: "manual-intervention",
      revision: 3 + MAX_UNRESOLVED_RECONCILIATIONS,
      lastObservedAt: T7,
      nextReconcileAt: null,
    });
    expect(fixture.effects.getExternalResource(EFFECT_ID)).toEqual(resourceBefore);
    expect(
      fixture.database
        .prepare(
          "SELECT payload_json AS payloadJson FROM effect_observations WHERE effect_id = ? ORDER BY observed_at DESC LIMIT 1",
        )
        .get(EFFECT_ID),
    ).toEqual(observationBefore);
    expect(
      fixture.database
        .prepare("SELECT COUNT(*) AS count FROM effect_reconciliation_attempts")
        .get(),
    ).toEqual({ count: MAX_UNRESOLVED_RECONCILIATIONS });
    expect(
      fixture.database
        .prepare(
          "SELECT from_state AS fromState, to_state AS toState FROM effect_transitions WHERE effect_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(EFFECT_ID),
    ).toEqual({ fromState: "observed", toState: "manual-intervention" });
    fixture.database.close();
  });

  it("retains attested resource evidence when observed requires manual intervention", async () => {
    const fixture = beginObservedFixture();
    const resourceBefore = fixture.effects.getExternalResource(EFFECT_ID);
    await expect(
      worker(fixture.effects, adaptersFor("manual-intervention")).processNextReconciliation(
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ kind: "completed", state: "manual-intervention" });
    expect(fixture.effects.getEffect(EFFECT_ID)?.effect).toMatchObject({
      state: "manual-intervention",
      revision: 4,
      lastObservedAt: T7,
      nextReconcileAt: null,
    });
    expect(fixture.effects.getExternalResource(EFFECT_ID)).toEqual(resourceBefore);
    expect(
      fixture.database
        .prepare(
          "SELECT from_state AS fromState, to_state AS toState FROM effect_transitions WHERE effect_id = ? ORDER BY sequence DESC LIMIT 1",
        )
        .get(EFFECT_ID),
    ).toEqual({ fromState: "observed", toState: "manual-intervention" });
    fixture.database.close();
  });
});
