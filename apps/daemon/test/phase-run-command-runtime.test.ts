import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  IsoInstantSchema,
  ProjectIdSchema,
  RoomHumanHandleSchema,
  RoomMessageIdSchema,
  type CommandRequestV1,
  type PhaseDefinitionV1,
  type ProjectId,
} from "@app-factory/contracts";
import { GitWorkspaceManager } from "@app-factory/git-workspace";
import { createFactoryRepositories, openMigratedFactoryDatabase } from "@app-factory/kernel";
import { RoomRepository, type RoomProviderCatalogPort } from "@app-factory/studio-rooms";
import type {
  ParticipantAdapter,
  ParticipantContributionResult,
} from "@app-factory/studio-room-adapters";
import { afterEach, describe, expect, it } from "vitest";

import {
  createPhaseInputsReaderPort,
  createPhaseOutputMirrorPort,
} from "../src/phase-output-mirror.js";
import {
  approvePhaseRunV1,
  rejectPhaseRunV1,
  runPhaseV1,
  type PhaseRunCommandDependencies,
} from "../src/phase-run-command-runtime.js";
import type { PhaseParticipantsPort, PhaseRoomPort } from "../src/phase-run-executor.js";

const GIT = "/usr/bin/git";
const NOW = IsoInstantSchema.parse("2026-08-16T12:00:00.000Z");
const PROJECT_ID = ProjectIdSchema.parse("90000000-0000-4000-8000-000000000001");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-08-16T12:00:00Z",
      GIT_AUTHOR_EMAIL: "factory-tests@example.invalid",
      GIT_AUTHOR_NAME: "Factory Tests",
      GIT_COMMITTER_DATE: "2026-08-16T12:00:00Z",
      GIT_COMMITTER_EMAIL: "factory-tests@example.invalid",
      GIT_COMMITTER_NAME: "Factory Tests",
      GIT_TERMINAL_PROMPT: "0",
      LC_ALL: "C",
    },
    shell: false,
  });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

/**
 * Real SQLite (a temp file, migrated) + a real git-workspace mirror (an ensured mirror of a scratch
 * source repo, keyed by `PROJECT_ID` doubling as its `repositoryId`) — the "fake participants over
 * real SQLite [and a real temp mirror]" shape the phase-runner tests require.
 */
function harness() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-phase-run-")));
  roots.push(root);

  const sourceRoot = join(root, "source");
  mkdirSync(sourceRoot, { recursive: true });
  git(sourceRoot, ["init", "--initial-branch=main"]);
  mkdirSync(join(sourceRoot, "docs"), { recursive: true });
  writeFileSync(join(sourceRoot, "docs", "README.md"), "# Project docs\n");
  git(sourceRoot, ["add", "--all"]);
  git(sourceRoot, ["commit", "-m", "initial"]);

  const gitRuntimeRoot = join(root, "git-runtime");
  const gitWorkspace = new GitWorkspaceManager({ gitExecutable: GIT });
  gitWorkspace.ensureMirror({
    sourceRepositoryPath: sourceRoot,
    runtimeRoot: gitRuntimeRoot,
    repositoryId: PROJECT_ID,
  });

  const database = openMigratedFactoryDatabase(join(root, "factory.sqlite"));
  const repositories = createFactoryRepositories(database);
  const roomRepository = new RoomRepository(database);

  // Seam (c) of the project-registry task: `createPhaseOutputMirrorPort`/`createPhaseInputsReaderPort`
  // resolve a project's docs directory and mirror binding from the Project Registry, so the fixture
  // project must actually be registered before any phase.run test can commit or read its outputs.
  repositories.projectRegistry.upsert({
    command: {
      schemaVersion: 1,
      commandId: "90000000-0000-4000-8000-0000000000f1",
      issuedAt: NOW,
      origin: "system",
      kind: "project.register",
      register: {
        project: {
          projectId: PROJECT_ID,
          slug: "test-project",
          displayName: "Test Project",
          sourceRepositoryPath: sourceRoot,
          repositoryId: PROJECT_ID,
          standardVersion: null,
          policyLockDigest: null,
          docsLayout: { docsDir: "docs" },
        },
        expectedRevision: null,
      },
    },
    recordedAt: NOW,
  });

  const outputMirror = createPhaseOutputMirrorPort({
    gitRuntimeRoot,
    gitExecutable: GIT,
    projectRegistry: repositories.projectRegistry,
  });
  const inputs = createPhaseInputsReaderPort({
    gitRuntimeRoot,
    gitExecutable: GIT,
    projectRegistry: repositories.projectRegistry,
  });

  return { root, gitRuntimeRoot, database, repositories, roomRepository, outputMirror, inputs };
}

function fakeParticipant(
  provider: string,
  reply: (
    persona: string,
    call: number,
  ) => ParticipantContributionResult | Promise<ParticipantContributionResult>,
): ParticipantAdapter & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: `fake.${provider}`,
    provider: provider as ParticipantAdapter["provider"],
    calls,
    async contribute(context) {
      calls.push(context.persona);
      return await reply(context.persona, calls.length);
    },
  };
}

function message(
  text: string,
  tokensUsed = 10,
  reported: Readonly<{
    inputTokens: number | null;
    outputTokens: number | null;
    cachedInputTokens: number | null;
  }> | null = null,
): ParticipantContributionResult {
  return { kind: "message", text, usage: { tokensUsed, reported, costUsdMicros: null } };
}

function participantsPort(...adapters: readonly ParticipantAdapter[]): PhaseParticipantsPort {
  const byProvider = new Map(adapters.map((adapter) => [adapter.provider, adapter]));
  return { resolve: (provider) => byProvider.get(provider) ?? null };
}

/** Every test provider resolves to the SAME fake family/model -- the fixture participant keys
 *  ("codex", "cursor", "claude", "ollama", ...) are arbitrary test strings, not real provider
 *  families, so this only needs to exercise the wiring, never real-world attribution accuracy. */
function fakeProviderCatalog(): RoomProviderCatalogPort {
  return { resolve: (provider) => ({ family: "ollama", model: `${provider}-test-model` }) };
}

function dependencies(
  harnessValue: ReturnType<typeof harness>,
  participants: PhaseParticipantsPort,
  roomsOverride?: PhaseRoomPort,
): PhaseRunCommandDependencies {
  const rooms: PhaseRoomPort = roomsOverride ?? {
    createPhaseRoom(input) {
      harnessValue.roomRepository.createRoom(
        {
          roomId: input.roomId,
          title: input.title,
          projectId: input.projectId,
          unattendedEnabled: false,
          agentCooldownEvents: 3,
          participants: input.participants,
          budget: {
            dailyCeilingTokens: 200_000,
            unattendedDailyCeilingTokens: 0,
            maxTokensPerReply: 4_000,
          },
        },
        input.now,
      );
      harnessValue.roomRepository.appendHumanMessage({
        roomId: input.roomId,
        messageId: RoomMessageIdSchema.parse(`00000000-0000-4000-8000-${input.roomId.slice(-12)}`),
        handle: RoomHumanHandleSchema.parse("phase-runner"),
        body: input.purpose,
        now: input.now,
      });
    },
  };
  return {
    outputMirror: harnessValue.outputMirror,
    executionPorts: {
      participants,
      inputs: harnessValue.inputs,
      rooms,
      standardRuleStatements: new Map([["rule.new.scope-before-breadth", "Scope before breadth."]]),
    },
    createTimeoutSignal: (timeoutSeconds) => AbortSignal.timeout(timeoutSeconds * 1_000),
    providerCatalog: fakeProviderCatalog(),
  };
}

let uuidCounter = 0;
/**
 * Doubles as an ad-hoc unique-ID minter (no args — a fresh counter-based UUID every call, used for
 * test fixture commandIds) and as the real `DaemonRuntimeIdFactory` `runPhaseV1` calls internally
 * (`purpose`/`commandId` given — deterministic per pair, so a replayed commandId derives the exact
 * same `phaseRunId`/`roomId` both times, matching the real daemon's own deterministic derivation).
 */
function idFactory(purpose?: string, commandId?: string): string {
  if (purpose === undefined) {
    uuidCounter += 1;
    const suffix = uuidCounter.toString(16).padStart(12, "0");
    return `91000000-0000-4000-8000-${suffix}`;
  }
  const digest = createHash("sha256")
    .update(`${purpose}\0${commandId ?? ""}`)
    .digest("hex");
  return `92000000-0000-4000-8000-${digest.slice(0, 12)}`;
}

/** The draft shape `phaseDefinitions.upsert`'s `upsert.phase` accepts (no envelope fields). */
function phaseDraft(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    phaseId: "research",
    name: "Research",
    purpose: "Inventory prior art before proposing a design.",
    mode: "solo",
    cast: {
      participants: [{ provider: "ollama", persona: "researcher", readOnly: true }],
      coordinator: null,
      grader: null,
    },
    inputs: ["docs"],
    rules: { standard: [], yours: [], requiredOutput: [], acceptanceChecks: [] },
    outputs: [{ path: "docs/product/research.md", schema: null }],
    gates: [],
    budget: { estimateMinutes: 20, timeoutSeconds: 1_800 },
    ...overrides,
  };
}

/** The full envelope shape a preset embeds (`PhaseDefinitionV1`) or a run's `phaseSnapshot` is. */
function phase(overrides: Readonly<Record<string, unknown>> = {}): PhaseDefinitionV1 {
  return {
    schemaVersion: 1,
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...phaseDraft(overrides),
  } as unknown as PhaseDefinitionV1;
}

function runRequest(commandId: string, projectId: ProjectId = PROJECT_ID) {
  return {
    schemaVersion: 1,
    commandId,
    issuedAt: NOW,
    origin: "cli",
    operation: "phase.run",
    payload: { presetId: null, phaseId: "research", projectId, inputsOverride: null },
  } as unknown as CommandRequestV1 as Extract<CommandRequestV1, { operation: "phase.run" }>;
}

/** Reads a committed output file back out of the mirror at the given branch, for assertions. */
function readCommittedFile(gitRuntimeRoot: string, path: string, branch: string): string {
  const mirrorPath = join(gitRuntimeRoot, "mirrors", `${PROJECT_ID}.git`);
  return git(mirrorPath, ["show", `${branch}:${path}`]);
}

describe("phase.run — solo mode", () => {
  it("commits the participant's output to the project's mirror at the declared path", async () => {
    const h = harness();
    const researcher = fakeParticipant("ollama", () => message("# Research\n\nSome findings.\n"));
    h.repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: phaseDraft(), expectedRevision: null },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });

    const result = await runPhaseV1(
      h.repositories,
      runRequest(idFactory()),
      NOW,
      idFactory,
      dependencies(h, participantsPort(researcher)),
    );
    if (result.operation !== "phase.run") throw new Error("unexpected operation");
    const { run } = result;

    expect(run.state).toBe("succeeded");
    expect(run.outcome).toEqual({ kind: "succeeded" });
    expect(run.tokenUsage).toEqual({ totalTokens: 10 });
    expect(run.outputs).toHaveLength(1);
    expect(run.outputs[0]?.path).toBe("docs/product/research.md");
    expect(run.outputs[0]?.evidence.branch).toBe(`factory/phase/research/${run.phaseRunId}`);
    expect(researcher.calls).toEqual(["researcher"]);

    const output = run.outputs[0];
    if (output === undefined) throw new Error("expected one committed output");
    const committed = readCommittedFile(
      h.gitRuntimeRoot,
      "docs/product/research.md",
      output.evidence.branch,
    );
    expect(committed).toBe("# Research\n\nSome findings.");
  });

  it("records one honest token_usage row (source: phase) per dispatched contribution", async () => {
    const h = harness();
    const researcher = fakeParticipant("ollama", () =>
      message("# Research\n\nSome findings.\n", 42, {
        inputTokens: 100,
        outputTokens: 50,
        cachedInputTokens: null,
      }),
    );
    h.repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: phaseDraft(), expectedRevision: null },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });

    const result = await runPhaseV1(
      h.repositories,
      runRequest(idFactory()),
      NOW,
      idFactory,
      dependencies(h, participantsPort(researcher)),
    );
    if (result.operation !== "phase.run") throw new Error("unexpected operation");
    expect(result.run.state).toBe("succeeded");

    const summary = h.repositories.tokenUsage.summarize({ sinceDays: 1, asOf: NOW });
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0]).toMatchObject({
      providerKey: "ollama",
      model: "ollama-test-model",
      inputTokens: 100,
      outputTokens: 50,
      unreportedCount: 0,
    });
  });

  it("fails closed when the resolved provider has no configured adapter", async () => {
    const h = harness();
    h.repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: phaseDraft(), expectedRevision: null },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });

    const result = await runPhaseV1(
      h.repositories,
      runRequest(idFactory()),
      NOW,
      idFactory,
      dependencies(h, participantsPort()),
    );
    if (result.operation !== "phase.run") throw new Error("unexpected operation");
    expect(result.run.state).toBe("failed");
    expect(result.run.outcome).toMatchObject({ kind: "failed", code: "participant-error" });
    expect(result.run.outputs).toEqual([]);
  });

  it("resolves the phase from a preset's own embedded snapshot when presetId is given", async () => {
    const h = harness();
    const researcher = fakeParticipant("ollama", () => message("preset-bound content\n"));
    h.repositories.phasePresets.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "preset.upsert",
        upsert: {
          preset: {
            presetId: "sample-preset",
            name: "Sample",
            phases: [phase()],
            appliesTo: null,
          },
          expectedRevision: null,
        },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });

    const request = {
      ...runRequest(idFactory()),
      payload: {
        presetId: "sample-preset",
        phaseId: "research",
        projectId: PROJECT_ID,
        inputsOverride: null,
      },
    } as unknown as Extract<CommandRequestV1, { operation: "phase.run" }>;
    const result = await runPhaseV1(
      h.repositories,
      request,
      NOW,
      idFactory,
      dependencies(h, participantsPort(researcher)),
    );
    if (result.operation !== "phase.run") throw new Error("unexpected operation");
    expect(result.run.state).toBe("succeeded");
    expect(result.run.presetId).toBe("sample-preset");
  });
});

describe("phase.run — panel mode", () => {
  it("runs bounded rounds across the cast, then the coordinator synthesizes the final output", async () => {
    const h = harness();
    const proposerA = fakeParticipant("codex", (persona, call) =>
      message(`A says ${String(call)}`),
    );
    const proposerB = fakeParticipant("cursor", (persona, call) =>
      message(`B says ${String(call)}`),
    );
    const coordinator = fakeParticipant("claude", () => message("# Decision\n\nSynthesized.\n"));

    const panelPhase = phaseDraft({
      mode: "panel",
      cast: {
        participants: [
          { provider: "codex", persona: "proposer-a", readOnly: true },
          { provider: "cursor", persona: "proposer-b", readOnly: true },
        ],
        coordinator: { provider: "claude", persona: "decider" },
        grader: null,
      },
      outputs: [{ path: "docs/architecture/decision.md", schema: null }],
    });
    h.repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: panelPhase, expectedRevision: null },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });

    const request = {
      ...runRequest(idFactory()),
      payload: {
        presetId: null,
        phaseId: panelPhase.phaseId,
        projectId: PROJECT_ID,
        inputsOverride: null,
      },
    } as unknown as Extract<CommandRequestV1, { operation: "phase.run" }>;
    const result = await runPhaseV1(
      h.repositories,
      request,
      NOW,
      idFactory,
      dependencies(h, participantsPort(proposerA, proposerB, coordinator)),
    );
    if (result.operation !== "phase.run") throw new Error("unexpected operation");
    const { run } = result;

    expect(run.state).toBe("succeeded");
    expect(run.outputs[0]?.path).toBe("docs/architecture/decision.md");
    const panelOutput = run.outputs[0];
    if (panelOutput === undefined) throw new Error("expected one committed output");
    const committed = readCommittedFile(
      h.gitRuntimeRoot,
      "docs/architecture/decision.md",
      panelOutput.evidence.branch,
    );
    expect(committed).toBe("# Decision\n\nSynthesized.");
    // Both panelists spoke across the bounded rounds; the coordinator spoke exactly once (synthesis).
    expect(proposerA.calls.length + proposerB.calls.length).toBeGreaterThan(0);
    expect(coordinator.calls).toHaveLength(1);
  });
});

describe("phase.run — chat mode", () => {
  it("creates a persistent room, seeds the phase's purpose, and awaits a human — for a real cast", async () => {
    const h = harness();
    const chatPhase = phaseDraft({
      mode: "chat",
      cast: {
        participants: [{ provider: "claude", persona: "pm", readOnly: true }],
        coordinator: null,
        grader: null,
      },
      outputs: [],
      gates: [],
    });
    h.repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: chatPhase, expectedRevision: null },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });

    const request = {
      ...runRequest(idFactory()),
      payload: {
        presetId: null,
        phaseId: chatPhase.phaseId,
        projectId: PROJECT_ID,
        inputsOverride: null,
      },
    } as unknown as Extract<CommandRequestV1, { operation: "phase.run" }>;
    const result = await runPhaseV1(
      h.repositories,
      request,
      NOW,
      idFactory,
      dependencies(h, participantsPort()),
    );
    if (result.operation !== "phase.run") throw new Error("unexpected operation");
    const { run } = result;

    expect(run.state).toBe("awaiting-human");
    const roomId = run.roomId;
    if (roomId === null) throw new Error("expected a room to be created");
    const room = h.roomRepository.requireRoom(roomId);
    expect(room.participants.map((participant) => participant.persona)).toContain("pm");
    const messages = h.roomRepository.listMessages(room.roomId, 0, 10);
    expect(messages[0]?.kind).toBe("message");
    expect(messages[0]).toMatchObject({ body: chatPhase.purpose });
  });

  it("is a bare human gate (no room) when the cast is empty, per the seed preset's checkpoint phases", async () => {
    const h = harness();
    const gatePhase = phaseDraft({
      phaseId: "ready",
      mode: "chat",
      cast: { participants: [], coordinator: null, grader: null },
      outputs: [],
      gates: ["build", "tests"],
    });
    h.repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: gatePhase, expectedRevision: null },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });

    const request = {
      ...runRequest(idFactory()),
      payload: { presetId: null, phaseId: "ready", projectId: PROJECT_ID, inputsOverride: null },
    } as unknown as Extract<CommandRequestV1, { operation: "phase.run" }>;
    const result = await runPhaseV1(
      h.repositories,
      request,
      NOW,
      idFactory,
      dependencies(h, participantsPort()),
    );
    if (result.operation !== "phase.run") throw new Error("unexpected operation");
    expect(result.run.state).toBe("awaiting-human");
    expect(result.run.roomId).toBeNull();
  });
});

describe("phase.run — gates on a working phase", () => {
  it("stops at awaiting-human once outputs are committed, for a non-chat phase with declared gates", async () => {
    const h = harness();
    const researcher = fakeParticipant("ollama", () => message("gated content\n"));
    const gatedPhase = phaseDraft({ gates: ["build"] });
    h.repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: gatedPhase, expectedRevision: null },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });

    const result = await runPhaseV1(
      h.repositories,
      runRequest(idFactory()),
      NOW,
      idFactory,
      dependencies(h, participantsPort(researcher)),
    );
    if (result.operation !== "phase.run") throw new Error("unexpected operation");
    expect(result.run.state).toBe("awaiting-human");
    expect(result.run.outputs).toHaveLength(1);
    expect(result.run.outcome).toBeNull();
    expect(result.run.finishedAt).toBeNull();
  });
});

describe("phase.run — grader", () => {
  it("fails the run with the grader's verdict recorded when the grader requests changes", async () => {
    const h = harness();
    const researcher = fakeParticipant("ollama", () => message("draft content\n"));
    const grader = fakeParticipant("claude", () =>
      message("VERDICT: changes-required\nFINDING: Missing a citations section.\n"),
    );
    const gradedPhase = phaseDraft({
      cast: {
        participants: [{ provider: "ollama", persona: "researcher", readOnly: true }],
        coordinator: null,
        grader: { provider: "claude", persona: "grader" },
      },
      rules: {
        standard: [],
        yours: [],
        requiredOutput: [],
        acceptanceChecks: ["Must cite at least one source."],
      },
    });
    h.repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: gradedPhase, expectedRevision: null },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });

    const result = await runPhaseV1(
      h.repositories,
      runRequest(idFactory()),
      NOW,
      idFactory,
      dependencies(h, participantsPort(researcher, grader)),
    );
    if (result.operation !== "phase.run") throw new Error("unexpected operation");
    const { run } = result;

    expect(run.state).toBe("failed");
    expect(run.outcome).toMatchObject({ kind: "failed", code: "grader-changes-required" });
    expect(run.graderVerdict).toEqual({
      verdict: "changes-required",
      findings: ["Missing a citations section."],
    });
    // The draft is still committed as evidence of what was tried, even though it was rejected.
    expect(run.outputs).toHaveLength(1);
  });

  it("succeeds when the grader passes", async () => {
    const h = harness();
    const researcher = fakeParticipant("ollama", () => message("good content\n"));
    const grader = fakeParticipant("claude", () => message("VERDICT: pass\n"));
    const gradedPhase = phaseDraft({
      cast: {
        participants: [{ provider: "ollama", persona: "researcher", readOnly: true }],
        coordinator: null,
        grader: { provider: "claude", persona: "grader" },
      },
    });
    h.repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: gradedPhase, expectedRevision: null },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });

    const result = await runPhaseV1(
      h.repositories,
      runRequest(idFactory()),
      NOW,
      idFactory,
      dependencies(h, participantsPort(researcher, grader)),
    );
    if (result.operation !== "phase.run") throw new Error("unexpected operation");
    expect(result.run.state).toBe("succeeded");
    expect(result.run.graderVerdict).toEqual({ verdict: "pass", findings: [] });
  });
});

describe("phase.approve / phase.reject", () => {
  async function createAwaitingRun(h: ReturnType<typeof harness>) {
    const gatePhase = phaseDraft({
      phaseId: "ready",
      mode: "chat",
      cast: { participants: [], coordinator: null, grader: null },
      outputs: [],
      gates: ["build"],
    });
    h.repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: gatePhase, expectedRevision: null },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });
    const request = {
      ...runRequest(idFactory()),
      payload: { presetId: null, phaseId: "ready", projectId: PROJECT_ID, inputsOverride: null },
    } as unknown as Extract<CommandRequestV1, { operation: "phase.run" }>;
    const result = await runPhaseV1(
      h.repositories,
      request,
      NOW,
      idFactory,
      dependencies(h, participantsPort()),
    );
    if (result.operation !== "phase.run") throw new Error("unexpected operation");
    return result.run;
  }

  it("approve transitions awaiting-human -> succeeded", async () => {
    const h = harness();
    const awaiting = await createAwaitingRun(h);
    const approveRequest = {
      schemaVersion: 1,
      commandId: idFactory(),
      issuedAt: NOW,
      origin: "cli",
      operation: "phase.approve",
      payload: { phaseRunId: awaiting.phaseRunId, reason: null },
    } as unknown as CommandRequestV1 as Extract<CommandRequestV1, { operation: "phase.approve" }>;
    const result = approvePhaseRunV1(
      h.repositories,
      approveRequest,
      IsoInstantSchema.parse("2026-08-16T12:05:00.000Z"),
    );
    if (result.operation !== "phase.approve") throw new Error("unexpected operation");
    expect(result.run.state).toBe("succeeded");
    expect(result.run.outcome).toEqual({ kind: "succeeded" });
  });

  it("reject transitions awaiting-human -> failed with the reason recorded", async () => {
    const h = harness();
    const awaiting = await createAwaitingRun(h);
    const rejectRequest = {
      schemaVersion: 1,
      commandId: idFactory(),
      issuedAt: NOW,
      origin: "cli",
      operation: "phase.reject",
      payload: { phaseRunId: awaiting.phaseRunId, reason: "Build is red." },
    } as unknown as CommandRequestV1 as Extract<CommandRequestV1, { operation: "phase.reject" }>;
    const result = rejectPhaseRunV1(
      h.repositories,
      rejectRequest,
      IsoInstantSchema.parse("2026-08-16T12:05:00.000Z"),
    );
    if (result.operation !== "phase.reject") throw new Error("unexpected operation");
    expect(result.run.state).toBe("failed");
    expect(result.run.outcome).toMatchObject({ code: "rejected", summary: "Build is red." });
  });
});

describe("phase.run — idempotent replay", () => {
  it("replaying the same commandId returns the already-created run without re-invoking a participant", async () => {
    const h = harness();
    const researcher = fakeParticipant("ollama", () => message("content\n"));
    h.repositories.phaseDefinitions.upsert({
      command: {
        schemaVersion: 1,
        commandId: idFactory(),
        issuedAt: NOW,
        origin: "system",
        kind: "phase.upsert",
        upsert: { phase: phaseDraft(), expectedRevision: null },
      },
      recordedAt: NOW,
      knownStandardRuleIds: [],
    });
    const request = runRequest(idFactory());
    const deps = dependencies(h, participantsPort(researcher));

    const first = await runPhaseV1(h.repositories, request, NOW, idFactory, deps);
    const second = await runPhaseV1(h.repositories, request, NOW, idFactory, deps);
    if (first.operation !== "phase.run" || second.operation !== "phase.run") {
      throw new Error("unexpected operation");
    }
    expect(second.run).toEqual(first.run);
    expect(researcher.calls).toHaveLength(1);
  });
});
