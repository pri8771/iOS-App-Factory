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

export type VerifyCertificationInput = Readonly<{
  certification: unknown;
  releaseContract: unknown;
  experienceManifest: unknown;
  coherence: CoherenceEvaluation;
  findingLedger: readonly unknown[];
}>;

export function verifyCertification(input: VerifyCertificationInput): CertificationV1 {
  const certification = CertificationV1Schema.parse(input.certification);
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
  if (certification.projectId !== release.projectId) {
    throw new CertificationError("Certification project does not match the release contract");
  }
  if (certification.policyDigest !== release.policyDigest) {
    throw new CertificationError("Certification policy digest does not match the release contract");
  }
  if (certification.releaseContractDigest !== qualityDigest(release)) {
    throw new CertificationError("Certification is not bound to the exact release contract");
  }
  if (certification.experienceManifestDigest !== qualityDigest(experience)) {
    throw new CertificationError("Certification is not bound to the exact experience manifest");
  }
  if (certification.findingLedgerDigest !== qualityDigest(findings)) {
    throw new CertificationError("Certification is not bound to the exact finding ledger");
  }
  const blocking = new Set(release.blockingSeverities);
  if (findings.some((finding) => finding.status === "open" && blocking.has(finding.severity))) {
    throw new CertificationError("The finding ledger contains an unresolved release blocker");
  }
  if (new Set(certification.approvalIds).size !== certification.approvalIds.length) {
    throw new CertificationError("Certification approval IDs must be unique");
  }
  return certification;
}

const STAGE_ORDER: readonly CertificationV1["stage"][] = [
  "candidate",
  "archived",
  "uploaded",
  "device-smoke-passed",
];

export function assertCertificationAdvancement(
  previousInput: unknown,
  nextInput: unknown,
): CertificationV1 {
  const previous = CertificationV1Schema.parse(previousInput);
  const next = CertificationV1Schema.parse(nextInput);
  const previousIndex = STAGE_ORDER.indexOf(previous.stage);
  const nextIndex = STAGE_ORDER.indexOf(next.stage);
  if (nextIndex !== previousIndex + 1) {
    throw new CertificationError(
      `Certification must advance exactly one stage from ${previous.stage}`,
    );
  }
  const immutableKeys = [
    "releaseId",
    "projectId",
    "profile",
    "gitCommit",
    "gitTree",
    "cleanTree",
    "policyDigest",
    "releaseContractDigest",
    "experienceManifestDigest",
    "evidenceManifestDigest",
    "findingLedgerDigest",
  ] as const;
  for (const key of immutableKeys) {
    if (previous[key] !== next[key]) {
      throw new CertificationError(`Certification changed immutable field ${key}`);
    }
  }
  const previousApprovals = new Set(previous.approvalIds);
  if (previous.approvalIds.some((approvalId) => !next.approvalIds.includes(approvalId))) {
    throw new CertificationError("Certification advancement removed an earlier approval");
  }
  if (new Set(next.approvalIds).size !== next.approvalIds.length) {
    throw new CertificationError("Certification advancement contains duplicate approvals");
  }
  if (next.approvalIds.length <= previousApprovals.size) {
    throw new CertificationError("Each certification stage requires a new approval");
  }
  return next;
}
