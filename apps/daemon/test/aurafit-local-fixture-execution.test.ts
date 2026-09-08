import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Sha256DigestSchema } from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import {
  AURAFIT_FIXTURE_BUNDLE_ID,
  AURAFIT_FIXTURE_CONFIGURATION,
  AURAFIT_FIXTURE_SCHEME,
  AuraFitLocalFixtureError,
  assertAuraFitLocalIdentity,
  createMemoryAuraFitLocalFixtureStore,
  executeAuraFitLocalFixture,
  loadAuraFitLocalIdentityFromManifest,
  type AuraFitLocalExecutionIntentV1,
  type AuraFitLocalIdentityV1,
} from "../src/aurafit-local-fixture-execution.js";

const MANIFEST = join(
  fileURLToPath(new URL("../../../fixtures/aurafit-local-proof/identity.v1.json", import.meta.url)),
);

const EVIDENCE = Sha256DigestSchema.parse(
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
);

function baseIdentity(): AuraFitLocalIdentityV1 {
  return loadAuraFitLocalIdentityFromManifest(MANIFEST);
}

function baseIntent(
  overrides: Partial<AuraFitLocalExecutionIntentV1> = {},
): AuraFitLocalExecutionIntentV1 {
  const identity = baseIdentity();
  return {
    intentId: "intent-1",
    implementerRunId: "run-implementer-1",
    reviewerRunId: "run-reviewer-1",
    sourceCommit: identity.allowedBaseCommit,
    sourceTree: identity.allowedBaseTree,
    scheme: identity.scheme,
    configuration: identity.configuration,
    bundleId: identity.bundleId,
    timeoutMs: 1_000,
    reviewerEvidenceDigests: [EVIDENCE],
    ...overrides,
  };
}

describe("aurafit local fixture identity", () => {
  it("loads the AuraFit-shaped fixture without Hindsight identity", () => {
    const identity = baseIdentity();
    expect(identity.scheme).toBe(AURAFIT_FIXTURE_SCHEME);
    expect(identity.configuration).toBe(AURAFIT_FIXTURE_CONFIGURATION);
    expect(identity.bundleId).toBe(AURAFIT_FIXTURE_BUNDLE_ID);
    assertAuraFitLocalIdentity(identity);
  });

  it("fails closed on identity mismatch and missing fields", () => {
    expect(() =>
      assertAuraFitLocalIdentity({
        ...baseIdentity(),
        scheme: "Hindsight",
      }),
    ).toThrow(AuraFitLocalFixtureError);

    expect(() =>
      assertAuraFitLocalIdentity({
        ...baseIdentity(),
        scheme: "",
      }),
    ).toThrow(/missing-scheme|scheme is required/i);

    expect(() =>
      assertAuraFitLocalIdentity({
        ...baseIdentity(),
        bundleId: "com.pchordia.hindsight",
      }),
    ).toThrow(AuraFitLocalFixtureError);
  });
});

describe("executeAuraFitLocalFixture", () => {
  it("proves a successful local non-signing execution with distinct reviewer evidence", () => {
    const store = createMemoryAuraFitLocalFixtureStore();
    const result = executeAuraFitLocalFixture({
      identity: baseIdentity(),
      intent: baseIntent(),
      store,
      requestedOperation: "local-proof",
    });
    expect(result.ok).toBe(true);
    expect(result.provenance.bundleId).toBe(AURAFIT_FIXTURE_BUNDLE_ID);
    expect(result.implementerRunId).not.toBe(result.reviewerRunId);
  });

  it("fails closed for duplicate/replay, timeout, cancel, failed checks, missing review, drift, and forbidden ops", () => {
    const identity = baseIdentity();
    const store = createMemoryAuraFitLocalFixtureStore();

    executeAuraFitLocalFixture({ identity, intent: baseIntent(), store });
    expect(() =>
      executeAuraFitLocalFixture({ identity, intent: baseIntent(), store }),
    ).toThrowError(/duplicate/i);

    const store2 = createMemoryAuraFitLocalFixtureStore();
    store2.recordIntent(
      "intent-1",
      Sha256DigestSchema.parse(
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
    );
    expect(() =>
      executeAuraFitLocalFixture({ identity, intent: baseIntent(), store: store2 }),
    ).toThrowError(/replay/i);

    expect(() =>
      executeAuraFitLocalFixture({
        identity,
        intent: baseIntent({ timeoutMs: 10 }),
        store: createMemoryAuraFitLocalFixtureStore(),
        elapsedMs: 11,
      }),
    ).toThrowError(/timeout/i);

    expect(() =>
      executeAuraFitLocalFixture({
        identity,
        intent: baseIntent({ cancelled: true }),
        store: createMemoryAuraFitLocalFixtureStore(),
      }),
    ).toThrowError(/cancelled/i);

    expect(() =>
      executeAuraFitLocalFixture({
        identity,
        intent: baseIntent({
          checkResults: [{ name: "unit", passed: false, detail: "boom" }],
        }),
        store: createMemoryAuraFitLocalFixtureStore(),
      }),
    ).toThrowError(/checks-failed|failed/i);

    expect(() =>
      executeAuraFitLocalFixture({
        identity,
        intent: baseIntent({ omitReviewerEvidence: true, reviewerEvidenceDigests: [] }),
        store: createMemoryAuraFitLocalFixtureStore(),
      }),
    ).toThrowError(/reviewer evidence/i);

    expect(() =>
      executeAuraFitLocalFixture({
        identity,
        intent: baseIntent({
          implementerRunId: "same",
          reviewerRunId: "same",
        }),
        store: createMemoryAuraFitLocalFixtureStore(),
      }),
    ).toThrowError(/differ from implementer/i);

    expect(() =>
      executeAuraFitLocalFixture({
        identity,
        intent: baseIntent({
          sourceCommit: "0000000000000000000000000000000000000000",
        }),
        store: createMemoryAuraFitLocalFixtureStore(),
      }),
    ).toThrowError(/source-drift|drift/i);

    expect(() =>
      executeAuraFitLocalFixture({
        identity,
        intent: baseIntent({ scheme: "" }),
        store: createMemoryAuraFitLocalFixtureStore(),
      }),
    ).toThrowError(/scheme/i);

    expect(() =>
      executeAuraFitLocalFixture({
        identity,
        intent: baseIntent(),
        store: createMemoryAuraFitLocalFixtureStore(),
        requestedOperation: "archive",
      }),
    ).toThrowError(/archive/i);

    expect(() =>
      executeAuraFitLocalFixture({
        identity,
        intent: baseIntent(),
        store: createMemoryAuraFitLocalFixtureStore(),
        requestedOperation: "sign",
      }),
    ).toThrowError(/sign/i);
  });
});
