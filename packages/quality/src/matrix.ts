import { createHash } from "node:crypto";

import { Sha256DigestSchema, type Sha256Digest } from "@app-factory/contracts";

import {
  ExperienceManifestV1Schema,
  ReleaseContractV1Schema,
  type ExperienceManifestV1,
  type QualityFindingV1,
} from "./model.js";
import { qualityDigest } from "./coherence.js";

export type PresentationCaseV1 = Readonly<{
  schemaVersion: 1;
  caseId: string;
  routeId: string;
  stateId: string;
  fixtureId: string;
  deviceId: string;
  appearance: "light" | "dark";
  contentSizeCategory: string;
  expectedDesignGeneration: string;
  requiredEvidenceKinds: ExperienceManifestV1["routes"][number]["states"][number]["requiredEvidenceKinds"];
}>;

export type PresentationMatrixV1 = Readonly<{
  schemaVersion: 1;
  projectId: string;
  releaseContractDigest: Sha256Digest;
  experienceManifestDigest: Sha256Digest;
  cases: readonly PresentationCaseV1[];
  matrixDigest: Sha256Digest;
}>;

export type PresentationObservationV1 = Readonly<{
  schemaVersion: 1;
  caseId: string;
  candidateCommit: string;
  screenshotDigest: Sha256Digest;
  uiTestEvidenceDigest: Sha256Digest;
  runtimeLineageDigest: Sha256Digest;
  accessibilityEvidenceDigest: Sha256Digest | null;
  renderedGenerations: readonly string[];
  clippedCriticalContent: boolean;
  missingAccessibilitySemantics: readonly string[];
}>;

export type PresentationMatrixEvaluation = Readonly<{
  passed: boolean;
  observedCaseCount: number;
  requiredCaseCount: number;
  findings: readonly QualityFindingV1[];
}>;

function caseId(value: Omit<PresentationCaseV1, "schemaVersion" | "caseId">): string {
  const digest = qualityDigest(value);
  return `qmc-${digest.slice("sha256:".length, "sha256:".length + 24)}`;
}

function matrixFinding(
  ruleId: string,
  severity: "p0" | "p1" | "p2" | "p3",
  summary: string,
  input: Readonly<{
    routeId?: string;
    stateId?: string;
    evidenceDigests?: readonly Sha256Digest[];
  }> = {},
): QualityFindingV1 {
  const identity = {
    ruleId,
    routeId: input.routeId ?? null,
    stateId: input.stateId ?? null,
    path: null,
    summary,
  };
  const fingerprint = qualityDigest(identity);
  return {
    schemaVersion: 1,
    findingId: `qf-${fingerprint.slice("sha256:".length, "sha256:".length + 24)}`,
    fingerprint,
    ruleId,
    severity,
    routeId: input.routeId ?? null,
    stateId: input.stateId ?? null,
    path: null,
    summary,
    rootCause: null,
    escapedGate: null,
    regressionId: null,
    lessonScope: null,
    evidenceDigests: [...(input.evidenceDigests ?? [])],
    status: "open",
  };
}

export function planPresentationMatrix(
  releaseInput: unknown,
  manifestInput: unknown,
): PresentationMatrixV1 {
  const release = ReleaseContractV1Schema.parse(releaseInput);
  const manifest = ExperienceManifestV1Schema.parse(manifestInput);
  if (release.projectId !== manifest.projectId) throw new TypeError("matrix project IDs differ");
  if (manifest.releaseContractDigest !== qualityDigest(release)) {
    throw new TypeError("matrix manifest is not bound to the release contract");
  }
  const cases: PresentationCaseV1[] = [];
  for (const route of manifest.routes) {
    if (!route.public) continue;
    for (const state of route.states) {
      for (const device of release.devices) {
        for (const appearance of release.appearances) {
          for (const contentSizeCategory of release.contentSizeCategories) {
            const core = {
              routeId: route.routeId,
              stateId: state.stateId,
              fixtureId: state.fixtureId,
              deviceId: device.id,
              appearance,
              contentSizeCategory,
              expectedDesignGeneration: route.designGeneration,
              requiredEvidenceKinds: state.requiredEvidenceKinds,
            } as const;
            cases.push({ schemaVersion: 1, caseId: caseId(core), ...core });
          }
        }
      }
    }
  }
  cases.sort((left, right) => left.caseId.localeCompare(right.caseId));
  const envelope = {
    schemaVersion: 1 as const,
    projectId: release.projectId,
    releaseContractDigest: qualityDigest(release),
    experienceManifestDigest: qualityDigest(manifest),
    cases,
  };
  return { ...envelope, matrixDigest: qualityDigest(envelope) };
}

function parseObservation(value: unknown): PresentationObservationV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("presentation observation must be an object");
  }
  const item = value as Readonly<Record<string, unknown>>;
  if (item.schemaVersion !== 1 || typeof item.caseId !== "string") {
    throw new TypeError("presentation observation has an invalid identity");
  }
  if (
    typeof item.candidateCommit !== "string" ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(item.candidateCommit)
  ) {
    throw new TypeError("presentation observation has an invalid candidate commit");
  }
  if (
    !Array.isArray(item.renderedGenerations) ||
    !item.renderedGenerations.every((generation) => typeof generation === "string")
  ) {
    throw new TypeError("presentation observation generations are invalid");
  }
  if (
    !Array.isArray(item.missingAccessibilitySemantics) ||
    !item.missingAccessibilitySemantics.every((value) => typeof value === "string")
  ) {
    throw new TypeError("presentation accessibility observations are invalid");
  }
  if (typeof item.clippedCriticalContent !== "boolean") {
    throw new TypeError("presentation clipping flag is invalid");
  }
  return {
    schemaVersion: 1,
    caseId: item.caseId,
    candidateCommit: item.candidateCommit,
    screenshotDigest: Sha256DigestSchema.parse(item.screenshotDigest),
    uiTestEvidenceDigest: Sha256DigestSchema.parse(item.uiTestEvidenceDigest),
    runtimeLineageDigest: Sha256DigestSchema.parse(item.runtimeLineageDigest),
    accessibilityEvidenceDigest:
      item.accessibilityEvidenceDigest === null
        ? null
        : Sha256DigestSchema.parse(item.accessibilityEvidenceDigest),
    renderedGenerations: [...item.renderedGenerations],
    clippedCriticalContent: item.clippedCriticalContent,
    missingAccessibilitySemantics: [...item.missingAccessibilitySemantics],
  };
}

export function evaluatePresentationMatrix(
  matrix: PresentationMatrixV1,
  observationsInput: readonly unknown[],
  candidateCommit: string,
): PresentationMatrixEvaluation {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(candidateCommit)) {
    throw new TypeError("candidateCommit must be an explicit Git SHA");
  }
  const observations = observationsInput.map(parseObservation);
  const cases = new Map(matrix.cases.map((item) => [item.caseId, item]));
  const seen = new Set<string>();
  const findings: QualityFindingV1[] = [];
  for (const observation of observations) {
    const planned = cases.get(observation.caseId);
    if (planned === undefined) {
      findings.push(
        matrixFinding(
          "quality.matrix.unplanned-observation",
          "p1",
          `Observation ${observation.caseId} is not in the presentation plan.`,
          { evidenceDigests: [observation.screenshotDigest] },
        ),
      );
      continue;
    }
    if (seen.has(observation.caseId)) {
      findings.push(
        matrixFinding(
          "quality.matrix.duplicate-observation",
          "p1",
          `Presentation case ${observation.caseId} has duplicate evidence.`,
          { routeId: planned.routeId, stateId: planned.stateId },
        ),
      );
      continue;
    }
    seen.add(observation.caseId);
    if (observation.candidateCommit !== candidateCommit) {
      findings.push(
        matrixFinding(
          "quality.matrix.stale-candidate-evidence",
          "p0",
          "Presentation evidence belongs to a different candidate commit.",
          { routeId: planned.routeId, stateId: planned.stateId },
        ),
      );
    }
    const generations = new Set(observation.renderedGenerations);
    if (generations.size !== 1 || !generations.has(planned.expectedDesignGeneration)) {
      findings.push(
        matrixFinding(
          "quality.matrix.mixed-generation",
          "p0",
          `Presentation case rendered ${[...generations].sort().join(", ")} instead of ${planned.expectedDesignGeneration}.`,
          {
            routeId: planned.routeId,
            stateId: planned.stateId,
            evidenceDigests: [observation.screenshotDigest, observation.runtimeLineageDigest],
          },
        ),
      );
    }
    if (observation.clippedCriticalContent) {
      findings.push(
        matrixFinding(
          "quality.matrix.clipped-critical-content",
          "p1",
          "Critical content is clipped in a required presentation case.",
          {
            routeId: planned.routeId,
            stateId: planned.stateId,
            evidenceDigests: [observation.screenshotDigest],
          },
        ),
      );
    }
    if (observation.missingAccessibilitySemantics.length > 0) {
      findings.push(
        matrixFinding(
          "quality.matrix.missing-accessibility-semantics",
          "p1",
          `Missing accessibility semantics: ${observation.missingAccessibilitySemantics.join(", ")}.`,
          {
            routeId: planned.routeId,
            stateId: planned.stateId,
            evidenceDigests:
              observation.accessibilityEvidenceDigest === null
                ? []
                : [observation.accessibilityEvidenceDigest],
          },
        ),
      );
    }
  }
  for (const planned of matrix.cases) {
    if (!seen.has(planned.caseId)) {
      findings.push(
        matrixFinding(
          "quality.matrix.required-case-missing",
          "p1",
          `Required presentation case ${planned.caseId} has no evidence.`,
          { routeId: planned.routeId, stateId: planned.stateId },
        ),
      );
    }
  }
  const deduplicated = [...new Map(findings.map((item) => [item.fingerprint, item])).values()].sort(
    (left, right) => left.findingId.localeCompare(right.findingId),
  );
  return {
    passed: !deduplicated.some((item) => item.severity === "p0" || item.severity === "p1"),
    observedCaseCount: seen.size,
    requiredCaseCount: matrix.cases.length,
    findings: deduplicated,
  };
}

export type RgbaScreenshot = Readonly<{
  width: number;
  height: number;
  rgba: Uint8Array;
}>;

export type VisualDiffResult = Readonly<{
  passed: boolean;
  differentPixelCount: number;
  differentPixelRatio: number;
  maximumChannelDelta: number;
  baselineDigest: Sha256Digest;
  currentDigest: Sha256Digest;
  diffDigest: Sha256Digest;
  diffRgba: Uint8Array;
}>;

function screenshotBytes(screenshot: RgbaScreenshot): Buffer {
  if (
    !Number.isSafeInteger(screenshot.width) ||
    screenshot.width < 1 ||
    !Number.isSafeInteger(screenshot.height) ||
    screenshot.height < 1
  ) {
    throw new TypeError("screenshot dimensions must be positive integers");
  }
  if (screenshot.rgba.byteLength !== screenshot.width * screenshot.height * 4) {
    throw new TypeError("RGBA byte length does not match screenshot dimensions");
  }
  const header = Buffer.allocUnsafe(8);
  header.writeUInt32BE(screenshot.width, 0);
  header.writeUInt32BE(screenshot.height, 4);
  return Buffer.concat([header, Buffer.from(screenshot.rgba)]);
}

export function compareRgbaScreenshots(
  baseline: RgbaScreenshot,
  current: RgbaScreenshot,
  options: Readonly<{ channelTolerance: number; maximumDifferentPixelRatio: number }>,
): VisualDiffResult {
  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw new TypeError("visual baseline and current screenshot dimensions differ");
  }
  if (
    !Number.isSafeInteger(options.channelTolerance) ||
    options.channelTolerance < 0 ||
    options.channelTolerance > 255
  ) {
    throw new TypeError("channelTolerance must be an integer from 0 through 255");
  }
  if (
    !Number.isFinite(options.maximumDifferentPixelRatio) ||
    options.maximumDifferentPixelRatio < 0 ||
    options.maximumDifferentPixelRatio > 1
  ) {
    throw new TypeError("maximumDifferentPixelRatio must be between 0 and 1");
  }
  const baselineBytes = screenshotBytes(baseline);
  const currentBytes = screenshotBytes(current);
  const diff = new Uint8Array(baseline.rgba.byteLength);
  let differentPixelCount = 0;
  let maximumChannelDelta = 0;
  for (let pixel = 0; pixel < baseline.width * baseline.height; pixel += 1) {
    const offset = pixel * 4;
    let different = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const left = baseline.rgba[offset + channel] ?? 0;
      const right = current.rgba[offset + channel] ?? 0;
      const delta = Math.abs(left - right);
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
      if (delta > options.channelTolerance) different = true;
    }
    if (different) {
      differentPixelCount += 1;
      diff[offset] = 255;
      diff[offset + 1] = 0;
      diff[offset + 2] = 255;
      diff[offset + 3] = 255;
    }
  }
  const pixelCount = baseline.width * baseline.height;
  const differentPixelRatio = differentPixelCount / pixelCount;
  const digest = (bytes: Uint8Array): Sha256Digest =>
    Sha256DigestSchema.parse(`sha256:${createHash("sha256").update(bytes).digest("hex")}`);
  return {
    passed: differentPixelRatio <= options.maximumDifferentPixelRatio,
    differentPixelCount,
    differentPixelRatio,
    maximumChannelDelta,
    baselineDigest: digest(baselineBytes),
    currentDigest: digest(currentBytes),
    diffDigest: digest(diff),
    diffRgba: diff,
  };
}
