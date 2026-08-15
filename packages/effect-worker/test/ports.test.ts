import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AdapterRegistry, sha256Bytes } from "@app-factory/adapter-sdk";
import type { ExternalEffectV1 } from "@app-factory/contracts";
import { EvidenceStore } from "@app-factory/evidence-store";
import {
  computeTaskSpecDigest,
  createEffectRepository,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
  type FactoryRepositories,
} from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import {
  EffectWorker,
  type EffectPayloadPort,
  type ObservationIssuerPort,
  type SanitizedProviderEvidencePort,
} from "../src/index.js";
import {
  createCanonicalObservationIssuerPort,
  createDurableSanitizedProviderEvidencePort,
  createKernelEffectPayloadPort,
  EffectWorkerPortsError,
  redactProviderDetail,
  verifyCanonicalObservationAttestation,
} from "../src/ports/index.js";

const T0 = "2026-08-12T09:00:00.000Z";
const T1 = "2026-08-12T09:00:01.000Z";
const T2 = "2026-08-12T09:00:02.000Z";
const T3 = "2026-08-12T09:00:03.000Z";
const T8 = "2026-08-12T09:00:08.000Z";
const T9 = "2026-08-12T09:00:09.000Z";
const T10 = "2026-08-12T09:00:10.000Z";
const T11 = "2026-08-12T09:00:11.000Z";
const T12 = "2026-08-12T09:00:12.000Z";
const EXPIRES = "2026-08-12T10:00:00.000Z";

function workerClock(...times: readonly string[]) {
  let index = 0;
  return { now: () => new Date(times[Math.min(index++, times.length - 1)] ?? T12) };
}

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
const CHECKPOINT_ID = "72000000-0000-4000-8000-00000000000c";
const APPROVAL_ID = "72000000-0000-4000-8000-000000000010";
const EFFECT_ID = "72000000-0000-4000-8000-000000000020";
const RELEASE_ID = "72000000-0000-4000-8000-000000000030";

const POLICY_DIGEST = `sha256:${"a".repeat(64)}`;
const PLAN_DIGEST = `sha256:${"c".repeat(64)}`;
const DIFF_DIGEST = `sha256:${"d".repeat(64)}`;
const BUILD_DIGEST = `sha256:${"e".repeat(64)}`;
const OBSERVED_DIGEST = `sha256:${"1".repeat(64)}`;
const APPROVAL_ATTESTATION_DIGEST = `sha256:${"6".repeat(64)}`;
const BASE_COMMIT = "2".repeat(40);
const EFFECT_COMMIT = "3".repeat(40);
const PAYLOAD = new TextEncoder().encode('{"title":"open a pull request"}\n');
const PAYLOAD_DIGEST = sha256Bytes(PAYLOAD);

const temporaryDirectories: string[] = [];

function makeDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

/* --------------------------------------------------------------------- *
 * createKernelEffectPayloadPort
 * --------------------------------------------------------------------- */

describe("createKernelEffectPayloadPort", () => {
  function fixture() {
    const database = openMigratedFactoryDatabase(join(makeDirectory("af-payload-port-"), "f.db"));
    const repositories = createFactoryRepositories(database);
    const evidenceStore = new EvidenceStore(makeDirectory("af-payload-store-"));
    return { database, repositories, evidenceStore };
  }

  it("reads bytes back only when the kernel artifact and the stored blob agree", () => {
    const { database, repositories, evidenceStore } = fixture();
    const digest = evidenceStore.putBlob(PAYLOAD);
    repositories.artifacts.record({
      artifact: {
        digest,
        byteLength: PAYLOAD.byteLength,
        mediaType: "application/json",
        logicalName: "effect-payload.json",
      },
      storagePath: evidenceStore.blobPath(digest),
      recordedAt: T0,
    });
    const port = createKernelEffectPayloadPort({
      artifacts: repositories.artifacts,
      evidenceStore,
    });

    const bytes = port.read({
      payloadDigest: digest,
      deadline: T1,
      signal: new AbortController().signal,
    });

    expect(bytes).toEqual(PAYLOAD);
    database.close();
  });

  it("fails when no kernel artifact is recorded for the digest, even if a blob happens to exist", () => {
    const { database, repositories, evidenceStore } = fixture();
    const digest = evidenceStore.putBlob(PAYLOAD);
    // Deliberately never registered with the kernel artifacts repository.
    const port = createKernelEffectPayloadPort({
      artifacts: repositories.artifacts,
      evidenceStore,
    });

    expect(() =>
      port.read({ payloadDigest: digest, deadline: T1, signal: new AbortController().signal }),
    ).toThrow(EffectWorkerPortsError);
    database.close();
  });

  it("fails when the recorded artifact byte length disagrees with the stored blob", () => {
    const { database, repositories, evidenceStore } = fixture();
    const digest = evidenceStore.putBlob(PAYLOAD);
    repositories.artifacts.record({
      artifact: {
        digest,
        byteLength: PAYLOAD.byteLength + 1,
        mediaType: "application/json",
        logicalName: "effect-payload.json",
      },
      storagePath: evidenceStore.blobPath(digest),
      recordedAt: T0,
    });
    const port = createKernelEffectPayloadPort({
      artifacts: repositories.artifacts,
      evidenceStore,
    });

    expect(() =>
      port.read({ payloadDigest: digest, deadline: T1, signal: new AbortController().signal }),
    ).toThrow(/byte length/);
    database.close();
  });

  it("fails before touching storage when the signal is already aborted", () => {
    const { database, repositories, evidenceStore } = fixture();
    const digest = evidenceStore.putBlob(PAYLOAD);
    repositories.artifacts.record({
      artifact: {
        digest,
        byteLength: PAYLOAD.byteLength,
        mediaType: "application/json",
        logicalName: "effect-payload.json",
      },
      storagePath: evidenceStore.blobPath(digest),
      recordedAt: T0,
    });
    const port = createKernelEffectPayloadPort({
      artifacts: repositories.artifacts,
      evidenceStore,
    });
    const controller = new AbortController();
    controller.abort();

    expect(() =>
      port.read({ payloadDigest: digest, deadline: T1, signal: controller.signal }),
    ).toThrow(/aborted/);
    database.close();
  });

  it("satisfies the EffectPayloadPort shape", () => {
    const { database, repositories, evidenceStore } = fixture();
    const port: EffectPayloadPort = createKernelEffectPayloadPort({
      artifacts: repositories.artifacts,
      evidenceStore,
    });
    expect(typeof port.read).toBe("function");
    database.close();
  });
});

/* --------------------------------------------------------------------- *
 * redactProviderDetail
 * --------------------------------------------------------------------- */

describe("redactProviderDetail", () => {
  it("redacts common secret-shaped JSON fields regardless of key style", () => {
    const raw = new TextEncoder().encode(
      JSON.stringify({
        authorization: "Bearer leak-1",
        token: "leak-2",
        api_key: "leak-3",
        "client-secret": "leak-4",
        status: "ok",
      }),
    );
    const redacted = Buffer.from(redactProviderDetail(raw, 1_024)).toString("utf8");
    expect(redacted).not.toContain("leak-1");
    expect(redacted).not.toContain("leak-2");
    expect(redacted).not.toContain("leak-3");
    expect(redacted).not.toContain("leak-4");
    expect(redacted).toContain('"status":"ok"');
    expect(JSON.parse(redacted)).toMatchObject({ status: "ok" });
  });

  it("redacts an inline bearer/basic scheme value embedded in free text", () => {
    const raw = new TextEncoder().encode("upstream rejected Bearer abcdEFGH123.token~value");
    const redacted = Buffer.from(redactProviderDetail(raw, 1_024)).toString("utf8");
    expect(redacted).not.toContain("abcdEFGH123");
    expect(redacted).toContain("Bearer [REDACTED]");
  });

  it("redacts a raw Authorization/Cookie header line", () => {
    const raw = new TextEncoder().encode("Authorization: Bearer leaked-header-value\nother: fine");
    const redacted = Buffer.from(redactProviderDetail(raw, 1_024)).toString("utf8");
    expect(redacted).not.toContain("leaked-header-value");
    expect(redacted).toContain("other: fine");
  });

  it("bounds output to the configured maximum before redacting", () => {
    const raw = new TextEncoder().encode("x".repeat(1_000));
    const redacted = redactProviderDetail(raw, 100);
    expect(redacted.byteLength).toBeLessThanOrEqual(100);
  });

  it("keeps non-UTF8 bytes bounded and opaque rather than mangling them", () => {
    const raw = new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x02]);
    const redacted = redactProviderDetail(raw, 1_024);
    expect(redacted).toEqual(raw);
  });
});

/* --------------------------------------------------------------------- *
 * createDurableSanitizedProviderEvidencePort
 * --------------------------------------------------------------------- */

describe("createDurableSanitizedProviderEvidencePort", () => {
  function fixture() {
    const database = openMigratedFactoryDatabase(join(makeDirectory("af-evidence-port-"), "f.db"));
    const repositories = createFactoryRepositories(database);
    const evidenceStore = new EvidenceStore(makeDirectory("af-evidence-store-"));
    return { database, repositories, evidenceStore };
  }

  function effectFixture(): ExternalEffectV1 {
    return {
      schemaVersion: 1,
      effectId: EFFECT_ID,
      attemptId: ATTEMPT_ID,
      action: "github.merge-pr",
      operationMarker: `app-factory:v1:github:merge:${EFFECT_ID}`,
      target: { provider: "github", resourceType: "github.pull-request", resourceKey: "o/r#1" },
      subject: {
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        releaseId: RELEASE_ID,
      },
      payloadDigest: PAYLOAD_DIGEST,
      policyDigest: POLICY_DIGEST,
      approvalId: APPROVAL_ID,
      state: "sent",
      revision: 1,
      sendCount: 1,
      providerCorrelationKey: null,
      createdAt: T0,
      updatedAt: T1,
      lastObservedAt: null,
      nextReconcileAt: null,
      detailDigest: null,
    };
  }

  it("persists redacted, bounded bytes and registers a kernel artifact the observation flow can find", () => {
    const { database, repositories, evidenceStore } = fixture();
    const port = createDurableSanitizedProviderEvidencePort({
      artifacts: repositories.artifacts,
      evidenceStore,
    });
    const rawDetail = new TextEncoder().encode(
      JSON.stringify({ token: "must-not-persist", pull_request: { number: 1 } }),
    );

    const digest = port.persist({
      effect: effectFixture(),
      adapterId: "github.rest",
      adapterVersion: "1.0.0",
      phase: "send",
      outcome: "observed",
      outcomeCode: null,
      rawDetail,
      recordedAt: T1,
      deadline: T2,
      signal: new AbortController().signal,
    });

    const storedBytes = evidenceStore.readBlob(digest);
    expect(storedBytes.toString("utf8")).not.toContain("must-not-persist");
    const artifact = repositories.artifacts.findByDigest(digest);
    expect(artifact).not.toBeNull();
    expect(artifact?.byteLength).toBe(storedBytes.byteLength);
    expect(artifact?.mediaType).toBe("application/json");
    database.close();
  });

  it("zeroizes its own redacted buffer once the bytes are durably persisted", () => {
    const { database, repositories, evidenceStore } = fixture();
    const port = createDurableSanitizedProviderEvidencePort({
      artifacts: repositories.artifacts,
      evidenceStore,
    });
    let capturedRedacted: Uint8Array | undefined;
    const originalPutBlob = evidenceStore.putBlob.bind(evidenceStore);
    evidenceStore.putBlob = (bytes: Uint8Array) => {
      capturedRedacted = bytes;
      return originalPutBlob(bytes);
    };

    port.persist({
      effect: effectFixture(),
      adapterId: "github.rest",
      adapterVersion: "1.0.0",
      phase: "send",
      outcome: "rejected",
      outcomeCode: "github.validation-failed",
      rawDetail: new TextEncoder().encode('{"safe":"detail"}\n'),
      recordedAt: T1,
      deadline: T2,
      signal: new AbortController().signal,
    });

    expect(capturedRedacted).toBeDefined();
    expect([...(capturedRedacted as Uint8Array)]).toEqual(
      new Array((capturedRedacted as Uint8Array).byteLength).fill(0),
    );
    database.close();
  });

  it("fails before doing any work when the signal is already aborted", () => {
    const { database, repositories, evidenceStore } = fixture();
    const port = createDurableSanitizedProviderEvidencePort({
      artifacts: repositories.artifacts,
      evidenceStore,
    });
    const controller = new AbortController();
    controller.abort();

    expect(() =>
      port.persist({
        effect: effectFixture(),
        adapterId: "github.rest",
        adapterVersion: "1.0.0",
        phase: "send",
        outcome: "observed",
        outcomeCode: null,
        rawDetail: new TextEncoder().encode("{}"),
        recordedAt: T1,
        deadline: T2,
        signal: controller.signal,
      }),
    ).toThrow(/aborted/);
    database.close();
  });

  it("satisfies the SanitizedProviderEvidencePort shape", () => {
    const { database, repositories, evidenceStore } = fixture();
    const port: SanitizedProviderEvidencePort = createDurableSanitizedProviderEvidencePort({
      artifacts: repositories.artifacts,
      evidenceStore,
    });
    expect(typeof port.persist).toBe("function");
    database.close();
  });
});

/* --------------------------------------------------------------------- *
 * createCanonicalObservationIssuerPort / verifyCanonicalObservationAttestation
 * --------------------------------------------------------------------- */

describe("createCanonicalObservationIssuerPort", () => {
  function envelopeInput() {
    const effect: ExternalEffectV1 = {
      schemaVersion: 1,
      effectId: EFFECT_ID,
      attemptId: ATTEMPT_ID,
      action: "github.merge-pr",
      operationMarker: `app-factory:v1:github:merge:${EFFECT_ID}`,
      target: { provider: "github", resourceType: "github.pull-request", resourceKey: "o/r#1" },
      subject: {
        projectId: PROJECT_ID,
        taskId: TASK_ID,
        attemptId: ATTEMPT_ID,
        releaseId: RELEASE_ID,
      },
      payloadDigest: PAYLOAD_DIGEST,
      policyDigest: POLICY_DIGEST,
      approvalId: APPROVAL_ID,
      state: "sent",
      revision: 1,
      sendCount: 1,
      providerCorrelationKey: null,
      createdAt: T0,
      updatedAt: T1,
      lastObservedAt: null,
      nextReconcileAt: null,
      detailDigest: null,
    };
    const resource = {
      schemaVersion: 1 as const,
      effectId: EFFECT_ID,
      target: effect.target,
      providerResourceId: "1",
      providerUrl: "https://github.example.invalid/o/r/pull/1",
      providerVersion: EFFECT_COMMIT,
      observedDigest: OBSERVED_DIGEST,
      observedAt: T2,
    };
    return {
      effect,
      resource,
      source: "provider-send" as const,
      adapterId: "github.rest" as const,
      adapterVersion: "1.0.0",
      ownerId: "worker.ports-test",
      fence: 1,
      evidenceDigest: `sha256:${"f".repeat(64)}` as const,
      observedAt: T2,
    };
  }

  it("issues an observation whose attestationDigest verifies as canonical", () => {
    const port = createCanonicalObservationIssuerPort();
    const observation = port.issue(envelopeInput());

    expect(
      verifyCanonicalObservationAttestation({
        observation,
        effect: envelopeInput().effect,
        resource: envelopeInput().resource,
        ownerId: envelopeInput().ownerId,
        fence: envelopeInput().fence,
        envelopeDigest: `sha256:${"0".repeat(64)}`, // ignored by the verifier's recomputation
      }),
    ).toBe(true);
  });

  it("binds the digest to fence and ownerId: tampering breaks verification", () => {
    const port = createCanonicalObservationIssuerPort();
    const input = envelopeInput();
    const observation = port.issue(input);

    expect(
      verifyCanonicalObservationAttestation({
        observation,
        effect: input.effect,
        resource: input.resource,
        ownerId: "someone-else",
        fence: input.fence,
        envelopeDigest: `sha256:${"0".repeat(64)}`,
      }),
    ).toBe(false);
    expect(
      verifyCanonicalObservationAttestation({
        observation,
        effect: input.effect,
        resource: input.resource,
        ownerId: input.ownerId,
        fence: input.fence + 1,
        envelopeDigest: `sha256:${"0".repeat(64)}`,
      }),
    ).toBe(false);
  });

  it("mints a fresh invocationId per call by default", () => {
    const port = createCanonicalObservationIssuerPort();
    const input = envelopeInput();
    const first = port.issue(input);
    const second = port.issue(input);
    expect(first.invocationId).not.toBe(second.invocationId);
    // Different invocationId -> different attestation digest for otherwise
    // identical inputs, since invocationId is part of the bound claims.
    expect(first.attestationDigest).not.toBe(second.attestationDigest);
  });

  it("honors an injected invocationId source", () => {
    const port = createCanonicalObservationIssuerPort({
      newInvocationId: () => "72000000-0000-4000-8000-0000000000ff",
    });
    const observation = port.issue(envelopeInput());
    expect(observation.invocationId).toBe("72000000-0000-4000-8000-0000000000ff");
  });

  it("satisfies the ObservationIssuerPort shape", () => {
    const port: ObservationIssuerPort = createCanonicalObservationIssuerPort();
    expect(typeof port.issue).toBe("function");
  });
});

/* --------------------------------------------------------------------- *
 * End-to-end: EffectWorker.processNextSend against the real kernel with
 * all three production ports wired together.
 * --------------------------------------------------------------------- */

describe("production ports against the real kernel", () => {
  function seedAttempt(repositories: FactoryRepositories): void {
    const taskSpec = {
      schemaVersion: 1,
      taskId: TASK_ID,
      projectId: PROJECT_ID,
      createdAt: T0,
      title: "Exercise the production effect-worker ports",
      objective: "Prove the payload, evidence, and observation ports work against the real kernel.",
      acceptanceCriteria: [
        {
          id: "ports-safe",
          statement: "Real ports drive an effect to observed.",
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
      ownerId: "worker.ports-test",
      expectedAttemptRevision: 0,
      acquiredAt: "2026-08-12T09:00:00.100Z",
      expiresAt: EXPIRES,
      event: {
        schemaVersion: 1,
        eventId: FENCE_EVENT_ID,
        attemptId: ATTEMPT_ID,
        sequence: 2,
        occurredAt: "2026-08-12T09:00:00.100Z",
        commandId: null,
        causationEventId: EVENT_ID,
        fence: 1,
        type: "attempt.fence-claimed",
        data: { previousFence: 0, newFence: 1, ownerId: "worker.ports-test" },
      },
    });
    const runningAttempt = {
      ...claimed.attempt,
      state: "running",
      revision: 2,
      updatedAt: "2026-08-12T09:00:00.200Z",
    } as const;
    repositories.transitionAttemptState({
      leaseKey: `attempt:${ATTEMPT_ID}`,
      ownerId: "worker.ports-test",
      observedAt: "2026-08-12T09:00:00.200Z",
      expectedRevision: 1,
      attempt: runningAttempt,
      event: {
        schemaVersion: 1,
        eventId: RUNNING_EVENT_ID,
        attemptId: ATTEMPT_ID,
        sequence: 3,
        occurredAt: "2026-08-12T09:00:00.200Z",
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
      ownerId: "worker.ports-test",
      observedAt: "2026-08-12T09:00:00.300Z",
      step: pendingStep,
      event: {
        schemaVersion: 1,
        eventId: STEP_CREATED_EVENT_ID,
        attemptId: ATTEMPT_ID,
        sequence: 4,
        occurredAt: "2026-08-12T09:00:00.300Z",
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
      ownerId: "worker.ports-test",
      observedAt: "2026-08-12T09:00:00.400Z",
      expectedRevision: 0,
      fence: 1,
      step: {
        ...pendingStep,
        state: "running",
        revision: 1,
        runCount: 1,
        startedAt: "2026-08-12T09:00:00.400Z",
      },
      event: {
        schemaVersion: 1,
        eventId: STEP_RUNNING_EVENT_ID,
        attemptId: ATTEMPT_ID,
        sequence: 5,
        occurredAt: "2026-08-12T09:00:00.400Z",
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
      resourceKey: "owner/repository#7",
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
        resourceKey: "owner/repository#7",
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
    const database = openMigratedFactoryDatabase(join(makeDirectory("af-ports-e2e-"), "f.db"));
    const repositories = createFactoryRepositories(database);
    seedAttempt(repositories);
    const effects = createEffectRepository(database, {
      verifyApprovalIssuance: (issuance) =>
        issuance.issuerId === "trusted.approval-service" &&
        issuance.attestationDigest === APPROVAL_ATTESTATION_DIGEST &&
        issuance.payloadDigest === PAYLOAD_DIGEST,
      // The port under test issues real canonical attestation digests, so
      // the kernel is wired with the matching real verifier rather than a
      // fixed-constant test double.
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
        ownerId: "worker.ports-test",
        fence: 1,
        stepId: STEP_ID,
        expectedAttemptRevision: 3,
        expectedStepRevision: 1,
        expectedCheckpointRevision: 0,
      },
    });

    const evidenceStore = new EvidenceStore(makeDirectory("af-ports-e2e-store-"));
    const payloadDigest = evidenceStore.putBlob(PAYLOAD);
    repositories.artifacts.record({
      artifact: {
        digest: payloadDigest,
        byteLength: PAYLOAD.byteLength,
        mediaType: "application/json",
        logicalName: "effect-payload.json",
      },
      storagePath: evidenceStore.blobPath(payloadDigest),
      recordedAt: T1,
    });
    if (payloadDigest !== PAYLOAD_DIGEST) throw new Error("fixture payload digest mismatch");

    return { database, repositories, effects, evidenceStore };
  }

  it("drives a planned effect to observed using only the real kernel-backed ports", async () => {
    const fixture = openFixture();
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
          checkedAt: T2,
          credentialReference: null,
          capabilities: [],
        };
      },
      async send(input) {
        return {
          kind: "observed",
          correlationKey: "github-pr-7",
          resource: {
            schemaVersion: 1,
            effectId: input.effect.effectId,
            target: input.effect.target,
            providerResourceId: "7",
            providerUrl: "https://github.example.invalid/owner/repository/pull/7",
            providerVersion: EFFECT_COMMIT,
            observedDigest: OBSERVED_DIGEST,
            observedAt: T2,
          },
          detail: new TextEncoder().encode(
            JSON.stringify({ token: "must-not-be-persisted", merged: true }),
          ),
        };
      },
      async reconcile() {
        throw new Error("this scenario only exercises send");
      },
    });

    const worker = new EffectWorker({
      ownerId: "worker.ports-e2e",
      repository: fixture.effects,
      adapters,
      payloads: createKernelEffectPayloadPort({
        artifacts: fixture.repositories.artifacts,
        evidenceStore: fixture.evidenceStore,
      }),
      evidence: createDurableSanitizedProviderEvidencePort({
        artifacts: fixture.repositories.artifacts,
        evidenceStore: fixture.evidenceStore,
      }),
      observations: createCanonicalObservationIssuerPort(),
      credentials: { referenceFor: () => null },
      clock: workerClock(T3, T8, T9, T10, T11, T12),
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 10_000,
      reconcileDelayMs: 30_000,
    });

    const result = await worker.processNextSend(new AbortController().signal);

    expect(result).toMatchObject({ kind: "completed", operation: "send", state: "observed" });
    const persisted = fixture.effects.getEffect(EFFECT_ID);
    expect(persisted?.effect.state).toBe("observed");
    expect(persisted?.effect.providerCorrelationKey).toBe("github-pr-7");
    expect(persisted?.effect.detailDigest).not.toBeNull();

    // The evidence artifact the observation is bound to is real, durable,
    // and redacted -- not a fixture digest that happens to already exist.
    const evidenceDigest = persisted?.effect.detailDigest;
    expect(evidenceDigest).toBeDefined();
    const storedEvidence = fixture.evidenceStore.readBlob(
      evidenceDigest as NonNullable<typeof evidenceDigest>,
    );
    expect(storedEvidence.toString("utf8")).not.toContain("must-not-be-persisted");
    expect(fixture.repositories.artifacts.findByDigest(evidenceDigest)).not.toBeNull();

    const resource = fixture.effects.getExternalResource(EFFECT_ID);
    expect(resource?.providerResourceId).toBe("7");

    fixture.database.close();
  });
});
