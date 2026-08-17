// Records lifecycle-stages.json — the project-lifecycle vocabulary StudioKit's `ProjectLifecycleStage`
// (Models/Portfolio.swift) must decode — through the real, built `@app-factory/contracts`, so the
// Swift enum is pinned to `lifecycle.ts`/`project.ts` themselves rather than to a hand-copied list
// that can drift the way `ProjectLifecycleStage` once did (it stayed on the legacy 8-value
// project-manifest enum after ADR 0005 moved `StudioProjectV1.lifecycleStage` to the canonical six,
// so a real studio.snapshot carrying `idea`/`launch-prep`/`live`/`frozen` would have failed to
// decode; only `building`/`qa`, which overlap by spelling, and `null` were ever exercised).
//
//   canonical  — `ProjectLifecycleStageV1Schema.options`, in progression order (ADR 0005). This is
//                what `StudioProjectV1.lifecycleStage` sends.
//   legacy     — `LegacyProjectLifecycleStageV1Schema.options`: what
//                `PortfolioProjectReadModelV1.lifecycleStage` (portfolio.snapshot) still sends.
//   legacyMap  — `LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1`: how each legacy value folds onto a
//                canonical stage. Swift's `ProjectLifecycleStage.legacyMap` mirrors this verbatim.
//
// The script fails (non-zero) rather than writing a fixture if the contract's own invariants break:
// every legacy option must have a fold, and every fold target must be a canonical stage.
import { writeFileSync } from "node:fs";
import {
  LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1,
  LegacyProjectLifecycleStageV1Schema,
  ProjectLifecycleStageV1Schema,
} from "../../../packages/contracts/dist/index.js";

const canonical = ProjectLifecycleStageV1Schema.options;
const legacy = LegacyProjectLifecycleStageV1Schema.options;
const legacyMap = LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1;

for (const value of legacy) {
  if (!(value in legacyMap)) {
    throw new Error(
      `legacy stage "${value}" has no entry in LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1`,
    );
  }
}
for (const [from, to] of Object.entries(legacyMap)) {
  ProjectLifecycleStageV1Schema.parse(to); // throws if a fold target is not canonical
  if (!legacy.includes(from)) {
    throw new Error(`LEGACY_PROJECT_LIFECYCLE_STAGE_MAP_V1 key "${from}" is not a legacy stage`);
  }
}

const fixture = { canonical, legacy, legacyMap };
const dir = new URL("../Tests/StudioKitTests/Fixtures/", import.meta.url).pathname;
writeFileSync(dir + "lifecycle-stages.json", JSON.stringify(fixture, null, 2) + "\n");
console.log(`lifecycle-stages.json: ${canonical.length} canonical, ${legacy.length} legacy stages`);
