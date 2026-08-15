import { ReleaseManifestV1Schema } from "@app-factory/contracts";

import {
  CertificationV1Schema,
  ExperienceManifestV1Schema,
  QualityFindingV1Schema,
  ReleaseContractV1Schema,
  type CertificationV1,
} from "./model.js";
import { qualityDigest, type CoherenceEvaluation } from "./coherence.js";

export class CertificationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "CertificationError";
  }
}

/**
 * Projects the quality-relevant subset of a `ReleaseManifestV1` (the
 * canonical, contracts-owned release state machine) into the narrower
 * `CertificationV1` read shape. This is a pure reshape: every one of the
 * eight release stages maps onto exactly one `CertificationV1` stage with an
 * identical evidence-nullability signature, so the projection never loses
 * stage fidelity and the defensive `CertificationV1Schema.parse` below can
 * never fail for a release that already satisfies
 * `ReleaseManifestV1Schema`'s own per-stage evidence gate.
 */
export function projectCertificationV1(releaseManifestInput: unknown): CertificationV1 {
  const release = ReleaseManifestV1Schema.parse(releaseManifestInput);
  return CertificationV1Schema.parse({
    schemaVersion: release.schemaVersion,
    stage: release.stage,
    releaseId: release.releaseId,
    projectId: release.projectId,
    profile: release.profile,
    gitCommit: release.candidate.commit,
    gitTree: release.candidate.tree,
    cleanTree: release.candidate.cleanTree,
    policyDigest: release.candidate.policyDigest,
    releaseContractDigest: release.candidate.releaseContractDigest,
    experienceManifestDigest: release.candidate.experienceManifestDigest,
    evidenceManifestDigest: release.candidate.evidenceManifestDigest,
    findingLedgerDigest: release.candidate.findingLedgerDigest,
    approvalIds: release.approvals,
    generatedAt: release.updatedAt,
    archiveDigest: release.archiveDigest,
    appStoreBuildId: release.appStoreBuildId,
    testFlightInstalledAt: release.internalTestFlightAvailableAt,
    deviceSmokeEvidenceDigest: release.deviceSmokeEvidenceDigest,
  });
}

export type VerifyCertificationInput = Readonly<{
  releaseManifest: unknown;
  releaseContract: unknown;
  experienceManifest: unknown;
  coherence: CoherenceEvaluation;
  findingLedger: readonly unknown[];
}>;

/**
 * Validates that a release candidate's digest-bound fields are consistent
 * with its actual supporting documents (the release contract, the
 * experience manifest, and the finding ledger) and that no open blocking
 * finding remains, then returns the certification-shaped read view. This is
 * the quality gate that a caller runs before allowing a `ReleaseManifestV1`
 * to advance from `candidate` to `certified`
 * (see `assertReleaseAdvancement` in `@app-factory/contracts`); it validates
 * against the canonical release record instead of tracking its own
 * competing stage.
 */
export function verifyCertification(input: VerifyCertificationInput): CertificationV1 {
  const releaseManifest = ReleaseManifestV1Schema.parse(input.releaseManifest);
  const release = ReleaseContractV1Schema.parse(input.releaseContract);
  const experience = ExperienceManifestV1Schema.parse(input.experienceManifest);
  const findings = input.findingLedger.map((value) => QualityFindingV1Schema.parse(value));
  if (!input.coherence.passed) {
    throw new CertificationError("A failed experience-coherence evaluation cannot be certified");
  }
  if (
    input.coherence.releaseContract.projectId !== release.projectId ||
    input.coherence.experienceManifest.projectId !== experience.projectId
  ) {
    throw new CertificationError("Coherence evidence belongs to a different project");
  }
  if (releaseManifest.projectId !== release.projectId) {
    throw new CertificationError("Release manifest project does not match the release contract");
  }
  if (releaseManifest.candidate.policyDigest !== release.policyDigest) {
    throw new CertificationError(
      "Release manifest policy digest does not match the release contract",
    );
  }
  if (releaseManifest.candidate.releaseContractDigest !== qualityDigest(release)) {
    throw new CertificationError("Release manifest is not bound to the exact release contract");
  }
  if (releaseManifest.candidate.experienceManifestDigest !== qualityDigest(experience)) {
    throw new CertificationError("Release manifest is not bound to the exact experience manifest");
  }
  if (releaseManifest.candidate.findingLedgerDigest !== qualityDigest(findings)) {
    throw new CertificationError("Release manifest is not bound to the exact finding ledger");
  }
  const blocking = new Set(release.blockingSeverities);
  if (findings.some((finding) => finding.status === "open" && blocking.has(finding.severity))) {
    throw new CertificationError("The finding ledger contains an unresolved release blocker");
  }
  return projectCertificationV1(releaseManifest);
}
