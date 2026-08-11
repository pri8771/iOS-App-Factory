import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ApprovalV1Schema,
  ExternalEffectV1Schema,
  ExternalResourceV1Schema,
} from "../src/index.js";

const NOW = "2026-08-10T12:00:00.000Z";
const LATER = "2026-08-10T13:00:00.000Z";
const DIGEST = `sha256:${"a".repeat(64)}`;

function subject() {
  return {
    projectId: randomUUID(),
    taskId: randomUUID(),
    attemptId: randomUUID(),
    releaseId: null,
  };
}

describe("approval and external-effect contracts", () => {
  it("accepts an exact hash-bound single-use approval", () => {
    const effectId = randomUUID();
    expect(
      ApprovalV1Schema.parse({
        schemaVersion: 1,
        approvalId: randomUUID(),
        action: "github.merge",
        resourceType: "github.pull-request",
        resourceKey: "owner/repository#42",
        subject: subject(),
        binding: {
          planDigest: DIGEST,
          diffDigest: DIGEST,
          commit: "a".repeat(40),
          buildIdentityDigest: null,
          policyDigest: DIGEST,
        },
        actorId: "priyansh@example.com",
        mode: "single-use",
        standingScope: null,
        issuedAt: NOW,
        expiresAt: LATER,
        status: "consumed",
        revokedAt: null,
        consumedAt: LATER,
        consumedByEffectId: effectId,
      }).consumedByEffectId,
    ).toBe(effectId);
  });

  it("models ambiguous provider state without calling it success", () => {
    const effectId = randomUUID();
    const effect = ExternalEffectV1Schema.parse({
      schemaVersion: 1,
      effectId,
      attemptId: randomUUID(),
      action: "apple.upload-build",
      operationMarker: `app-factory:v1:apple:upload:${effectId}`,
      target: {
        provider: "apple",
        resourceType: "apple.build",
        resourceKey: "com.example.app/1.0/7",
      },
      subject: subject(),
      payloadDigest: DIGEST,
      policyDigest: DIGEST,
      approvalId: randomUUID(),
      state: "unknown",
      revision: 3,
      sendCount: 1,
      providerCorrelationKey: "com.example.app:1.0:7",
      createdAt: NOW,
      updatedAt: LATER,
      lastObservedAt: null,
      nextReconcileAt: LATER,
      detailDigest: DIGEST,
    });
    expect(effect.state).toBe("unknown");
    expect(effect.state).not.toBe("confirmed");
  });

  it("keeps observed external resource identity separate from intended effect", () => {
    const effectId = randomUUID();
    const resource = ExternalResourceV1Schema.parse({
      schemaVersion: 1,
      effectId,
      target: {
        provider: "github",
        resourceType: "github.pull-request",
        resourceKey: "owner/repository:factory/task-1",
      },
      providerResourceId: "42",
      providerUrl: "https://github.com/owner/repository/pull/42",
      providerVersion: "head-sha",
      observedDigest: DIGEST,
      observedAt: NOW,
    });
    expect(resource.effectId).toBe(effectId);
  });

  it("rejects unversioned markers, unknown fields, and unsupported providers", () => {
    const base = {
      schemaVersion: 1,
      effectId: randomUUID(),
      attemptId: randomUUID(),
      action: "github.open-pr",
      operationMarker: "ad-hoc-marker",
      target: {
        provider: "github",
        resourceType: "github.pull-request",
        resourceKey: "owner/repository:branch",
      },
      subject: subject(),
      payloadDigest: DIGEST,
      policyDigest: DIGEST,
      approvalId: null,
      state: "planned",
      revision: 0,
      sendCount: 0,
      providerCorrelationKey: null,
      createdAt: NOW,
      updatedAt: NOW,
      lastObservedAt: null,
      nextReconcileAt: null,
      detailDigest: null,
    };
    expect(ExternalEffectV1Schema.safeParse(base).success).toBe(false);
    expect(
      ExternalEffectV1Schema.safeParse({
        ...base,
        operationMarker: `app-factory:v1:github:pr:${base.effectId}`,
        bypassApproval: true,
      }).success,
    ).toBe(false);
    expect(
      ExternalEffectV1Schema.safeParse({
        ...base,
        operationMarker: `app-factory:v1:github:pr:${base.effectId}`,
        target: { ...base.target, provider: "unregistered" },
      }).success,
    ).toBe(false);
  });
});
