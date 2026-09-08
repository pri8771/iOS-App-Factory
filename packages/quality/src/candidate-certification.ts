import {
  CandidateCertificationV1Schema,
  EvidenceManifestV1Schema,
  VerificationClaimsV1Schema,
  type CandidateCertificationV1,
} from "@app-factory/contracts";

import { QualityFindingV1Schema, type QualitySeverityV1 } from "./model.js";

/**
 * Every quality dimension the FULL certification engine (`verifyCertification`,
 * `evaluateExperienceCoherence` in this package) speaks to but `certifyCandidateSubsetV1` below
 * cannot: each needs screenshot or route instrumentation (`RuntimeLineageObservationV1`,
 * `StaticUiObservationV1`) that does not exist anywhere in the factory yet (release-rail
 * architecture decision 6). Always disclosed on every `CandidateCertificationV1` this module
 * produces via its `unevaluated` field -- never silently dropped, never counted as a pass.
 */
export const KNOWN_UNEVALUATED_QUALITY_DIMENSIONS_V1 = [
  "quality.coherence",
  "quality.presentation-matrix",
  "quality.runtime-lineage",
] as const;

export class CandidateCertificationSubsetError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CandidateCertificationSubsetError";
  }
}

export type CertifyCandidateSubsetInputV1 = Readonly<{
  releaseId: string;
  projectId: string;
  /** The release candidate's own commit (`ReleaseManifestV1.candidate.commit`). */
  candidateCommit: string;
  /** The commit the Factory mirror's broker actually verified -- checked for equality against
   *  `candidateCommit` rather than trusted blindly, so a candidate can never claim a clean tree at
   *  a commit nobody actually verified. */
  verifiedBrokerCommit: string;
  /** `ReleaseManifestV1.candidate.cleanTree`, passed through rather than re-derived: this function
   *  is pure and does no filesystem I/O. */
  cleanTree: boolean;
  /** A `VerificationClaimsV1` input -- the plan's own executed verification check for this
   *  candidate (see `packages/contracts/src/v1/evidence.ts`). */
  verification: unknown;
  /** An `EvidenceManifestV1` input for this candidate. */
  evidenceManifest: unknown;
  /** The caller's already-computed digest for every evidence ID the manifest references (digest
   *  computation is I/O over the evidence store, out of scope for a pure function); every entry in
   *  `evidenceManifest.entries` must have a matching, matching-digest entry here for the manifest
   *  to verify. */
  evidenceDigestsByEvidenceId: Readonly<Record<string, string>>;
  /** `QualityFindingV1` inputs for this candidate's finding ledger. */
  findings: readonly unknown[];
  blockingSeverities: readonly QualitySeverityV1[];
  evaluatedAt: string;
}>;

/**
 * The honest `candidate -> certified` subset (release-rail architecture decision 6): everything
 * Wave 1 can genuinely check today --
 *   1. a clean tree at a verified broker commit,
 *   2. the plan's own verification passed,
 *   3. the evidence manifest verifies, and
 *   4. no open blocking finding --
 * with the presentation-matrix / coherence / runtime-lineage dimensions always named in
 * `unevaluated` rather than silently skipped or faked as passing. This is a pure function over
 * caller-supplied inputs: it does no I/O and computes no digests itself, so a later wave's daemon
 * command is responsible for actually sourcing `evidenceDigestsByEvidenceId` from the real evidence
 * store before calling this. NEVER reports coherence as passing -- it is not represented in
 * `checks` at all, only disclosed via `unevaluated`.
 */
export function certifyCandidateSubsetV1(
  input: CertifyCandidateSubsetInputV1,
): CandidateCertificationV1 {
  const verification = VerificationClaimsV1Schema.parse(input.verification);
  const evidenceManifest = EvidenceManifestV1Schema.parse(input.evidenceManifest);
  const findings = input.findings.map((value) => QualityFindingV1Schema.parse(value));

  // Unbranded intermediate shape: `CandidateCertificationV1Schema.parse` below re-validates and
  // brands every field (including each check's `code`) when it builds the final, returned record.
  const checks: Array<{ code: string; passed: boolean; detail: string }> = [];

  const cleanTreeAtVerifiedCommit =
    input.cleanTree === true && input.candidateCommit === input.verifiedBrokerCommit;
  checks.push({
    code: "quality.candidate.clean-tree-at-verified-commit",
    passed: cleanTreeAtVerifiedCommit,
    detail: cleanTreeAtVerifiedCommit
      ? `Clean tree at verified broker commit ${input.candidateCommit}.`
      : `Candidate commit ${input.candidateCommit} is not a clean tree at the verified broker commit ${input.verifiedBrokerCommit}.`,
  });

  checks.push({
    code: "quality.candidate.plan-verification-passed",
    passed: verification.passed,
    detail: verification.passed
      ? `Verification check ${verification.checkId} passed.`
      : `Verification check ${verification.checkId} failed (exit ${String(verification.exitCode)}).`,
  });

  const unverifiedEntries = evidenceManifest.entries.filter(
    (entry) => input.evidenceDigestsByEvidenceId[entry.evidenceId] !== entry.digest,
  );
  checks.push({
    code: "quality.candidate.evidence-manifest-verifies",
    passed: unverifiedEntries.length === 0,
    detail:
      unverifiedEntries.length === 0
        ? `All ${String(evidenceManifest.entries.length)} evidence manifest entries verified.`
        : `${String(unverifiedEntries.length)} evidence manifest entry/entries do not match their recorded digest.`,
  });

  const blocking = new Set(input.blockingSeverities);
  const openBlockingFindings = findings.filter(
    (finding) => finding.status === "open" && blocking.has(finding.severity),
  );
  checks.push({
    code: "quality.candidate.no-open-blocking-findings",
    passed: openBlockingFindings.length === 0,
    detail:
      openBlockingFindings.length === 0
        ? "No open blocking findings."
        : `${String(openBlockingFindings.length)} open blocking finding(s): ${openBlockingFindings
            .map((finding) => finding.findingId)
            .join(", ")}.`,
  });

  return CandidateCertificationV1Schema.parse({
    schemaVersion: 1,
    releaseId: input.releaseId,
    projectId: input.projectId,
    candidateCommit: input.candidateCommit,
    evaluatedAt: input.evaluatedAt,
    checks,
    unevaluated: [...KNOWN_UNEVALUATED_QUALITY_DIMENSIONS_V1],
    certified: checks.every((check) => check.passed),
  });
}
