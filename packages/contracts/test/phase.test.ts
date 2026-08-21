import { describe, expect, it } from "vitest";

import {
  PhaseDefinitionUpsertCommandV1Schema,
  PhaseDefinitionV1Schema,
  PhasePresetUpsertCommandV1Schema,
  PhasePresetV1Schema,
  PhaseTokenBudgetV1Schema,
  PhaseTurnPolicyV1Schema,
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

  it("defaults prompt, topicScope, turnPolicy, and tokenBudget to null when omitted", () => {
    const parsed = PhaseDefinitionV1Schema.parse(phase());
    expect(parsed.prompt).toBeNull();
    expect(parsed.topicScope).toBeNull();
    expect(parsed.turnPolicy).toBeNull();
    expect(parsed.tokenBudget).toBeNull();
  });

  it("accepts explicit prompt, topicScope, turnPolicy, and tokenBudget", () => {
    const parsed = PhaseDefinitionV1Schema.parse(
      phase({
        prompt: "Operator briefing: keep the debate focused on the MVP boundary.",
        topicScope: "Only discuss the contract phase's own scope.",
        turnPolicy: { maxRounds: 6, perParticipantTurnCap: 2 },
        tokenBudget: { maxTotalTokens: 50_000 },
      }),
    );
    expect(parsed.turnPolicy).toEqual({ maxRounds: 6, perParticipantTurnCap: 2 });
    expect(parsed.tokenBudget).toEqual({ maxTotalTokens: 50_000 });
  });

  it("bounds prompt and topicScope length", () => {
    expect(() => PhaseDefinitionV1Schema.parse(phase({ prompt: "" }))).toThrow();
    expect(() => PhaseDefinitionV1Schema.parse(phase({ prompt: "x".repeat(10_001) }))).toThrow();
    expect(() => PhaseDefinitionV1Schema.parse(phase({ topicScope: "x".repeat(2_001) }))).toThrow();
  });
});

describe("PhaseTurnPolicyV1Schema / PhaseTokenBudgetV1Schema", () => {
  it("bounds maxRounds and perParticipantTurnCap to 1..12 and allows a null cap", () => {
    expect(
      PhaseTurnPolicyV1Schema.safeParse({ maxRounds: 1, perParticipantTurnCap: null }).success,
    ).toBe(true);
    expect(
      PhaseTurnPolicyV1Schema.safeParse({ maxRounds: 12, perParticipantTurnCap: 12 }).success,
    ).toBe(true);
    expect(
      PhaseTurnPolicyV1Schema.safeParse({ maxRounds: 13, perParticipantTurnCap: null }).success,
    ).toBe(false);
    expect(
      PhaseTurnPolicyV1Schema.safeParse({ maxRounds: 0, perParticipantTurnCap: null }).success,
    ).toBe(false);
  });

  it("requires a positive maxTotalTokens", () => {
    expect(PhaseTokenBudgetV1Schema.safeParse({ maxTotalTokens: 1 }).success).toBe(true);
    expect(PhaseTokenBudgetV1Schema.safeParse({ maxTotalTokens: 0 }).success).toBe(false);
  });
});

describe("legacy compatibility: a stored phase definition predating prompt/topicScope/turnPolicy/tokenBudget", () => {
  it("parses a phase definition JSON with none of the four new fields, defaulting all to null", () => {
    // Exactly the shape `preset.upsert`/`phase.upsert` would have persisted before this wave --
    // no `prompt`, `topicScope`, `turnPolicy`, or `tokenBudget` key at all.
    const legacyStoredPhase = {
      schemaVersion: 1,
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
      revision: 0,
      createdAt: T0,
      updatedAt: T0,
    };

    const parsed = PhaseDefinitionV1Schema.parse(legacyStoredPhase);
    expect(parsed.prompt).toBeNull();
    expect(parsed.topicScope).toBeNull();
    expect(parsed.turnPolicy).toBeNull();
    expect(parsed.tokenBudget).toBeNull();
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
