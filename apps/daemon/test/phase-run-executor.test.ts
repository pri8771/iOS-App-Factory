import {
  IsoInstantSchema,
  ProjectIdSchema,
  RoomIdSchema,
  type PhaseDefinitionV1,
  type ProjectId,
} from "@app-factory/contracts";
import type {
  ParticipantAdapter,
  ParticipantContributionResult,
  ParticipantUsage,
} from "@app-factory/studio-room-adapters";
import { describe, expect, it } from "vitest";

import {
  buildPhaseInstructionV1,
  executePhaseRunV1,
  type PhaseInputsReaderPort,
  type PhaseParticipantsPort,
  type PhaseRoomPort,
  type PhaseRunExecutionPorts,
} from "../src/phase-run-executor.js";

/**
 * Direct unit coverage of `executePhaseRunV1`/`buildPhaseInstructionV1` (Wave 7): the module's own
 * doc comment promises it "owns no durable state itself and issues no I/O beyond calling the
 * injected ports", so it is exercised here with fake `ParticipantAdapter`s over an in-memory
 * transcript -- no SQLite, no git mirror, no daemon -- exactly like
 * `packages/studio-room-adapters/test/moderator-integration.test.ts` does for the room system.
 */

const NOW = IsoInstantSchema.parse("2026-08-21T12:00:00.000Z");
const PROJECT_ID = ProjectIdSchema.parse("90000000-0000-4000-8000-000000000001");

const inertInputs: PhaseInputsReaderPort = {
  readDocsTree: () => [],
  readFile: () => null,
};

const inertRooms: PhaseRoomPort = {
  createPhaseRoom: () => {
    throw new Error("not exercised by these tests");
  },
};

function usage(
  tokensUsed: number,
  reported: ParticipantUsage["reported"] = null,
): ParticipantUsage {
  return { tokensUsed, reported, costUsdMicros: null };
}

function message(
  text: string,
  tokensUsed = 10,
  reported: ParticipantUsage["reported"] = null,
): ParticipantContributionResult {
  return { kind: "message", text, usage: usage(tokensUsed, reported) };
}

function fakeAdapter(
  provider: string,
  reply: (call: number) => ParticipantContributionResult | Promise<ParticipantContributionResult>,
): ParticipantAdapter & { calls: number } {
  const state = { calls: 0 };
  return {
    id: `fake.${provider}`,
    provider: provider as ParticipantAdapter["provider"],
    get calls() {
      return state.calls;
    },
    async contribute() {
      state.calls += 1;
      return await reply(state.calls);
    },
  };
}

function participantsPort(...adapters: readonly ParticipantAdapter[]): PhaseParticipantsPort {
  const byProvider = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  return { resolve: (provider) => byProvider.get(provider) ?? null };
}

function ports(participants: PhaseParticipantsPort): PhaseRunExecutionPorts {
  return {
    participants,
    inputs: inertInputs,
    rooms: inertRooms,
    standardRuleStatements: new Map(),
    mintRoomId: () => RoomIdSchema.parse("91000000-0000-4000-8000-000000000099"),
    signal: new AbortController().signal,
  };
}

/** The draft shape a `PhaseDefinitionV1` upsert accepts, wrapped into the full envelope zod
 *  requires -- mirrors `phase-run-command-runtime.test.ts`'s own `phase()` helper. Every Wave 7
 *  field (`prompt`/`topicScope`/`turnPolicy`/`tokenBudget`) defaults to `null` via the schema's own
 *  `.default(null)` whenever omitted, so a legacy-shaped `overrides` object never needs to name them. */
function phase(overrides: Readonly<Record<string, unknown>> = {}): PhaseDefinitionV1 {
  return {
    schemaVersion: 1,
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
    phaseId: "research",
    name: "Research",
    purpose: "Inventory prior art before proposing a design.",
    mode: "solo",
    cast: {
      participants: [{ provider: "ollama", persona: "researcher", readOnly: true }],
      coordinator: null,
      grader: null,
    },
    inputs: [],
    rules: { standard: [], yours: [], requiredOutput: [], acceptanceChecks: [] },
    outputs: [{ path: "docs/product/research.md", schema: null }],
    gates: [],
    budget: { estimateMinutes: 20, timeoutSeconds: 1_800 },
    // Explicit here (rather than relying on the schema's own `.default(null)`) because
    // `buildPhaseInstructionV1` is exercised directly in some tests below, bypassing
    // `PhaseDefinitionV1Schema.parse` (which `executePhaseRunV1` itself always applies) --
    // an omitted key would read as `undefined`, not `null`, and falsely trip the prepend checks.
    prompt: null,
    topicScope: null,
    turnPolicy: null,
    tokenBudget: null,
    ...overrides,
  } as unknown as PhaseDefinitionV1;
}

async function runExecutor(definition: PhaseDefinitionV1, participants: PhaseParticipantsPort) {
  return await executePhaseRunV1(
    {
      phase: definition,
      phaseId: definition.phaseId,
      phaseRunId: "92000000-0000-4000-8000-000000000001",
      projectId: PROJECT_ID as ProjectId,
      inputsOverride: null,
      now: NOW,
    },
    ports(participants),
  );
}

describe("buildPhaseInstructionV1 -- operator briefing prepend + topicScope", () => {
  it("prepends the operator briefing BEFORE the synthesized sections when prompt is set", () => {
    const instruction = buildPhaseInstructionV1(
      phase({ prompt: "Ship the smallest correct thing." }),
      PROJECT_ID,
      [],
      { inputs: inertInputs, standardRuleStatements: new Map() },
    );
    const briefingIndex = instruction.indexOf("Operator briefing:");
    const phaseLineIndex = instruction.indexOf("Phase: Research");
    expect(briefingIndex).toBeGreaterThanOrEqual(0);
    expect(phaseLineIndex).toBeGreaterThan(briefingIndex);
    expect(instruction).toContain("Operator briefing:\nShip the smallest correct thing.");
  });

  it("renders topicScope as a prompted line alongside rules.yours, never as an enforced rule", () => {
    const instruction = buildPhaseInstructionV1(
      phase({
        topicScope: "Only the iOS client, never the backend.",
        rules: {
          standard: [],
          yours: ["Prefer SwiftUI."],
          requiredOutput: [],
          acceptanceChecks: [],
        },
      }),
      PROJECT_ID,
      [],
      { inputs: inertInputs, standardRuleStatements: new Map() },
    );
    expect(instruction).toContain("Guidance (not machine-enforced, but follow it):");
    expect(instruction).toContain("- Topic scope: Only the iOS client, never the backend.");
    expect(instruction).toContain("- Prefer SwiftUI.");
    // The scope line precedes the free-text operator rules within the same section.
    expect(instruction.indexOf("Topic scope")).toBeLessThan(instruction.indexOf("Prefer SwiftUI"));
  });

  it("legacy-null-fields regression: no operator briefing and no topic-scope line when both are null", () => {
    const instruction = buildPhaseInstructionV1(phase(), PROJECT_ID, [], {
      inputs: inertInputs,
      standardRuleStatements: new Map(),
    });
    expect(instruction).not.toContain("Operator briefing:");
    expect(instruction).not.toContain("Topic scope:");
    expect(instruction.startsWith("Phase: Research")).toBe(true);
  });
});

// Every round-based test below names an explicit, separate coordinator (never `coordinator: null`
// with a single- or dual-member cast): `runRoundBasedMode`'s synthesis step falls back to
// `lastSpeaker` when no coordinator is named, which would otherwise add one extra, easy-to-miscount
// contribute() call onto whichever cast member happened to speak last. A dedicated coordinator
// keeps every cast member's call count attributable purely to the round loop under test.
function withCoordinator(): {
  coordinator: ParticipantAdapter & { calls: number };
  coordinatorRef: Readonly<{ provider: string; persona: string }>;
} {
  const coordinator = fakeAdapter("claude", () => message("# Decision\n"));
  return { coordinator, coordinatorRef: { provider: "claude", persona: "decider" } };
}

describe("turnPolicy.maxRounds -- overrides the legacy default, never exceeds it when null", () => {
  it("panel mode: a lower maxRounds stops the round loop before the legacy default (6)", async () => {
    const proposer = fakeAdapter("codex", (call) => message(`round ${String(call)}`));
    const { coordinator, coordinatorRef } = withCoordinator();
    const panelPhase = phase({
      mode: "panel",
      cast: {
        participants: [{ provider: "codex", persona: "proposer", readOnly: true }],
        coordinator: coordinatorRef,
        grader: null,
      },
      turnPolicy: { maxRounds: 2, perParticipantTurnCap: null },
    });
    const outcome = await runExecutor(panelPhase, participantsPort(proposer, coordinator));
    expect(outcome.kind).toBe("succeeded");
    // One speaker per panel round (no "pass"), so maxRounds=2 bounds the proposer to 2 calls.
    expect(proposer.calls).toBe(2);
    expect(coordinator.calls).toBe(1);
  });

  it("debate mode: a lower maxRounds stops the round-barrier loop the same way", async () => {
    const a = fakeAdapter("codex", (call) => message(`a says ${String(call)}`));
    const b = fakeAdapter("cursor", (call) => message(`b says ${String(call)}`));
    const { coordinator, coordinatorRef } = withCoordinator();
    const debatePhase = phase({
      mode: "debate",
      cast: {
        participants: [
          { provider: "codex", persona: "a", readOnly: true },
          { provider: "cursor", persona: "b", readOnly: true },
        ],
        coordinator: coordinatorRef,
        grader: null,
      },
      turnPolicy: { maxRounds: 2, perParticipantTurnCap: null },
    });
    const outcome = await runExecutor(debatePhase, participantsPort(a, b, coordinator));
    expect(outcome.kind).toBe("succeeded");
    // Every cast member speaks every round in debate mode: 2 rounds x 2 participants each.
    expect(a.calls).toBe(2);
    expect(b.calls).toBe(2);
    expect(coordinator.calls).toBe(1);
  });

  it("legacy regression: turnPolicy null keeps the exact pre-Wave-7 default of 6 rounds", async () => {
    const proposer = fakeAdapter("codex", (call) => message(`round ${String(call)}`));
    const { coordinator, coordinatorRef } = withCoordinator();
    const legacyPhase = phase({
      mode: "panel",
      cast: {
        participants: [{ provider: "codex", persona: "proposer", readOnly: true }],
        coordinator: coordinatorRef,
        grader: null,
      },
    });
    const outcome = await runExecutor(legacyPhase, participantsPort(proposer, coordinator));
    expect(outcome.kind).toBe("succeeded");
    expect(proposer.calls).toBe(6);
    expect(coordinator.calls).toBe(1);
  });
});

describe("turnPolicy.perParticipantTurnCap -- selectPanelSpeaker and the debate barrier", () => {
  it("panel mode: caps each participant's turns, ending the round loop once everyone has hit it", async () => {
    const a = fakeAdapter("codex", (call) => message(`a says ${String(call)}`));
    const b = fakeAdapter("cursor", (call) => message(`b says ${String(call)}`));
    const { coordinator, coordinatorRef } = withCoordinator();
    const cappedPhase = phase({
      mode: "panel",
      cast: {
        participants: [
          { provider: "codex", persona: "a", readOnly: true },
          { provider: "cursor", persona: "b", readOnly: true },
        ],
        coordinator: coordinatorRef,
        grader: null,
      },
      // maxRounds generous; perParticipantTurnCap is the real bound under test.
      turnPolicy: { maxRounds: 10, perParticipantTurnCap: 1 },
    });
    const outcome = await runExecutor(cappedPhase, participantsPort(a, b, coordinator));
    expect(outcome.kind).toBe("succeeded");
    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
    expect(coordinator.calls).toBe(1);
  });

  it("debate mode: caps each participant's turns in the round-barrier loop the same way", async () => {
    const a = fakeAdapter("codex", (call) => message(`a says ${String(call)}`));
    const b = fakeAdapter("cursor", (call) => message(`b says ${String(call)}`));
    const { coordinator, coordinatorRef } = withCoordinator();
    const cappedPhase = phase({
      mode: "debate",
      cast: {
        participants: [
          { provider: "codex", persona: "a", readOnly: true },
          { provider: "cursor", persona: "b", readOnly: true },
        ],
        coordinator: coordinatorRef,
        grader: null,
      },
      turnPolicy: { maxRounds: 10, perParticipantTurnCap: 2 },
    });
    const outcome = await runExecutor(cappedPhase, participantsPort(a, b, coordinator));
    expect(outcome.kind).toBe("succeeded");
    expect(a.calls).toBe(2);
    expect(b.calls).toBe(2);
    expect(coordinator.calls).toBe(1);
  });
});

describe("tokenBudget.maxTotalTokens -- aborts the round loop over KNOWN reported usage", () => {
  it("stops once the running sum of reported usage exceeds the budget, before maxRounds", async () => {
    // Each contribution reports 300 known tokens (150 in + 150 out); a 400-token budget is
    // exceeded partway through the second contribution's accounting, so the loop must not reach
    // a third round even though maxRounds (10) would otherwise allow it.
    const proposer = fakeAdapter("codex", (call) =>
      message(`round ${String(call)}`, 10, {
        inputTokens: 150,
        outputTokens: 150,
        cachedInputTokens: null,
      }),
    );
    const { coordinator, coordinatorRef } = withCoordinator();
    const budgetedPhase = phase({
      mode: "panel",
      cast: {
        participants: [{ provider: "codex", persona: "proposer", readOnly: true }],
        coordinator: coordinatorRef,
        grader: null,
      },
      turnPolicy: { maxRounds: 10, perParticipantTurnCap: null },
      tokenBudget: { maxTotalTokens: 400 },
    });
    const outcome = await runExecutor(budgetedPhase, participantsPort(proposer, coordinator));
    expect(outcome.kind).toBe("succeeded");
    // Round 1: 300 known tokens (<= 400, continues). Round 2: 600 known tokens (> 400, aborts).
    expect(proposer.calls).toBe(2);
    expect(coordinator.calls).toBe(1);
  });

  it("never aborts on unreported usage alone (honest-over-known-usage, not a fabricated count)", async () => {
    // No contribution ever reports usage (`reported: null`), so the known-usage sum never moves
    // off zero and the budget can never trip -- the loop runs its full legacy-default 6 rounds.
    const proposer = fakeAdapter("codex", (call) => message(`round ${String(call)}`, 10, null));
    const { coordinator, coordinatorRef } = withCoordinator();
    const budgetedPhase = phase({
      mode: "panel",
      cast: {
        participants: [{ provider: "codex", persona: "proposer", readOnly: true }],
        coordinator: coordinatorRef,
        grader: null,
      },
      tokenBudget: { maxTotalTokens: 1 },
    });
    const outcome = await runExecutor(budgetedPhase, participantsPort(proposer, coordinator));
    expect(outcome.kind).toBe("succeeded");
    expect(proposer.calls).toBe(6);
    expect(coordinator.calls).toBe(1);
  });
});

describe("legacy-null-fields regression -- byte-identical behavior with every Wave 7 field null", () => {
  it("solo mode: no operator briefing folded in, one contribution, succeeds exactly as before", async () => {
    const researcher = fakeAdapter("ollama", () => message("# Research\n\nSome findings.\n"));
    let seenInstruction = "";
    const capturingAdapter: ParticipantAdapter = {
      id: researcher.id,
      provider: researcher.provider,
      async contribute(context) {
        seenInstruction = context.roomCharter;
        return await researcher.contribute(context);
      },
    };
    const outcome = await runExecutor(phase(), participantsPort(capturingAdapter));
    expect(outcome.kind).toBe("succeeded");
    expect(researcher.calls).toBe(1);
    expect(seenInstruction).not.toContain("Operator briefing:");
    expect(seenInstruction.startsWith("Phase: Research")).toBe(true);
  });
});
