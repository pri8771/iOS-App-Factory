import { createHash } from "node:crypto";

import {
  ExternalResourceV1Schema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  ReleaseIdentityV1Schema,
  Sha256DigestSchema,
  type IsoInstant,
  type Sha256Digest,
} from "@app-factory/contracts";

import {
  createDisabledRealAppleUploadTransportV1,
  createFakeAppleUploadTransportV1,
  type FakeAppleUploadScenarioV1,
  type FakeAppleUploadTransportV1,
} from "./fake-apple-upload-transport.js";

const ADAPTER_ID = "app-factory.adapter.fake-apple-upload";
const ADAPTER_VERSION = "1.0.0";

function sha256Utf8(value: string): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`,
  );
}

function sha256Payload(bytes: Uint8Array): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(Buffer.from(bytes)).digest("hex")}`,
  );
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function reconcileAfter(now: IsoInstant, delayMs: number): IsoInstant {
  return IsoInstantSchema.parse(new Date(Date.parse(now) + delayMs).toISOString());
}

/**
 * Registers the Session-2 fake Apple upload transport as an effect-worker provider adapter.
 * Never contacts Apple; real transport remains a separate disabled probe.
 */
export function createFakeAppleUploadAdapterV1(
  scenario: FakeAppleUploadScenarioV1 = "success",
  transport: FakeAppleUploadTransportV1 = createFakeAppleUploadTransportV1(scenario),
) {
  const disabledReal = createDisabledRealAppleUploadTransportV1();
  return {
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    provider: "apple" as const,
    async preflight(signal: AbortSignal) {
      if (signal.aborted) throw new Error("fake apple upload preflight aborted");
      const now = IsoInstantSchema.parse(new Date().toISOString());
      const capability = transport.probeCapability(now);
      const realCapability = disabledReal.probeCapability(now);
      return {
        schemaVersion: 1 as const,
        adapterId: NamespacedCodeSchema.parse(ADAPTER_ID),
        adapterVersion: ADAPTER_VERSION,
        provider: "apple" as const,
        checkedAt: now,
        credentialReference: null,
        capabilities: [
          {
            capability: "apple.upload-build",
            available: capability.available,
            blockerCode: capability.available ? null : capability.blockerCode,
            summary: capability.summary,
          },
          {
            capability: "apple.upload-build.real",
            available: realCapability.available,
            blockerCode: realCapability.blockerCode,
            summary: realCapability.summary,
          },
        ],
      };
    },
    async send(input: {
      effect: {
        effectId: string;
        payloadDigest: Sha256Digest;
        target: {
          provider: string;
          resourceType: string;
          resourceKey: string;
        };
      };
      payload: Uint8Array;
      signal: AbortSignal;
      assertActive(): Promise<void>;
    }) {
      await input.assertActive();
      if (input.signal.aborted) throw new Error("fake apple upload send aborted");
      const identity = ReleaseIdentityV1Schema.parse(
        JSON.parse(new TextDecoder().decode(input.payload)),
      );
      if (sha256Payload(input.payload) !== input.effect.payloadDigest) {
        throw new Error("fake apple upload payload digest mismatch");
      }
      if (identity.transportProtocol !== "app-factory.fake-apple-upload.v1") {
        throw new Error("fake apple upload adapter refuses non-fake transport protocol identity");
      }
      const identityDigest = sha256Payload(input.payload);
      const receipt = transport.send({
        effectId: input.effect.effectId as never,
        releaseRunId: identity.releaseRunId,
        identity,
        identityDigest,
        now: IsoInstantSchema.parse(new Date().toISOString()),
      });
      const detail = textBytes(
        JSON.stringify({
          outcome: receipt.outcome,
          reasonCode: receipt.reasonCode,
          providerBuildId: receipt.providerBuildId,
          detailDigest: receipt.detailDigest,
        }),
      );
      switch (receipt.outcome) {
        case "accepted":
        case "duplicate-provider-receipt":
          return {
            kind: "observed" as const,
            correlationKey: receipt.providerCorrelationKey as string,
            resource: ExternalResourceV1Schema.parse({
              schemaVersion: 1,
              effectId: input.effect.effectId,
              target: input.effect.target,
              providerResourceId: receipt.providerBuildId ?? `fake:${input.effect.effectId}`,
              providerUrl: null,
              providerVersion: null,
              observedDigest: receipt.detailDigest ?? sha256Utf8(receipt.outcome),
              observedAt: receipt.recordedAt,
            }),
            detail,
          };
        case "rejected":
        case "identity-mismatch":
        case "malformed-receipt":
          return {
            kind: "rejected" as const,
            code: NamespacedCodeSchema.parse(receipt.reasonCode ?? "apple.upload.rejected"),
            retryable: false,
            detail,
          };
        case "timeout-uncertain":
          return {
            kind: "ambiguous" as const,
            correlationKey: receipt.providerCorrelationKey,
            reconcileAfter: reconcileAfter(receipt.recordedAt, 60_000),
            detail,
          };
        default: {
          const _exhaustive: never = receipt.outcome;
          throw new Error(`unsupported fake receipt outcome: ${_exhaustive}`);
        }
      }
    },
    async reconcile(input: {
      effect: {
        effectId: string;
        providerCorrelationKey: string | null;
        target: {
          provider: string;
          resourceType: string;
          resourceKey: string;
        };
      };
      signal: AbortSignal;
      assertActive(): Promise<void>;
    }) {
      await input.assertActive();
      if (input.signal.aborted) throw new Error("fake apple upload reconcile aborted");
      const now = IsoInstantSchema.parse(new Date().toISOString());
      if (scenario === "delayed-success" || scenario === "success") {
        return {
          kind: "observed" as const,
          correlationKey: `fake-reconcile:${input.effect.effectId}`,
          resource: ExternalResourceV1Schema.parse({
            schemaVersion: 1,
            effectId: input.effect.effectId,
            target: input.effect.target,
            providerResourceId: `fake-build-reconciled:${input.effect.effectId}`,
            providerUrl: null,
            providerVersion: null,
            observedDigest: sha256Utf8(`reconciled:${input.effect.effectId}`),
            observedAt: now,
          }),
          detail: textBytes(JSON.stringify({ kind: "reconcile-observed" })),
        };
      }
      if (scenario === "timeout") {
        return {
          kind: "ambiguous" as const,
          correlationKey: input.effect.providerCorrelationKey,
          reconcileAfter: reconcileAfter(now, 60_000),
          detail: textBytes(JSON.stringify({ kind: "reconcile-still-uncertain" })),
        };
      }
      return {
        kind: "not-found" as const,
        correlationKey: input.effect.providerCorrelationKey,
        reconcileAfter: reconcileAfter(now, 60_000),
        detail: textBytes(JSON.stringify({ kind: "reconcile-not-found" })),
      };
    },
  };
}
