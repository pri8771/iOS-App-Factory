import { createHash, randomUUID } from "node:crypto";

import {
  ProtectedReleaseTransportCapabilityV1Schema,
  SanitizedReleaseTransportReceiptV1Schema,
  type EffectId,
  type IsoInstant,
  type ProtectedReleaseTransportCapabilityV1,
  type ReleaseIdentityV1,
  type ReleaseRunId,
  type SanitizedReleaseTransportReceiptV1,
  type Sha256Digest,
} from "@app-factory/contracts";

export type FakeAppleUploadScenarioV1 =
  | "success"
  | "rejected"
  | "timeout"
  | "delayed-success"
  | "malformed-receipt"
  | "wrong-identity"
  | "duplicate-provider-receipt";

export type FakeAppleUploadTransportV1 = Readonly<{
  protocol: "app-factory.fake-apple-upload.v1";
  scenario: FakeAppleUploadScenarioV1;
  probeCapability: (now: IsoInstant) => ProtectedReleaseTransportCapabilityV1;
  send: (input: {
    effectId: EffectId;
    releaseRunId: ReleaseRunId;
    identity: ReleaseIdentityV1;
    identityDigest: Sha256Digest;
    now: IsoInstant;
  }) => SanitizedReleaseTransportReceiptV1;
}>;

export type RealAppleUploadTransportV1 = Readonly<{
  protocol: "app-factory.apple-upload.v1";
  probeCapability: (now: IsoInstant) => ProtectedReleaseTransportCapabilityV1;
  send: () => never;
}>;

function digestOf(value: string): Sha256Digest {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}` as Sha256Digest;
}

/**
 * Deterministic in-process fake Apple upload transport for Session 2. Never contacts Apple.
 */
export function createFakeAppleUploadTransportV1(
  scenario: FakeAppleUploadScenarioV1 = "success",
): FakeAppleUploadTransportV1 {
  return {
    protocol: "app-factory.fake-apple-upload.v1",
    scenario,
    probeCapability(now) {
      return ProtectedReleaseTransportCapabilityV1Schema.parse({
        schemaVersion: 1,
        transportProtocol: "app-factory.fake-apple-upload.v1",
        available: true,
        enabledByDefault: true,
        blockerCode: null,
        summary: `Fake Apple upload transport available (scenario=${scenario})`,
        checkedAt: now,
      });
    },
    send(input) {
      const base = {
        schemaVersion: 1 as const,
        effectId: input.effectId,
        releaseRunId: input.releaseRunId,
        identityDigest: input.identityDigest,
        transportProtocol: "app-factory.fake-apple-upload.v1" as const,
        recordedAt: input.now,
      };
      switch (scenario) {
        case "success":
        case "delayed-success":
          return SanitizedReleaseTransportReceiptV1Schema.parse({
            ...base,
            outcome: "accepted",
            providerCorrelationKey: `fake:${input.identity.appBundleId}:${input.identity.buildNumber}`,
            providerBuildId: `fake-build-${input.identity.buildNumber}`,
            reasonCode: null,
            detailDigest: digestOf(`accepted:${input.effectId}`),
          });
        case "rejected":
          return SanitizedReleaseTransportReceiptV1Schema.parse({
            ...base,
            outcome: "rejected",
            providerCorrelationKey: null,
            providerBuildId: null,
            reasonCode: "apple.upload.rejected",
            detailDigest: digestOf(`rejected:${input.effectId}`),
          });
        case "timeout":
          return SanitizedReleaseTransportReceiptV1Schema.parse({
            ...base,
            outcome: "timeout-uncertain",
            providerCorrelationKey: `fake-uncertain:${input.effectId}`,
            providerBuildId: null,
            reasonCode: "apple.upload.timeout-uncertain",
            detailDigest: digestOf(`timeout:${input.effectId}`),
          });
        case "malformed-receipt":
          return SanitizedReleaseTransportReceiptV1Schema.parse({
            ...base,
            outcome: "malformed-receipt",
            providerCorrelationKey: null,
            providerBuildId: null,
            reasonCode: "apple.upload.malformed-receipt",
            detailDigest: digestOf(`malformed:${input.effectId}`),
          });
        case "wrong-identity":
          return SanitizedReleaseTransportReceiptV1Schema.parse({
            ...base,
            outcome: "identity-mismatch",
            providerCorrelationKey: `fake:wrong:${randomUUID()}`,
            providerBuildId: "fake-build-999999",
            reasonCode: "apple.upload.identity-mismatch",
            detailDigest: digestOf(`mismatch:${input.effectId}`),
          });
        case "duplicate-provider-receipt":
          return SanitizedReleaseTransportReceiptV1Schema.parse({
            ...base,
            outcome: "duplicate-provider-receipt",
            providerCorrelationKey: `fake:${input.identity.appBundleId}:${input.identity.buildNumber}`,
            providerBuildId: `fake-build-${input.identity.buildNumber}`,
            reasonCode: "apple.upload.duplicate-provider-receipt",
            detailDigest: digestOf(`duplicate:${input.effectId}`),
          });
        default: {
          const _exhaustive: never = scenario;
          throw new Error(`unsupported fake scenario: ${_exhaustive}`);
        }
      }
    },
  };
}

/**
 * Real Apple upload transport remains unavailable by default and fail-closed.
 */
export function createDisabledRealAppleUploadTransportV1(): RealAppleUploadTransportV1 {
  return {
    protocol: "app-factory.apple-upload.v1",
    probeCapability(now) {
      return ProtectedReleaseTransportCapabilityV1Schema.parse({
        schemaVersion: 1,
        transportProtocol: "app-factory.apple-upload.v1",
        available: false,
        enabledByDefault: false,
        blockerCode: "apple.upload.transport-disabled",
        summary:
          "Real Apple upload transport is disabled by default until a later live-authorization task supplies exact approval and credentials",
        checkedAt: now,
      });
    },
    send(): never {
      throw new Error(
        "apple.upload.transport-disabled: real Apple upload transport is unavailable in this factory build",
      );
    },
  };
}
