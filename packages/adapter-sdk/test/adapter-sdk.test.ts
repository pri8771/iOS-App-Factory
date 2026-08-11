import { describe, expect, it, vi } from "vitest";

import {
  AdapterContractError,
  AdapterRegistry,
  parseCredentialReference,
  sha256Bytes,
  validateExternalProviderAdapter,
  type ExternalProviderAdapter,
} from "../src/index.js";

const EFFECT_ID = "72000000-0000-4000-8000-000000000001";
const ATTEMPT_ID = "72000000-0000-4000-8000-000000000002";
const PROJECT_ID = "72000000-0000-4000-8000-000000000003";
const T0 = "2026-08-11T12:00:00.000Z";
const T1 = "2026-08-11T12:01:00.000Z";
const POLICY = `sha256:${"a".repeat(64)}`;
const payload = Buffer.from('{"title":"Factory task"}\n');

function effect(state: "planned" | "sent" | "unknown" = "planned") {
  return {
    schemaVersion: 1,
    effectId: EFFECT_ID,
    attemptId: ATTEMPT_ID,
    action: "github.issue-create",
    operationMarker: "app-factory:v1:github:issue:72000000",
    target: { provider: "github", resourceType: "github.issue", resourceKey: "owner/repo#new" },
    subject: { projectId: PROJECT_ID, taskId: null, attemptId: ATTEMPT_ID, releaseId: null },
    payloadDigest: sha256Bytes(payload),
    policyDigest: POLICY,
    approvalId: null,
    state,
    revision: 0,
    sendCount: 0,
    providerCorrelationKey: state === "planned" ? null : "owner/repo:marker",
    createdAt: T0,
    updatedAt: T0,
    lastObservedAt: null,
    nextReconcileAt: state === "unknown" ? T1 : null,
    detailDigest: null,
  } as const;
}

function resource() {
  return {
    schemaVersion: 1,
    effectId: EFFECT_ID,
    target: { provider: "github", resourceType: "github.issue", resourceKey: "owner/repo#new" },
    providerResourceId: "123",
    providerUrl: "https://github.test/owner/repo/issues/123",
    providerVersion: "etag-1",
    observedDigest: `sha256:${"b".repeat(64)}`,
    observedAt: T0,
  } as const;
}

function dispatchContext(effectRevision = 0) {
  return {
    credentialReference: null,
    claim: {
      ownerId: "effect-worker-1",
      fence: 1,
      outboxRevision: 1,
      effectRevision,
      lockedUntil: "2026-08-11T12:02:00.000Z",
    },
    deadline: T1,
    signal: new AbortController().signal,
    assertActive: vi.fn(async () => undefined),
  } as const;
}

function adapter(overrides: Partial<ExternalProviderAdapter> = {}): ExternalProviderAdapter {
  return {
    adapterId: "github.rest",
    adapterVersion: "1.0.0",
    provider: "github",
    async preflight() {
      return {
        schemaVersion: 1,
        adapterId: "github.rest",
        adapterVersion: "1.0.0",
        provider: "github",
        checkedAt: T0,
        credentialReference: {
          schemaVersion: 1,
          kind: "macos-keychain",
          service: "app-factory.github",
          account: "factory",
        },
        capabilities: [
          {
            capability: "github.issue-write",
            available: true,
            blockerCode: null,
            summary: "Issue writes are available.",
          },
        ],
      };
    },
    async send() {
      return {
        kind: "observed",
        correlationKey: "owner/repo:marker",
        resource: resource(),
        detail: Buffer.from("created"),
      };
    },
    async reconcile() {
      return {
        kind: "observed",
        correlationKey: "owner/repo:marker",
        resource: resource(),
        detail: Buffer.from("found"),
      };
    },
    ...overrides,
  };
}

describe("adapter SDK", () => {
  it("validates preflight identity, capabilities, and keychain references", async () => {
    const validated = validateExternalProviderAdapter(adapter());
    await expect(validated.preflight(new AbortController().signal)).resolves.toMatchObject({
      provider: "github",
      capabilities: [{ capability: "github.issue-write", available: true }],
    });
    expect(
      parseCredentialReference({
        schemaVersion: 1,
        kind: "macos-keychain",
        service: "app-factory.github",
        account: "factory",
      }),
    ).toMatchObject({ service: "app-factory.github" });
  });

  it("binds dispatch to provider, planned state, and exact payload digest", async () => {
    const send = vi.fn(adapter().send);
    const validated = validateExternalProviderAdapter(adapter({ send }));
    await expect(
      validated.send({
        effect: effect("sent"),
        payload,
        ...dispatchContext(),
      }),
    ).resolves.toMatchObject({ kind: "observed", correlationKey: "owner/repo:marker" });
    expect(send).toHaveBeenCalledOnce();

    await expect(
      validated.send({
        effect: effect("sent"),
        payload: Buffer.from("wrong"),
        ...dispatchContext(),
      }),
    ).rejects.toThrow(/payload bytes/);
    expect(send).toHaveBeenCalledOnce();
  });

  it("rejects provider-resource substitution and premature reconciliation", async () => {
    const wrong = resource();
    const validated = validateExternalProviderAdapter(
      adapter({
        async send() {
          return {
            kind: "observed",
            correlationKey: "owner/repo:marker",
            resource: { ...wrong, target: { ...wrong.target, provider: "jira" } },
            detail: Buffer.from("bad"),
          };
        },
      }),
    );
    await expect(
      validated.send({
        effect: effect("sent"),
        payload,
        ...dispatchContext(),
      }),
    ).rejects.toThrow();
    await expect(
      validated.reconcile({
        effect: effect(),
        ...dispatchContext(),
      }),
    ).rejects.toThrow(/only sent, unknown, or observed/);
  });

  it("accepts bounded ambiguous outcomes but never lets an adapter claim confirmation", async () => {
    const validated = validateExternalProviderAdapter(
      adapter({
        async send() {
          return {
            kind: "ambiguous",
            correlationKey: null,
            reconcileAfter: T1,
            detail: Buffer.from("request timed out"),
          };
        },
      }),
    );
    await expect(
      validated.send({
        effect: effect("sent"),
        payload,
        ...dispatchContext(),
      }),
    ).resolves.toMatchObject({ kind: "ambiguous", reconcileAfter: T1 });

    const invalid = validateExternalProviderAdapter(
      adapter({
        async send() {
          return { kind: "confirmed" };
        },
      }),
    );
    await expect(
      invalid.send({
        effect: effect("sent"),
        payload,
        ...dispatchContext(),
      }),
    ).rejects.toBeInstanceOf(AdapterContractError);
  });

  it("rechecks the fenced claim immediately before provider I/O", async () => {
    const send = vi.fn(adapter().send);
    const validated = validateExternalProviderAdapter(adapter({ send }));
    const assertActive = vi.fn(async () => {
      throw new Error("stale outbox fence");
    });
    await expect(
      validated.send({
        effect: effect("sent"),
        payload,
        ...dispatchContext(),
        assertActive,
      }),
    ).rejects.toThrow(/stale outbox fence/);
    expect(assertActive).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("registers exactly one adapter per provider in deterministic order", () => {
    const registry = new AdapterRegistry();
    registry.register(adapter());
    expect(registry.require("github").adapterId).toBe("github.rest");
    expect(registry.list().map((item) => item.provider)).toEqual(["github"]);
    expect(() => registry.register(adapter())).toThrow(/already registered/);
    expect(() => registry.require("jira")).toThrow(/no adapter/);
  });
});
