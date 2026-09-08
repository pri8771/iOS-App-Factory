import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  RELEASE_STAGE_ORDER_V1,
  ReleaseRunAdvancementError,
  ReleaseRunV1Schema,
  ReleaseBuildNumberAllocationError,
  ReleaseBuildNumberAllocationV1Schema,
  ReleaseExportOptionsConfigV1Schema,
  CandidateCertificationV1Schema,
  assertReleaseRunAdvancement,
  assertBuildNumberAllocationV1,
  isReleaseScopedApprovalSubjectV1,
  type ReleaseRunV1,
  type ReleaseStageV1,
} from "../src/index.js";

const PROJECT_ID = randomUUID();
const REPOSITORY_ID = randomUUID();
const RELEASE_ID = randomUUID();
const RELEASE_RUN_ID = randomUUID();
const OTHER_RELEASE_RUN_ID = randomUUID();
const DIGEST_A = `sha256:${"a".repeat(64)}` as const;
const DIGEST_B = `sha256:${"b".repeat(64)}` as const;
const DIGEST_C = `sha256:${"c".repeat(64)}` as const;
const COMMIT = "a".repeat(40);
const NOW = "2026-08-12T12:00:00.000Z";
const LATER = "2026-08-12T12:05:00.000Z";

// The exact evidence a valid ReleaseRunV1 must carry at each of the eight stages, cumulative: once
// a record is required at a stage it stays required at every later stage (mirrors release.test.ts's
// own EVIDENCE_BY_STAGE for ReleaseManifestV1).
function evidenceForStage(stage: ReleaseStageV1): Partial<ReleaseRunV1> {
  const rank = RELEASE_STAGE_ORDER_V1.indexOf(stage);
  const archivedRank = RELEASE_STAGE_ORDER_V1.indexOf("archived");
  const uploadedRank = RELEASE_STAGE_ORDER_V1.indexOf("uploaded");
  const testflightRank = RELEASE_STAGE_ORDER_V1.indexOf("internal-testflight-available");
  const evidence: Partial<ReleaseRunV1> = {};
  if (rank >= archivedRank) {
    evidence.promotion = { promotedCommit: COMMIT, branch: "main", at: NOW };
    evidence.archive = {
      buildNumber: "5",
      marketingVersion: "1.0",
      archiveDigest: DIGEST_A,
      exportedArtifactDigest: DIGEST_B,
      receiptDigest: DIGEST_C,
      at: NOW,
    };
  }
  if (rank >= uploadedRank) {
    evidence.upload = {
      submittedAt: NOW,
      ascBuildId: "42",
      confirmedAt: rank >= testflightRank ? NOW : null,
    };
  }
  return evidence;
}

function baseRun(overrides: Partial<ReleaseRunV1> = {}): ReleaseRunV1 {
  return ReleaseRunV1Schema.parse({
    schemaVersion: 1,
    releaseRunId: RELEASE_RUN_ID,
    projectId: PROJECT_ID,
    repositoryId: REPOSITORY_ID,
    releaseId: RELEASE_ID,
    sourceCommit: COMMIT,
    branch: "main",
    stage: "candidate",
    revision: 1,
    promotion: null,
    archive: null,
    upload: null,
    unevaluated: [],
    notes: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function runAtStage(stage: ReleaseStageV1, revision = 1): ReleaseRunV1 {
  return baseRun({ stage, revision, ...evidenceForStage(stage) });
}

describe("release run evidence gate", () => {
  it.each(RELEASE_STAGE_ORDER_V1)("accepts the exact evidence required at %s", (stage) => {
    expect(() => runAtStage(stage)).not.toThrow();
  });

  it("rejects evidence recorded earlier than its gating stage", () => {
    expect(
      ReleaseRunV1Schema.safeParse({
        ...runAtStage("certified"),
        archive: evidenceForStage("archived").archive,
      }).success,
    ).toBe(false);
    expect(
      ReleaseRunV1Schema.safeParse({
        ...runAtStage("certified"),
        promotion: evidenceForStage("archived").promotion,
      }).success,
    ).toBe(false);
    expect(
      ReleaseRunV1Schema.safeParse({
        ...runAtStage("archived"),
        upload: { submittedAt: NOW, ascBuildId: "42", confirmedAt: null },
      }).success,
    ).toBe(false);
  });

  it("rejects evidence still missing at or after its gating stage", () => {
    expect(ReleaseRunV1Schema.safeParse({ ...runAtStage("archived"), archive: null }).success).toBe(
      false,
    );
    expect(
      ReleaseRunV1Schema.safeParse({ ...runAtStage("archived"), promotion: null }).success,
    ).toBe(false);
    expect(
      ReleaseRunV1Schema.safeParse({
        ...runAtStage("uploaded"),
        upload: { submittedAt: NOW, ascBuildId: null, confirmedAt: null },
      }).success,
    ).toBe(false);
    expect(
      ReleaseRunV1Schema.safeParse({
        ...runAtStage("internal-testflight-available"),
        upload: { submittedAt: NOW, ascBuildId: "42", confirmedAt: null },
      }).success,
    ).toBe(false);
  });

  it("rejects updatedAt preceding createdAt", () => {
    expect(
      ReleaseRunV1Schema.safeParse({
        ...baseRun(),
        createdAt: LATER,
        updatedAt: NOW,
      }).success,
    ).toBe(false);
  });
});

describe("assertReleaseRunAdvancement", () => {
  it("walks the full candidate -> device-smoke-passed chain one stage at a time", () => {
    let current = baseRun();
    let revision = 1;
    for (const stage of RELEASE_STAGE_ORDER_V1.slice(1)) {
      revision += 1;
      const next = ReleaseRunV1Schema.parse({
        ...current,
        stage,
        revision,
        ...evidenceForStage(stage),
        updatedAt: LATER,
      });
      current = assertReleaseRunAdvancement(current, next);
      expect(current.stage).toBe(stage);
    }
    expect(current.stage).toBe("device-smoke-passed");
  });

  it("allows a same-stage revision bump that only refreshes notes/unevaluated (resumable per stage)", () => {
    const previous = runAtStage("archived", 3);
    const next = ReleaseRunV1Schema.parse({
      ...previous,
      revision: 4,
      notes: ["retried the export step after a transient signing failure"],
      unevaluated: ["quality.coherence"],
      updatedAt: LATER,
    });
    const result = assertReleaseRunAdvancement(previous, next);
    expect(result.stage).toBe("archived");
    expect(result.revision).toBe(4);
    expect(result.notes).toEqual(["retried the export step after a transient signing failure"]);
  });

  it("rejects a skip from candidate to archived", () => {
    const previous = runAtStage("candidate", 1);
    const next = ReleaseRunV1Schema.parse({
      ...previous,
      stage: "archived",
      revision: 2,
      ...evidenceForStage("archived"),
      updatedAt: LATER,
    });
    expect(() => assertReleaseRunAdvancement(previous, next)).toThrow(ReleaseRunAdvancementError);
    expect(() => assertReleaseRunAdvancement(previous, next)).toThrow(
      /hold its stage or advance exactly one stage/,
    );
  });

  it("rejects a stage regression", () => {
    const previous = runAtStage("certified", 2);
    const next = ReleaseRunV1Schema.parse({
      ...previous,
      stage: "candidate",
      revision: 3,
      updatedAt: LATER,
    });
    expect(() => assertReleaseRunAdvancement(previous, next)).toThrow(
      /hold its stage or advance exactly one stage/,
    );
  });

  it("rejects a revision that does not increment by exactly one", () => {
    const previous = baseRun();
    const next = ReleaseRunV1Schema.parse({ ...previous, revision: 3, updatedAt: LATER });
    expect(() => assertReleaseRunAdvancement(previous, next)).toThrow(
      /revision must increment by exactly one/,
    );
  });

  it("rejects a changed run identity field", () => {
    const previous = baseRun();
    const next = ReleaseRunV1Schema.parse({
      ...previous,
      branch: "release/1.0",
      revision: 2,
      updatedAt: LATER,
    });
    expect(() => assertReleaseRunAdvancement(previous, next)).toThrow(/immutable field branch/);
  });

  it("rejects a changed source commit", () => {
    const previous = baseRun();
    const next = ReleaseRunV1Schema.parse({
      ...previous,
      sourceCommit: "f".repeat(40),
      revision: 2,
      updatedAt: LATER,
    });
    expect(() => assertReleaseRunAdvancement(previous, next)).toThrow(
      /immutable field sourceCommit/,
    );
  });
});

describe("assertBuildNumberAllocationV1 (build-number monotonicity)", () => {
  function allocation(bundleId: string, buildNumber: string, releaseRunId = RELEASE_RUN_ID) {
    return ReleaseBuildNumberAllocationV1Schema.parse({
      schemaVersion: 1,
      bundleId,
      buildNumber,
      releaseRunId,
      allocatedAt: NOW,
    });
  }

  it("accepts the first allocation for a bundle", () => {
    const next = allocation("com.example.app", "1");
    expect(assertBuildNumberAllocationV1([], next)).toEqual(next);
  });

  it("accepts a strictly increasing next allocation for the same bundle", () => {
    const existing = [allocation("com.example.app", "5")];
    const next = allocation("com.example.app", "6", OTHER_RELEASE_RUN_ID);
    expect(assertBuildNumberAllocationV1(existing, next)).toEqual(next);
  });

  it("rejects a re-upload replaying an already-allocated build number", () => {
    const existing = [allocation("com.example.app", "5")];
    const next = allocation("com.example.app", "5", OTHER_RELEASE_RUN_ID);
    expect(() => assertBuildNumberAllocationV1(existing, next)).toThrow(
      ReleaseBuildNumberAllocationError,
    );
    expect(() => assertBuildNumberAllocationV1(existing, next)).toThrow(/already allocated/);
  });

  it("rejects a non-increasing allocation for the same bundle", () => {
    const existing = [allocation("com.example.app", "10")];
    const next = allocation("com.example.app", "3", OTHER_RELEASE_RUN_ID);
    expect(() => assertBuildNumberAllocationV1(existing, next)).toThrow(
      /does not strictly increase/,
    );
  });

  it("does not compare build numbers across different bundles", () => {
    const existing = [allocation("com.example.app-one", "100")];
    const next = allocation("com.example.app-two", "1", OTHER_RELEASE_RUN_ID);
    expect(assertBuildNumberAllocationV1(existing, next)).toEqual(next);
  });

  it("compares build numbers numerically, not lexicographically", () => {
    const existing = [allocation("com.example.app", "9")];
    const next = allocation("com.example.app", "10", OTHER_RELEASE_RUN_ID);
    expect(assertBuildNumberAllocationV1(existing, next)).toEqual(next);
  });
});

describe("ReleaseExportOptionsConfigV1Schema", () => {
  it("accepts the owner's proven recipe shape", () => {
    expect(
      ReleaseExportOptionsConfigV1Schema.safeParse({
        schemaVersion: 1,
        teamId: "796XH483R4",
        method: "app-store-connect",
        destination: "upload",
        signingStyle: "automatic",
        bundleIdOverride: null,
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed team ID", () => {
    expect(
      ReleaseExportOptionsConfigV1Schema.safeParse({
        schemaVersion: 1,
        teamId: "not-a-team-id",
        method: "app-store-connect",
        destination: "upload",
        signingStyle: "automatic",
        bundleIdOverride: null,
      }).success,
    ).toBe(false);
  });

  it("never carries a secret-shaped field (strict object)", () => {
    expect(
      ReleaseExportOptionsConfigV1Schema.safeParse({
        schemaVersion: 1,
        teamId: "796XH483R4",
        method: "app-store-connect",
        destination: "upload",
        signingStyle: "automatic",
        bundleIdOverride: null,
        signingCertificate: "-----BEGIN PRIVATE KEY-----",
      }).success,
    ).toBe(false);
  });
});

describe("release-scoped approval subject (architecture decision 7)", () => {
  it("recognizes a project+release subject with no attempt or task", () => {
    expect(
      isReleaseScopedApprovalSubjectV1({
        projectId: PROJECT_ID,
        releaseId: RELEASE_ID,
        taskId: null,
        attemptId: null,
      }),
    ).toBe(true);
  });

  it("rejects a subject that still carries a task or attempt", () => {
    expect(
      isReleaseScopedApprovalSubjectV1({
        projectId: PROJECT_ID,
        releaseId: RELEASE_ID,
        taskId: randomUUID(),
        attemptId: null,
      }),
    ).toBe(false);
    expect(
      isReleaseScopedApprovalSubjectV1({
        projectId: PROJECT_ID,
        releaseId: RELEASE_ID,
        taskId: null,
        attemptId: randomUUID(),
      }),
    ).toBe(false);
  });

  it("rejects a subject missing a release ID", () => {
    expect(
      isReleaseScopedApprovalSubjectV1({
        projectId: PROJECT_ID,
        releaseId: null,
        taskId: null,
        attemptId: null,
      }),
    ).toBe(false);
  });
});

describe("CandidateCertificationV1Schema", () => {
  function check(code: string, passed: boolean) {
    return { code, passed, detail: passed ? `${code} passed` : `${code} failed` };
  }

  const UNEVALUATED = [
    "quality.coherence",
    "quality.presentation-matrix",
    "quality.runtime-lineage",
  ];

  it("accepts a fully-passing checkable subset alongside disclosed unevaluated dimensions", () => {
    const parsed = CandidateCertificationV1Schema.parse({
      schemaVersion: 1,
      releaseId: RELEASE_ID,
      projectId: PROJECT_ID,
      candidateCommit: COMMIT,
      evaluatedAt: NOW,
      checks: [
        check("quality.candidate.clean-tree-at-verified-commit", true),
        check("quality.candidate.plan-verification-passed", true),
      ],
      unevaluated: UNEVALUATED,
      certified: true,
    });
    expect(parsed.certified).toBe(true);
    expect(parsed.unevaluated).toEqual(UNEVALUATED);
  });

  it("rejects certified=true when a checkable-today check failed (never quietly stubbed as passing)", () => {
    expect(
      CandidateCertificationV1Schema.safeParse({
        schemaVersion: 1,
        releaseId: RELEASE_ID,
        projectId: PROJECT_ID,
        candidateCommit: COMMIT,
        evaluatedAt: NOW,
        checks: [
          check("quality.candidate.clean-tree-at-verified-commit", true),
          check("quality.candidate.plan-verification-passed", false),
        ],
        unevaluated: UNEVALUATED,
        certified: true,
      }).success,
    ).toBe(false);
  });

  it("rejects certified=false when every checkable-today check actually passed", () => {
    expect(
      CandidateCertificationV1Schema.safeParse({
        schemaVersion: 1,
        releaseId: RELEASE_ID,
        projectId: PROJECT_ID,
        candidateCommit: COMMIT,
        evaluatedAt: NOW,
        checks: [check("quality.candidate.clean-tree-at-verified-commit", true)],
        unevaluated: UNEVALUATED,
        certified: false,
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate check codes", () => {
    expect(
      CandidateCertificationV1Schema.safeParse({
        schemaVersion: 1,
        releaseId: RELEASE_ID,
        projectId: PROJECT_ID,
        candidateCommit: COMMIT,
        evaluatedAt: NOW,
        checks: [
          check("quality.candidate.clean-tree-at-verified-commit", true),
          check("quality.candidate.clean-tree-at-verified-commit", true),
        ],
        unevaluated: UNEVALUATED,
        certified: true,
      }).success,
    ).toBe(false);
  });

  it("requires at least one disclosed unevaluated dimension", () => {
    expect(
      CandidateCertificationV1Schema.safeParse({
        schemaVersion: 1,
        releaseId: RELEASE_ID,
        projectId: PROJECT_ID,
        candidateCommit: COMMIT,
        evaluatedAt: NOW,
        checks: [check("quality.candidate.clean-tree-at-verified-commit", true)],
        unevaluated: [],
        certified: true,
      }).success,
    ).toBe(false);
  });
});
