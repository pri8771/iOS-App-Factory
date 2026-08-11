import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  closeFindingWithRegression,
  compareRgbaScreenshots,
  evaluatePresentationMatrix,
  mergeFindingLedger,
  planPresentationMatrix,
  qualityDigest,
  recordOperatorFinding,
  type ExperienceManifestV1,
  type ReleaseContractV1,
} from "../src/index.js";

const PROJECT_ID = randomUUID();
const DIGEST_A = `sha256:${"a".repeat(64)}` as const;
const DIGEST_B = `sha256:${"b".repeat(64)}` as const;

function release(): ReleaseContractV1 {
  return {
    schemaVersion: 1,
    profile: "ios-internal-testflight-v1",
    projectId: PROJECT_ID,
    productAuthorityDigest: DIGEST_A,
    policyDigest: DIGEST_A,
    activeDesignGeneration: "current",
    devices: [
      { id: "small", platform: "ios", model: "iPhone SE", osVersion: "26.0" },
      { id: "large", platform: "ios", model: "iPhone Pro Max", osVersion: "26.0" },
    ],
    appearances: ["light", "dark"],
    contentSizeCategories: ["large", "accessibility-xxxl"],
    requiredJourneyIds: ["launch-capture"],
    requiredEvidenceKinds: ["screenshot", "ui-test", "runtime-lineage"],
    blockingSeverities: ["p0", "p1"],
    requiredHumanGates: ["visual-baseline"],
  };
}

function experience(contract: ReleaseContractV1): ExperienceManifestV1 {
  return {
    schemaVersion: 1,
    projectId: PROJECT_ID,
    releaseContractDigest: qualityDigest(contract),
    routes: [
      {
        routeId: "today",
        public: true,
        designGeneration: "current",
        sourcePaths: ["App/TodayView.swift"],
        states: [
          {
            stateId: "content",
            fixtureId: "today-content",
            journeyIds: ["launch-capture"],
            requiredEvidenceKinds: ["screenshot", "ui-test", "runtime-lineage"],
            accessibility: {
              semanticsRequired: true,
              dynamicTypeRequired: true,
              reduceMotionRequired: true,
              increasedContrastRequired: true,
            },
          },
        ],
      },
    ],
    journeys: [
      {
        journeyId: "launch-capture",
        title: "Launch and capture",
        orderedStates: [
          { routeId: "today", stateId: "content" },
          { routeId: "today", stateId: "content" },
        ],
      },
    ],
    legacyExceptions: [],
  };
}

describe("presentation matrix", () => {
  it("plans the complete device, appearance, text-size, route, and state product", () => {
    const contract = release();
    const matrix = planPresentationMatrix(contract, experience(contract));
    expect(matrix.cases).toHaveLength(8);
    expect(new Set(matrix.cases.map((item) => item.caseId))).toHaveLength(8);
    expect(planPresentationMatrix(contract, experience(contract))).toEqual(matrix);
  });

  it("rejects stale, missing, mixed-generation, clipped, and inaccessible evidence", () => {
    const contract = release();
    const matrix = planPresentationMatrix(contract, experience(contract));
    const planned = matrix.cases[0];
    if (planned === undefined) throw new Error("matrix fixture is empty");
    const result = evaluatePresentationMatrix(
      matrix,
      [
        {
          schemaVersion: 1,
          caseId: planned.caseId,
          candidateCommit: "b".repeat(40),
          screenshotDigest: DIGEST_A,
          uiTestEvidenceDigest: DIGEST_A,
          runtimeLineageDigest: DIGEST_B,
          accessibilityEvidenceDigest: DIGEST_B,
          renderedGenerations: ["current", "legacy"],
          clippedCriticalContent: true,
          missingAccessibilitySemantics: ["capture-button.label"],
        },
      ],
      "a".repeat(40),
    );
    expect(result.passed).toBe(false);
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "quality.matrix.stale-candidate-evidence",
        "quality.matrix.mixed-generation",
        "quality.matrix.clipped-critical-content",
        "quality.matrix.missing-accessibility-semantics",
        "quality.matrix.required-case-missing",
      ]),
    );
  });
});

describe("visual comparison and finding learning", () => {
  it("produces deterministic pixel-level visual evidence", () => {
    const baseline = {
      width: 2,
      height: 1,
      rgba: Uint8Array.from([0, 0, 0, 255, 10, 10, 10, 255]),
    };
    const current = {
      width: 2,
      height: 1,
      rgba: Uint8Array.from([0, 0, 0, 255, 200, 10, 10, 255]),
    };
    const result = compareRgbaScreenshots(baseline, current, {
      channelTolerance: 2,
      maximumDifferentPixelRatio: 0,
    });
    expect(result).toMatchObject({
      passed: false,
      differentPixelCount: 1,
      differentPixelRatio: 0.5,
    });
    expect(
      compareRgbaScreenshots(baseline, current, {
        channelTolerance: 255,
        maximumDifferentPixelRatio: 0,
      }),
    ).toMatchObject({ passed: true });
  });

  it("records operator feedback and requires regression evidence before closure", () => {
    const observation = recordOperatorFinding({
      projectId: PROJECT_ID,
      candidateCommit: "a".repeat(40),
      routeId: "today",
      stateId: "content",
      comment: "The old card style appears below the new navigation shell.",
      observedAt: "2026-08-11T12:00:00.000Z",
      screenshotDigest: DIGEST_A,
      recordingDigest: DIGEST_B,
    });
    expect(mergeFindingLedger([], [observation.finding, observation.finding])).toHaveLength(1);
    expect(() =>
      closeFindingWithRegression(observation.finding, {
        rootCause: "",
        escapedGate: "slice-only snapshot",
        regressionId: "mixed-ui",
        lessonScope: "factory",
        evidenceDigests: [DIGEST_A],
      }),
    ).toThrow(/root cause/);
    expect(
      closeFindingWithRegression(observation.finding, {
        rootCause: "Whole-product route graph was not verified.",
        escapedGate: "Slice-only screenshot approval.",
        regressionId: "mixed-ui-generation",
        lessonScope: "factory",
        evidenceDigests: [DIGEST_A],
      }),
    ).toMatchObject({ status: "fixed", regressionId: "mixed-ui-generation" });
  });
});
