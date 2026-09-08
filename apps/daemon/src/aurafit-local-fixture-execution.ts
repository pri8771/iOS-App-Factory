import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  RelativePathSchema,
  Sha256DigestSchema,
  type Sha256Digest,
} from "@app-factory/contracts";

/**
 * OR-22 / IF-T009: bounded AuraFit-shaped local fixture.
 *
 * Validates source-bound identity (scheme, configuration, bundle ID, base commit/tree) and
 * fail-closed execution intent without invoking Xcode archive, Apple APIs, signing, or a live
 * provider. Reviewer evidence is required and must differ from the implementer run id.
 */

export const AURAFIT_FIXTURE_SCHEME = "AuraFit" as const;
export const AURAFIT_FIXTURE_CONFIGURATION = "Release" as const;
export const AURAFIT_FIXTURE_BUNDLE_ID = "com.pchordia.aurafit" as const;

export type AuraFitLocalIdentityV1 = Readonly<{
  scheme: string;
  configuration: string;
  bundleId: string;
  allowedBaseCommit: string;
  allowedBaseTree: string;
}>;

export type AuraFitLocalExecutionIntentV1 = Readonly<{
  intentId: string;
  implementerRunId: string;
  reviewerRunId: string;
  sourceCommit: string;
  sourceTree: string;
  scheme: string;
  configuration: string;
  bundleId: string;
  /** Wall-clock budget for local checks; exceeded intents fail closed. */
  timeoutMs: number;
  cancelled?: boolean;
  checkResults?: readonly Readonly<{ name: string; passed: boolean; detail: string }>[];
  reviewerEvidenceDigests?: readonly Sha256Digest[];
  /** When true, simulates missing reviewer evidence. */
  omitReviewerEvidence?: boolean;
}>;

export type AuraFitLocalFixtureResultV1 = Readonly<{
  ok: true;
  identity: AuraFitLocalIdentityV1;
  intentId: string;
  implementerRunId: string;
  reviewerRunId: string;
  evidenceDigests: readonly Sha256Digest[];
  provenance: Readonly<{
    scheme: string;
    configuration: string;
    bundleId: string;
    sourceCommit: string;
    sourceTree: string;
  }>;
}>;

export class AuraFitLocalFixtureError extends Error {
  public constructor(
    public readonly code:
      | "aurafit.identity-mismatch"
      | "aurafit.missing-scheme"
      | "aurafit.missing-configuration"
      | "aurafit.missing-bundle-id"
      | "aurafit.duplicate-intent"
      | "aurafit.replay-conflict"
      | "aurafit.timeout"
      | "aurafit.cancelled"
      | "aurafit.checks-failed"
      | "aurafit.missing-reviewer-evidence"
      | "aurafit.self-review-refused"
      | "aurafit.source-drift"
      | "aurafit.signing-forbidden"
      | "aurafit.archive-forbidden",
    message: string,
  ) {
    super(message);
    this.name = "AuraFitLocalFixtureError";
  }
}

export type AuraFitLocalFixtureStore = {
  hasIntent(intentId: string): boolean;
  recordIntent(intentId: string, digest: Sha256Digest): void;
  priorDigest(intentId: string): Sha256Digest | undefined;
};

export function createMemoryAuraFitLocalFixtureStore(): AuraFitLocalFixtureStore {
  const intents = new Map<string, Sha256Digest>();
  return {
    hasIntent: (intentId) => intents.has(intentId),
    recordIntent: (intentId, digest) => {
      intents.set(intentId, digest);
    },
    priorDigest: (intentId) => intents.get(intentId),
  };
}

function digestIntent(intent: AuraFitLocalExecutionIntentV1): Sha256Digest {
  const payload = JSON.stringify({
    intentId: intent.intentId,
    implementerRunId: intent.implementerRunId,
    reviewerRunId: intent.reviewerRunId,
    sourceCommit: intent.sourceCommit,
    sourceTree: intent.sourceTree,
    scheme: intent.scheme,
    configuration: intent.configuration,
    bundleId: intent.bundleId,
  });
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`,
  );
}

export function loadAuraFitLocalIdentityFromManifest(path: string): AuraFitLocalIdentityV1 {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (raw.schemaVersion !== 1 || raw.kind !== "aurafit-local-proof-v1") {
    throw new AuraFitLocalFixtureError(
      "aurafit.identity-mismatch",
      "AuraFit local proof manifest schema/kind mismatch.",
    );
  }
  return {
    scheme: String(raw.scheme ?? ""),
    configuration: String(raw.configuration ?? ""),
    bundleId: String(raw.bundleId ?? ""),
    allowedBaseCommit: String(raw.allowedBaseCommit ?? ""),
    allowedBaseTree: String(raw.allowedBaseTree ?? ""),
  };
}

export function assertAuraFitLocalIdentity(identity: AuraFitLocalIdentityV1): void {
  if (identity.scheme.length === 0) {
    throw new AuraFitLocalFixtureError("aurafit.missing-scheme", "AuraFit scheme is required.");
  }
  if (identity.configuration.length === 0) {
    throw new AuraFitLocalFixtureError(
      "aurafit.missing-configuration",
      "AuraFit build configuration is required.",
    );
  }
  if (identity.bundleId.length === 0) {
    throw new AuraFitLocalFixtureError(
      "aurafit.missing-bundle-id",
      "AuraFit bundle identifier is required.",
    );
  }
  if (identity.scheme !== AURAFIT_FIXTURE_SCHEME) {
    throw new AuraFitLocalFixtureError(
      "aurafit.identity-mismatch",
      `Expected scheme ${AURAFIT_FIXTURE_SCHEME}, got ${identity.scheme}.`,
    );
  }
  if (identity.configuration !== AURAFIT_FIXTURE_CONFIGURATION) {
    throw new AuraFitLocalFixtureError(
      "aurafit.identity-mismatch",
      `Expected configuration ${AURAFIT_FIXTURE_CONFIGURATION}, got ${identity.configuration}.`,
    );
  }
  if (identity.bundleId !== AURAFIT_FIXTURE_BUNDLE_ID) {
    throw new AuraFitLocalFixtureError(
      "aurafit.identity-mismatch",
      `Expected bundleId ${AURAFIT_FIXTURE_BUNDLE_ID}, got ${identity.bundleId}.`,
    );
  }
  // Refuse Hindsight or other product identities by substring without reading that repo.
  if (/hindsight/i.test(identity.scheme) || /hindsight/i.test(identity.bundleId)) {
    throw new AuraFitLocalFixtureError(
      "aurafit.identity-mismatch",
      "Hindsight identity is forbidden in the AuraFit local proof fixture.",
    );
  }
}

export function executeAuraFitLocalFixture(options: Readonly<{
  identity: AuraFitLocalIdentityV1;
  intent: AuraFitLocalExecutionIntentV1;
  store: AuraFitLocalFixtureStore;
  /** Simulated elapsed milliseconds for timeout classification. */
  elapsedMs?: number;
  /** Explicit refusal if a caller asks for signing/archive. */
  requestedOperation?: "local-proof" | "archive" | "sign";
}>): AuraFitLocalFixtureResultV1 {
  const { identity, intent, store } = options;
  assertAuraFitLocalIdentity(identity);

  if (options.requestedOperation === "archive") {
    throw new AuraFitLocalFixtureError(
      "aurafit.archive-forbidden",
      "AuraFit local proof refuses archive/export operations.",
    );
  }
  if (options.requestedOperation === "sign") {
    throw new AuraFitLocalFixtureError(
      "aurafit.signing-forbidden",
      "AuraFit local proof refuses signing operations.",
    );
  }

  if (!intent.scheme) {
    throw new AuraFitLocalFixtureError("aurafit.missing-scheme", "Execution intent omitted scheme.");
  }
  if (!intent.configuration) {
    throw new AuraFitLocalFixtureError(
      "aurafit.missing-configuration",
      "Execution intent omitted configuration.",
    );
  }
  if (!intent.bundleId) {
    throw new AuraFitLocalFixtureError(
      "aurafit.missing-bundle-id",
      "Execution intent omitted bundleId.",
    );
  }

  if (
    intent.scheme !== identity.scheme ||
    intent.configuration !== identity.configuration ||
    intent.bundleId !== identity.bundleId
  ) {
    throw new AuraFitLocalFixtureError(
      "aurafit.identity-mismatch",
      "Execution intent identity does not match the AuraFit fixture identity.",
    );
  }

  if (
    intent.sourceCommit !== identity.allowedBaseCommit ||
    intent.sourceTree !== identity.allowedBaseTree
  ) {
    throw new AuraFitLocalFixtureError(
      "aurafit.source-drift",
      "Source commit/tree drifted from the AuraFit fixture pin.",
    );
  }

  if (intent.cancelled === true) {
    throw new AuraFitLocalFixtureError("aurafit.cancelled", "Execution intent was cancelled.");
  }

  const elapsed = options.elapsedMs ?? 0;
  if (elapsed > intent.timeoutMs) {
    throw new AuraFitLocalFixtureError(
      "aurafit.timeout",
      `Local proof exceeded timeoutMs=${intent.timeoutMs}.`,
    );
  }

  if (intent.implementerRunId === intent.reviewerRunId) {
    throw new AuraFitLocalFixtureError(
      "aurafit.self-review-refused",
      "Reviewer run id must differ from implementer run id.",
    );
  }

  const intentDigest = digestIntent(intent);
  if (store.hasIntent(intent.intentId)) {
    const prior = store.priorDigest(intent.intentId);
    if (prior === intentDigest) {
      throw new AuraFitLocalFixtureError(
        "aurafit.duplicate-intent",
        `Intent ${intent.intentId} was already executed (duplicate).`,
      );
    }
    throw new AuraFitLocalFixtureError(
      "aurafit.replay-conflict",
      `Intent ${intent.intentId} was replayed with a conflicting payload.`,
    );
  }

  const checks = intent.checkResults ?? [{ name: "identity-bound", passed: true, detail: "ok" }];
  const failed = checks.filter((check) => !check.passed);
  if (failed.length > 0) {
    throw new AuraFitLocalFixtureError(
      "aurafit.checks-failed",
      `Trusted checks failed: ${failed.map((check) => check.name).join(", ")}.`,
    );
  }

  if (intent.omitReviewerEvidence === true || (intent.reviewerEvidenceDigests?.length ?? 0) === 0) {
    throw new AuraFitLocalFixtureError(
      "aurafit.missing-reviewer-evidence",
      "Independent reviewer evidence digests are required.",
    );
  }

  store.recordIntent(intent.intentId, intentDigest);

  return {
    ok: true,
    identity,
    intentId: intent.intentId,
    implementerRunId: intent.implementerRunId,
    reviewerRunId: intent.reviewerRunId,
    evidenceDigests: intent.reviewerEvidenceDigests ?? [],
    provenance: {
      scheme: intent.scheme,
      configuration: intent.configuration,
      bundleId: intent.bundleId,
      sourceCommit: intent.sourceCommit,
      sourceTree: intent.sourceTree,
    },
  };
}

/** Helper for tests: validate a relative path stays inside the fixture tree. */
export function assertFixtureRelativePath(path: string): string {
  return RelativePathSchema.parse(path);
}
