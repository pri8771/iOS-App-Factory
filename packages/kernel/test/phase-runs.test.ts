import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { computePhaseDefinitionDigest } from "../src/canonical-json.js";
import { createFactoryRepositories, openMigratedFactoryDatabase } from "../src/index.js";

const T0 = "2026-08-16T09:00:00.000Z";
const T1 = "2026-08-16T09:00:01.000Z";
const T2 = "2026-08-16T09:00:02.000Z";
const T3 = "2026-08-16T09:00:03.000Z";

const roots: string[] = [];

function uuid(value: number): string {
  return `85000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function database() {
  const root = mkdtempSync(join(tmpdir(), "app-factory-phase-runs-"));
  roots.push(root);
  return openMigratedFactoryDatabase(join(root, "factory.sqlite"));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function phaseDraft(phaseId: string, overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    phaseId,
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

function upsertPhase(
  repositories: ReturnType<typeof createFactoryRepositories>,
  commandId: string,
  phase: ReturnType<typeof phaseDraft>,
  expectedRevision: number | null,
  issuedAt = T0,
) {
  return repositories.phaseDefinitions.upsert({
    command: {
      schemaVersion: 1,
      commandId,
      issuedAt,
      origin: "system",
      kind: "phase.upsert",
      upsert: { phase, expectedRevision },
    },
    recordedAt: issuedAt,
    knownStandardRuleIds: [],
  });
}

describe("phase run repository", () => {
  it("creates a run at revision 0, queued, bound to the phase snapshot's exact digest", () => {
    const database_ = database();
    const repositories = createFactoryRepositories(database_);
    const { phase } = upsertPhase(repositories, uuid(1), phaseDraft("research"), null);

    const { run, duplicate } = repositories.phaseRuns.create({
      commandId: uuid(2),
      origin: "cli",
      issuedAt: T1,
      phaseRunId: uuid(3),
      presetId: null,
      phaseId: "research",
      projectId: "00000000-0000-4000-8000-000000000001",
      phaseSnapshot: phase,
      recordedAt: T1,
    });

    expect(duplicate).toBe(false);
    expect(run.state).toBe("queued");
    expect(run.revision).toBe(0);
    expect(run.startedAt).toBeNull();
    expect(run.finishedAt).toBeNull();
    expect(run.outcome).toBeNull();
    expect(run.phaseSnapshotDigest).toBe(computePhaseDefinitionDigest(phase));
    expect(repositories.phaseRuns.findById(uuid(3))).toEqual(run);
    database_.close();
  });

  it("is idempotent by commandId: a byte-identical replay returns the same run", () => {
    const database_ = database();
    const repositories = createFactoryRepositories(database_);
    const { phase } = upsertPhase(repositories, uuid(1), phaseDraft("research"), null);
    const input = {
      commandId: uuid(2),
      origin: "cli" as const,
      issuedAt: T1,
      phaseRunId: uuid(3),
      presetId: null,
      phaseId: "research",
      projectId: "00000000-0000-4000-8000-000000000001",
      phaseSnapshot: phase,
      recordedAt: T1,
    };

    const first = repositories.phaseRuns.create(input);
    const second = repositories.phaseRuns.create(input);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.run).toEqual(first.run);
    database_.close();
  });

  it("rejects a replayed commandId bound to different content", () => {
    const database_ = database();
    const repositories = createFactoryRepositories(database_);
    const { phase } = upsertPhase(repositories, uuid(1), phaseDraft("research"), null);
    const commandId = uuid(2);
    repositories.phaseRuns.create({
      commandId,
      origin: "cli",
      issuedAt: T1,
      phaseRunId: uuid(3),
      presetId: null,
      phaseId: "research",
      projectId: "00000000-0000-4000-8000-000000000001",
      phaseSnapshot: phase,
      recordedAt: T1,
    });

    expect(() =>
      repositories.phaseRuns.create({
        commandId,
        origin: "cli",
        issuedAt: T1,
        phaseRunId: uuid(4), // a different phaseRunId under the same commandId
        presetId: null,
        phaseId: "research",
        projectId: "00000000-0000-4000-8000-000000000001",
        phaseSnapshot: phase,
        recordedAt: T1,
      }),
    ).toThrow(/already bound to a different phase run/);
    database_.close();
  });

  it("advances queued -> running -> succeeded under revision-gated compare-and-set", () => {
    const database_ = database();
    const repositories = createFactoryRepositories(database_);
    const { phase } = upsertPhase(repositories, uuid(1), phaseDraft("research"), null);
    const { run: queued } = repositories.phaseRuns.create({
      commandId: uuid(2),
      origin: "cli",
      issuedAt: T1,
      phaseRunId: uuid(3),
      presetId: null,
      phaseId: "research",
      projectId: "00000000-0000-4000-8000-000000000001",
      phaseSnapshot: phase,
      recordedAt: T1,
    });

    const running = repositories.phaseRuns.transitionState({
      expectedRevision: 0,
      run: { ...queued, state: "running", revision: 1, startedAt: T2, updatedAt: T2 },
    });
    expect(running.state).toBe("running");
    expect(running.startedAt).toBe(T2);

    const succeeded = repositories.phaseRuns.transitionState({
      expectedRevision: 1,
      run: {
        ...running,
        state: "succeeded",
        revision: 2,
        outcome: { kind: "succeeded" },
        finishedAt: T3,
        updatedAt: T3,
      },
    });
    expect(succeeded.state).toBe("succeeded");
    expect(succeeded.outcome).toEqual({ kind: "succeeded" });
    expect(succeeded.finishedAt).toBe(T3);
    expect(repositories.phaseRuns.findById(queued.phaseRunId)?.state).toBe("succeeded");
    database_.close();
  });

  it("rejects a stale-revision transition", () => {
    const database_ = database();
    const repositories = createFactoryRepositories(database_);
    const { phase } = upsertPhase(repositories, uuid(1), phaseDraft("research"), null);
    const { run: queued } = repositories.phaseRuns.create({
      commandId: uuid(2),
      origin: "cli",
      issuedAt: T1,
      phaseRunId: uuid(3),
      presetId: null,
      phaseId: "research",
      projectId: "00000000-0000-4000-8000-000000000001",
      phaseSnapshot: phase,
      recordedAt: T1,
    });

    expect(() =>
      repositories.phaseRuns.transitionState({
        expectedRevision: 5,
        run: { ...queued, state: "running", revision: 1, startedAt: T2, updatedAt: T2 },
      }),
    ).toThrow(/revision conflict/);
    database_.close();
  });

  it("rejects an illegal state transition (queued cannot jump straight to succeeded)", () => {
    const database_ = database();
    const repositories = createFactoryRepositories(database_);
    const { phase } = upsertPhase(repositories, uuid(1), phaseDraft("research"), null);
    const { run: queued } = repositories.phaseRuns.create({
      commandId: uuid(2),
      origin: "cli",
      issuedAt: T1,
      phaseRunId: uuid(3),
      presetId: null,
      phaseId: "research",
      projectId: "00000000-0000-4000-8000-000000000001",
      phaseSnapshot: phase,
      recordedAt: T1,
    });

    expect(() =>
      repositories.phaseRuns.transitionState({
        expectedRevision: 0,
        run: {
          ...queued,
          state: "succeeded",
          revision: 1,
          startedAt: T2,
          outcome: { kind: "succeeded" },
          finishedAt: T2,
          updatedAt: T2,
        },
      }),
    ).toThrow(/illegal phase run transition queued -> succeeded/);
    database_.close();
  });

  it("binds a run to the phase's exact bytes: a later phase edit never changes a past run", () => {
    const database_ = database();
    const repositories = createFactoryRepositories(database_);
    const { phase: v0 } = upsertPhase(repositories, uuid(1), phaseDraft("research"), null);
    const { run } = repositories.phaseRuns.create({
      commandId: uuid(2),
      origin: "cli",
      issuedAt: T1,
      phaseRunId: uuid(3),
      presetId: null,
      phaseId: "research",
      projectId: "00000000-0000-4000-8000-000000000001",
      phaseSnapshot: v0,
      recordedAt: T1,
    });
    const originalDigest = run.phaseSnapshotDigest;

    // Edit the live phase definition: the purpose changes, so its digest changes.
    const { phase: v1 } = upsertPhase(
      repositories,
      uuid(4),
      phaseDraft("research", { purpose: "A materially different purpose." }),
      0,
      T2,
    );
    expect(computePhaseDefinitionDigest(v1)).not.toBe(originalDigest);

    // The already-created run's stored snapshot and digest are untouched.
    const reread = repositories.phaseRuns.findById(run.phaseRunId);
    expect(reread?.phaseSnapshotDigest).toBe(originalDigest);
    expect(reread?.phaseSnapshot.purpose).toBe(v0.purpose);
    expect(repositories.phaseDefinitions.findById("research")?.purpose).toBe(v1.purpose);
    database_.close();
  });

  it("lists runs awaiting human decision, scoped to one project", () => {
    const database_ = database();
    const repositories = createFactoryRepositories(database_);
    const { phase } = upsertPhase(
      repositories,
      uuid(1),
      phaseDraft("ready", { mode: "chat" }),
      null,
    );
    const projectA = "00000000-0000-4000-8000-0000000000a1";
    const projectB = "00000000-0000-4000-8000-0000000000b1";

    function createAndAwait(phaseRunId: string, commandId: string, projectId: string) {
      const { run: queued } = repositories.phaseRuns.create({
        commandId,
        origin: "cli",
        issuedAt: T1,
        phaseRunId,
        presetId: null,
        phaseId: "ready",
        projectId,
        phaseSnapshot: phase,
        recordedAt: T1,
      });
      const running = repositories.phaseRuns.transitionState({
        expectedRevision: 0,
        run: { ...queued, state: "running", revision: 1, startedAt: T2, updatedAt: T2 },
      });
      return repositories.phaseRuns.transitionState({
        expectedRevision: 1,
        run: { ...running, state: "awaiting-human", revision: 2, updatedAt: T3 },
      });
    }

    createAndAwait(uuid(10), uuid(20), projectA);
    createAndAwait(uuid(11), uuid(21), projectB);

    const awaitingA = repositories.phaseRuns.listAwaitingHumanByProject(projectA);
    expect(awaitingA).toHaveLength(1);
    expect(awaitingA[0]?.phaseRunId).toBe(uuid(10));
    expect(awaitingA[0]?.state).toBe("awaiting-human");
  });

  function createAwaitingRun(
    repositories: ReturnType<typeof createFactoryRepositories>,
    phase: Readonly<Record<string, unknown>>,
    phaseRunId: string,
    commandId: string,
  ) {
    const { run: queued } = repositories.phaseRuns.create({
      commandId,
      origin: "cli",
      issuedAt: T1,
      phaseRunId,
      presetId: null,
      phaseId: "ready",
      projectId: "00000000-0000-4000-8000-000000000001",
      phaseSnapshot: phase,
      recordedAt: T1,
    });
    const running = repositories.phaseRuns.transitionState({
      expectedRevision: 0,
      run: { ...queued, state: "running", revision: 1, startedAt: T2, updatedAt: T2 },
    });
    return repositories.phaseRuns.transitionState({
      expectedRevision: 1,
      run: { ...running, state: "awaiting-human", revision: 2, updatedAt: T3 },
    });
  }

  it("approve transitions awaiting-human -> succeeded", () => {
    const database_ = database();
    const repositories = createFactoryRepositories(database_);
    const { phase } = upsertPhase(
      repositories,
      uuid(1),
      phaseDraft("ready", { mode: "chat" }),
      null,
    );
    const awaiting = createAwaitingRun(repositories, phase, uuid(3), uuid(2));

    const approved = repositories.phaseRuns.transitionState({
      expectedRevision: 2,
      run: {
        ...awaiting,
        state: "succeeded",
        revision: 3,
        outcome: { kind: "succeeded" },
        finishedAt: "2026-08-16T09:00:04.000Z",
        updatedAt: "2026-08-16T09:00:04.000Z",
      },
    });
    expect(approved.state).toBe("succeeded");
    database_.close();
  });

  it("reject transitions awaiting-human -> failed with the rejection recorded", () => {
    const database_ = database();
    const repositories = createFactoryRepositories(database_);
    const { phase } = upsertPhase(
      repositories,
      uuid(1),
      phaseDraft("ready", { mode: "chat" }),
      null,
    );
    const awaiting = createAwaitingRun(repositories, phase, uuid(3), uuid(2));

    const rejected = repositories.phaseRuns.transitionState({
      expectedRevision: 2,
      run: {
        ...awaiting,
        state: "failed",
        revision: 3,
        outcome: { kind: "failed", code: "rejected", summary: "Not ready for release." },
        finishedAt: "2026-08-16T09:00:04.000Z",
        updatedAt: "2026-08-16T09:00:04.000Z",
      },
    });
    expect(rejected.state).toBe("failed");
    expect(rejected.outcome).toEqual({
      kind: "failed",
      code: "rejected",
      summary: "Not ready for release.",
    });
    database_.close();
  });
});
