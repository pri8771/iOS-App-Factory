import { describe, expect, it } from "vitest";

import {
  PhaseDefinitionUpsertCommandV1Schema,
  PhaseDefinitionV1Schema,
  PhasePresetUpsertCommandV1Schema,
  PhasePresetV1Schema,
} from "../src/index.js";

const T0 = "2026-08-16T09:00:00.000Z";
const T1 = "2026-08-16T10:00:00.000Z";
const COMMAND_ID = "76000000-0000-4000-8000-000000000201";

function phaseDraft(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    phaseId: "contract",
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
    ...overrides,
  };
}

function phase(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    ...phaseDraft(),
    revision: 0,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

function preset(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    presetId: "ios-app-standard-0.4.0",
    name: "iOS App Standard 0.4.0",
    phases: [phase()],
    appliesTo: ["ios"],
    revision: 0,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

describe("PhaseDefinitionV1", () => {
  it("accepts a well-formed phase definition and round-trips through JSON", () => {
    const parsed = PhaseDefinitionV1Schema.parse(phase());
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });

  it("requires exactly one cast participant in solo mode", () => {
    expect(() =>
      PhaseDefinitionV1Schema.parse(
        phase({
          cast: {
            participants: [
              { provider: "claude", persona: "a", readOnly: true },
              { provider: "codex", persona: "b", readOnly: true },
            ],
            coordinator: null,
            grader: null,
          },
        }),
      ),
    ).toThrow(/mode solo requires exactly one cast participant/);
    expect(() =>
      PhaseDefinitionV1Schema.parse(
        phase({ cast: { participants: [], coordinator: null, grader: null } }),
      ),
    ).toThrow(/mode solo requires exactly one cast participant/);
  });

  it("allows zero participants in chat mode (a pure human gate checkpoint)", () => {
    expect(() =>
      PhaseDefinitionV1Schema.parse(
        phase({
          phaseId: "ready",
          mode: "chat",
          cast: { participants: [], coordinator: null, grader: null },
          gates: ["build", "tests"],
        }),
      ),
    ).not.toThrow();
  });

  it("rejects a grader who is also a cast participant", () => {
    expect(() =>
      PhaseDefinitionV1Schema.parse(
        phase({
          mode: "debate",
          cast: {
            participants: [
              { provider: "codex", persona: "a", readOnly: true },
              { provider: "cursor", persona: "b", readOnly: true },
            ],
            coordinator: null,
            grader: { provider: "codex", persona: "a" },
          },
        }),
      ),
    ).toThrow(/grader must differ from every cast participant/);
    // A grader with the same provider but a different persona is a distinct cast member.
    expect(() =>
      PhaseDefinitionV1Schema.parse(
        phase({
          mode: "debate",
          cast: {
            participants: [
              { provider: "codex", persona: "a", readOnly: true },
              { provider: "cursor", persona: "b", readOnly: true },
            ],
            coordinator: null,
            grader: { provider: "codex", persona: "grader" },
          },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects duplicate cast participants, inputs, gates, and output paths", () => {
    expect(() =>
      PhaseDefinitionV1Schema.parse(
        phase({
          mode: "panel",
          cast: {
            participants: [
              { provider: "codex", persona: "a", readOnly: true },
              { provider: "codex", persona: "a", readOnly: true },
            ],
            coordinator: null,
            grader: null,
          },
        }),
      ),
    ).toThrow(/cast participants must be unique/);
    expect(() => PhaseDefinitionV1Schema.parse(phase({ inputs: ["docs", "docs"] }))).toThrow(
      /inputs must be unique/,
    );
    expect(() => PhaseDefinitionV1Schema.parse(phase({ gates: ["build", "build"] }))).toThrow(
      /gates must be unique/,
    );
    expect(() =>
      PhaseDefinitionV1Schema.parse(
        phase({
          outputs: [
            { path: "docs/a.md", schema: null },
            { path: "docs/a.md", schema: null },
          ],
        }),
      ),
    ).toThrow(/output paths must be unique/);
  });

  it("requires output paths to be repo-relative under docs/", () => {
    expect(() =>
      PhaseDefinitionV1Schema.parse(phase({ outputs: [{ path: "src/main.swift", schema: null }] })),
    ).toThrow();
    expect(() =>
      PhaseDefinitionV1Schema.parse(
        phase({ outputs: [{ path: "docs/../secret.md", schema: null }] }),
      ),
    ).toThrow();
  });

  it("requires revision 0 to carry its creation timestamp and rejects updatedAt before createdAt", () => {
    expect(() => PhaseDefinitionV1Schema.parse(phase({ updatedAt: T1 }))).toThrow(
      /revision 0 must carry its creation timestamp/,
    );
    expect(() =>
      PhaseDefinitionV1Schema.parse(phase({ revision: 1, createdAt: T1, updatedAt: T0 })),
    ).toThrow(/updatedAt precedes createdAt/);
  });

  it("rejects an estimate that exceeds the timeout budget", () => {
    expect(() =>
      PhaseDefinitionV1Schema.parse(
        phase({ budget: { estimateMinutes: 61, timeoutSeconds: 3_600 } }),
      ),
    ).toThrow(/estimateMinutes cannot exceed timeoutSeconds/);
  });

  it("accepts an upsert command envelope", () => {
    expect(() =>
      PhaseDefinitionUpsertCommandV1Schema.parse({
        schemaVersion: 1,
        commandId: COMMAND_ID,
        issuedAt: T0,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: phaseDraft(), expectedRevision: null },
      }),
    ).not.toThrow();
  });
});

describe("PhasePresetV1", () => {
  it("accepts a well-formed preset and round-trips through JSON", () => {
    const parsed = PhasePresetV1Schema.parse(preset());
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });

  it("rejects duplicate phase IDs within one preset", () => {
    expect(() => PhasePresetV1Schema.parse(preset({ phases: [phase(), phase()] }))).toThrow(
      /phase IDs must be unique/,
    );
  });

  it("rejects duplicate appliesTo entries", () => {
    expect(() => PhasePresetV1Schema.parse(preset({ appliesTo: ["ios", "ios"] }))).toThrow(
      /appliesTo entries must be unique/,
    );
  });

  it("accepts a null appliesTo (applies to every project kind)", () => {
    expect(() => PhasePresetV1Schema.parse(preset({ appliesTo: null }))).not.toThrow();
  });

  it("requires at least one phase", () => {
    expect(() => PhasePresetV1Schema.parse(preset({ phases: [] }))).toThrow();
  });

  it("accepts an upsert command envelope", () => {
    expect(() =>
      PhasePresetUpsertCommandV1Schema.parse({
        schemaVersion: 1,
        commandId: COMMAND_ID,
        issuedAt: T0,
        origin: "system",
        kind: "preset.upsert",
        upsert: {
          preset: {
            presetId: "ios-app-standard-0.4.0",
            name: "iOS App Standard 0.4.0",
            phases: [phase()],
            appliesTo: ["ios"],
          },
          expectedRevision: null,
        },
      }),
    ).not.toThrow();
  });
});
