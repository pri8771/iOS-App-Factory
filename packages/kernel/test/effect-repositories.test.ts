import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  LEGAL_EXTERNAL_EFFECT_TRANSITIONS,
  assertApprovalSemantics,
  assertLegalExternalEffectTransition,
  computeTaskSpecDigest,
  createEffectRepository,
  createFactoryRepositories,
  isLegalExternalEffectTransition,
  MAX_EFFECT_RECONCILE_BACKOFF_MS,
  MAX_UNRESOLVED_RECONCILIATIONS,
  openMigratedFactoryDatabase,
} from "../src/index.js";

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
const EXPIRES = "2026-08-10T13:00:00.000Z";
const SEED_LEASE_AT = "2026-08-10T12:00:00.100Z";
const SEED_ATTEMPT_RUNNING_AT = "2026-08-10T12:00:00.200Z";
const SEED_STEP_CREATED_AT = "2026-08-10T12:00:00.300Z";
const SEED_STEP_RUNNING_AT = "2026-08-10T12:00:00.400Z";

const PROJECT_ID = "70000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "70000000-0000-4000-8000-000000000002";
const TASK_ID = "70000000-0000-4000-8000-000000000003";
const COMMAND_ID = "70000000-0000-4000-8000-000000000004";
const ATTEMPT_ID = "70000000-0000-4000-8000-000000000005";
const EVENT_ID = "70000000-0000-4000-8000-000000000006";
const FENCE_EVENT_ID = "70000000-0000-4000-8000-000000000007";
const ATTEMPT_RUNNING_EVENT_ID = "70000000-0000-4000-8000-000000000008";
const STEP_ID = "70000000-0000-4000-8000-000000000009";
const STEP_CREATED_EVENT_ID = "70000000-0000-4000-8000-00000000000a";
const STEP_RUNNING_EVENT_ID = "70000000-0000-4000-8000-00000000000b";
const CHECKPOINT_ID = "70000000-0000-4000-8000-00000000000c";
const SECOND_CHECKPOINT_ID = "70000000-0000-4000-8000-00000000000d";
const THIRD_CHECKPOINT_ID = "70000000-0000-4000-8000-00000000000e";
const APPROVAL_ID = "70000000-0000-4000-8000-000000000010";
const SECOND_APPROVAL_ID = "70000000-0000-4000-8000-000000000011";
const EFFECT_ID = "70000000-0000-4000-8000-000000000020";
const SECOND_EFFECT_ID = "70000000-0000-4000-8000-000000000021";
const THIRD_EFFECT_ID = "70000000-0000-4000-8000-000000000022";
const RELEASE_ID = "70000000-0000-4000-8000-000000000030";
const OTHER_RELEASE_ID = "70000000-0000-4000-8000-000000000031";

const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const PAYLOAD_DIGEST = `sha256:${"b".repeat(64)}`;
const PLAN_DIGEST = `sha256:${"c".repeat(64)}`;
const DIFF_DIGEST = `sha256:${"d".repeat(64)}`;
const BUILD_DIGEST = `sha256:${"e".repeat(64)}`;
const DETAIL_DIGEST = `sha256:${"f".repeat(64)}`;
const OBSERVED_DIGEST = `sha256:${"1".repeat(64)}`;
const ATTESTATION_DIGEST = `sha256:${"6".repeat(64)}`;
const CONFIRMATION_DIGEST = `sha256:${"7".repeat(64)}`;
const REJECTION_DIGEST = `sha256:${"8".repeat(64)}`;
const OBSERVATION_ATTESTATION_DIGEST = `sha256:${"9".repeat(64)}`;
const BASE_COMMIT = "2".repeat(40);
const EFFECT_COMMIT = "3".repeat(40);
const SEND_INVOCATION_ID = "70000000-0000-4000-8000-000000000040";
const RECONCILE_INVOCATION_ID = "70000000-0000-4000-8000-000000000041";
const CONFIRM_INVOCATION_ID = "70000000-0000-4000-8000-000000000042";

const temporaryDirectories: string[] = [];

function makeDatabasePath(): string {
  const directory = mkdtempSync(join(tmpdir(), "app-factory-effects-test-"));
  temporaryDirectories.push(directory);
  return join(directory, "factory.db");
}

function seedAttempt(database: Database.Database): void {
  const taskSpec = {
    schemaVersion: 1,
    taskId: TASK_ID,
    projectId: PROJECT_ID,
    createdAt: T0,
    title: "Exercise an external effect",
    objective: "Prove approval-bound transactional external effects.",
    acceptanceCriteria: [
      {
        id: "effect-safe",
        statement: "The external effect is reconciled safely.",
        verification: "automated",
      },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: BASE_COMMIT },
    requestedScope: { paths: ["Factory/Effect.swift"] },
    policyDigest: POLICY_DIGEST,
  } as const;
  const taskSpecDigest = computeTaskSpecDigest(taskSpec);
  const repositories = createFactoryRepositories(database);
  for (const [index, digest] of [DETAIL_DIGEST, CONFIRMATION_DIGEST, REJECTION_DIGEST].entries()) {
    repositories.artifacts.record({
      artifact: {
        digest,
        byteLength: 16 + index,
        mediaType: "application/json",
        logicalName: `provider-evidence-${String(index)}.json`,
      },
      storagePath: `/private/tmp/app-factory-provider-evidence-${String(index)}.json`,
      recordedAt: T0,
    });
  }
  const created = repositories.createTaskAttempt({
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
    acquiredAt: SEED_LEASE_AT,
    expiresAt: EXPIRES,
    event: {
      schemaVersion: 1,
      eventId: FENCE_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 2,
      occurredAt: SEED_LEASE_AT,
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
    updatedAt: SEED_ATTEMPT_RUNNING_AT,
  } as const;
  repositories.transitionAttemptState({
    leaseKey: `attempt:${ATTEMPT_ID}`,
    ownerId: "worker.effect",
    observedAt: SEED_ATTEMPT_RUNNING_AT,
    expectedRevision: 1,
    attempt: runningAttempt,
    event: {
      schemaVersion: 1,
      eventId: ATTEMPT_RUNNING_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 3,
      occurredAt: SEED_ATTEMPT_RUNNING_AT,
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
    observedAt: SEED_STEP_CREATED_AT,
    step: pendingStep,
    event: {
      schemaVersion: 1,
      eventId: STEP_CREATED_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 4,
      occurredAt: SEED_STEP_CREATED_AT,
      commandId: null,
      causationEventId: ATTEMPT_RUNNING_EVENT_ID,
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
    observedAt: SEED_STEP_RUNNING_AT,
    expectedRevision: 0,
    fence: 1,
    step: {
      ...pendingStep,
      state: "running",
      revision: 1,
      runCount: 1,
      startedAt: SEED_STEP_RUNNING_AT,
    },
    event: {
      schemaVersion: 1,
      eventId: STEP_RUNNING_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 5,
      occurredAt: SEED_STEP_RUNNING_AT,
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
  expect(created.duplicate).toBe(false);
}

function openSeededDatabase(databasePath = makeDatabasePath()) {
  const database = openMigratedFactoryDatabase(databasePath);
  seedAttempt(database);
  return {
    databasePath,
    database,
    effects: createEffectRepository(database, {
      verifyApprovalIssuance: (issuance) =>
        issuance.issuerId === "trusted.approval-service" &&
        issuance.attestationDigest === ATTESTATION_DIGEST &&
        issuance.payloadDigest === PAYLOAD_DIGEST,
      verifyObservationAttestation: ({ observation }) =>
        observation.adapterId === "github.rest" &&
        observation.adapterVersion === "1.0.0" &&
        observation.attestationDigest === OBSERVATION_ATTESTATION_DIGEST,
    }),
  };
}

function subject(releaseId: string | null = RELEASE_ID) {
  return {
    projectId: PROJECT_ID,
    taskId: TASK_ID,
    attemptId: ATTEMPT_ID,
    releaseId,
  };
}

function approval(
  approvalId = APPROVAL_ID,
  options: Readonly<{
    mode?: "single-use" | "standing";
    standingScope?: readonly string[] | null;
    expiresAt?: string;
  }> = {},
) {
  const mode = options.mode ?? "single-use";
  return {
    schemaVersion: 1,
    approvalId,
    action: "github.merge-pr",
    resourceType: "github.pull-request",
    resourceKey: "owner/repository#42",
    subject: subject(),
    binding: {
      planDigest: PLAN_DIGEST,
      diffDigest: DIFF_DIGEST,
      commit: EFFECT_COMMIT,
      buildIdentityDigest: BUILD_DIGEST,
      policyDigest: POLICY_DIGEST,
    },
    actorId: "owner@example.com",
    mode,
    standingScope:
      options.standingScope === undefined
        ? mode === "standing"
          ? ["github.repository-write"]
          : null
        : options.standingScope,
    issuedAt: T0,
    expiresAt: options.expiresAt ?? EXPIRES,
    status: "active",
    revokedAt: null,
    consumedAt: null,
    consumedByEffectId: null,
  };
}

function effect(effectId = EFFECT_ID, approvalId = APPROVAL_ID) {
  return {
    schemaVersion: 1,
    effectId,
    attemptId: ATTEMPT_ID,
    action: "github.merge-pr",
    operationMarker: `app-factory:v1:github:merge:${effectId}`,
    target: {
      provider: "github",
      resourceType: "github.pull-request",
      resourceKey: "owner/repository#42",
    },
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
  };
}

function plan(
  effectSnapshot = effect(),
  standingScope: string | null = null,
  originOverrides: Readonly<{
    checkpointId?: string;
    expectedAttemptRevision?: number;
    expectedStepRevision?: number;
    expectedCheckpointRevision?: number;
  }> = {},
  availableAt = T1,
) {
  return {
    effect: effectSnapshot,
    binding: {
      planDigest: PLAN_DIGEST,
      diffDigest: DIFF_DIGEST,
      commit: EFFECT_COMMIT,
      buildIdentityDigest: BUILD_DIGEST,
    },
    authorizedAt: T1,
    availableAt,
    standingScope,
    origin: {
      checkpointId: originOverrides.checkpointId ?? CHECKPOINT_ID,
      leaseKey: `attempt:${ATTEMPT_ID}`,
      ownerId: "worker.effect",
      fence: 1,
      stepId: STEP_ID,
      expectedAttemptRevision: originOverrides.expectedAttemptRevision ?? 3,
      expectedStepRevision: originOverrides.expectedStepRevision ?? 1,
      expectedCheckpointRevision: originOverrides.expectedCheckpointRevision ?? 0,
    },
  };
}

function issuance(approvalSnapshot = approval()) {
  return {
    issuance: {
      approval: approvalSnapshot,
      payloadDigest: PAYLOAD_DIGEST,
      issuerId: "trusted.approval-service",
      authenticatedAt: approvalSnapshot.issuedAt,
      attestationDigest: ATTESTATION_DIGEST,
    },
  };
}

function resource(effectId = EFFECT_ID, observedAt = T7) {
  return {
    schemaVersion: 1,
    effectId,
    target: {
      provider: "github",
      resourceType: "github.pull-request",
      resourceKey: "owner/repository#42",
    },
    providerResourceId: "42",
    providerUrl: "https://github.com/owner/repository/pull/42",
    providerVersion: EFFECT_COMMIT,
    observedDigest: OBSERVED_DIGEST,
    observedAt,
  };
}

function observation(
  invocationId = RECONCILE_INVOCATION_ID,
  observedAt = T7,
  source: "provider-send" | "provider-reconciliation" = "provider-reconciliation",
  evidenceDigest = DETAIL_DIGEST,
) {
  return {
    schemaVersion: 1,
    invocationId,
    source,
    adapterId: "github.rest",
    adapterVersion: "1.0.0",
    evidenceDigest,
    attestationDigest: OBSERVATION_ATTESTATION_DIGEST,
    observedAt,
  } as const;
}

function requireClaim<T>(claim: T | null): T {
  if (claim === null) throw new Error("Expected an outbox claim in test setup");
  return claim;
}

function setAttemptControlState(
  database: Database.Database,
  state: "running" | "paused" | "failed" | "cancelled",
  desiredState: "running" | "paused" | "cancelled",
  updatedAt = T2,
): void {
  const row = database
    .prepare("SELECT payload_json FROM attempts WHERE attempt_id = ?")
    .get(ATTEMPT_ID) as Readonly<{ payload_json: string }>;
  const current = JSON.parse(row.payload_json) as Record<string, unknown>;
  const terminal = state === "failed" || state === "cancelled";
  const outcome =
    state === "failed"
      ? {
          kind: "failed",
          failure: {
            code: "provider.dispatch-blocked",
            summary: "Dispatch safety test",
            retryable: false,
            detailArtifactDigest: null,
          },
        }
      : state === "cancelled"
        ? { kind: "cancelled", reason: "Dispatch safety test" }
        : null;
  const next = {
    ...current,
    state,
    desiredState,
    revision: Number(current.revision) + 1,
    currentStepId: terminal ? null : current.currentStepId,
    outcome,
    updatedAt,
    terminalAt: terminal ? updatedAt : null,
  };
  database
    .prepare(
      `UPDATE attempts SET
         state = ?, desired_state = ?, revision = ?, current_step_id = ?,
         outcome_json = ?, updated_at = ?, terminal_at = ?, payload_json = ?
       WHERE attempt_id = ?`,
    )
    .run(
      state,
      desiredState,
      next.revision,
      next.currentStepId,
      outcome === null ? null : JSON.stringify(outcome),
      updatedAt,
      terminal ? updatedAt : null,
      JSON.stringify(next),
      ATTEMPT_ID,
    );
}

function openSentEffectForFaultTest() {
  const seeded = openSeededDatabase();
  seeded.effects.registerApproval(issuance());
  seeded.effects.planExternalEffect(plan());
  const claim = requireClaim(
    seeded.effects.claimNextSend({
      ownerId: "dispatcher.fault",
      observedAt: T2,
      lockedUntil: T8,
    }),
  );
  seeded.effects.beginSend({
    effectId: EFFECT_ID,
    ownerId: "dispatcher.fault",
    fence: claim.fence,
    expectedOutboxRevision: claim.revision,
    expectedEffectRevision: 0,
    observedAt: T3,
  });
  return { ...seeded, claim };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("approval semantics", () => {
  it("rejects invalid temporal, status, mode, scope, and subject combinations", () => {
    expect(() => assertApprovalSemantics({ ...approval(), expiresAt: T0 })).toThrow(/expiresAt/);
    expect(() => assertApprovalSemantics({ ...approval(), subject: subject(null) })).not.toThrow();
    expect(() =>
      assertApprovalSemantics({
        ...approval(),
        subject: { projectId: null, taskId: null, attemptId: null, releaseId: null },
      }),
    ).toThrow(/at least one resource/);
    expect(() =>
      assertApprovalSemantics({
        ...approval(),
        subject: { projectId: null, taskId: TASK_ID, attemptId: null, releaseId: null },
      }),
    ).toThrow(/project/);
    expect(() =>
      assertApprovalSemantics({ ...approval(), standingScope: ["github.repository-write"] }),
    ).toThrow(/single-use/);
    expect(() =>
      assertApprovalSemantics(approval(APPROVAL_ID, { mode: "standing", standingScope: [] })),
    ).toThrow(/non-empty/);
    expect(() =>
      assertApprovalSemantics(
        approval(APPROVAL_ID, {
          mode: "standing",
          standingScope: ["github.repository-write", "github.repository-write"],
        }),
      ),
    ).toThrow(/duplicates/);
    expect(() =>
      assertApprovalSemantics({
        ...approval(),
        status: "consumed",
        consumedAt: T1,
        consumedByEffectId: null,
      }),
    ).toThrow(/complete consumption/);
  });

  it("rejects wildcard targets and missing action-specific bindings", () => {
    expect(() => assertApprovalSemantics({ ...approval(), resourceKey: "*" })).toThrow(
      /wildcard-like/,
    );
    expect(() =>
      assertApprovalSemantics({
        ...approval(),
        binding: { ...approval().binding, diffDigest: null },
      }),
    ).toThrow(/github\.merge-pr approval requires exact bindings/);
    expect(() =>
      assertApprovalSemantics({
        ...approval(),
        action: "apple.upload-build",
        resourceType: "apple.build",
        resourceKey: "com.example.app/1.0/7",
        binding: { ...approval().binding, planDigest: null },
      }),
    ).toThrow(/apple\.upload-build approval requires exact bindings/);
    expect(() =>
      assertApprovalSemantics({
        ...approval(),
        action: "jira.transition-issue",
        resourceType: "jira.issue",
        resourceKey: "APP-42",
        binding: { ...approval().binding, diffDigest: null },
      }),
    ).toThrow(/jira\.transition-issue approval requires exact bindings/);
    expect(() =>
      assertApprovalSemantics({
        ...approval(),
        action: "github.merge-queue",
      }),
    ).toThrow(/action is not registered/);
    expect(() =>
      assertApprovalSemantics({
        ...approval(),
        resourceType: "github.issue",
      }),
    ).toThrow(/resource type is not registered/);
    expect(() =>
      assertApprovalSemantics({
        ...approval(),
        action: "apple.testflight-upload",
        resourceType: "apple.build",
      }),
    ).toThrow(/action is not registered/);
  });

  it("accepts approvals only through the configured authenticated issuance boundary", () => {
    const { database } = openSeededDatabase();
    expect(() => createEffectRepository(database).registerApproval(issuance())).toThrow(
      /verifier is not configured/,
    );
    const rejecting = createEffectRepository(database, {
      verifyApprovalIssuance: () => false,
    });
    expect(() => rejecting.registerApproval(issuance())).toThrow(/attestation was rejected/);

    const trusted = createEffectRepository(database, {
      verifyApprovalIssuance: (candidate) =>
        candidate.issuerId === "trusted.approval-service" &&
        candidate.attestationDigest === ATTESTATION_DIGEST &&
        candidate.payloadDigest === PAYLOAD_DIGEST,
    });
    expect(trusted.registerApproval(issuance())).toMatchObject({
      duplicate: false,
      issuance: {
        issuerId: "trusted.approval-service",
        envelopeDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      },
    });
    expect(() =>
      trusted.registerApproval({
        issuance: {
          ...issuance(approval(SECOND_APPROVAL_ID)).issuance,
          payloadDigest: DETAIL_DIGEST,
        },
      }),
    ).toThrow(/attestation was rejected/);
    expect(() =>
      trusted.registerApproval(
        issuance({
          ...approval(SECOND_APPROVAL_ID),
          subject: { ...subject(), projectId: OTHER_RELEASE_ID },
        }),
      ),
    ).toThrow(/subject project/);
    expect(() =>
      trusted.registerApproval(
        issuance({
          ...approval(SECOND_APPROVAL_ID),
          binding: { ...approval().binding, policyDigest: OBSERVED_DIGEST },
        }),
      ),
    ).toThrow(/active TaskSpec policy digest/);

    database.exec("DROP TRIGGER approvals_identity_immutable");
    database.prepare("UPDATE approvals SET actor_id = 'tampered@example.com'").run();
    expect(() => trusted.getApproval(APPROVAL_ID)).toThrow(/approval actor projection/);
    database.close();
  });
});

describe("approval-bound effect planning", () => {
  it("matches every immutable input exactly, consumes once atomically, and replays one identity", () => {
    const { database, effects } = openSeededDatabase();
    effects.registerApproval(issuance());

    const base = effect();
    const mismatches = [
      plan({ ...base, action: "github.close-pr" }),
      plan({ ...base, target: { ...base.target, resourceType: "github.issue" } }),
      plan({ ...base, target: { ...base.target, resourceKey: "owner/repository#43" } }),
      plan({ ...base, subject: subject(OTHER_RELEASE_ID) }),
      plan({ ...base, payloadDigest: OBSERVED_DIGEST }),
      plan({ ...base, policyDigest: OBSERVED_DIGEST }),
      { ...plan(base), binding: { ...plan(base).binding, planDigest: OBSERVED_DIGEST } },
      { ...plan(base), binding: { ...plan(base).binding, diffDigest: OBSERVED_DIGEST } },
      { ...plan(base), binding: { ...plan(base).binding, commit: "4".repeat(40) } },
      { ...plan(base), binding: { ...plan(base).binding, buildIdentityDigest: OBSERVED_DIGEST } },
    ];
    for (const mismatch of mismatches) {
      expect(() => effects.planExternalEffect(mismatch)).toThrow(/does not match|must be/);
      expect(effects.getApproval(APPROVAL_ID)?.approval.status).toBe("active");
    }

    const planned = effects.planExternalEffect(plan(base));
    expect(planned).toMatchObject({ duplicate: false, effect: { state: "planned" } });
    expect(effects.getApproval(APPROVAL_ID)?.approval).toMatchObject({
      status: "consumed",
      consumedAt: T1,
      consumedByEffectId: EFFECT_ID,
    });
    expect(effects.registerApproval(issuance())).toMatchObject({
      duplicate: true,
      approval: { status: "consumed", consumedByEffectId: EFFECT_ID },
    });
    expect(database.prepare("SELECT COUNT(*) AS count FROM effect_outbox").get()).toEqual({
      count: 1,
    });
    expect(database.pragma("foreign_key_check")).toEqual([]);

    expect(effects.planExternalEffect(plan(base))).toMatchObject({
      duplicate: true,
      effect: { effectId: EFFECT_ID },
    });
    expect(effects.planExternalEffect(plan(effect(SECOND_EFFECT_ID, APPROVAL_ID)))).toMatchObject({
      duplicate: true,
      effect: { effectId: EFFECT_ID },
    });
    expect(
      effects.planExternalEffect(plan(effect(SECOND_EFFECT_ID, APPROVAL_ID), null, {}, T2)),
    ).toMatchObject({ duplicate: true, effect: { effectId: EFFECT_ID } });
    expect(() =>
      effects.planExternalEffect(
        plan(
          {
            ...effect(SECOND_EFFECT_ID, APPROVAL_ID),
            target: { ...base.target, resourceKey: "owner/repository#43" },
          },
          null,
          { checkpointId: SECOND_CHECKPOINT_ID, expectedCheckpointRevision: 1 },
        ),
      ),
    ).toThrow(/not active/);
    expect(() =>
      effects.planExternalEffect(plan({ ...base, payloadDigest: OBSERVED_DIGEST })),
    ).toThrow(/immutable identity/);
    database.close();
  });

  it("requires the live attempt lease and atomically CASes the originating step checkpoint", () => {
    const { database, effects } = openSeededDatabase();
    effects.registerApproval(issuance());

    expect(() =>
      effects.planExternalEffect({
        ...plan(),
        origin: { ...plan().origin, ownerId: "worker.stale" },
      }),
    ).toThrow(/active lease owner/);
    expect(() =>
      effects.planExternalEffect(plan(effect(), null, { expectedAttemptRevision: 2 })),
    ).toThrow(/planning attempt revision/);
    expect(() =>
      effects.planExternalEffect(plan(effect(), null, { expectedStepRevision: 0 })),
    ).toThrow(/originating step revision/);
    expect(
      database.prepare("SELECT effect_checkpoint_revision AS revision FROM steps").get(),
    ).toEqual({ revision: 0 });

    effects.planExternalEffect(plan());
    const alternateApproval = {
      ...approval(SECOND_APPROVAL_ID),
      action: "github.close-pr",
    };
    effects.registerApproval(issuance(alternateApproval));
    const alternateEffect = {
      ...effect(SECOND_EFFECT_ID, SECOND_APPROVAL_ID),
      action: "github.close-pr",
      operationMarker: `app-factory:v1:github:close:${SECOND_EFFECT_ID}`,
    };
    expect(() => effects.planExternalEffect(plan(alternateEffect))).toThrow(
      /originating checkpoint revision/,
    );
    expect(
      effects.planExternalEffect(
        plan(alternateEffect, null, {
          checkpointId: SECOND_CHECKPOINT_ID,
          expectedCheckpointRevision: 1,
        }),
      ).duplicate,
    ).toBe(false);
    expect(
      database.prepare("SELECT effect_checkpoint_revision AS revision FROM steps").get(),
    ).toEqual({ revision: 2 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM effect_origin_checkpoints").get(),
    ).toEqual({ count: 2 });
    database.close();
  });

  it("does not let a stale or paused semantic-dedup caller skip its no-op checkpoint", () => {
    const { database, effects } = openSeededDatabase();
    effects.registerApproval(
      issuance(
        approval(APPROVAL_ID, {
          mode: "standing",
          standingScope: ["github.repository-write"],
        }),
      ),
    );
    effects.planExternalEffect(plan(effect(), "github.repository-write"));
    const duplicatePlan = plan(effect(SECOND_EFFECT_ID), "github.repository-write", {
      checkpointId: SECOND_CHECKPOINT_ID,
      expectedCheckpointRevision: 1,
    });
    expect(() =>
      effects.planExternalEffect({
        ...duplicatePlan,
        origin: { ...duplicatePlan.origin, ownerId: "worker.stale" },
      }),
    ).toThrow(/active lease owner/);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM effect_origin_checkpoints").get(),
    ).toEqual({ count: 1 });

    setAttemptControlState(database, "running", "paused", T2);
    expect(() =>
      effects.planExternalEffect({
        ...duplicatePlan,
        origin: {
          ...duplicatePlan.origin,
          checkpointId: THIRD_CHECKPOINT_ID,
          expectedAttemptRevision: 4,
        },
      }),
    ).toThrow(/cannot dispatch/);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM effect_origin_checkpoints").get(),
    ).toEqual({ count: 1 });
    database.close();
  });

  it("rolls approval, intent, and outbox back together on a failed outbox insert", () => {
    const { database, effects } = openSeededDatabase();
    effects.registerApproval(issuance());
    database.exec(`
      CREATE TRIGGER test_abort_outbox
      BEFORE INSERT ON effect_outbox BEGIN
        SELECT RAISE(ABORT, 'injected outbox crash');
      END;
    `);

    expect(() => effects.planExternalEffect(plan())).toThrow(/injected outbox crash/);
    expect(effects.getApproval(APPROVAL_ID)?.approval.status).toBe("active");
    expect(effects.getEffect(EFFECT_ID)).toBeNull();
    expect(database.prepare("SELECT COUNT(*) AS count FROM effect_outbox").get()).toEqual({
      count: 0,
    });
    expect(
      database.prepare("SELECT effect_checkpoint_revision AS revision FROM steps").get(),
    ).toEqual({ revision: 0 });

    database.exec("DROP TRIGGER test_abort_outbox");
    expect(effects.planExternalEffect(plan()).duplicate).toBe(false);
    database.close();
  });

  it("keeps standing authority scoped, replay-safe, revocable, and unconsumed", () => {
    const { database, effects } = openSeededDatabase();
    effects.registerApproval(
      issuance(
        approval(APPROVAL_ID, {
          mode: "standing",
          standingScope: ["github.repository-write", "github.merge-write"],
        }),
      ),
    );
    expect(() => effects.planExternalEffect(plan(effect(), "github.issue-write"))).toThrow(
      /does not include requested scope/,
    );
    effects.planExternalEffect(plan(effect(), "github.repository-write"));
    expect(
      effects.planExternalEffect(
        plan(effect(SECOND_EFFECT_ID), "github.merge-write", {
          checkpointId: SECOND_CHECKPOINT_ID,
          expectedCheckpointRevision: 1,
        }),
      ),
    ).toMatchObject({ duplicate: true, effect: { effectId: EFFECT_ID } });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM effect_origin_checkpoints").get(),
    ).toEqual({ count: 2 });
    expect(effects.getApproval(APPROVAL_ID)?.approval.status).toBe("active");
    const standingClaim = requireClaim(
      effects.claimNextSend({
        ownerId: "dispatcher.standing",
        observedAt: T2,
        lockedUntil: T5,
      }),
    );
    expect(effects.revokeApproval(APPROVAL_ID, T3).approval.status).toBe("revoked");
    expect(() =>
      effects.beginSend({
        effectId: EFFECT_ID,
        ownerId: "dispatcher.standing",
        fence: standingClaim.fence,
        expectedOutboxRevision: standingClaim.revision,
        expectedEffectRevision: 0,
        observedAt: T4,
      }),
    ).toThrow(/not active at dispatch/);
    expect(() =>
      effects.planExternalEffect(
        plan(
          {
            ...effect(THIRD_EFFECT_ID),
            target: { ...effect().target, resourceKey: "owner/repository#43" },
          },
          "github.repository-write",
          { checkpointId: THIRD_CHECKPOINT_ID, expectedCheckpointRevision: 2 },
        ),
      ),
    ).toThrow(/not active/);
    database.close();
  });

  it("revalidates expiry immediately before dispatch", () => {
    const { database, effects } = openSeededDatabase();
    effects.registerApproval(issuance(approval(SECOND_APPROVAL_ID, { expiresAt: T3 })));
    effects.planExternalEffect(plan(effect(EFFECT_ID, SECOND_APPROVAL_ID)));
    const claim = requireClaim(
      effects.claimNextSend({
        ownerId: "dispatcher.expiry",
        observedAt: T2,
        lockedUntil: T5,
      }),
    );
    expect(() =>
      effects.beginSend({
        effectId: EFFECT_ID,
        ownerId: "dispatcher.expiry",
        fence: claim.fence,
        expectedOutboxRevision: claim.revision,
        expectedEffectRevision: 0,
        observedAt: T3,
      }),
    ).toThrow(/expired before dispatch/);
    expect(() => effects.expireApproval(SECOND_APPROVAL_ID, T3)).toThrow(/only an active approval/);
    expect(effects.getEffect(EFFECT_ID)?.effect.state).toBe("planned");
    database.close();
  });
});

describe("fenced outbox delivery and reconciliation", () => {
  it("blocks new sends for paused/cancelled/failed attempts and bounds claim duration", () => {
    const cases = [
      ["paused", "paused"],
      ["failed", "running"],
      ["cancelled", "cancelled"],
    ] as const;
    for (const [state, desiredState] of cases) {
      const { database, effects } = openSeededDatabase();
      effects.registerApproval(issuance());
      effects.planExternalEffect(plan());
      setAttemptControlState(database, state, desiredState);
      expect(
        effects.claimNextSend({
          ownerId: `dispatcher.${state}`,
          observedAt: T3,
          lockedUntil: T5,
        }),
      ).toBeNull();
      database.close();
    }

    const { database, effects } = openSeededDatabase();
    effects.registerApproval(issuance());
    effects.planExternalEffect(plan());
    expect(() =>
      effects.claimNextSend({
        ownerId: "dispatcher.unbounded",
        observedAt: T2,
        lockedUntil: "2026-08-10T12:10:02.001Z",
      }),
    ).toThrow(/lease exceeds/);
    database.close();
  });

  it("rechecks attempt control state at beginSend and immediately before network I/O", () => {
    const first = openSeededDatabase();
    first.effects.registerApproval(issuance());
    first.effects.planExternalEffect(plan());
    const firstClaim = requireClaim(
      first.effects.claimNextSend({
        ownerId: "dispatcher.begin-race",
        observedAt: T2,
        lockedUntil: T8,
      }),
    );
    setAttemptControlState(first.database, "running", "paused", T3);
    expect(() =>
      first.effects.beginSend({
        effectId: EFFECT_ID,
        ownerId: "dispatcher.begin-race",
        fence: firstClaim.fence,
        expectedOutboxRevision: firstClaim.revision,
        expectedEffectRevision: 0,
        observedAt: T4,
      }),
    ).toThrow(/cannot dispatch/);
    first.database.close();

    const second = openSeededDatabase();
    second.effects.registerApproval(issuance());
    second.effects.planExternalEffect(plan());
    const secondClaim = requireClaim(
      second.effects.claimNextSend({
        ownerId: "dispatcher.last-moment",
        observedAt: T2,
        lockedUntil: T8,
      }),
    );
    const begun = second.effects.beginSend({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.last-moment",
      fence: secondClaim.fence,
      expectedOutboxRevision: secondClaim.revision,
      expectedEffectRevision: 0,
      observedAt: T3,
    });
    expect(second.effects.assertDispatchActive(begun.dispatchToken, T4).effect.state).toBe("sent");
    setAttemptControlState(second.database, "running", "paused", T4);
    expect(() => second.effects.assertDispatchActive(begun.dispatchToken, T5)).toThrow(
      /cannot dispatch/,
    );
    second.database.close();
  });

  it("allows one claimant, rejects a stale fence, and increments lease identity", () => {
    const { databasePath, database, effects } = openSeededDatabase();
    effects.registerApproval(issuance());
    effects.planExternalEffect(plan());
    const competitorDatabase = openMigratedFactoryDatabase(databasePath, { fileMustExist: true });
    const competitor = createEffectRepository(competitorDatabase);

    const first = effects.claimNextSend({
      ownerId: "dispatcher.one",
      observedAt: T2,
      lockedUntil: T5,
    });
    expect(first).toMatchObject({ fence: 1, revision: 1, lockedBy: "dispatcher.one" });
    expect(
      competitor.claimNextSend({ ownerId: "dispatcher.two", observedAt: T3, lockedUntil: T6 }),
    ).toBeNull();

    const second = competitor.claimNextSend({
      ownerId: "dispatcher.two",
      observedAt: T5,
      lockedUntil: T8,
    });
    expect(second).toMatchObject({ fence: 2, revision: 2, lockedBy: "dispatcher.two" });
    expect(() =>
      effects.beginSend({
        effectId: EFFECT_ID,
        ownerId: "dispatcher.one",
        fence: 1,
        expectedOutboxRevision: 1,
        expectedEffectRevision: 0,
        observedAt: T6,
      }),
    ).toThrow(/outbox owner|outbox fence|outbox revision/);

    competitorDatabase.close();
    database.close();
  });

  it("turns timeout-after-provider-mutation into unknown, then observes before confirming", () => {
    const { database, effects } = openSeededDatabase();
    effects.registerApproval(issuance());
    effects.planExternalEffect(plan());
    const sendClaim = requireClaim(
      effects.claimNextSend({
        ownerId: "dispatcher.send",
        observedAt: T2,
        lockedUntil: T5,
      }),
    );
    const sent = effects.beginSend({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.send",
      fence: sendClaim.fence,
      expectedOutboxRevision: sendClaim.revision,
      expectedEffectRevision: 0,
      observedAt: T3,
    });
    expect(sent.effect).toMatchObject({ state: "sent", sendCount: 1, revision: 1 });

    const unknown = effects.recordSendOutcome({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.send",
      fence: sendClaim.fence,
      expectedOutboxRevision: sendClaim.revision,
      expectedEffectRevision: 1,
      observedAt: T4,
      outcome: {
        kind: "timeout",
        providerCorrelationKey: "possibly-created-pr-42",
        nextReconcileAt: T6,
        detailDigest: DETAIL_DIGEST,
      },
    });
    expect(unknown.effect.state).toBe("unknown");
    expect(unknown.effect.state).not.toBe("confirmed");
    expect(effects.listEffectsForReconciliation(T5)).toEqual([]);
    expect(
      effects.listEffectsForReconciliation(T6).map(({ effect: item }) => item.effectId),
    ).toEqual([EFFECT_ID]);

    const reconcileClaim = requireClaim(
      effects.claimNextReconciliation({
        ownerId: "reconciler.one",
        observedAt: T6,
        lockedUntil: T9,
      }),
    );
    expect(reconcileClaim).toMatchObject({ fence: 2, revision: 3 });
    expect(() =>
      effects.recordReconciliationObserved({
        effectId: EFFECT_ID,
        ownerId: "dispatcher.send",
        fence: sendClaim.fence,
        expectedOutboxRevision: sendClaim.revision,
        expectedEffectRevision: 2,
        observedAt: T7,
        providerCorrelationKey: "github-pr-42",
        resource: resource(),
        observation: observation(),
        detailDigest: null,
      }),
    ).toThrow(/outbox owner|outbox fence|outbox revision/);
    const unattestedObservationInput = {
      effectId: EFFECT_ID,
      ownerId: "reconciler.one",
      fence: reconcileClaim.fence,
      expectedOutboxRevision: reconcileClaim.revision,
      expectedEffectRevision: 2,
      observedAt: T7,
      providerCorrelationKey: "github-pr-42",
      resource: resource(),
      observation: observation(),
      detailDigest: null,
    } as const;
    expect(() =>
      createEffectRepository(database).recordReconciliationObserved(unattestedObservationInput),
    ).toThrow(/observation attestation verifier is not configured/);
    expect(() =>
      createEffectRepository(database, {
        verifyObservationAttestation: () => false,
      }).recordReconciliationObserved(unattestedObservationInput),
    ).toThrow(/observation attestation was rejected/);
    expect(database.prepare("SELECT COUNT(*) AS count FROM effect_observations").get()).toEqual({
      count: 0,
    });
    expect(() =>
      effects.recordReconciliationObserved({
        effectId: EFFECT_ID,
        ownerId: "reconciler.one",
        fence: reconcileClaim.fence,
        expectedOutboxRevision: reconcileClaim.revision,
        expectedEffectRevision: 2,
        observedAt: T7,
        providerCorrelationKey: "github-pr-42",
        resource: resource(),
        observation: observation(
          RECONCILE_INVOCATION_ID,
          T7,
          "provider-reconciliation",
          OBSERVED_DIGEST,
        ),
        detailDigest: null,
      }),
    ).toThrow(/evidence artifact does not exist/);

    const observed = effects.recordReconciliationObserved({
      effectId: EFFECT_ID,
      ownerId: "reconciler.one",
      fence: reconcileClaim.fence,
      expectedOutboxRevision: reconcileClaim.revision,
      expectedEffectRevision: 2,
      observedAt: T7,
      providerCorrelationKey: "github-pr-42",
      resource: resource(),
      observation: observation(),
      detailDigest: null,
    });
    expect(observed.effect).toMatchObject({
      state: "observed",
      providerCorrelationKey: "github-pr-42",
      lastObservedAt: T7,
    });
    expect(effects.getExternalResource(EFFECT_ID)).toEqual(resource());
    const persistedObservation = database
      .prepare(
        `SELECT payload_json AS payloadJson, envelope_digest AS envelopeDigest
         FROM effect_observations WHERE invocation_id = ?`,
      )
      .get(RECONCILE_INVOCATION_ID) as Readonly<{
      payloadJson: string;
      envelopeDigest: string;
    }>;
    expect(JSON.parse(persistedObservation.payloadJson)).toMatchObject({
      observation: observation(),
      effect: { effectId: EFFECT_ID, state: "unknown" },
      resource: resource(),
      ownerId: "reconciler.one",
      fence: reconcileClaim.fence,
      envelopeDigest: persistedObservation.envelopeDigest,
    });
    expect(persistedObservation.envelopeDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(() =>
      database
        .prepare("UPDATE effect_observations SET payload_json = '{}' WHERE invocation_id = ?")
        .run(RECONCILE_INVOCATION_ID),
    ).toThrow(/effect observations are immutable/);

    const confirmClaim = requireClaim(
      effects.claimNextReconciliation({
        ownerId: "reconciler.confirm",
        observedAt: T8,
        lockedUntil: T10,
      }),
    );
    expect(() =>
      effects.confirmObserved({
        effectId: EFFECT_ID,
        ownerId: "reconciler.confirm",
        fence: confirmClaim.fence,
        expectedOutboxRevision: confirmClaim.revision,
        expectedEffectRevision: 3,
        observedAt: T9,
        providerCorrelationKey: "github-pr-42",
        resource: resource(EFFECT_ID, T9),
        observation: observation(RECONCILE_INVOCATION_ID, T9),
        confirmationEvidenceDigest: DETAIL_DIGEST,
      }),
    ).toThrow(/distinct provider invocation/);
    expect(() =>
      effects.confirmObserved({
        effectId: EFFECT_ID,
        ownerId: "reconciler.confirm",
        fence: confirmClaim.fence,
        expectedOutboxRevision: confirmClaim.revision,
        expectedEffectRevision: 3,
        observedAt: T9,
        providerCorrelationKey: "github-pr-42",
        resource: resource(),
        observation: observation(
          CONFIRM_INVOCATION_ID,
          T9,
          "provider-reconciliation",
          CONFIRMATION_DIGEST,
        ),
        confirmationEvidenceDigest: CONFIRMATION_DIGEST,
      }),
    ).toThrow(/observed resource time/);
    const confirmed = effects.confirmObserved({
      effectId: EFFECT_ID,
      ownerId: "reconciler.confirm",
      fence: confirmClaim.fence,
      expectedOutboxRevision: confirmClaim.revision,
      expectedEffectRevision: 3,
      observedAt: T9,
      providerCorrelationKey: "github-pr-42",
      resource: resource(EFFECT_ID, T9),
      observation: observation(
        CONFIRM_INVOCATION_ID,
        T9,
        "provider-reconciliation",
        CONFIRMATION_DIGEST,
      ),
      confirmationEvidenceDigest: CONFIRMATION_DIGEST,
    });
    expect(confirmed.effect).toMatchObject({ state: "confirmed", revision: 4 });
    expect(effects.getExternalResource(EFFECT_ID)).toEqual(resource(EFFECT_ID, T9));
    expect(database.prepare("SELECT COUNT(*) AS count FROM external_resources").get()).toEqual({
      count: 2,
    });
    expect(database.prepare("SELECT outcome FROM effect_send_attempts").get()).toEqual({
      outcome: "timeout",
    });
    database.close();
  });

  it("persists not-found and ambiguous reconciliation backoff while remaining unknown", () => {
    const { database, effects } = openSeededDatabase();
    effects.registerApproval(issuance());
    effects.planExternalEffect(plan());
    const sendClaim = requireClaim(
      effects.claimNextSend({
        ownerId: "dispatcher.backoff",
        observedAt: T2,
        lockedUntil: T5,
      }),
    );
    effects.beginSend({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.backoff",
      fence: sendClaim.fence,
      expectedOutboxRevision: sendClaim.revision,
      expectedEffectRevision: 0,
      observedAt: T3,
    });
    effects.recordSendOutcome({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.backoff",
      fence: sendClaim.fence,
      expectedOutboxRevision: sendClaim.revision,
      expectedEffectRevision: 1,
      observedAt: T4,
      outcome: {
        kind: "ambiguous",
        providerCorrelationKey: null,
        nextReconcileAt: T6,
        detailDigest: DETAIL_DIGEST,
      },
    });
    const reconciliation = requireClaim(
      effects.claimNextReconciliation({
        ownerId: "reconciler.backoff",
        observedAt: T6,
        lockedUntil: T9,
      }),
    );
    expect(() =>
      effects.recordReconciliationUnresolved({
        effectId: EFFECT_ID,
        ownerId: "reconciler.backoff",
        fence: reconciliation.fence,
        expectedOutboxRevision: reconciliation.revision,
        expectedEffectRevision: 2,
        observedAt: T7,
        outcome: "not-found",
        providerCorrelationKey: null,
        nextReconcileAt: new Date(
          Date.parse(T7) + MAX_EFFECT_RECONCILE_BACKOFF_MS + 1,
        ).toISOString(),
        detailDigest: DETAIL_DIGEST,
      }),
    ).toThrow(/backoff exceeds/);
    const unresolved = effects.recordReconciliationUnresolved({
      effectId: EFFECT_ID,
      ownerId: "reconciler.backoff",
      fence: reconciliation.fence,
      expectedOutboxRevision: reconciliation.revision,
      expectedEffectRevision: 2,
      observedAt: T7,
      outcome: "not-found",
      providerCorrelationKey: null,
      nextReconcileAt: T9,
      detailDigest: DETAIL_DIGEST,
    });
    expect(unresolved.effect).toMatchObject({
      state: "unknown",
      revision: 3,
      nextReconcileAt: T9,
    });
    expect(effects.listEffectsForReconciliation(T8)).toEqual([]);
    expect(effects.listEffectsForReconciliation(T9)[0]?.effect.effectId).toBe(EFFECT_ID);
    expect(
      database
        .prepare(
          "SELECT outcome, next_reconcile_at AS nextReconcileAt FROM effect_reconciliation_attempts",
        )
        .get(),
    ).toEqual({ outcome: "not-found", nextReconcileAt: T9 });
    database.close();
  });

  it("moves repeated unresolved observations to manual intervention at the policy threshold", () => {
    const { database, effects } = openSeededDatabase();
    effects.registerApproval(issuance());
    effects.planExternalEffect(plan());
    const sendClaim = requireClaim(
      effects.claimNextSend({
        ownerId: "dispatcher.threshold",
        observedAt: T2,
        lockedUntil: T5,
      }),
    );
    effects.beginSend({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.threshold",
      fence: sendClaim.fence,
      expectedOutboxRevision: sendClaim.revision,
      expectedEffectRevision: 0,
      observedAt: T3,
    });
    effects.recordSendOutcome({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.threshold",
      fence: sendClaim.fence,
      expectedOutboxRevision: sendClaim.revision,
      expectedEffectRevision: 1,
      observedAt: T4,
      outcome: {
        kind: "ambiguous",
        providerCorrelationKey: null,
        nextReconcileAt: T6,
        detailDigest: DETAIL_DIGEST,
      },
    });

    let revision = 2;
    let finalState = "unknown";
    for (let index = 0; index < MAX_UNRESOLVED_RECONCILIATIONS; index += 1) {
      const claimAt = new Date(Date.parse(T6) + index * 3_000).toISOString();
      const observedAt = new Date(Date.parse(claimAt) + 1_000).toISOString();
      const nextAt = new Date(Date.parse(claimAt) + 2_000).toISOString();
      const claim = requireClaim(
        effects.claimNextReconciliation({
          ownerId: `reconciler.threshold-${String(index)}`,
          observedAt: claimAt,
          lockedUntil: nextAt,
        }),
      );
      const result = effects.recordReconciliationUnresolved({
        effectId: EFFECT_ID,
        ownerId: `reconciler.threshold-${String(index)}`,
        fence: claim.fence,
        expectedOutboxRevision: claim.revision,
        expectedEffectRevision: revision,
        observedAt,
        outcome: "not-found",
        providerCorrelationKey: null,
        nextReconcileAt: nextAt,
        detailDigest: DETAIL_DIGEST,
      });
      revision += 1;
      finalState = result.effect.state;
    }
    expect(finalState).toBe("manual-intervention");
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM effect_reconciliation_attempts").get(),
    ).toEqual({ count: MAX_UNRESOLVED_RECONCILIATIONS });
    expect(effects.listEffectsForReconciliation("2026-08-11T12:00:00.000Z")).toEqual([]);
    database.close();
  });

  it("durably records a provider-proven rejection and never treats it as ambiguity", () => {
    const { database, effects } = openSeededDatabase();
    effects.registerApproval(issuance());
    effects.planExternalEffect(plan());
    const claim = requireClaim(
      effects.claimNextSend({
        ownerId: "dispatcher.rejected",
        observedAt: T2,
        lockedUntil: T6,
      }),
    );
    effects.beginSend({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.rejected",
      fence: claim.fence,
      expectedOutboxRevision: claim.revision,
      expectedEffectRevision: 0,
      observedAt: T3,
    });
    const rejected = effects.recordSendOutcome({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.rejected",
      fence: claim.fence,
      expectedOutboxRevision: claim.revision,
      expectedEffectRevision: 1,
      observedAt: T4,
      outcome: {
        kind: "rejected",
        code: "github.validation-rejected",
        retryable: false,
        evidenceDigest: REJECTION_DIGEST,
      },
    });
    expect(rejected.effect).toMatchObject({
      state: "rejected",
      detailDigest: REJECTION_DIGEST,
      revision: 2,
    });
    expect(effects.listEffectsForReconciliation(T10)).toEqual([]);
    expect(database.prepare("SELECT code, retryable FROM effect_rejections").get()).toEqual({
      code: "github.validation-rejected",
      retryable: 0,
    });
    expect(database.prepare("SELECT outcome FROM effect_send_attempts").get()).toEqual({
      outcome: "rejected",
    });
    database.close();
  });

  it("recovers a crash after send start by reconciling after restart, never resending", () => {
    const { databasePath, database, effects } = openSeededDatabase();
    effects.registerApproval(issuance());
    effects.planExternalEffect(plan());
    const claim = requireClaim(
      effects.claimNextSend({
        ownerId: "dispatcher.crash",
        observedAt: T2,
        lockedUntil: T5,
      }),
    );
    effects.beginSend({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.crash",
      fence: claim.fence,
      expectedOutboxRevision: claim.revision,
      expectedEffectRevision: 0,
      observedAt: T3,
    });
    database.close();

    const reopened = openMigratedFactoryDatabase(databasePath, { fileMustExist: true });
    const recovered = createEffectRepository(reopened, {
      verifyObservationAttestation: ({ observation: candidate }) =>
        candidate.attestationDigest === OBSERVATION_ATTESTATION_DIGEST,
    });
    setAttemptControlState(reopened, "cancelled", "cancelled", T5);
    expect(
      recovered.claimNextSend({ ownerId: "dispatcher.restart", observedAt: T6, lockedUntil: T9 }),
    ).toBeNull();
    expect(recovered.listEffectsForReconciliation(T6)[0]?.effect.state).toBe("sent");
    const reconciliation = requireClaim(
      recovered.claimNextReconciliation({
        ownerId: "reconciler.restart",
        observedAt: T6,
        lockedUntil: T9,
      }),
    );
    const observed = recovered.recordReconciliationObserved({
      effectId: EFFECT_ID,
      ownerId: "reconciler.restart",
      fence: reconciliation.fence,
      expectedOutboxRevision: reconciliation.revision,
      expectedEffectRevision: 1,
      observedAt: T7,
      providerCorrelationKey: "github-pr-42",
      resource: resource(),
      observation: observation(),
      detailDigest: DETAIL_DIGEST,
    });
    expect(observed.effect).toMatchObject({ state: "observed", sendCount: 1 });
    expect(reopened.prepare("SELECT outcome FROM effect_send_attempts").get()).toEqual({
      outcome: "observed",
    });
    reopened.close();
  });

  it("rolls every provider-outcome write back when any transactional stage crashes", () => {
    const failpoints = [
      `BEFORE INSERT ON external_resources`,
      `BEFORE UPDATE ON external_effects WHEN OLD.state = 'sent'`,
      `BEFORE UPDATE ON effect_send_attempts`,
      `BEFORE INSERT ON effect_transitions WHEN NEW.from_state = 'sent'`,
      `BEFORE UPDATE ON effect_outbox WHEN NEW.locked_by IS NULL`,
    ];
    for (const failpoint of failpoints) {
      const { database, effects, claim } = openSentEffectForFaultTest();
      database.exec(`
        CREATE TRIGGER injected_effect_failure
        ${failpoint} BEGIN
          SELECT RAISE(ABORT, 'injected effect transaction crash');
        END;
      `);
      expect(() =>
        effects.recordSendOutcome({
          effectId: EFFECT_ID,
          ownerId: "dispatcher.fault",
          fence: claim.fence,
          expectedOutboxRevision: claim.revision,
          expectedEffectRevision: 1,
          observedAt: T4,
          outcome: {
            kind: "observed",
            providerCorrelationKey: "github-pr-42",
            resource: resource(EFFECT_ID, T4),
            observation: observation(SEND_INVOCATION_ID, T4, "provider-send", DETAIL_DIGEST),
            detailDigest: DETAIL_DIGEST,
          },
        }),
      ).toThrow(/injected effect transaction crash/);
      expect(database.prepare("SELECT state, revision FROM external_effects").get()).toEqual({
        state: "sent",
        revision: 1,
      });
      expect(database.prepare("SELECT COUNT(*) AS count FROM external_resources").get()).toEqual({
        count: 0,
      });
      expect(
        database
          .prepare("SELECT finished_at AS finishedAt, outcome FROM effect_send_attempts")
          .get(),
      ).toEqual({ finishedAt: null, outcome: null });
      expect(database.prepare("SELECT COUNT(*) AS count FROM effect_transitions").get()).toEqual({
        count: 2,
      });
      expect(
        database.prepare("SELECT locked_by AS lockedBy, revision FROM effect_outbox").get(),
      ).toEqual({ lockedBy: "dispatcher.fault", revision: claim.revision });
      database.close();
    }
  });

  it("fails closed on every illegal shortcut and can route unknown state to manual review", () => {
    const states = Object.keys(LEGAL_EXTERNAL_EFFECT_TRANSITIONS) as Array<
      keyof typeof LEGAL_EXTERNAL_EFFECT_TRANSITIONS
    >;
    for (const from of states) {
      for (const to of states) {
        const legal = (LEGAL_EXTERNAL_EFFECT_TRANSITIONS[from] as readonly string[]).includes(to);
        expect(isLegalExternalEffectTransition(from, to), `${from} -> ${to}`).toBe(legal);
        if (legal) expect(() => assertLegalExternalEffectTransition(from, to)).not.toThrow();
        else expect(() => assertLegalExternalEffectTransition(from, to)).toThrow(/illegal effect/);
      }
    }

    const { database, effects } = openSeededDatabase();
    effects.registerApproval(issuance());
    effects.planExternalEffect(plan());
    expect(() =>
      database
        .prepare("UPDATE external_effects SET state = 'confirmed' WHERE effect_id = ?")
        .run(EFFECT_ID),
    ).toThrow(/illegal external effect state transition|observed external resource is required/);
    expect(() =>
      database
        .prepare(
          `UPDATE external_effects
           SET state = 'rejected', revision = 1, send_count = 1, updated_at = ?
           WHERE effect_id = ?`,
        )
        .run(T2, EFFECT_ID),
    ).toThrow(/durable provider rejection evidence is required/);

    const sendClaim = requireClaim(
      effects.claimNextSend({
        ownerId: "dispatcher.manual",
        observedAt: T2,
        lockedUntil: T5,
      }),
    );
    effects.beginSend({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.manual",
      fence: sendClaim.fence,
      expectedOutboxRevision: sendClaim.revision,
      expectedEffectRevision: 0,
      observedAt: T3,
    });
    effects.recordSendOutcome({
      effectId: EFFECT_ID,
      ownerId: "dispatcher.manual",
      fence: sendClaim.fence,
      expectedOutboxRevision: sendClaim.revision,
      expectedEffectRevision: 1,
      observedAt: T4,
      outcome: {
        kind: "ambiguous",
        providerCorrelationKey: null,
        nextReconcileAt: T6,
        detailDigest: DETAIL_DIGEST,
      },
    });
    const reconciliation = requireClaim(
      effects.claimNextReconciliation({
        ownerId: "reconciler.manual",
        observedAt: T6,
        lockedUntil: T9,
      }),
    );
    expect(
      effects.requireManualIntervention({
        effectId: EFFECT_ID,
        ownerId: "reconciler.manual",
        fence: reconciliation.fence,
        expectedOutboxRevision: reconciliation.revision,
        expectedEffectRevision: 2,
        observedAt: T7,
        detailDigest: DETAIL_DIGEST,
      }).effect.state,
    ).toBe("manual-intervention");
    database.close();
  });
});
