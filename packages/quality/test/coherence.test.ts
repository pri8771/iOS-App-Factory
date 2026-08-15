import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  RELEASE_STAGE_ORDER_V1,
  ReleaseManifestV1Schema,
  assertReleaseAdvancement,
  type ReleaseManifestV1,
  type ReleaseStageV1,
} from "@app-factory/contracts";

import {
  CertificationError,
  evaluateExperienceCoherence,
  projectCertificationV1,
  qualityDigest,
  verifyCertification,
  type ExperienceManifestV1,
  type QualityFindingV1,
  type ReleaseContractV1,
} from "../src/index.js";

const DIGEST = `sha256:${"a".repeat(64)}` as const;
const SCREENSHOT = `sha256:${"b".repeat(64)}` as const;
const PROJECT_ID = randomUUID();

function release(): ReleaseContractV1 {
  return {
    schemaVersion: 1,
    profile: "ios-internal-testflight-v1",
    projectId: PROJECT_ID,
    productAuthorityDigest: DIGEST,
    policyDigest: DIGEST,
    activeDesignGeneration: "hindsight-2026",
    devices: [
      { id: "small-phone", platform: "ios", model: "iPhone SE", osVersion: "26.0" },
      { id: "large-phone", platform: "ios", model: "iPhone Pro Max", osVersion: "26.0" },
    ],
    appearances: ["light", "dark"],
    contentSizeCategories: ["large", "accessibility-xxxl"],
    requiredJourneyIds: ["capture-review"],
    requiredEvidenceKinds: ["screenshot", "ui-test", "runtime-lineage"],
    blockingSeverities: ["p0", "p1"],
    requiredHumanGates: ["product-authority", "visual-baseline", "candidate"],
  };
}

function manifest(
  contract: ReleaseContractV1,
  detailGeneration = contract.activeDesignGeneration,
): ExperienceManifestV1 {
  const accessibility = {
    semanticsRequired: true,
    dynamicTypeRequired: true,
    reduceMotionRequired: true,
    increasedContrastRequired: true,
  };
  const requiredEvidenceKinds = ["screenshot", "ui-test", "runtime-lineage"] as const;
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    releaseContractDigest: qualityDigest(contract),
    routes: [
      {
        routeId: "today",
        public: true,
        designGeneration: "hindsight-2026",
        sourcePaths: ["Hindsight/TodayView.swift"],
        states: [
          {
            stateId: "content",
            fixtureId: "today-content",
            journeyIds: ["capture-review"],
            requiredEvidenceKinds: [...requiredEvidenceKinds],
            accessibility,
          },
        ],
      },
      {
        routeId: "decision-detail",
        public: true,
        designGeneration: detailGeneration,
        sourcePaths: ["Hindsight/DecisionDetailView.swift"],
        states: [
          {
            stateId: "content",
            fixtureId: "detail-content",
            journeyIds: ["capture-review"],
            requiredEvidenceKinds: [...requiredEvidenceKinds],
            accessibility,
          },
        ],
      },
    ],
    journeys: [
      {
        journeyId: "capture-review",
        title: "Capture then review a decision",
        orderedStates: [
          { routeId: "today", stateId: "content" },
          { routeId: "decision-detail", stateId: "content" },
        ],
      },
    ],
    legacyExceptions: [],
  };
}

function runtime(detailGenerations: readonly string[] = ["hindsight-2026"]) {
  return [
    {
      routeId: "today",
      stateId: "content",
      renderedGenerations: ["hindsight-2026"],
      screenshotDigest: SCREENSHOT,
    },
    {
      routeId: "decision-detail",
      stateId: "content",
      renderedGenerations: [...detailGenerations],
      screenshotDigest: SCREENSHOT,
    },
  ];
}

describe("whole-product experience coherence", () => {
  it("passes one fully inventoried, single-generation public route graph", () => {
    const contract = release();
    const result = evaluateExperienceCoherence({
      releaseContract: contract,
      experienceManifest: manifest(contract),
      runtimeLineage: runtime(),
      staticUi: [
        {
          path: "Hindsight/TodayView.swift",
          legacyReferences: [],
          rawTokenReferences: [],
        },
      ],
      observedAt: "2026-08-10T12:00:00.000Z",
    });
    expect(result.passed).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual({
      publicStateCount: 2,
      observedPublicStateCount: 2,
      requiredJourneyCount: 1,
      presentRequiredJourneyCount: 1,
    });
  });

  it("rejects the historical new-shell plus old-detail failure deterministically", () => {
    const contract = release();
    const input = {
      releaseContract: contract,
      experienceManifest: manifest(contract, "hindsight-legacy"),
      runtimeLineage: runtime(["hindsight-2026", "hindsight-legacy"]),
      staticUi: [
        {
          path: "Hindsight/DecisionDetailView.swift",
          legacyReferences: ["LegacyPostcardCard"],
          rawTokenReferences: ["Color(legacyPaper)"],
        },
      ],
      observedAt: "2026-08-10T12:00:00.000Z",
    } as const;
    const first = evaluateExperienceCoherence(input);
    const second = evaluateExperienceCoherence(input);

    expect(first.passed).toBe(false);
    expect(first.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "quality.design.mixed-generation-route",
        "quality.runtime.mixed-generation-lineage",
        "quality.static.legacy-reference",
        "quality.static.raw-token",
      ]),
    );
    expect(second.findings.map((finding) => finding.findingId)).toEqual(
      first.findings.map((finding) => finding.findingId),
    );
  });

  it("rejects an unobserved public state and an expired narrow exception", () => {
    const contract = release();
    const experience = manifest(contract);
    const result = evaluateExperienceCoherence({
      releaseContract: contract,
      experienceManifest: {
        ...experience,
        legacyExceptions: [
          {
            path: "Hindsight/InternalLegacyView.swift",
            issueKey: "HIN-100",
            owner: "product@example.com",
            rationale: "Temporary internal migration view.",
            expiresAt: "2026-08-09T12:00:00.000Z",
            public: false,
          },
        ],
      },
      runtimeLineage: runtime().slice(0, 1),
      staticUi: [],
      observedAt: "2026-08-10T12:00:00.000Z",
    });
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "quality.runtime.public-state-unobserved",
        "quality.design.expired-exception",
      ]),
    );
  });
});

function releaseManifest(
  contract: ReleaseContractV1,
  experience: ExperienceManifestV1,
  findings: readonly QualityFindingV1[],
  overrides: Partial<ReleaseManifestV1> = {},
): ReleaseManifestV1 {
  return ReleaseManifestV1Schema.parse({
    schemaVersion: 1,
    releaseId: randomUUID(),
    projectId: PROJECT_ID,
    profile: "ios-internal-testflight-v1",
    target: "ios-internal-testflight",
    stage: "candidate",
    candidate: {
      commit: "a".repeat(40),
      tree: "b".repeat(40),
      cleanTree: true,
      policyDigest: contract.policyDigest,
      releaseContractDigest: qualityDigest(contract),
      experienceManifestDigest: qualityDigest(experience),
      qualityReportDigest: DIGEST,
      evidenceManifestDigest: DIGEST,
      findingLedgerDigest: qualityDigest(findings),
    },
    ios: {
      bundleId: "com.example.hindsight",
      marketingVersion: "1.0",
      buildNumber: "1",
      testerGroup: "Internal",
    },
    metadataDigest: DIGEST,
    archiveDigest: null,
    exportedArtifactDigest: null,
    appStoreBuildId: null,
    internalTestFlightAvailableAt: null,
    deviceSmokeEvidenceDigest: null,
    approvals: [randomUUID()],
    lifecycleEventKeys: [],
    createdAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  });
}

const EVIDENCE_BY_STAGE: Record<ReleaseStageV1, Partial<ReleaseManifestV1>> = {
  candidate: {},
  certified: {},
  archived: { archiveDigest: SCREENSHOT },
  "upload-approved": { archiveDigest: SCREENSHOT },
  uploaded: { archiveDigest: SCREENSHOT, appStoreBuildId: "42" },
  processing: { archiveDigest: SCREENSHOT, appStoreBuildId: "42" },
  "internal-testflight-available": {
    archiveDigest: SCREENSHOT,
    appStoreBuildId: "42",
    internalTestFlightAvailableAt: "2026-08-10T12:05:00.000Z",
  },
  "device-smoke-passed": {
    archiveDigest: SCREENSHOT,
    appStoreBuildId: "42",
    internalTestFlightAvailableAt: "2026-08-10T12:05:00.000Z",
    deviceSmokeEvidenceDigest: SCREENSHOT,
  },
};

describe("release-manifest-bound certification projection", () => {
  it("certifies only the exact coherent contract, inventory, and finding ledger", () => {
    const contract = release();
    const experience = manifest(contract);
    const coherence = evaluateExperienceCoherence({
      releaseContract: contract,
      experienceManifest: experience,
      runtimeLineage: runtime(),
      staticUi: [],
      observedAt: "2026-08-10T12:00:00.000Z",
    });
    const value = releaseManifest(contract, experience, []);
    expect(
      verifyCertification({
        releaseManifest: value,
        releaseContract: contract,
        experienceManifest: experience,
        coherence,
        findingLedger: [],
      }),
    ).toEqual(projectCertificationV1(value));
    const tampered = () =>
      verifyCertification({
        releaseManifest: {
          ...value,
          candidate: { ...value.candidate, experienceManifestDigest: DIGEST },
        },
        releaseContract: contract,
        experienceManifest: experience,
        coherence,
        findingLedger: [],
      });
    expect(tampered).toThrow(CertificationError);
    expect(tampered).toThrow(/exact experience manifest/);
  });

  it("rejects a release bound to an open blocking finding", () => {
    const contract = release();
    const experience = manifest(contract);
    const coherence = evaluateExperienceCoherence({
      releaseContract: contract,
      experienceManifest: experience,
      runtimeLineage: runtime(),
      staticUi: [],
      observedAt: "2026-08-10T12:00:00.000Z",
    });
    const findings: QualityFindingV1[] = [
      {
        schemaVersion: 1,
        findingId: `qf-${"1".repeat(24)}`,
        fingerprint: DIGEST,
        ruleId: "quality.manual.blocker",
        severity: "p0",
        routeId: null,
        stateId: null,
        path: null,
        summary: "Unresolved p0 blocker.",
        rootCause: null,
        escapedGate: null,
        regressionId: null,
        lessonScope: null,
        evidenceDigests: [],
        status: "open",
      },
    ];
    const value = releaseManifest(contract, experience, findings);
    expect(() =>
      verifyCertification({
        releaseManifest: value,
        releaseContract: contract,
        experienceManifest: experience,
        coherence,
        findingLedger: findings,
      }),
    ).toThrow(/unresolved release blocker/);
  });

  it("projects every one of the eight release stages onto the matching certification stage", () => {
    const contract = release();
    const experience = manifest(contract);
    for (const stage of RELEASE_STAGE_ORDER_V1) {
      const value = releaseManifest(contract, experience, [], {
        stage,
        ...EVIDENCE_BY_STAGE[stage],
      });
      const projected = projectCertificationV1(value);
      expect(projected.stage).toBe(stage);
      expect(projected.archiveDigest).toBe(value.archiveDigest);
      expect(projected.appStoreBuildId).toBe(value.appStoreBuildId);
      expect(projected.testFlightInstalledAt).toBe(value.internalTestFlightAvailableAt);
      expect(projected.deviceSmokeEvidenceDigest).toBe(value.deviceSmokeEvidenceDigest);
    }
  });

  it("keeps the projection consistent while advancing a release through every legacy 4-stage milestone", () => {
    const contract = release();
    const experience = manifest(contract);
    let current = releaseManifest(contract, experience, []);
    expect(projectCertificationV1(current).stage).toBe("candidate");

    for (const stage of RELEASE_STAGE_ORDER_V1.slice(1)) {
      const next = ReleaseManifestV1Schema.parse({
        ...current,
        stage,
        ...EVIDENCE_BY_STAGE[stage],
        approvals: [...current.approvals, randomUUID()],
        updatedAt: "2026-08-10T12:05:00.000Z",
      });
      current = assertReleaseAdvancement(current, next);
      expect(projectCertificationV1(current).stage).toBe(stage);
    }

    // The four stages the old 4-stage CertificationV1 model recognized are
    // reached along the way, now with two additional evidence-bearing stops
    // (upload-approved, processing) and two additional gate stops
    // (certified, internal-testflight-available) in between.
    expect(projectCertificationV1(current)).toMatchObject({
      stage: "device-smoke-passed",
      archiveDigest: SCREENSHOT,
      appStoreBuildId: "42",
      testFlightInstalledAt: "2026-08-10T12:05:00.000Z",
      deviceSmokeEvidenceDigest: SCREENSHOT,
    });
  });

  it("rejects a changed immutable field across a release advancement", () => {
    const contract = release();
    const experience = manifest(contract);
    const candidate = releaseManifest(contract, experience, []);
    const certified = ReleaseManifestV1Schema.parse({
      ...candidate,
      stage: "certified",
      approvals: [...candidate.approvals, randomUUID()],
      updatedAt: "2026-08-10T12:05:00.000Z",
    });
    expect(assertReleaseAdvancement(candidate, certified)).toEqual(certified);
    expect(() =>
      assertReleaseAdvancement(candidate, {
        ...certified,
        candidate: { ...candidate.candidate, commit: "c".repeat(40) },
      }),
    ).toThrow(/immutable field candidate/);
  });
});
