import { createHash } from "node:crypto";

import { Sha256DigestSchema, type RelativePath, type Sha256Digest } from "@app-factory/contracts";

import {
  ExperienceManifestV1Schema,
  ReleaseContractV1Schema,
  RuntimeLineageObservationV1Schema,
  StaticUiObservationV1Schema,
  type ExperienceManifestV1,
  type QualityFindingV1,
  type ReleaseContractV1,
} from "./model.js";

export type CoherenceEvaluationInput = Readonly<{
  releaseContract: unknown;
  experienceManifest: unknown;
  runtimeLineage: readonly unknown[];
  staticUi: readonly unknown[];
  observedAt: string;
}>;

export type CoherenceEvaluation = Readonly<{
  passed: boolean;
  releaseContract: ReleaseContractV1;
  experienceManifest: ExperienceManifestV1;
  findings: readonly QualityFindingV1[];
  coverage: Readonly<{
    publicStateCount: number;
    observedPublicStateCount: number;
    requiredJourneyCount: number;
    presentRequiredJourneyCount: number;
  }>;
}>;

function canonical(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input !== null && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

export function qualityDigest(value: unknown): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`,
  );
}

type FindingInput = Readonly<{
  ruleId: string;
  severity: "p0" | "p1" | "p2" | "p3";
  routeId?: string;
  stateId?: string;
  path?: RelativePath;
  summary: string;
  evidenceDigests?: readonly Sha256Digest[];
}>;

function finding(input: FindingInput): QualityFindingV1 {
  const key = {
    ruleId: input.ruleId,
    routeId: input.routeId ?? null,
    stateId: input.stateId ?? null,
    path: input.path ?? null,
    summary: input.summary,
  };
  const fingerprint = qualityDigest(key);
  return {
    schemaVersion: 1,
    findingId: `qf-${fingerprint.slice("sha256:".length, "sha256:".length + 24)}`,
    fingerprint,
    ruleId: input.ruleId,
    severity: input.severity,
    routeId: input.routeId ?? null,
    stateId: input.stateId ?? null,
    path: input.path ?? null,
    summary: input.summary,
    rootCause: null,
    escapedGate: null,
    regressionId: null,
    lessonScope: null,
    evidenceDigests: [...(input.evidenceDigests ?? [])],
    status: "open",
  };
}

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): boolean {
  return new Set(values.map(key)).size === values.length;
}

export function evaluateExperienceCoherence(input: CoherenceEvaluationInput): CoherenceEvaluation {
  const release = ReleaseContractV1Schema.parse(input.releaseContract);
  const manifest = ExperienceManifestV1Schema.parse(input.experienceManifest);
  const runtime = input.runtimeLineage.map((value) =>
    RuntimeLineageObservationV1Schema.parse(value),
  );
  const staticUi = input.staticUi.map((value) => StaticUiObservationV1Schema.parse(value));
  const observedAt = new Date(input.observedAt);
  if (!Number.isFinite(observedAt.getTime()) || observedAt.toISOString() !== input.observedAt) {
    throw new TypeError("observedAt must be a canonical ISO instant");
  }
  if (release.projectId !== manifest.projectId) {
    throw new TypeError("Release contract and experience manifest project IDs differ");
  }

  const findings: QualityFindingV1[] = [];
  if (manifest.releaseContractDigest !== qualityDigest(release)) {
    findings.push(
      finding({
        ruleId: "quality.authority.release-contract-digest",
        severity: "p0",
        summary: "The experience manifest is not bound to this release contract.",
      }),
    );
  }
  if (!uniqueBy(manifest.routes, (route) => route.routeId)) {
    findings.push(
      finding({
        ruleId: "quality.inventory.duplicate-route",
        severity: "p1",
        summary: "The experience manifest contains duplicate route IDs.",
      }),
    );
  }
  if (!uniqueBy(manifest.journeys, (journey) => journey.journeyId)) {
    findings.push(
      finding({
        ruleId: "quality.inventory.duplicate-journey",
        severity: "p1",
        summary: "The experience manifest contains duplicate journey IDs.",
      }),
    );
  }

  const stateIndex = new Map<string, { public: boolean; generation: string }>();
  for (const route of manifest.routes) {
    if (!uniqueBy(route.states, (state) => state.stateId)) {
      findings.push(
        finding({
          ruleId: "quality.inventory.duplicate-state",
          severity: "p1",
          routeId: route.routeId,
          summary: `Route ${route.routeId} contains duplicate state IDs.`,
        }),
      );
    }
    if (route.public && route.designGeneration !== release.activeDesignGeneration) {
      findings.push(
        finding({
          ruleId: "quality.design.mixed-generation-route",
          severity: "p0",
          routeId: route.routeId,
          summary: `Public route ${route.routeId} declares ${route.designGeneration}, not ${release.activeDesignGeneration}.`,
        }),
      );
    }
    for (const state of route.states) {
      const key = `${route.routeId}\0${state.stateId}`;
      stateIndex.set(key, { public: route.public, generation: route.designGeneration });
      const missingEvidence = release.requiredEvidenceKinds.filter(
        (kind) => !state.requiredEvidenceKinds.includes(kind),
      );
      if (route.public && missingEvidence.length > 0) {
        findings.push(
          finding({
            ruleId: "quality.inventory.missing-evidence-declaration",
            severity: "p1",
            routeId: route.routeId,
            stateId: state.stateId,
            summary: `Public state is missing required evidence declarations: ${missingEvidence.join(", ")}.`,
          }),
        );
      }
    }
  }

  const journeyIds = new Set(manifest.journeys.map((journey) => journey.journeyId));
  for (const journeyId of release.requiredJourneyIds) {
    if (!journeyIds.has(journeyId)) {
      findings.push(
        finding({
          ruleId: "quality.journey.required-missing",
          severity: "p1",
          summary: `Required journey ${journeyId} is not declared.`,
        }),
      );
    }
  }
  for (const journey of manifest.journeys) {
    for (const state of journey.orderedStates) {
      if (!stateIndex.has(`${state.routeId}\0${state.stateId}`)) {
        findings.push(
          finding({
            ruleId: "quality.journey.unknown-state",
            severity: "p1",
            routeId: state.routeId,
            stateId: state.stateId,
            summary: `Journey ${journey.journeyId} references an unregistered state.`,
          }),
        );
      }
    }
  }

  for (const exception of manifest.legacyExceptions) {
    if (Date.parse(exception.expiresAt) <= observedAt.getTime()) {
      findings.push(
        finding({
          ruleId: "quality.design.expired-exception",
          severity: "p1",
          path: exception.path,
          summary: `Legacy exception ${exception.issueKey} expired at ${exception.expiresAt}.`,
        }),
      );
    }
  }

  const observedStateKeys = new Set<string>();
  for (const observation of runtime) {
    const key = `${observation.routeId}\0${observation.stateId}`;
    const expected = stateIndex.get(key);
    if (expected === undefined) {
      findings.push(
        finding({
          ruleId: "quality.runtime.unregistered-state",
          severity: "p0",
          routeId: observation.routeId,
          stateId: observation.stateId,
          summary: "Runtime lineage observed an unregistered route/state.",
          evidenceDigests: [observation.screenshotDigest],
        }),
      );
      continue;
    }
    observedStateKeys.add(key);
    const generations = new Set(observation.renderedGenerations);
    if (
      generations.size !== 1 ||
      !generations.has(expected.generation) ||
      (expected.public && !generations.has(release.activeDesignGeneration))
    ) {
      findings.push(
        finding({
          ruleId: "quality.runtime.mixed-generation-lineage",
          severity: "p0",
          routeId: observation.routeId,
          stateId: observation.stateId,
          summary: `Rendered generations ${[...generations].sort().join(", ")} do not match ${expected.generation}.`,
          evidenceDigests: [observation.screenshotDigest],
        }),
      );
    }
  }

  for (const [key, expected] of stateIndex) {
    if (expected.public && !observedStateKeys.has(key)) {
      const [routeId, stateId] = key.split("\0") as [string, string];
      findings.push(
        finding({
          ruleId: "quality.runtime.public-state-unobserved",
          severity: "p1",
          routeId,
          stateId,
          summary: "A public release state has no runtime-lineage observation.",
        }),
      );
    }
  }

  const exceptionPaths = new Set(
    manifest.legacyExceptions
      .filter((exception) => Date.parse(exception.expiresAt) > observedAt.getTime())
      .map((exception) => exception.path),
  );
  for (const observation of staticUi) {
    if (observation.legacyReferences.length > 0 && !exceptionPaths.has(observation.path)) {
      findings.push(
        finding({
          ruleId: "quality.static.legacy-reference",
          severity: "p1",
          path: observation.path,
          summary: `Unapproved legacy UI references: ${observation.legacyReferences.join(", ")}.`,
        }),
      );
    }
    if (observation.rawTokenReferences.length > 0) {
      findings.push(
        finding({
          ruleId: "quality.static.raw-token",
          severity: "p1",
          path: observation.path,
          summary: `Unapproved raw design tokens: ${observation.rawTokenReferences.join(", ")}.`,
        }),
      );
    }
  }

  const deduplicated = [...new Map(findings.map((item) => [item.fingerprint, item])).values()].sort(
    (left, right) => left.findingId.localeCompare(right.findingId),
  );
  const blocking = new Set(release.blockingSeverities);
  const publicStateCount = [...stateIndex.values()].filter((state) => state.public).length;
  const observedPublicStateCount = [...observedStateKeys].filter(
    (key) => stateIndex.get(key)?.public === true,
  ).length;
  return {
    passed: !deduplicated.some((item) => item.status === "open" && blocking.has(item.severity)),
    releaseContract: release,
    experienceManifest: manifest,
    findings: deduplicated,
    coverage: {
      publicStateCount,
      observedPublicStateCount,
      requiredJourneyCount: release.requiredJourneyIds.length,
      presentRequiredJourneyCount: release.requiredJourneyIds.filter((id) => journeyIds.has(id))
        .length,
    },
  };
}
