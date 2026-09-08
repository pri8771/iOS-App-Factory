import { describe, expect, it, vi } from "vitest";

import {
  createDisabledRealAppleUploadTransportV1,
  createFakeAppleUploadAdapterV1,
  createFakeAppleUploadTransportV1,
  sha256Bytes,
  validateExternalProviderAdapter,
} from "../src/index.js";

describe("fake apple upload adapter", () => {
  it("registers as an apple provider and refuses real transport by default", async () => {
    const adapter = validateExternalProviderAdapter(createFakeAppleUploadAdapterV1("success"));
    expect(adapter.provider).toBe("apple");
    const preflight = await adapter.preflight(new AbortController().signal);
    expect(preflight.capabilities.some((item) => item.capability === "apple.upload-build")).toBe(
      true,
    );
    expect(
      preflight.capabilities.find((item) => item.capability === "apple.upload-build.real")
        ?.available,
    ).toBe(false);
    expect(
      createDisabledRealAppleUploadTransportV1().probeCapability("2026-09-08T18:00:00.000Z")
        .available,
    ).toBe(false);
  });

  it("maps success transport receipts to observed send results", async () => {
    const identity = {
      schemaVersion: 1,
      repositoryId: "9c000000-0000-4000-8000-000000000002",
      sourceCommit: "1".repeat(40),
      sourceTree: "2".repeat(40),
      policyDigest: `sha256:${"d".repeat(64)}`,
      projectId: "9c000000-0000-4000-8000-000000000001",
      releaseId: "9c000000-0000-4000-8000-000000000003",
      releaseRunId: "9c000000-0000-4000-8000-000000000004",
      appBundleId: "com.pchordia.aurafit",
      marketingVersion: "1.0.0",
      buildNumber: "11",
      archiveDigest: `sha256:${"c".repeat(64)}`,
      exportedArtifactDigest: `sha256:${"e".repeat(64)}`,
      destination: "app-store-connect-internal",
      transportProtocol: "app-factory.fake-apple-upload.v1",
      transportProtocolVersion: 1,
    } as const;
    const payload = Buffer.from(JSON.stringify(identity), "utf8");
    const effectId = "9c000000-0000-4000-8000-000000000006";
    const adapter = validateExternalProviderAdapter(
      createFakeAppleUploadAdapterV1("success", createFakeAppleUploadTransportV1("success")),
    );
    const result = await adapter.send({
      effect: {
        schemaVersion: 1,
        effectId,
        attemptId: null,
        action: "apple.upload-build",
        operationMarker: `app-factory:v1:apple:upload-build:${effectId}`,
        target: {
          provider: "apple",
          resourceType: "apple.build",
          resourceKey: "com.pchordia.aurafit/1.0.0/11",
        },
        subject: {
          projectId: "9c000000-0000-4000-8000-000000000001",
          taskId: null,
          attemptId: null,
          releaseId: "9c000000-0000-4000-8000-000000000003",
        },
        payloadDigest: sha256Bytes(payload),
        policyDigest: `sha256:${"d".repeat(64)}`,
        approvalId: "9c000000-0000-4000-8000-000000000005",
        state: "sent",
        revision: 1,
        sendCount: 1,
        providerCorrelationKey: null,
        createdAt: "2026-09-08T18:00:00.000Z",
        updatedAt: "2026-09-08T18:00:01.000Z",
        lastObservedAt: null,
        nextReconcileAt: null,
        detailDigest: null,
      },
      payload,
      credentialReference: null,
      claim: {
        ownerId: "effect-worker-1",
        fence: 1,
        outboxRevision: 1,
        effectRevision: 1,
        lockedUntil: "2026-09-08T18:05:00.000Z",
      },
      deadline: "2026-09-08T18:04:00.000Z",
      signal: new AbortController().signal,
      assertActive: vi.fn(async () => undefined),
    });
    expect(result.kind).toBe("observed");
  });
});
