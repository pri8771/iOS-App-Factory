import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createFactoryRepositories, openMigratedFactoryDatabase } from "@app-factory/kernel";
import type { FactoryRepositories } from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import {
  SEED_INSTANT_V1,
  SEED_PHASE_PRESET_COMMAND_ID_V1,
  buildSeedIosAppStandardPhaseDraftsV1,
  loadKnownStandardRuleIdsV1,
  materializeSeedIosAppStandardPhaseDefinitionsV1,
  seedIosAppStandardPresetV1,
} from "../src/phase-command-runtime.js";

/**
 * Regression coverage for the bug the Swift stage-builder wave found live: seeding the built-in
 * `ios-app-standard-0.4.0` preset used to embed its 10 phase snapshots directly into
 * `phase_presets` without ever writing matching rows to the durable, independently-revisioned
 * `phase_definitions` table (`phaseDefinitions.upsert`, `PhaseDefinitionRepository` in
 * `@app-factory/kernel`'s `phase-repositories.ts`). That left the first `phase.upsert` against any
 * seeded phase, with `expectedRevision` set to the embedded revision, failing `phase.not-found` --
 * the row it compared against never existed.
 *
 * These tests exercise `seedIosAppStandardPresetV1`/`materializeSeedIosAppStandardPhaseDefinitionsV1`
 * directly against a real `FactoryRepositories` over a temp SQLite database, the same way
 * `phase-output-mirror.test.ts` and its siblings drive kernel repositories directly (as opposed to
 * `phase-command-runtime.test.ts`, which drives the full `openDaemonCommandRuntime` handler -- see
 * that file's own module doc comment for why command-handler behavior belongs there instead). The
 * actual `phase.upsert`-succeeds-after-seeding regression is covered end-to-end in
 * `phase-command-runtime.test.ts`.
 */

const SEEDED_PHASE_IDS = [
  "contract",
  "research",
  "brief",
  "design",
  "architecture",
  "plan",
  "ready",
  "build",
  "review",
  "release",
];

const SEED_PRESET_ID = "ios-app-standard-0.4.0";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function freshRepositories(): FactoryRepositories {
  const root = mkdtempSync(join(tmpdir(), "app-factory-phase-preset-seed-"));
  roots.push(root);
  return createFactoryRepositories(openMigratedFactoryDatabase(join(root, "factory.sqlite")));
}

describe("seedIosAppStandardPresetV1 — durable phase materialization", () => {
  it("materializes all 10 phase definitions durably, byte-for-byte identical to the preset's embedded snapshots", () => {
    const repositories = freshRepositories();
    const knownStandardRuleIds = loadKnownStandardRuleIdsV1();

    const preset = seedIosAppStandardPresetV1(repositories, knownStandardRuleIds);

    expect(preset.phases.map((phase) => phase.phaseId)).toEqual(SEEDED_PHASE_IDS);
    for (const phase of preset.phases) {
      const durable = repositories.phaseDefinitions.findById(phase.phaseId);
      expect(durable).not.toBeNull();
      expect(durable).toEqual(phase);
      expect(durable?.revision).toBe(0);
      expect(durable?.createdAt).toBe(SEED_INSTANT_V1);
      expect(durable?.updatedAt).toBe(SEED_INSTANT_V1);
    }
  });

  it("materializeSeedIosAppStandardPhaseDefinitionsV1 alone durably creates every phase, independent of the preset ever being seeded", () => {
    const repositories = freshRepositories();
    const knownStandardRuleIds = loadKnownStandardRuleIdsV1();

    const phases = materializeSeedIosAppStandardPhaseDefinitionsV1(
      repositories,
      knownStandardRuleIds,
    );

    expect(phases.map((phase) => phase.phaseId)).toEqual(SEEDED_PHASE_IDS);
    for (const phaseId of SEEDED_PHASE_IDS) {
      expect(repositories.phaseDefinitions.findById(phaseId)?.revision).toBe(0);
    }
    expect(repositories.phasePresets.findById(SEED_PRESET_ID)).toBeNull();
  });

  it("seeds idempotently: seeding twice on the same database writes no duplicate revisions", () => {
    const repositories = freshRepositories();
    const knownStandardRuleIds = loadKnownStandardRuleIdsV1();

    const first = seedIosAppStandardPresetV1(repositories, knownStandardRuleIds);
    const second = seedIosAppStandardPresetV1(repositories, knownStandardRuleIds);

    expect(second).toEqual(first);
    for (const phaseId of SEEDED_PHASE_IDS) {
      expect(repositories.phaseDefinitions.findById(phaseId)?.revision).toBe(0);
    }
  });

  it("backfills phase_definitions on a legacy database that already carries the preset but never materialized its phases", () => {
    const repositories = freshRepositories();
    const knownStandardRuleIds = loadKnownStandardRuleIdsV1();

    // Simulates a pre-fix daemon start: only `phasePresets.upsert` ran, embedding each phase's
    // own full literal snapshot directly into `phase_presets` -- exactly the bug this fix closes
    // -- without ever calling `phaseDefinitions.upsert`.
    const legacyPhases = buildSeedIosAppStandardPhaseDraftsV1().map((draft) => ({
      schemaVersion: 1,
      ...draft,
      revision: 0,
      createdAt: SEED_INSTANT_V1,
      updatedAt: SEED_INSTANT_V1,
    }));
    repositories.phasePresets.upsert({
      command: {
        schemaVersion: 1,
        commandId: SEED_PHASE_PRESET_COMMAND_ID_V1,
        issuedAt: SEED_INSTANT_V1,
        origin: "system",
        kind: "preset.upsert",
        upsert: {
          preset: {
            presetId: SEED_PRESET_ID,
            name: "iOS App Standard 0.4.0",
            phases: legacyPhases,
            appliesTo: ["ios"],
          },
          expectedRevision: null,
        },
      },
      recordedAt: SEED_INSTANT_V1,
      knownStandardRuleIds: [...knownStandardRuleIds],
    });

    // Confirms the fixture actually reproduces the bug: the preset exists, but none of its
    // phases were ever durably materialized.
    expect(repositories.phasePresets.findById(SEED_PRESET_ID)?.revision).toBe(0);
    for (const phaseId of SEEDED_PHASE_IDS) {
      expect(repositories.phaseDefinitions.findById(phaseId)).toBeNull();
    }

    // The next seed call -- exactly what runs at the next daemon start -- backfills every
    // missing phase row. The check is per-phase, not gated on "the preset already exists": the
    // preset upsert itself is a no-op (identical command ID and content), but materialization
    // still runs and still creates the missing rows.
    const backfilled = seedIosAppStandardPresetV1(repositories, knownStandardRuleIds);

    expect(repositories.phasePresets.findById(SEED_PRESET_ID)?.revision).toBe(0);
    for (const phase of backfilled.phases) {
      const durable = repositories.phaseDefinitions.findById(phase.phaseId);
      expect(durable).not.toBeNull();
      expect(durable).toEqual(phase);
      expect(durable?.revision).toBe(0);
    }
  });
});
