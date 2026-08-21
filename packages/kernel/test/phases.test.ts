import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createFactoryRepositories, openMigratedFactoryDatabase } from "../src/index.js";

const T0 = "2026-08-16T09:00:00.000Z";
const T1 = "2026-08-16T09:00:01.000Z";
const T2 = "2026-08-16T09:00:02.000Z";
const T3 = "2026-08-16T09:00:03.000Z";

const KNOWN_RULE_IDS = ["rule.new.scope-before-breadth", "rule.dod.verification"];

const roots: string[] = [];

function uuid(value: number): string {
  return `84000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function database() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-phases-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function phaseDraft(phaseId: string, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    phaseId,
    name: "Contract",
    purpose: "Define the user outcome, MVP boundary, and Definition of Done.",
    mode: "solo",
    cast: {
      participants: [{ provider: "claude", persona: "contract-writer", readOnly: true }],
      coordinator: null,
      grader: null,
    },
    inputs: ["docs"],
    rules: {
      standard: ["rule.new.scope-before-breadth"],
      yours: [],
      requiredOutput: [],
      acceptanceChecks: [],
    },
    outputs: [{ path: "docs/product/contract.md", schema: null }],
    gates: [],
    budget: { estimateMinutes: 20, timeoutSeconds: 1_800 },
    prompt: null,
    topicScope: null,
    turnPolicy: null,
    tokenBudget: null,
    ...overrides,
  };
}

function phaseCommand(
  commandId: string,
  phase: ReturnType<typeof phaseDraft>,
  expectedRevision: number | null,
  issuedAt = T0,
) {
  return {
    schemaVersion: 1,
    commandId,
    issuedAt,
    origin: "system",
    kind: "phase.upsert",
    upsert: { phase, expectedRevision },
  };
}

function fullPhase(phaseId: string, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    ...phaseDraft(phaseId),
    revision: 0,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function presetDraft(presetId: string, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    presetId,
    name: "iOS App Standard",
    phases: [fullPhase("contract")],
    appliesTo: ["ios"],
    ...overrides,
  };
}

function presetCommand(
  commandId: string,
  preset: ReturnType<typeof presetDraft>,
  expectedRevision: number | null,
  issuedAt = T0,
) {
  return {
    schemaVersion: 1,
    commandId,
    issuedAt,
    origin: "system",
    kind: "preset.upsert",
    upsert: { preset, expectedRevision },
  };
}

describe("phase definition repository", () => {
  it("creates at revision 0, updates by compare-and-set, and keeps every revision", () => {
    const store = database();
    const phases = createFactoryRepositories(store).phaseDefinitions;

    const created = phases.upsert({
      command: phaseCommand(uuid(101), phaseDraft("contract"), null),
      recordedAt: T0,
      knownStandardRuleIds: KNOWN_RULE_IDS,
    });
    expect(created).toEqual({
      phase: fullPhase("contract"),
      created: true,
      duplicate: false,
    });

    const updated = phases.upsert({
      command: phaseCommand(uuid(102), phaseDraft("contract", { name: "Contract v2" }), 0, T1),
      recordedAt: T1,
      knownStandardRuleIds: KNOWN_RULE_IDS,
    });
    expect(updated.created).toBe(false);
    expect(updated.duplicate).toBe(false);
    expect(updated.phase).toMatchObject({ revision: 1, name: "Contract v2", updatedAt: T1 });

    expect(phases.findById("contract")).toEqual(updated.phase);
    store.close();
  });

  it("is idempotent by command ID and refuses a reused command ID with different content", () => {
    const store = database();
    const phases = createFactoryRepositories(store).phaseDefinitions;
    const create = phaseCommand(uuid(101), phaseDraft("contract"), null);
    const first = phases.upsert({
      command: create,
      recordedAt: T0,
      knownStandardRuleIds: KNOWN_RULE_IDS,
    });
    const replay = phases.upsert({
      command: create,
      recordedAt: T3,
      knownStandardRuleIds: KNOWN_RULE_IDS,
    });
    expect(replay).toEqual({ ...first, duplicate: true });

    expect(() =>
      phases.upsert({
        command: phaseCommand(uuid(101), phaseDraft("contract", { name: "Different" }), null),
        recordedAt: T3,
        knownStandardRuleIds: KNOWN_RULE_IDS,
      }),
    ).toThrowError(expect.objectContaining({ code: "phase.identity-conflict" }));
    store.close();
  });

  it.each([
    [
      "creating an existing phase",
      (id: string) => phaseCommand(uuid(201), phaseDraft(id), null, T1),
      "phase.already-exists",
    ],
    [
      "updating a missing phase",
      () => phaseCommand(uuid(202), phaseDraft("missing-phase"), 0, T1),
      "phase.not-found",
    ],
    [
      "a stale expected revision",
      (id: string) => phaseCommand(uuid(203), phaseDraft(id, { name: "X" }), 4, T1),
      "phase.revision-conflict",
    ],
  ])("refuses %s without writing a revision", (_label, build, code) => {
    const store = database();
    const phases = createFactoryRepositories(store).phaseDefinitions;
    phases.upsert({
      command: phaseCommand(uuid(101), phaseDraft("contract"), null),
      recordedAt: T0,
      knownStandardRuleIds: KNOWN_RULE_IDS,
    });
    expect(() =>
      phases.upsert({
        command: build("contract"),
        recordedAt: T1,
        knownStandardRuleIds: KNOWN_RULE_IDS,
      }),
    ).toThrowError(expect.objectContaining({ code }));
    expect(phases.findById("contract")?.revision).toBe(0);
    store.close();
  });

  it("fails closed on a standard rule ID the compiled policy source does not declare", () => {
    const store = database();
    const phases = createFactoryRepositories(store).phaseDefinitions;
    expect(() =>
      phases.upsert({
        command: phaseCommand(
          uuid(101),
          phaseDraft("contract", {
            rules: {
              standard: ["rule.does-not-exist"],
              yours: [],
              requiredOutput: [],
              acceptanceChecks: [],
            },
          }),
          null,
        ),
        recordedAt: T0,
        knownStandardRuleIds: KNOWN_RULE_IDS,
      }),
    ).toThrowError(expect.objectContaining({ code: "phase.unknown-rule-id" }));
    expect(phases.findById("contract")).toBeNull();
    expect(store.prepare("SELECT COUNT(*) AS n FROM phase_definitions").get()).toEqual({ n: 0 });
    store.close();
  });

  it("enforces immutable history at the SQLite layer", () => {
    const store = database();
    const phases = createFactoryRepositories(store).phaseDefinitions;
    phases.upsert({
      command: phaseCommand(uuid(101), phaseDraft("contract"), null),
      recordedAt: T0,
      knownStandardRuleIds: KNOWN_RULE_IDS,
    });
    expect(() =>
      store.prepare("DELETE FROM phase_definitions WHERE phase_id = ?").run("contract"),
    ).toThrow(/retained/);
    expect(() =>
      store.prepare("DELETE FROM phase_definition_revisions WHERE phase_id = ?").run("contract"),
    ).toThrow(/append-only/);
    store.close();
  });
});

describe("phase preset repository", () => {
  it("creates, updates, and lists presets embedding full phase snapshots", () => {
    const store = database();
    const presets = createFactoryRepositories(store).phasePresets;

    const created = presets.upsert({
      command: presetCommand(uuid(101), presetDraft("ios-app-standard-0.4.0"), null),
      recordedAt: T0,
      knownStandardRuleIds: KNOWN_RULE_IDS,
    });
    expect(created.created).toBe(true);
    expect(created.preset.phases).toEqual([fullPhase("contract")]);

    const updated = presets.upsert({
      command: presetCommand(
        uuid(102),
        presetDraft("ios-app-standard-0.4.0", { name: "iOS App Standard (updated)" }),
        0,
        T1,
      ),
      recordedAt: T1,
      knownStandardRuleIds: KNOWN_RULE_IDS,
    });
    expect(updated.preset).toMatchObject({ revision: 1, name: "iOS App Standard (updated)" });

    expect(presets.findById("ios-app-standard-0.4.0")).toEqual(updated.preset);
    expect(presets.listAll().map((preset) => preset.presetId)).toEqual(["ios-app-standard-0.4.0"]);
    store.close();
  });

  it("fails closed when any embedded phase references an unknown standard rule ID", () => {
    const store = database();
    const presets = createFactoryRepositories(store).phasePresets;
    const badPhase = fullPhase("contract", {
      rules: {
        standard: ["rule.does-not-exist"],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: [],
      },
    });
    expect(() =>
      presets.upsert({
        command: presetCommand(
          uuid(101),
          presetDraft("ios-app-standard-0.4.0", { phases: [badPhase] }),
          null,
        ),
        recordedAt: T0,
        knownStandardRuleIds: KNOWN_RULE_IDS,
      }),
    ).toThrowError(expect.objectContaining({ code: "preset.unknown-rule-id" }));
    expect(presets.findById("ios-app-standard-0.4.0")).toBeNull();
    store.close();
  });

  it("is idempotent by command ID and refuses a reused command ID with different content", () => {
    const store = database();
    const presets = createFactoryRepositories(store).phasePresets;
    const create = presetCommand(uuid(101), presetDraft("ios-app-standard-0.4.0"), null);
    const first = presets.upsert({
      command: create,
      recordedAt: T0,
      knownStandardRuleIds: KNOWN_RULE_IDS,
    });
    const replay = presets.upsert({
      command: create,
      recordedAt: T2,
      knownStandardRuleIds: KNOWN_RULE_IDS,
    });
    expect(replay).toEqual({ ...first, duplicate: true });
    store.close();
  });

  it.each([
    [
      "creating an existing preset",
      (id: string) => presetCommand(uuid(201), presetDraft(id), null, T1),
      "preset.already-exists",
    ],
    [
      "updating a missing preset",
      () => presetCommand(uuid(202), presetDraft("missing-preset"), 0, T1),
      "preset.not-found",
    ],
    [
      "a stale expected revision",
      (id: string) => presetCommand(uuid(203), presetDraft(id, { name: "Different" }), 4, T1),
      "preset.revision-conflict",
    ],
  ])("refuses %s without writing a revision", (_label, build, code) => {
    const store = database();
    const presets = createFactoryRepositories(store).phasePresets;
    presets.upsert({
      command: presetCommand(uuid(101), presetDraft("ios-app-standard-0.4.0"), null),
      recordedAt: T0,
      knownStandardRuleIds: KNOWN_RULE_IDS,
    });
    expect(() =>
      presets.upsert({
        command: build("ios-app-standard-0.4.0"),
        recordedAt: T1,
        knownStandardRuleIds: KNOWN_RULE_IDS,
      }),
    ).toThrowError(expect.objectContaining({ code }));
    expect(presets.findById("ios-app-standard-0.4.0")?.revision).toBe(0);
    store.close();
  });
});
