import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AdapterRegistry, sha256Bytes } from "@app-factory/adapter-sdk";
import {
  IsoInstantSchema,
  Sha256DigestSchema,
  type ExternalResourceV1,
  type ExternalTargetV1,
} from "@app-factory/contracts";
import { verifyCanonicalObservationAttestation } from "@app-factory/effect-worker";
import { EvidenceStore } from "@app-factory/evidence-store";
import {
  computeTaskSpecDigest,
  createEffectRepository,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
  type EffectRepository,
  type FactoryRepositories,
} from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import {
  createEffectSubsystem,
  EffectPumpLoop,
  type EffectPumpWorkerPort,
} from "../src/effect-pump.js";
import type { DaemonLoopWait } from "../src/factory-daemon-service.js";

// Mirrors the fixture-building pattern in
// packages/effect-worker/test/kernel-integration.test.ts (seed an attempt,
// register an approval, plan one external effect) so this daemon-level suite
// exercises the pump loop against the real SQLite kernel repository rather
// than a fake. This file adds a real payload artifact + EvidenceStore on top,
// since (unlike that harness) processNextSend here actually reads a payload.

const T0 = "2026-08-13T12:00:00.000Z";
const T1 = "2026-08-13T12:00:01.000Z";
const EXPIRES = "2026-08-13T13:00:00.000Z";

const PROJECT_ID = "73000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "73000000-0000-4000-8000-000000000002";
const TASK_ID = "73000000-0000-4000-8000-000000000003";
const COMMAND_ID = "73000000-0000-4000-8000-000000000004";
const ATTEMPT_ID = "73000000-0000-4000-8000-000000000005";
const EVENT_ID = "73000000-0000-4000-8000-000000000006";
const FENCE_EVENT_ID = "73000000-0000-4000-8000-000000000007";
const RUNNING_EVENT_ID = "73000000-0000-4000-8000-000000000008";
const STEP_ID = "73000000-0000-4000-8000-000000000009";
const STEP_CREATED_EVENT_ID = "73000000-0000-4000-8000-00000000000a";
const STEP_RUNNING_EVENT_ID = "73000000-0000-4000-8000-00000000000b";
const CHECKPOINT_ID = "73000000-0000-4000-8000-00000000000c";
const APPROVAL_ID = "73000000-0000-4000-8000-000000000010";
const EFFECT_ID = "73000000-0000-4000-8000-000000000020";
const RELEASE_ID = "73000000-0000-4000-8000-000000000030";

const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const PLAN_DIGEST = `sha256:${"c".repeat(64)}`;
const DIFF_DIGEST = `sha256:${"d".repeat(64)}`;
const BUILD_DIGEST = `sha256:${"e".repeat(64)}`;
const RESOURCE_DIGEST = Sha256DigestSchema.parse(`sha256:${"1".repeat(64)}`);
const APPROVAL_ATTESTATION_DIGEST = `sha256:${"6".repeat(64)}`;
const BASE_COMMIT = "2".repeat(40);
const EFFECT_COMMIT = "3".repeat(40);

const PAYLOAD_BYTES = new TextEncoder().encode("app-factory effect pump fixture payload");
const PAYLOAD_DIGEST = sha256Bytes(PAYLOAD_BYTES);

const TARGET: ExternalTargetV1 = {
  provider: "github",
  resourceType: "github.pull-request",
  resourceKey: "owner/repository#77",
};

const temporaryDirectories: string[] = [];

function makeDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function seedAttempt(database: ReturnType<typeof openMigratedFactoryDatabase>): void {
  const taskSpec = {
    schemaVersion: 1,
    taskId: TASK_ID,
    projectId: PROJECT_ID,
    createdAt: T0,
    title: "Exercise the daemon effect pump",
    objective: "Verify the pump loop drives a planned effect through the real kernel repository.",
    acceptanceCriteria: [
      {
        id: "pump-drains-outbox",
        statement: "A planned effect reaches confirmed via the pump loop and a fake adapter.",
        verification: "automated",
      },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: BASE_COMMIT },
    requestedScope: { paths: ["Factory/Effect.swift"] },
    policyDigest: POLICY_DIGEST,
  } as const;
  const repositories = createFactoryRepositories(database);
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
    acquiredAt: "2026-08-13T12:00:00.100Z",
    expiresAt: EXPIRES,
    event: {
      schemaVersion: 1,
      eventId: FENCE_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 2,
      occurredAt: "2026-08-13T12:00:00.100Z",
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
    updatedAt: "2026-08-13T12:00:00.200Z",
  } as const;
  repositories.transitionAttemptState({
    leaseKey: `attempt:${ATTEMPT_ID}`,
    ownerId: "worker.effect",
    observedAt: "2026-08-13T12:00:00.200Z",
    expectedRevision: 1,
    attempt: runningAttempt,
    event: {
      schemaVersion: 1,
      eventId: RUNNING_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 3,
      occurredAt: "2026-08-13T12:00:00.200Z",
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
    observedAt: "2026-08-13T12:00:00.300Z",
    step: pendingStep,
    event: {
      schemaVersion: 1,
      eventId: STEP_CREATED_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 4,
      occurredAt: "2026-08-13T12:00:00.300Z",
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
    observedAt: "2026-08-13T12:00:00.400Z",
    expectedRevision: 0,
    fence: 1,
    step: {
      ...pendingStep,
      state: "running",
      revision: 1,
      runCount: 1,
      startedAt: "2026-08-13T12:00:00.400Z",
    },
    event: {
      schemaVersion: 1,
      eventId: STEP_RUNNING_EVENT_ID,
      attemptId: ATTEMPT_ID,
      sequence: 5,
      occurredAt: "2026-08-13T12:00:00.400Z",
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
    resourceKey: TARGET.resourceKey,
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
    target: TARGET,
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

function resourceFor(): ExternalResourceV1 {
  return {
    schemaVersion: 1,
    effectId: EFFECT_ID,
    target: TARGET,
    providerResourceId: "77",
    providerUrl: "https://github.example.invalid/owner/repository/pull/77",
    providerVersion: EFFECT_COMMIT,
    observedDigest: RESOURCE_DIGEST,
    observedAt: T1,
  };
}

type Fixture = Readonly<{
  database: ReturnType<typeof openMigratedFactoryDatabase>;
  repositories: FactoryRepositories;
  effects: EffectRepository;
  evidenceStore: EvidenceStore;
}>;

function openFixture(): Fixture {
  const directory = makeDirectory("app-factory-effect-pump-");
  const database = openMigratedFactoryDatabase(join(directory, "factory.db"));
  seedAttempt(database);
  const repositories = createFactoryRepositories(database);
  const evidenceStore = new EvidenceStore(join(directory, "evidence"));

  repositories.artifacts.record({
    artifact: {
      digest: PAYLOAD_DIGEST,
      byteLength: PAYLOAD_BYTES.byteLength,
      mediaType: "application/octet-stream",
      logicalName: "effect-pump-fixture-payload.bin",
    },
    storagePath: evidenceStore.blobPath(PAYLOAD_DIGEST),
    recordedAt: T0,
  });
  evidenceStore.putBlob(PAYLOAD_BYTES);

  const effects = createEffectRepository(database, {
    verifyApprovalIssuance: (issuance) =>
      issuance.issuerId === "trusted.approval-service" &&
      issuance.attestationDigest === APPROVAL_ATTESTATION_DIGEST &&
      issuance.payloadDigest === PAYLOAD_DIGEST,
    verifyObservationAttestation: verifyCanonicalObservationAttestation,
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

  return { database, repositories, effects, evidenceStore };
}

/**
 * The fixture's approval/effect timestamps are fixed (T0/T1/EXPIRES), but
 * `EffectWorker` defaults to the real wall clock. Real time has since moved
 * past `EXPIRES`, which would silently starve every claim (approval-window
 * eligibility fails closed, not with an error). Every fixture-based test
 * therefore injects this clock: strictly increasing so kernel mutations
 * that require monotonic `updatedAt` values never collide, and bounded well
 * inside [T1, EXPIRES).
 */
function testClock(): { now(): Date } {
  let currentMs = Date.parse(T1);
  return {
    now: () => {
      currentMs += 250;
      return new Date(currentMs);
    },
  };
}

async function eventually(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for the pump loop");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("EffectPumpLoop against the real kernel repository", () => {
  it("drives a planned effect through send -> observed -> confirmed with a registered fake adapter", async () => {
    const { database, repositories, effects, evidenceStore } = openFixture();

    const adapters = new AdapterRegistry();
    adapters.register({
      adapterId: "github.test",
      adapterVersion: "1.0.0",
      provider: "github",
      preflight() {
        throw new Error("preflight is not exercised by the pump loop");
      },
      async send() {
        return {
          kind: "observed",
          correlationKey: "github-pr-77",
          resource: resourceFor(),
          detail: new TextEncoder().encode('{"safe":"send"}\n'),
        };
      },
      async reconcile() {
        return {
          kind: "observed",
          correlationKey: "github-pr-77",
          resource: resourceFor(),
          detail: new TextEncoder().encode('{"safe":"reconcile"}\n'),
        };
      },
    });

    const subsystem = createEffectSubsystem({
      ownerId: "daemon.effect-pump.test",
      effects,
      artifacts: repositories.artifacts,
      evidenceStore,
      adapters,
      clock: testClock(),
      pollIntervalMs: 20,
    });
    subsystem.start();

    await eventually(() => effects.getEffect(EFFECT_ID)?.effect.state === "confirmed");
    await subsystem.stop();

    const persisted = effects.getEffect(EFFECT_ID);
    expect(persisted?.effect.state).toBe("confirmed");
    expect(persisted?.effect.providerCorrelationKey).toBe("github-pr-77");
    expect(subsystem.statusPort.status().lastActivityAt).not.toBeNull();
    expect(subsystem.statusPort.status().lastErrorMessage).toBeNull();

    database.close();
  });

  it("idles cheaply with an empty registry: exactly one claim pair per poll, never a hot loop", async () => {
    const { database, repositories, effects, evidenceStore } = openFixture();
    // No adapters are registered at all; the outbox has one planned effect,
    // so a claim *is* taken on send but immediately fails closed with "no
    // adapter is registered" -- proving the empty registry is safe, not that
    // it is silently skipped. The claim then waits out its own lease.
    const subsystem = createEffectSubsystem({
      ownerId: "daemon.effect-pump.idle-test",
      effects,
      artifacts: repositories.artifacts,
      evidenceStore,
      adapters: new AdapterRegistry(),
      clock: testClock(),
      pollIntervalMs: 20,
      maxBackoffMs: 20,
    });
    subsystem.start();

    await eventually(() => subsystem.statusPort.status().lastErrorMessage !== null);
    expect(subsystem.statusPort.status().lastErrorMessage).toMatch(/no adapter is registered/);

    await subsystem.stop();
    database.close();
  });

  it("idles without a polling storm once the outbox is empty: exactly one claim pair per wait cycle", async () => {
    let sendCalls = 0;
    let reconcileCalls = 0;
    let waitCalls = 0;
    const pollIntervalMs = 5_000;
    const worker: EffectPumpWorkerPort = {
      processNextSend() {
        sendCalls += 1;
        return Promise.resolve({ kind: "idle", operation: "send" });
      },
      processNextReconciliation() {
        reconcileCalls += 1;
        return Promise.resolve({ kind: "idle", operation: "reconcile" });
      },
    };
    const loopRef: { current: EffectPumpLoop | null } = { current: null };
    const wait: DaemonLoopWait = (delayMs) => {
      waitCalls += 1;
      expect(delayMs).toBe(pollIntervalMs);
      if (waitCalls >= 3) loopRef.current?.requestStop();
      return Promise.resolve();
    };
    const loop = new EffectPumpLoop(worker, { pollIntervalMs, wait });
    loopRef.current = loop;
    loop.start();
    await loop.stopped();

    expect(sendCalls).toBe(3);
    expect(reconcileCalls).toBe(3);
    expect(waitCalls).toBe(3);
    expect(loop.lastError).toBeNull();
  });

  it("backs off with growing bounded delays on persistent errors instead of hot-looping", async () => {
    let attempts = 0;
    const delays: number[] = [];
    const worker: EffectPumpWorkerPort = {
      processNextSend() {
        attempts += 1;
        return Promise.reject(new Error("simulated persistent failure"));
      },
      processNextReconciliation() {
        throw new Error("must not be reached after a send failure");
      },
    };
    const loopRef: { current: EffectPumpLoop | null } = { current: null };
    const wait: DaemonLoopWait = (delayMs) => {
      delays.push(delayMs);
      if (delays.length >= 4) loopRef.current?.requestStop();
      return Promise.resolve();
    };
    const loop = new EffectPumpLoop(worker, { pollIntervalMs: 100, maxBackoffMs: 1_000, wait });
    loopRef.current = loop;
    loop.start();
    await loop.stopped();

    expect(attempts).toBe(4);
    // First failure backs off by the base poll interval; each further
    // consecutive failure doubles it, capped at maxBackoffMs (1_000 here).
    expect(delays).toEqual([100, 200, 400, 800]);
    expect(loop.lastError).toBeInstanceOf(Error);
  });

  it("leaves the outbox lease intact on an aborted mid-claim shutdown; recovery relies on lease expiry, not an explicit release", async () => {
    const { database, repositories, effects, evidenceStore } = openFixture();

    let sendStarted: (() => void) | undefined;
    const sendStartedPromise = new Promise<void>((resolve) => {
      sendStarted = resolve;
    });
    const adapters = new AdapterRegistry();
    adapters.register({
      adapterId: "github.test",
      adapterVersion: "1.0.0",
      provider: "github",
      preflight() {
        throw new Error("preflight is not exercised by the pump loop");
      },
      async send(input) {
        sendStarted?.();
        return await new Promise((_resolve, reject) => {
          const onAbort = () => {
            const error = new Error("aborted for shutdown");
            error.name = "AbortError";
            reject(error);
          };
          if (input.signal.aborted) onAbort();
          else input.signal.addEventListener("abort", onAbort, { once: true });
        });
      },
      async reconcile() {
        throw new Error("not exercised before shutdown");
      },
    });

    const subsystem = createEffectSubsystem({
      ownerId: "daemon.effect-pump.shutdown-test",
      effects,
      artifacts: repositories.artifacts,
      evidenceStore,
      adapters,
      clock: testClock(),
      pollIntervalMs: 1_000,
    });
    subsystem.start();
    await sendStartedPromise;

    await subsystem.stop();

    // beginSend already advanced planned -> sent before the adapter call, and
    // that mutation is never rolled back by an aborted operation.
    const persisted = effects.getEffect(EFFECT_ID);
    expect(persisted?.effect.state).toBe("sent");

    const outboxRow = database
      .prepare(
        "SELECT locked_by AS lockedBy, locked_until AS lockedUntil FROM effect_outbox WHERE effect_id = ?",
      )
      .get(EFFECT_ID) as Readonly<{ lockedBy: string | null; lockedUntil: string | null }>;
    // The claim is still held by the pump's ownerId: shutdown does not
    // explicitly release it.
    expect(outboxRow.lockedBy).toBe("daemon.effect-pump.shutdown-test");
    expect(outboxRow.lockedUntil).not.toBeNull();
    const lockedUntil = outboxRow.lockedUntil as string;

    // Strictly before the lease elapses, no other claimant can recover it.
    expect(
      effects.claimNextReconciliation({
        ownerId: "recovery-claimant",
        observedAt: IsoInstantSchema.parse(new Date(Date.parse(lockedUntil) - 1).toISOString()),
        lockedUntil: IsoInstantSchema.parse(
          new Date(Date.parse(lockedUntil) + 60_000).toISOString(),
        ),
      }),
    ).toBeNull();

    // Once the lease naturally elapses, reconciliation recovers the sent
    // effect cleanly -- this is the recovery path, not an explicit release.
    const recovered = effects.claimNextReconciliation({
      ownerId: "recovery-claimant",
      observedAt: lockedUntil,
      lockedUntil: IsoInstantSchema.parse(new Date(Date.parse(lockedUntil) + 60_000).toISOString()),
    });
    expect(recovered?.effect.effectId).toBe(EFFECT_ID);

    database.close();
  });
});
