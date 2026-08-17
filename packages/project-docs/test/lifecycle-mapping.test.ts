import { describe, expect, it } from "vitest";

import {
  CORPUS_LIFECYCLE_STAGE_TO_CANONICAL_V1,
  mapCorpusLifecycleStageToCanonicalV1,
} from "../src/index.js";

describe("mapCorpusLifecycleStageToCanonicalV1", () => {
  it("maps every corpus 14-stage token onto one of the six canonical stages", () => {
    for (const [corpusStage, canonical] of Object.entries(CORPUS_LIFECYCLE_STAGE_TO_CANONICAL_V1)) {
      expect(mapCorpusLifecycleStageToCanonicalV1(corpusStage)).toBe(canonical);
    }
  });

  it("is tolerant of case and surrounding whitespace", () => {
    expect(mapCorpusLifecycleStageToCanonicalV1("  Verification_Pending  ")).toBe("qa");
    expect(mapCorpusLifecycleStageToCanonicalV1("BETA")).toBe("launch-prep");
  });

  it("returns null -- never a guess -- for an unrecognized token", () => {
    expect(mapCorpusLifecycleStageToCanonicalV1("shipping_soon")).toBeNull();
    expect(mapCorpusLifecycleStageToCanonicalV1("")).toBeNull();
    expect(mapCorpusLifecycleStageToCanonicalV1("exploring")).toBeNull();
  });

  it("agrees with the reconciliation doc's stage groupings (RULES_CORPUS_RECONCILIATION.md §2)", () => {
    // Pre-launch stages collapse to "idea"; nothing built yet.
    for (const stage of ["idea", "research", "validated", "planned"]) {
      expect(mapCorpusLifecycleStageToCanonicalV1(stage)).toBe("idea");
    }
    // Under-construction stages collapse to "building".
    for (const stage of ["prototype", "mvp_development", "code_complete"]) {
      expect(mapCorpusLifecycleStageToCanonicalV1(stage)).toBe("building");
    }
    // Verification stages collapse to "qa".
    for (const stage of ["verification_pending", "verified"]) {
      expect(mapCorpusLifecycleStageToCanonicalV1(stage)).toBe("qa");
    }
    // Pre-release-live stages collapse to "launch-prep".
    for (const stage of ["beta", "release_candidate"]) {
      expect(mapCorpusLifecycleStageToCanonicalV1(stage)).toBe("launch-prep");
    }
    // Shipped stages collapse to "live".
    for (const stage of ["released", "maintained"]) {
      expect(mapCorpusLifecycleStageToCanonicalV1(stage)).toBe("live");
    }
    expect(mapCorpusLifecycleStageToCanonicalV1("paused_or_retired")).toBe("frozen");
  });
});
