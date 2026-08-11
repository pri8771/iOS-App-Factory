import { randomUUID } from "node:crypto";

import { AdapterRegistry, sha256Bytes } from "@app-factory/adapter-sdk";
import type {
  EffectReconciliationResult,
  EffectSendResult,
  ValidatedExternalProviderAdapter,
} from "@app-factory/adapter-sdk";
import type { ExternalEffectV1, ExternalObservationV1 } from "@app-factory/contracts";
import { EffectClaimLostError } from "@app-factory/kernel";
import type { BeginSendResult, EffectOutboxClaim, PersistedEffect } from "@app-factory/kernel";
import { describe, expect, it, vi } from "vitest";

import {
  EffectWorker,
  createInMemorySanitizingEvidencePort,
  type EffectWorkerRepositoryPort,
} from "../src/index.js";

const T0 = "2026-08-10T12:00:00.000Z";
const T1 = "2026-08-10T12:00:00.100Z";
const T2 = "2026-08-10T12:00:00.200Z";
const DIGEST = `sha256:${"a".repeat(64)}` as const;
const DETAIL = new TextEncoder().encode('{"safe":"detail"}\n');
const PAYLOAD = new TextEncoder().encode('{"title":"bounded"}\n');

function elapsedClock() {
  const wallStartedAt = Date.now();
  const logicalStartedAt = Date.parse(T0);
  return { now: () => new Date(logicalStartedAt + (Date.now() - wallStartedAt)) };
}

function directRegistry(
  base: AdapterRegistry,
  overrides: Partial<ValidatedExternalProviderAdapter>,
): AdapterRegistry {
  const adapter = { ...base.require("github"), ...overrides };
  return { require: () => adapter } as unknown as AdapterRegistry;
}

function effect(state: ExternalEffectV1["state"]): ExternalEffectV1 {
  return {
    schemaVersion: 1,
    effectId: randomUUID(),
    attemptId: randomUUID(),
    action: "github.issue-create",
    operationMarker: "app-factory:v1:github:issue:test",
    target: { provider: "github", resourceType: "github.issue", resourceKey: "owner/repo#factory" },
    subject: {
      projectId: randomUUID(),
      taskId: randomUUID(),
      attemptId: null,
      releaseId: null,
    },
    payloadDigest: sha256Bytes(PAYLOAD),
    policyDigest: DIGEST,
    approvalId: randomUUID(),
    state,
    revision: state === "planned" ? 0 : 1,
    sendCount: state === "planned" ? 0 : 1,
    providerCorrelationKey: state === "planned" || state === "sent" ? null : "issue:42",
    createdAt: T0,
    updatedAt: T0,
    lastObservedAt: state === "observed" ? T0 : null,
    nextReconcileAt: state === "planned" ? null : T0,
    detailDigest: null,
  };
}

function claim(value: ExternalEffectV1): EffectOutboxClaim {
  return {
    effect: value,
    availableAt: T0,
    lockedBy: "worker.one",
    lockedUntil: "2026-08-10T12:01:00.000Z",
    fence: 1,
    revision: 1,
  };
}

function persisted(value: ExternalEffectV1): PersistedEffect {
  return {
    effect: value,
    binding: { planDigest: DIGEST, diffDigest: null, commit: null, buildIdentityDigest: null },
    standingScope: null,
    intentDigest: DIGEST,
    availableAt: T0,
  };
}

function observation(input: {
  source: ExternalObservationV1["source"];
  evidenceDigest: string;
  observedAt: string;
}): ExternalObservationV1 {
  return {
    schemaVersion: 1,
    invocationId: randomUUID(),
    source: input.source,
    adapterId: "github.test",
    adapterVersion: "1",
    evidenceDigest: input.evidenceDigest as `sha256:${string}`,
    attestationDigest: DIGEST,
    observedAt: input.observedAt,
  };
}

function harness(
  input: Readonly<{
    initial: ExternalEffectV1;
    send?: "observed" | "throw" | "claim-spoof";
    reconcile?: "observed" | "ambiguous" | "not-found" | "manual-intervention";
  }>,
) {
  let current = input.initial;
  const calls: string[] = [];
  const repositoryEvents: string[] = [];
  const mutations: unknown[] = [];
  const sendClaim = current.state === "planned" ? claim(current) : null;
  const reconcileClaim = current.state === "planned" ? null : claim(current);
  const repository: EffectWorkerRepositoryPort = {
    claimNextSend: () => sendClaim,
    claimNextReconciliation: () => reconcileClaim,
    beginSend: () => {
      current = { ...current, state: "sent", revision: current.revision + 1, sendCount: 1 };
      return {
        ...persisted(current),
        dispatchToken: {
          effectId: current.effectId,
          ownerId: "worker.one",
          fence: 1,
          outboxRevision: 1,
          effectRevision: current.revision,
        },
      } as BeginSendResult;
    },
    assertDispatchActive: () => {
      repositoryEvents.push("assert-send");
      return persisted(current);
    },
    assertReconciliationActive: () => {
      repositoryEvents.push("assert-reconcile");
      return persisted(current);
    },
    recordSendOutcome: (value) => {
      repositoryEvents.push("record-send");
      mutations.push(value);
      calls.push(value.outcome.kind);
      current = {
        ...current,
        state:
          value.outcome.kind === "observed"
            ? "observed"
            : value.outcome.kind === "rejected"
              ? "rejected"
              : "unknown",
        revision: current.revision + 1,
        providerCorrelationKey:
          "providerCorrelationKey" in value.outcome
            ? (value.outcome.providerCorrelationKey as string | null)
            : null,
      };
      return persisted(current);
    },
    recordReconciliationObserved: (value) => {
      repositoryEvents.push("record-reconcile-observed");
      mutations.push(value);
      calls.push("reconcile-observed");
      current = {
        ...current,
        state: "observed",
        revision: current.revision + 1,
        providerCorrelationKey: "issue:42",
        lastObservedAt: T1,
      };
      return persisted(current);
    },
    recordReconciliationUnknown: (value) => {
      repositoryEvents.push("record-reconcile-unknown");
      mutations.push(value);
      calls.push("reconcile-unknown");
      current = { ...current, state: "unknown", revision: current.revision + 1 };
      return persisted(current);
    },
    recordReconciliationUnresolved: (value) => {
      repositoryEvents.push("record-reconcile-unresolved");
      mutations.push(value);
      calls.push("reconcile-unresolved");
      current = { ...current, state: "unknown", revision: current.revision + 1 };
      return persisted(current);
    },
    deferObservedReconciliation: (value) => {
      repositoryEvents.push("defer-observed");
      mutations.push(value);
      calls.push("defer-observed");
      current = { ...current, state: "observed", revision: current.revision + 1 };
      return persisted(current);
    },
    confirmObserved: (value) => {
      repositoryEvents.push("confirm-observed");
      mutations.push(value);
      calls.push("confirmed");
      current = {
        ...current,
        state: "confirmed",
        revision: current.revision + 1,
        lastObservedAt: T1,
      };
      return persisted(current);
    },
    requireManualIntervention: (value) => {
      repositoryEvents.push("require-manual");
      mutations.push(value);
      calls.push("manual-intervention");
      current = { ...current, state: "manual-intervention", revision: current.revision + 1 };
      return persisted(current);
    },
  };
  const adapters = new AdapterRegistry();
  adapters.register({
    adapterId: "github.test",
    adapterVersion: "1",
    provider: "github",
    async preflight() {
      return {
        schemaVersion: 1,
        adapterId: "github.test",
        adapterVersion: "1",
        provider: "github",
        checkedAt: T0,
        credentialReference: null,
        capabilities: [],
      };
    },
    async send(value) {
      if (input.send === "throw") throw new Error("untrusted provider secret must not persist");
      if (input.send === "claim-spoof") throw new Error("provider claim rejected upstream");
      return {
        kind: "observed",
        correlationKey: "issue:42",
        resource: {
          schemaVersion: 1,
          effectId: value.effect.effectId,
          target: value.effect.target,
          providerResourceId: "42",
          providerUrl: "https://github.example.invalid/issues/42",
          providerVersion: "etag-1",
          observedDigest: DIGEST,
          observedAt: T1,
        },
        detail: Uint8Array.from(DETAIL),
      };
    },
    async reconcile(value) {
      if (input.reconcile === "manual-intervention") {
        return {
          kind: "manual-intervention",
          code: "github.operator-review",
          detail: Uint8Array.from(DETAIL),
        };
      }
      if (input.reconcile === "not-found") {
        return {
          kind: "not-found",
          correlationKey: current.providerCorrelationKey,
          reconcileAfter: "2026-08-10T12:02:00.000Z",
          detail: Uint8Array.from(DETAIL),
        };
      }
      if (input.reconcile === "ambiguous") {
        return {
          kind: "ambiguous",
          correlationKey: current.providerCorrelationKey,
          reconcileAfter: "2026-08-10T12:02:00.000Z",
          detail: Uint8Array.from(DETAIL),
        };
      }
      return {
        kind: "observed",
        correlationKey: "issue:42",
        resource: {
          schemaVersion: 1,
          effectId: value.effect.effectId,
          target: value.effect.target,
          providerResourceId: "42",
          providerUrl: "https://github.example.invalid/issues/42",
          providerVersion: "etag-1",
          observedDigest: DIGEST,
          observedAt: T1,
        },
        detail: Uint8Array.from(DETAIL),
      };
    },
  });
  const evidence = new Map();
  const evidenceInputs: unknown[] = [];
  const inMemoryEvidencePort = createInMemorySanitizingEvidencePort(evidence);
  const evidencePort = {
    persist(input: Parameters<typeof inMemoryEvidencePort.persist>[0]) {
      evidenceInputs.push(input);
      return inMemoryEvidencePort.persist(input);
    },
  };
  const issuedInputs: unknown[] = [];
  const observationPort = {
    issue: (value: Parameters<typeof observation>[0]) => {
      issuedInputs.push(value);
      return observation(value);
    },
  };
  let tick = 0;
  const times = [T0, T1, T2];
  const worker = new EffectWorker({
    ownerId: "worker.one",
    repository,
    adapters,
    payloads: { read: () => Uint8Array.from(PAYLOAD) },
    evidence: evidencePort,
    observations: observationPort,
    credentials: { referenceFor: () => null },
    clock: { now: () => new Date(times[Math.min(tick++, times.length - 1)] ?? T2) },
    claimDurationMs: 60_000,
    adapterCallTimeoutMs: 10_000,
  });
  return {
    worker,
    calls,
    evidence,
    evidenceInputs,
    repository,
    repositoryEvents,
    mutations,
    currentEffect: () => current,
    adapters,
    evidencePort,
    observationPort,
    issuedInputs,
  };
}

describe("approval-bound effect worker", () => {
  it("marks a send before invocation and records an attested observation", async () => {
    const value = harness({ initial: effect("planned"), send: "observed" });
    await expect(value.worker.processNextSend(new AbortController().signal)).resolves.toMatchObject(
      {
        kind: "completed",
        operation: "send",
        state: "observed",
      },
    );
    expect(value.calls).toEqual(["observed"]);
    expect(value.evidence.size).toBe(1);
  });

  it("keeps a missing-adapter effect planned and retryable without reading local prerequisites", async () => {
    const base = harness({ initial: effect("planned") });
    const payloadRead = vi.fn(() => Uint8Array.from(PAYLOAD));
    const credentialLookup = vi.fn(() => null);
    const worker = new EffectWorker({
      ownerId: "worker.missing-adapter",
      repository: base.repository,
      adapters: new AdapterRegistry(),
      payloads: { read: payloadRead },
      evidence: base.evidencePort,
      observations: base.observationPort,
      credentials: { referenceFor: credentialLookup },
      clock: { now: () => new Date(T2) },
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 10_000,
    });

    await expect(worker.processNextSend(new AbortController().signal)).rejects.toThrow(
      /no adapter is registered/,
    );
    expect(base.currentEffect()).toMatchObject({ state: "planned", revision: 0, sendCount: 0 });
    expect(credentialLookup).not.toHaveBeenCalled();
    expect(payloadRead).not.toHaveBeenCalled();
    expect(base.calls).toEqual([]);
  });

  it("keeps a credential-broker failure planned and never invokes the provider", async () => {
    const base = harness({ initial: effect("planned") });
    const providerSend = vi.fn(async () => {
      throw new Error("provider must not be called");
    });
    const payloadRead = vi.fn(() => Uint8Array.from(PAYLOAD));
    const worker = new EffectWorker({
      ownerId: "worker.credential-failure",
      repository: base.repository,
      adapters: directRegistry(base.adapters, { send: providerSend }),
      payloads: { read: payloadRead },
      evidence: base.evidencePort,
      observations: base.observationPort,
      credentials: {
        referenceFor: () => {
          throw new Error("credential broker unavailable");
        },
      },
      clock: { now: () => new Date(T2) },
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 10_000,
    });

    await expect(worker.processNextSend(new AbortController().signal)).rejects.toThrow(
      "credential broker unavailable",
    );
    expect(base.currentEffect()).toMatchObject({ state: "planned", revision: 0, sendCount: 0 });
    expect(payloadRead).not.toHaveBeenCalled();
    expect(providerSend).not.toHaveBeenCalled();
  });

  it("keeps a payload-read failure planned and never invokes the provider", async () => {
    const base = harness({ initial: effect("planned") });
    const providerSend = vi.fn(async () => {
      throw new Error("provider must not be called");
    });
    const worker = new EffectWorker({
      ownerId: "worker.payload-failure",
      repository: base.repository,
      adapters: directRegistry(base.adapters, { send: providerSend }),
      payloads: {
        read: () => {
          throw new Error("payload store unavailable");
        },
      },
      evidence: base.evidencePort,
      observations: base.observationPort,
      credentials: { referenceFor: () => null },
      clock: { now: () => new Date(T2) },
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 10_000,
    });

    await expect(worker.processNextSend(new AbortController().signal)).rejects.toThrow(
      "payload store unavailable",
    );
    expect(base.currentEffect()).toMatchObject({ state: "planned", revision: 0, sendCount: 0 });
    expect(providerSend).not.toHaveBeenCalled();
  });

  it("rejects a stale claim at begin after local checks without invoking the provider", async () => {
    const base = harness({ initial: effect("planned") });
    const providerSend = vi.fn(async () => {
      throw new Error("provider must not be called");
    });
    const payloadRead = vi.fn(() => Uint8Array.from(PAYLOAD));
    const credentialLookup = vi.fn(() => null);
    const beginSend = vi.fn((): BeginSendResult => {
      throw new EffectClaimLostError("outbox claim changed before begin");
    });
    const worker = new EffectWorker({
      ownerId: "worker.stale-before-begin",
      repository: { ...base.repository, beginSend },
      adapters: directRegistry(base.adapters, { send: providerSend }),
      payloads: { read: payloadRead },
      evidence: base.evidencePort,
      observations: base.observationPort,
      credentials: { referenceFor: credentialLookup },
      clock: { now: () => new Date(T2) },
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 10_000,
    });

    await expect(worker.processNextSend(new AbortController().signal)).resolves.toMatchObject({
      kind: "interrupted",
      reason: "claim-lost",
    });
    expect(credentialLookup).toHaveBeenCalledOnce();
    expect(payloadRead).toHaveBeenCalledOnce();
    expect(beginSend).toHaveBeenCalledOnce();
    expect(base.currentEffect()).toMatchObject({ state: "planned", revision: 0, sendCount: 0 });
    expect(providerSend).not.toHaveBeenCalled();
  });

  it("turns an adapter exception into unknown state without persisting its message", async () => {
    const value = harness({ initial: effect("planned"), send: "throw" });
    await expect(value.worker.processNextSend(new AbortController().signal)).resolves.toMatchObject(
      { state: "unknown" },
    );
    expect(value.calls).toEqual(["timeout"]);
    const stored = [...value.evidence.values()][0];
    expect(new TextDecoder().decode(stored)).not.toContain("untrusted provider secret");
  });

  it("does not let untrusted adapter text forge a trusted claim-loss result", async () => {
    const value = harness({ initial: effect("planned"), send: "claim-spoof" });
    await expect(value.worker.processNextSend(new AbortController().signal)).resolves.toMatchObject(
      { kind: "completed", state: "unknown" },
    );
    expect(value.calls).toEqual(["timeout"]);
    const stored = [...value.evidence.values()][0];
    expect(new TextDecoder().decode(stored)).not.toContain("provider claim rejected");
  });

  it("classifies claim loss only when the trusted repository reports it", async () => {
    const initial = effect("planned");
    const base = harness({ initial, send: "observed" });
    const worker = new EffectWorker({
      ownerId: "worker.trusted-claim-loss",
      repository: {
        ...base.repository,
        assertDispatchActive: () => {
          throw new EffectClaimLostError("outbox claim expired");
        },
      },
      adapters: base.adapters,
      payloads: { read: () => Uint8Array.from(PAYLOAD) },
      evidence: base.evidencePort,
      observations: base.observationPort,
      credentials: { referenceFor: () => null },
      clock: { now: () => new Date(T2) },
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 10_000,
    });

    await expect(worker.processNextSend(new AbortController().signal)).resolves.toMatchObject({
      kind: "interrupted",
      reason: "claim-lost",
    });
    expect(base.mutations).toEqual([]);
  });

  it("does not infer claim loss from an untyped repository error message", async () => {
    const initial = effect("planned");
    const base = harness({ initial, send: "observed" });
    const worker = new EffectWorker({
      ownerId: "worker.untyped-repository-error",
      repository: {
        ...base.repository,
        assertDispatchActive: () => {
          throw new Error("repository claim telemetry failed");
        },
      },
      adapters: base.adapters,
      payloads: { read: () => Uint8Array.from(PAYLOAD) },
      evidence: base.evidencePort,
      observations: base.observationPort,
      credentials: { referenceFor: () => null },
      clock: { now: () => new Date(T2) },
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 10_000,
    });

    await expect(worker.processNextSend(new AbortController().signal)).rejects.toThrow(
      "repository claim telemetry failed",
    );
    expect(base.mutations).toEqual([]);
  });

  it("requires a second observed provider call to confirm an already observed effect", async () => {
    const value = harness({ initial: effect("observed"), reconcile: "observed" });
    await expect(
      value.worker.processNextReconciliation(new AbortController().signal),
    ).resolves.toMatchObject({ state: "confirmed" });
    expect(value.calls).toEqual(["confirmed"]);
  });

  it("keeps an unresolved unknown effect in reconciliation instead of resending", async () => {
    const value = harness({ initial: effect("unknown"), reconcile: "ambiguous" });
    await expect(
      value.worker.processNextReconciliation(new AbortController().signal),
    ).resolves.toMatchObject({ state: "unknown" });
    expect(value.calls).toEqual(["reconcile-unresolved"]);
  });

  it("uses the legal sent -> unknown path for a manual result", async () => {
    const value = harness({ initial: effect("sent"), reconcile: "manual-intervention" });
    await expect(
      value.worker.processNextReconciliation(new AbortController().signal),
    ).resolves.toMatchObject({ state: "unknown" });
    expect(value.calls).toEqual(["reconcile-unknown"]);
  });

  it("preserves an attested observed state when a follow-up is not observed", async () => {
    for (const reconcile of ["not-found", "ambiguous"] as const) {
      const value = harness({ initial: effect("observed"), reconcile });
      await expect(
        value.worker.processNextReconciliation(new AbortController().signal),
      ).resolves.toMatchObject({ state: "observed" });
      expect(value.calls).toEqual(["defer-observed"]);
    }
  });

  it("terminates an observed effect truthfully when the provider requires intervention", async () => {
    const value = harness({
      initial: effect("observed"),
      reconcile: "manual-intervention",
    });
    await expect(
      value.worker.processNextReconciliation(new AbortController().signal),
    ).resolves.toMatchObject({ state: "manual-intervention" });
    expect(value.calls).toEqual(["manual-intervention"]);
    expect(value.evidenceInputs[0]).toMatchObject({
      outcome: "manual-intervention",
      outcomeCode: "github.operator-review",
    });
  });

  it("allows an unknown effect to enter manual intervention", async () => {
    const value = harness({ initial: effect("unknown"), reconcile: "manual-intervention" });
    await expect(
      value.worker.processNextReconciliation(new AbortController().signal),
    ).resolves.toMatchObject({ state: "manual-intervention" });
    expect(value.calls).toEqual(["manual-intervention"]);
  });

  it("normalizes provider time locally and revalidates the claim immediately before commit", async () => {
    const value = harness({ initial: effect("planned"), send: "observed" });
    await expect(value.worker.processNextSend(new AbortController().signal)).resolves.toMatchObject(
      { state: "observed" },
    );

    const issued = value.issuedInputs[0] as Readonly<{
      resource: Readonly<{ observedAt: string }>;
      observedAt: string;
      adapterId: string;
      adapterVersion: string;
    }>;
    const mutation = value.mutations[0] as Readonly<{
      outcome: Readonly<{
        resource: Readonly<{ observedAt: string }>;
        observation: Readonly<{ observedAt: string }>;
      }>;
    }>;
    expect(issued.observedAt).not.toBe(T1);
    expect(issued.resource.observedAt).toBe(issued.observedAt);
    expect(mutation.outcome.resource.observedAt).toBe(issued.observedAt);
    expect(mutation.outcome.observation.observedAt).toBe(issued.observedAt);
    expect(issued).toMatchObject({ adapterId: "github.test", adapterVersion: "1" });
    expect(value.repositoryEvents.slice(-2)).toEqual(["assert-send", "record-send"]);
  });

  it("cannot commit an observation when async attestation outlives the claim", async () => {
    const initial = effect("planned");
    const base = harness({ initial, send: "observed" });
    let claimExpired = false;
    const worker = new EffectWorker({
      ownerId: "worker.stale-observation",
      repository: base.repository,
      adapters: base.adapters,
      payloads: { read: () => Uint8Array.from(PAYLOAD) },
      evidence: base.evidencePort,
      observations: {
        issue(input) {
          claimExpired = true;
          return observation(input);
        },
      },
      credentials: { referenceFor: () => null },
      clock: {
        now: () => new Date(claimExpired ? "2026-08-10T12:01:01.000Z" : "2026-08-10T12:00:00.000Z"),
      },
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 10_000,
    });

    await expect(worker.processNextSend(new AbortController().signal)).resolves.toMatchObject({
      kind: "interrupted",
      reason: "deadline-elapsed",
    });
    expect(base.mutations).toEqual([]);
    expect(base.calls).toEqual([]);
  });

  it("bounds a hanging payload read and propagates its absolute deadline and abort signal", async () => {
    const initial = effect("planned");
    const base = harness({ initial });
    const providerSend = vi.fn(async () => {
      throw new Error("provider must not be called");
    });
    let payloadContext: Readonly<{ deadline: string; signal: AbortSignal }> | undefined;
    const worker = new EffectWorker({
      ownerId: "worker.deadline.payload",
      repository: base.repository,
      adapters: directRegistry(base.adapters, { send: providerSend }),
      payloads: {
        read(input) {
          payloadContext = input;
          return new Promise<Uint8Array>(() => undefined);
        },
      },
      evidence: base.evidencePort,
      observations: base.observationPort,
      credentials: { referenceFor: () => null },
      clock: elapsedClock(),
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 15,
    });

    await expect(worker.processNextSend(new AbortController().signal)).resolves.toMatchObject({
      kind: "interrupted",
      reason: "deadline-elapsed",
    });
    expect(payloadContext?.deadline).toMatch(/^2026-08-10T12:00:00\.0[0-9]{2}Z$/u);
    expect(payloadContext?.signal.aborted).toBe(true);
    expect(base.currentEffect()).toMatchObject({ state: "planned", revision: 0, sendCount: 0 });
    expect(providerSend).not.toHaveBeenCalled();
  });

  it("bounds hanging evidence persistence and zeroizes provider detail", async () => {
    const initial = effect("planned");
    const base = harness({ initial });
    const adapterDetail = Uint8Array.from(DETAIL);
    let evidenceContext:
      Readonly<{ deadline: string; signal: AbortSignal; rawDetail: Uint8Array }> | undefined;
    const worker = new EffectWorker({
      ownerId: "worker.deadline.evidence",
      repository: base.repository,
      adapters: directRegistry(base.adapters, {
        async send(input): Promise<EffectSendResult> {
          return {
            kind: "observed",
            correlationKey: "issue:42",
            resource: {
              schemaVersion: 1,
              effectId: input.effect.effectId,
              target: input.effect.target,
              providerResourceId: "42",
              providerUrl: null,
              providerVersion: null,
              observedDigest: DIGEST,
              observedAt: T1,
            },
            detail: adapterDetail,
          };
        },
      }),
      payloads: { read: () => Uint8Array.from(PAYLOAD) },
      evidence: {
        persist(input) {
          evidenceContext = input;
          return new Promise<`sha256:${string}`>(() => undefined);
        },
      },
      observations: base.observationPort,
      credentials: { referenceFor: () => null },
      clock: elapsedClock(),
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 15,
    });

    await expect(worker.processNextSend(new AbortController().signal)).resolves.toMatchObject({
      reason: "deadline-elapsed",
    });
    expect(evidenceContext?.deadline).toMatch(/^2026-08-10T12:00:00\.0[0-9]{2}Z$/u);
    expect(evidenceContext?.signal.aborted).toBe(true);
    expect([...adapterDetail]).toEqual(new Array(adapterDetail.length).fill(0));
    expect(evidenceContext === undefined ? [] : [...evidenceContext.rawDetail]).toEqual(
      new Array(DETAIL.length).fill(0),
    );
  });

  it("bounds hanging observation issuance under the same absolute deadline", async () => {
    const initial = effect("planned");
    const base = harness({ initial });
    const adapterDetail = Uint8Array.from(DETAIL);
    let observationContext: Readonly<{ deadline: string; signal: AbortSignal }> | undefined;
    const worker = new EffectWorker({
      ownerId: "worker.deadline.observation",
      repository: base.repository,
      adapters: directRegistry(base.adapters, {
        async send(input): Promise<EffectSendResult> {
          return {
            kind: "observed",
            correlationKey: "issue:42",
            resource: {
              schemaVersion: 1,
              effectId: input.effect.effectId,
              target: input.effect.target,
              providerResourceId: "42",
              providerUrl: null,
              providerVersion: null,
              observedDigest: DIGEST,
              observedAt: T1,
            },
            detail: adapterDetail,
          };
        },
      }),
      payloads: { read: () => Uint8Array.from(PAYLOAD) },
      evidence: base.evidencePort,
      observations: {
        issue(input) {
          observationContext = input;
          return new Promise<unknown>(() => undefined);
        },
      },
      credentials: { referenceFor: () => null },
      clock: elapsedClock(),
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 15,
    });

    await expect(worker.processNextSend(new AbortController().signal)).resolves.toMatchObject({
      reason: "deadline-elapsed",
    });
    expect(observationContext?.deadline).toMatch(/^2026-08-10T12:00:00\.0[0-9]{2}Z$/u);
    expect(observationContext?.signal.aborted).toBe(true);
    expect([...adapterDetail]).toEqual(new Array(adapterDetail.length).fill(0));
  });

  it("zeroizes a late provider result after the absolute deadline", async () => {
    const initial = effect("planned");
    const base = harness({ initial });
    let resolveSend: ((value: EffectSendResult) => void) | undefined;
    const adapterDetail = Uint8Array.from(DETAIL);
    let payloadDeadline: string | undefined;
    let adapterContext:
      | Readonly<{
          deadline: string;
          signal: AbortSignal;
          payload: Uint8Array;
          assertActive(): Promise<void>;
        }>
      | undefined;
    const lateAdapters = new AdapterRegistry();
    lateAdapters.register({
      adapterId: "github.test",
      adapterVersion: "1",
      provider: "github",
      async preflight() {
        return {
          schemaVersion: 1,
          adapterId: "github.test",
          adapterVersion: "1",
          provider: "github",
          checkedAt: T0,
          credentialReference: null,
          capabilities: [],
        };
      },
      send: (input) =>
        new Promise<EffectSendResult>((resolve) => {
          adapterContext = input;
          resolveSend = resolve;
        }),
      async reconcile() {
        throw new Error("not used");
      },
    });
    const worker = new EffectWorker({
      ownerId: "worker.deadline.adapter",
      repository: base.repository,
      adapters: lateAdapters,
      payloads: {
        read(input) {
          payloadDeadline = input.deadline;
          return Uint8Array.from(PAYLOAD);
        },
      },
      evidence: base.evidencePort,
      observations: base.observationPort,
      credentials: { referenceFor: () => null },
      clock: elapsedClock(),
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 15,
    });

    await expect(worker.processNextSend(new AbortController().signal)).resolves.toMatchObject({
      reason: "deadline-elapsed",
    });
    expect(resolveSend).toBeTypeOf("function");
    expect(adapterContext?.deadline).toBe(payloadDeadline);
    expect(adapterContext?.signal.aborted).toBe(true);
    const lateContext = adapterContext;
    if (lateContext === undefined) throw new Error("expected the adapter invocation context");
    expect([...lateContext.payload]).toEqual([...PAYLOAD]);
    const repositoryEventsBeforeLateCheck = [...base.repositoryEvents];
    await expect(lateContext.assertActive()).rejects.toThrow(/deadline elapsed/);
    expect(base.repositoryEvents).toEqual(repositoryEventsBeforeLateCheck);
    resolveSend?.({
      kind: "observed",
      correlationKey: "issue:42",
      resource: {
        schemaVersion: 1,
        effectId: initial.effectId,
        target: initial.target,
        providerResourceId: "42",
        providerUrl: null,
        providerVersion: null,
        observedDigest: DIGEST,
        observedAt: T1,
      },
      detail: adapterDetail,
    });
    await vi.waitFor(() => {
      expect([...adapterDetail]).toEqual(new Array(adapterDetail.length).fill(0));
      expect([...lateContext.payload]).toEqual(new Array(lateContext.payload.length).fill(0));
    });
  });

  it("rejects reconciliation authorization after parent cancellation before repository access", async () => {
    const initial = effect("unknown");
    const base = harness({ initial });
    let resolveReconciliation: ((value: EffectReconciliationResult) => void) | undefined;
    const adapterDetail = Uint8Array.from(DETAIL);
    let adapterContext:
      Readonly<{ signal: AbortSignal; assertActive(): Promise<void> }> | undefined;
    const cancelledAdapters = new AdapterRegistry();
    cancelledAdapters.register({
      adapterId: "github.test",
      adapterVersion: "1",
      provider: "github",
      async preflight() {
        return {
          schemaVersion: 1,
          adapterId: "github.test",
          adapterVersion: "1",
          provider: "github",
          checkedAt: T0,
          credentialReference: null,
          capabilities: [],
        };
      },
      async send() {
        throw new Error("not used");
      },
      reconcile: (input) =>
        new Promise<EffectReconciliationResult>((resolve) => {
          adapterContext = input;
          resolveReconciliation = resolve;
        }),
    });
    const worker = new EffectWorker({
      ownerId: "worker.cancelled.reconciliation",
      repository: base.repository,
      adapters: cancelledAdapters,
      payloads: { read: () => Uint8Array.from(PAYLOAD) },
      evidence: base.evidencePort,
      observations: base.observationPort,
      credentials: { referenceFor: () => null },
      clock: elapsedClock(),
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 10_000,
    });
    const controller = new AbortController();
    const processing = worker.processNextReconciliation(controller.signal);
    await vi.waitFor(() => expect(resolveReconciliation).toBeTypeOf("function"));
    expect(base.repositoryEvents).toEqual(["assert-reconcile"]);
    controller.abort(new Error("operator cancelled"));
    await expect(processing).resolves.toMatchObject({
      kind: "interrupted",
      reason: "aborted",
    });
    const cancelledContext = adapterContext;
    if (cancelledContext === undefined) throw new Error("expected reconciliation context");
    expect(cancelledContext.signal.aborted).toBe(true);
    await expect(cancelledContext.assertActive()).rejects.toThrow(/authorization aborted/);
    expect(base.repositoryEvents).toEqual(["assert-reconcile"]);

    resolveReconciliation?.({
      kind: "ambiguous",
      correlationKey: "issue:42",
      reconcileAfter: "2026-08-10T12:02:00.000Z",
      detail: adapterDetail,
    });
    await vi.waitFor(() => {
      expect([...adapterDetail]).toEqual(new Array(adapterDetail.length).fill(0));
    });
  });

  it("rejects an observation issued for a different adapter and zeroizes detail", async () => {
    const initial = effect("planned");
    const base = harness({ initial });
    const adapterDetail = Uint8Array.from(DETAIL);
    const worker = new EffectWorker({
      ownerId: "worker.provenance",
      repository: base.repository,
      adapters: directRegistry(base.adapters, {
        async send(input): Promise<EffectSendResult> {
          return {
            kind: "observed",
            correlationKey: "issue:42",
            resource: {
              schemaVersion: 1,
              effectId: input.effect.effectId,
              target: input.effect.target,
              providerResourceId: "42",
              providerUrl: null,
              providerVersion: null,
              observedDigest: DIGEST,
              observedAt: T1,
            },
            detail: adapterDetail,
          };
        },
      }),
      payloads: { read: () => Uint8Array.from(PAYLOAD) },
      evidence: base.evidencePort,
      observations: {
        issue(input) {
          return { ...observation(input), adapterId: "github.other" };
        },
      },
      credentials: { referenceFor: () => null },
      clock: { now: () => new Date(T2) },
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 10_000,
    });

    await expect(worker.processNextSend(new AbortController().signal)).rejects.toThrow(
      /exact adapter/,
    );
    expect([...adapterDetail]).toEqual(new Array(adapterDetail.length).fill(0));
    expect(base.mutations).toEqual([]);
  });

  it("rejects an observation issued for a different adapter version", async () => {
    const initial = effect("planned");
    const base = harness({ initial, send: "observed" });
    const worker = new EffectWorker({
      ownerId: "worker.provenance-version",
      repository: base.repository,
      adapters: base.adapters,
      payloads: { read: () => Uint8Array.from(PAYLOAD) },
      evidence: base.evidencePort,
      observations: {
        issue(input) {
          return { ...observation(input), adapterVersion: "2" };
        },
      },
      credentials: { referenceFor: () => null },
      clock: { now: () => new Date(T2) },
      claimDurationMs: 60_000,
      adapterCallTimeoutMs: 10_000,
    });

    await expect(worker.processNextSend(new AbortController().signal)).rejects.toThrow(
      /exact adapter/,
    );
    expect(base.mutations).toEqual([]);
  });
});
