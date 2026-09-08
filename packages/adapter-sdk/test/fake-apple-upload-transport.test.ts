import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createDisabledRealAppleUploadTransportV1,
  createFakeAppleUploadTransportV1,
} from "../src/index.js";

const NOW = "2026-09-08T18:00:00.000Z";
const DIGEST = `sha256:${"a".repeat(64)}` as const;

describe("fake apple upload transport", () => {
  it("reports the fake transport available and returns a sanitized success receipt", () => {
    const transport = createFakeAppleUploadTransportV1("success");
    const capability = transport.probeCapability(NOW);
    expect(capability.available).toBe(true);
    expect(capability.enabledByDefault).toBe(true);

    const receipt = transport.send({
      effectId: randomUUID() as never,
      releaseRunId: randomUUID() as never,
      identityDigest: DIGEST,
      now: NOW,
      identity: {
        schemaVersion: 1,
        repositoryId: randomUUID() as never,
        sourceCommit: "a".repeat(40),
        sourceTree: "b".repeat(40),
        policyDigest: DIGEST,
        projectId: randomUUID() as never,
        releaseId: randomUUID() as never,
        releaseRunId: randomUUID() as never,
        appBundleId: "com.pchordia.aurafit",
        marketingVersion: "1.0",
        buildNumber: "12",
        archiveDigest: DIGEST,
        exportedArtifactDigest: DIGEST,
        destination: "app-store-connect-internal",
        transportProtocol: "app-factory.fake-apple-upload.v1",
        transportProtocolVersion: 1,
      },
    });
    expect(receipt.outcome).toBe("accepted");
    expect(receipt.providerBuildId).toBe("fake-build-12");
  });

  it("keeps the real Apple transport disabled by default", () => {
    const transport = createDisabledRealAppleUploadTransportV1();
    const capability = transport.probeCapability(NOW);
    expect(capability.available).toBe(false);
    expect(capability.blockerCode).toBe("apple.upload.transport-disabled");
    expect(() => transport.send()).toThrow(/transport-disabled/);
  });
});
