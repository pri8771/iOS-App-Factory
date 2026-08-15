import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  RELEASE_STAGE_ORDER_V1,
  ReleaseAdvancementError,
  ReleaseManifestV1Schema,
  assertReleaseAdvancement,
  type ReleaseManifestV1,
  type ReleaseStageV1,
} from "../src/index.js";

const PROJECT_ID = randomUUID();
const RELEASE_ID = randomUUID();
const DIGEST_A = `sha256:${"a".repeat(64)}` as const;
const DIGEST_B = `sha256:${"b".repeat(64)}` as const;
const DIGEST_C = `sha256:${"c".repeat(64)}` as const;
const NOW = "2026-08-12T12:00:00.000Z";
const LATER = "2026-08-12T12:05:00.000Z";

// The exact evidence a valid ReleaseManifestV1 must carry at each of the
// eight stages, cumulative: once a field is populated it stays populated at
// every later stage. This is the same matrix documented in
// docs/architecture/0003-release-state-reconciliation.md.
const EVIDENCE_BY_STAGE: Record<ReleaseStageV1, Partial<ReleaseManifestV1>> = {
  candidate: {},
  certified: {},
  archived: { archiveDigest: DIGEST_A },
  "upload-approved": { archiveDigest: DIGEST_A },
  uploaded: { archiveDigest: DIGEST_A, appStoreBuildId: "42" },
  processing: { archiveDigest: DIGEST_A, appStoreBuildId: "42" },
  "internal-testflight-available": {
    archiveDigest: DIGEST_A,
    appStoreBuildId: "42",
    internalTestFlightAvailableAt: NOW,
  },
  "device-smoke-passed": {
    archiveDigest: DIGEST_A,
    appStoreBuildId: "42",
    internalTestFlightAvailableAt: NOW,
    deviceSmokeEvidenceDigest: DIGEST_B,
  },
};

function baseRelease(overrides: Partial<ReleaseManifestV1> = {}): ReleaseManifestV1 {
  return ReleaseManifestV1Schema.parse({
    schemaVersion: 1,
    releaseId: RELEASE_ID,
    projectId: PROJECT_ID,
    profile: "quality.ios-internal-testflight-v1",
    target: "ios-internal-testflight",
    stage: "candidate",
    candidate: {
      commit: "a".repeat(40),
      tree: "b".repeat(40),
      cleanTree: true,
      policyDigest: DIGEST_A,
      releaseContractDigest: DIGEST_B,
      experienceManifestDigest: DIGEST_C,
      qualityReportDigest: DIGEST_A,
      evidenceManifestDigest: DIGEST_B,
      findingLedgerDigest: DIGEST_C,
    },
    ios: {
      bundleId: "com.example.hindsight",
      marketingVersion: "1.1",
      buildNumber: "5",
      testerGroup: "Internal",
    },
    metadataDigest: DIGEST_A,
    archiveDigest: null,
    exportedArtifactDigest: null,
    appStoreBuildId: null,
    internalTestFlightAvailableAt: null,
    deviceSmokeEvidenceDigest: null,
    approvals: [randomUUID()],
    lifecycleEventKeys: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function releaseAtStage(stage: ReleaseStageV1, approvals: readonly string[]): ReleaseManifestV1 {
  return baseRelease({ stage, approvals: [...approvals], ...EVIDENCE_BY_STAGE[stage] });
}

describe("release stage evidence gate", () => {
  it.each(RELEASE_STAGE_ORDER_V1)("accepts the exact evidence required at %s", (stage) => {
    expect(() => releaseAtStage(stage, [randomUUID()])).not.toThrow();
  });

  it("rejects evidence recorded earlier than its gating stage", () => {
    expect(
      ReleaseManifestV1Schema.safeParse({
        ...releaseAtStage("candidate", [randomUUID()]),
        archiveDigest: DIGEST_A,
      }).success,
    ).toBe(false);
    expect(
      ReleaseManifestV1Schema.safeParse({
        ...releaseAtStage("archived", [randomUUID()]),
        appStoreBuildId: "42",
      }).success,
    ).toBe(false);
    expect(
      ReleaseManifestV1Schema.safeParse({
        ...releaseAtStage("uploaded", [randomUUID()]),
        internalTestFlightAvailableAt: NOW,
      }).success,
    ).toBe(false);
    expect(
      ReleaseManifestV1Schema.safeParse({
        ...releaseAtStage("internal-testflight-available", [randomUUID()]),
        deviceSmokeEvidenceDigest: DIGEST_B,
      }).success,
    ).toBe(false);
  });

  it("rejects a duplicate approval on a single object", () => {
    const duplicated = randomUUID();
    expect(
      ReleaseManifestV1Schema.safeParse({
        ...releaseAtStage("candidate", [randomUUID()]),
        approvals: [duplicated, duplicated],
      }).success,
    ).toBe(false);
  });

  it("rejects evidence still missing at or after its gating stage", () => {
    expect(
      ReleaseManifestV1Schema.safeParse({
        ...releaseAtStage("archived", [randomUUID()]),
        archiveDigest: null,
      }).success,
    ).toBe(false);
    expect(
      ReleaseManifestV1Schema.safeParse({
        ...releaseAtStage("uploaded", [randomUUID()]),
        appStoreBuildId: null,
      }).success,
    ).toBe(false);
    expect(
      ReleaseManifestV1Schema.safeParse({
        ...releaseAtStage("internal-testflight-available", [randomUUID()]),
        internalTestFlightAvailableAt: null,
      }).success,
    ).toBe(false);
    expect(
      ReleaseManifestV1Schema.safeParse({
        ...releaseAtStage("device-smoke-passed", [randomUUID()]),
        deviceSmokeEvidenceDigest: null,
      }).success,
    ).toBe(false);
  });
});

describe("assertReleaseAdvancement", () => {
  it("walks the full candidate -> device-smoke-passed chain one stage at a time", () => {
    let current = baseRelease({ approvals: [randomUUID()] });
    for (const stage of RELEASE_STAGE_ORDER_V1.slice(1)) {
      const next = ReleaseManifestV1Schema.parse({
        ...current,
        stage,
        ...EVIDENCE_BY_STAGE[stage],
        approvals: [...current.approvals, randomUUID()],
        updatedAt: LATER,
      });
      current = assertReleaseAdvancement(current, next);
      expect(current.stage).toBe(stage);
    }
    expect(current.stage).toBe("device-smoke-passed");
  });

  it.each([
    ["candidate", "archived"],
    ["candidate", "device-smoke-passed"],
    ["archived", "uploaded"],
    ["uploaded", "internal-testflight-available"],
  ] as const)("rejects a skip from %s to %s", (from, to) => {
    const previous = releaseAtStage(from, [randomUUID()]);
    const next = ReleaseManifestV1Schema.parse({
      ...previous,
      stage: to,
      ...EVIDENCE_BY_STAGE[to],
      approvals: [...previous.approvals, randomUUID()],
      updatedAt: LATER,
    });
    expect(() => assertReleaseAdvancement(previous, next)).toThrow(ReleaseAdvancementError);
    expect(() => assertReleaseAdvancement(previous, next)).toThrow(/advance exactly one stage/);
  });

  it("rejects a changed candidate payload", () => {
    const previous = baseRelease();
    const next = ReleaseManifestV1Schema.parse({
      ...previous,
      stage: "certified",
      candidate: { ...previous.candidate, commit: "f".repeat(40) },
      approvals: [...previous.approvals, randomUUID()],
      updatedAt: LATER,
    });
    expect(() => assertReleaseAdvancement(previous, next)).toThrow(/immutable field candidate/);
  });

  it("rejects a changed iOS target payload", () => {
    const previous = baseRelease();
    const next = ReleaseManifestV1Schema.parse({
      ...previous,
      stage: "certified",
      ios: { ...previous.ios, testerGroup: "Beta" },
      approvals: [...previous.approvals, randomUUID()],
      updatedAt: LATER,
    });
    expect(() => assertReleaseAdvancement(previous, next)).toThrow(/immutable field ios/);
  });

  it("rejects a changed release identity field", () => {
    const previous = baseRelease();
    const next = ReleaseManifestV1Schema.parse({
      ...previous,
      stage: "certified",
      profile: "quality.other-profile-v1",
      approvals: [...previous.approvals, randomUUID()],
      updatedAt: LATER,
    });
    expect(() => assertReleaseAdvancement(previous, next)).toThrow(/immutable field profile/);
  });

  it("requires a new approval for each stage", () => {
    const previous = baseRelease();
    const next = ReleaseManifestV1Schema.parse({
      ...previous,
      stage: "certified",
      updatedAt: LATER,
    });
    expect(() => assertReleaseAdvancement(previous, next)).toThrow(/requires a new approval/);
  });

  it("rejects a removed approval even when a new one was also added", () => {
    const idOne = randomUUID();
    const idTwo = randomUUID();
    const previous = baseRelease({ approvals: [idOne, idTwo] });
    const next = ReleaseManifestV1Schema.parse({
      ...previous,
      stage: "certified",
      approvals: [idOne, randomUUID()],
      updatedAt: LATER,
    });
    expect(() => assertReleaseAdvancement(previous, next)).toThrow(/removed an earlier approval/);
  });

  it("accepts a legal single-stage advance with a new approval", () => {
    const previous = baseRelease();
    const next = ReleaseManifestV1Schema.parse({
      ...previous,
      stage: "certified",
      approvals: [...previous.approvals, randomUUID()],
      updatedAt: LATER,
    });
    expect(assertReleaseAdvancement(previous, next)).toEqual(next);
  });
});
