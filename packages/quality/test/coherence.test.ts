import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assertCertificationAdvancement,
  CertificationError,
  evaluateExperienceCoherence,
  qualityDigest,
  verifyCertification,
  type CertificationV1,
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

function certificate(
  contract: ReleaseContractV1,
  experience: ExperienceManifestV1,
  findings: readonly QualityFindingV1[],
  overrides: Partial<CertificationV1> = {},
): CertificationV1 {
  return {
    schemaVersion: 1,
    stage: "candidate",
    releaseId: randomUUID(),
    projectId: PROJECT_ID,
    profile: "ios-internal-testflight-v1",
    gitCommit: "a".repeat(40),
    gitTree: "b".repeat(40),
    cleanTree: true,
    policyDigest: contract.policyDigest,
    releaseContractDigest: qualityDigest(contract),
    experienceManifestDigest: qualityDigest(experience),
    evidenceManifestDigest: DIGEST,
    findingLedgerDigest: qualityDigest(findings),
    approvalIds: [randomUUID()],
    generatedAt: "2026-08-10T12:00:00.000Z",
    archiveDigest: null,
    appStoreBuildId: null,
    testFlightInstalledAt: null,
    deviceSmokeEvidenceDigest: null,
    ...overrides,
  } as CertificationV1;
}

describe("SHA-bound release certification", () => {
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
    const value = certificate(contract, experience, []);
    expect(
      verifyCertification({
        certification: value,
        releaseContract: contract,
        experienceManifest: experience,
        coherence,
        findingLedger: [],
      }),
    ).toEqual(value);
    expect(() =>
      verifyCertification({
        certification: { ...value, experienceManifestDigest: DIGEST },
        releaseContract: contract,
        experienceManifest: experience,
        coherence,
        findingLedger: [],
      }),
    ).toThrow(/exact experience manifest/);
  });

  it("requires sequential immutable promotion with a new approval at each stage", () => {
    const contract = release();
    const experience = manifest(contract);
    const candidate = certificate(contract, experience, []);
    const archived = {
      ...candidate,
      stage: "archived",
      archiveDigest: SCREENSHOT,
      approvalIds: [...candidate.approvalIds, randomUUID()],
    } as CertificationV1;
    expect(assertCertificationAdvancement(candidate, archived)).toEqual(archived);
    expect(() =>
      assertCertificationAdvancement(candidate, {
        ...archived,
        stage: "uploaded",
        appStoreBuildId: "123",
      }),
    ).toThrow(CertificationError);
    expect(() =>
      assertCertificationAdvancement(candidate, {
        ...archived,
        gitCommit: "c".repeat(40),
      }),
    ).toThrow(/immutable field gitCommit/);
  });
});
