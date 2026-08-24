import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CandidateCertificationSubsetError,
  KNOWN_UNEVALUATED_QUALITY_DIMENSIONS_V1,
  certifyCandidateSubsetV1,
  type CertifyCandidateSubsetInputV1,
} from "../src/index.js";

const PROJECT_ID = randomUUID();
const RELEASE_ID = randomUUID();
const COMMIT = "a".repeat(40);
const NOW = "2026-08-12T12:00:00.000Z";
const EARLIER = "2026-08-12T11:00:00.000Z";
const EVIDENCE_ID_A = randomUUID();
const EVIDENCE_ID_B = randomUUID();
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const DIGEST_C = `sha256:${"c".repeat(64)}`;

function passingVerification() {
  return {
    checkId: "verify.build-and-test",
    argv: ["pnpm", "verify"],
    checkoutTree: "b".repeat(40),
    startedAt: EARLIER,
    finishedAt: NOW,
    toolVersions: [],
    passed: true,
    exitCode: 0,
  };
}

function failingVerification() {
  return {
    ...passingVerification(),
    passed: false,
    exitCode: 1,
  };
}

function evidenceManifest() {
  return {
    schemaVersion: 1,
    attemptId: randomUUID(),
    createdAt: NOW,
    subject: {
      taskSpecDigest: DIGEST_A,
      policyDigest: DIGEST_B,
      baseCommit: "c".repeat(40),
      candidateTree: COMMIT,
      fence: 0,
    },
    entries: [
      { evidenceId: EVIDENCE_ID_A, digest: DIGEST_A },
      { evidenceId: EVIDENCE_ID_B, digest: DIGEST_B },
    ],
    requiredKinds: ["verification", "commit"],
  };
}

function matchingDigests() {
  return { [EVIDENCE_ID_A]: DIGEST_A, [EVIDENCE_ID_B]: DIGEST_B };
}

function openBlockingFinding() {
  return {
    schemaVersion: 1,
    findingId: `qf-${"1".repeat(24)}`,
    fingerprint: DIGEST_C,
    ruleId: "quality.release.blocker",
    severity: "p0",
    routeId: null,
    stateId: null,
    path: null,
    summary: "Something is broken.",
    rootCause: null,
    escapedGate: null,
    regressionId: null,
    lessonScope: null,
    evidenceDigests: [],
    status: "open",
  };
}

function baseInput(
  overrides: Partial<CertifyCandidateSubsetInputV1> = {},
): CertifyCandidateSubsetInputV1 {
  return {
    releaseId: RELEASE_ID,
    projectId: PROJECT_ID,
    candidateCommit: COMMIT,
    verifiedBrokerCommit: COMMIT,
    cleanTree: true,
    verification: passingVerification(),
    evidenceManifest: evidenceManifest(),
    evidenceDigestsByEvidenceId: matchingDigests(),
    findings: [],
    blockingSeverities: ["p0", "p1"],
    evaluatedAt: NOW,
    ...overrides,
  };
}

describe("certifyCandidateSubsetV1 (the honest checkable-today subset)", () => {
  it("certifies a candidate that passes every checkable-today dimension", () => {
    const result = certifyCandidateSubsetV1(baseInput());
    expect(result.certified).toBe(true);
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("always discloses the known-unevaluated dimensions, even on a fully certified candidate", () => {
    const result = certifyCandidateSubsetV1(baseInput());
    expect(result.certified).toBe(true);
    expect(result.unevaluated).toEqual([...KNOWN_UNEVALUATED_QUALITY_DIMENSIONS_V1]);
    // The disclosed dimensions are never smuggled into `checks` as passes: `checks` only ever
    // contains the four checkable-today codes, and none of them names a disclosed dimension.
    const checkCodes = new Set(result.checks.map((check) => check.code));
    for (const dimension of KNOWN_UNEVALUATED_QUALITY_DIMENSIONS_V1) {
      expect(checkCodes.has(dimension)).toBe(false);
    }
    expect(result.checks).toHaveLength(4);
  });

  it("NEVER reports coherence as passing -- it never appears in checks at all", () => {
    const result = certifyCandidateSubsetV1(baseInput());
    expect(result.checks.some((check) => check.code.includes("coherence"))).toBe(false);
    expect(result.unevaluated).toContain("quality.coherence");
  });

  it("fails when the candidate commit is not the verified broker commit", () => {
    const result = certifyCandidateSubsetV1(baseInput({ verifiedBrokerCommit: "f".repeat(40) }));
    expect(result.certified).toBe(false);
    const check = result.checks.find(
      (item) => item.code === "quality.candidate.clean-tree-at-verified-commit",
    );
    expect(check?.passed).toBe(false);
  });

  it("fails when the tree is not clean", () => {
    const result = certifyCandidateSubsetV1(baseInput({ cleanTree: false }));
    expect(result.certified).toBe(false);
  });

  it("fails when the plan's own verification did not pass", () => {
    const result = certifyCandidateSubsetV1(baseInput({ verification: failingVerification() }));
    expect(result.certified).toBe(false);
    const check = result.checks.find(
      (item) => item.code === "quality.candidate.plan-verification-passed",
    );
    expect(check?.passed).toBe(false);
  });

  it("fails when an evidence manifest entry does not match its recorded digest", () => {
    const result = certifyCandidateSubsetV1(
      baseInput({ evidenceDigestsByEvidenceId: { [EVIDENCE_ID_A]: DIGEST_A } }),
    );
    expect(result.certified).toBe(false);
    const check = result.checks.find(
      (item) => item.code === "quality.candidate.evidence-manifest-verifies",
    );
    expect(check?.passed).toBe(false);
  });

  it("fails when an open blocking finding remains", () => {
    const result = certifyCandidateSubsetV1(baseInput({ findings: [openBlockingFinding()] }));
    expect(result.certified).toBe(false);
    const check = result.checks.find(
      (item) => item.code === "quality.candidate.no-open-blocking-findings",
    );
    expect(check?.passed).toBe(false);
  });

  it("passes despite a non-blocking open finding", () => {
    const nonBlocking = { ...openBlockingFinding(), severity: "p2" as const };
    const result = certifyCandidateSubsetV1(baseInput({ findings: [nonBlocking] }));
    expect(result.certified).toBe(true);
  });

  it("passes when the only blocking-severity finding is already resolved", () => {
    const resolved = { ...openBlockingFinding(), status: "fixed" as const };
    const result = certifyCandidateSubsetV1(baseInput({ findings: [resolved] }));
    expect(result.certified).toBe(true);
  });

  it("throws on a malformed verification input rather than silently passing", () => {
    expect(() => certifyCandidateSubsetV1(baseInput({ verification: { bogus: true } }))).toThrow();
  });

  it("is exported alongside its error class for later-wave callers", () => {
    expect(CandidateCertificationSubsetError.name).toBe("CandidateCertificationSubsetError");
  });
});
