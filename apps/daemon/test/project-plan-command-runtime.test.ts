import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CommandRequestV1Schema,
  RepositoryIdSchema,
  type CommandRequestV1,
  type CommandResultV1,
  type ExecutionAttemptV1,
} from "@app-factory/contracts";
import {
  GitWorkspaceManager,
  type BrokerCommitRecord,
  type FactoryMirror,
  type ImmutableMirrorBinding,
} from "@app-factory/git-workspace";
import {
  createFactoryRepositories,
  openMigratedFactoryDatabase,
  ProjectRegistryRepository,
  type FactoryRepositories,
} from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";
import {
  createGitWorkspaceProjectPlanMirrorPortV1,
  createRegistryBackedProjectPlanMirrorPortV1,
} from "../src/project-plan-mirror-port.js";

/**
 * The Planner (`plan.propose`/`plan.edit`/`plan.approve`/`plan.execute`/`plan.approve-gate`/
 * `plan.tick`), driven end-to-end through the real `openDaemonCommandRuntime` handler exactly like
 * `phase-command-runtime.test.ts` drives `preset.upsert`/`phase.upsert` -- not isolated calls into
 * `project-plan-command-runtime.ts`.
 */

const T0 = "2026-08-16T12:00:00.000Z";
const LEASE_ACQUIRED_AT = "2026-08-16T12:01:00.000Z";
const REQUEST_ID = "86000000-0000-4000-8000-000000000010";
const GIT = "/usr/bin/git";

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];
const gitTempRoots: string[] = [];

function commandId(index: number): string {
  return `86000000-0000-4000-8000-${(200 + index).toString().padStart(12, "0")}`;
}

function request(
  operation: CommandRequestV1["operation"],
  id: string,
  payload: unknown,
  issuedAt = T0,
): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId: id,
    issuedAt,
    origin: "cli",
    operation,
    payload,
  });
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-plan-commands-"));
  roots.push(root);
  return root;
}

async function invoke(
  runtime: DaemonCommandRuntime,
  command: CommandRequestV1,
): Promise<CommandResultV1> {
  return await runtime.handler(command, { requestId: REQUEST_ID });
}

function unwrap<Operation extends CommandResultV1["operation"]>(
  result: CommandResultV1,
  operation: Operation,
): Extract<CommandResultV1, { operation: Operation }> {
  if (result.operation !== operation) {
    throw new Error(`Expected ${operation}, got ${result.operation}`);
  }
  return result as Extract<CommandResultV1, { operation: Operation }>;
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  for (const root of gitTempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// A small, controlled two-phase preset: one plain task phase, then a gate phase. Deliberately
// avoids a `build` phase so `plan.propose` yields exactly one task item and one gate item -- the
// execute-chaining test then adds a second task item by hand to get the exact "2 tasks + 1 gate"
// shape the task brief asks for, without depending on the seeded 13-item iOS preset.
// ---------------------------------------------------------------------------

function chatPhase(phaseId: string, name: string, gates: readonly string[]) {
  return {
    schemaVersion: 1,
    phaseId,
    name,
    purpose: `Human checkpoint: ${name}.`,
    mode: "chat",
    cast: { participants: [], coordinator: null, grader: null },
    inputs: ["docs"],
    rules: { standard: [], yours: [], requiredOutput: [], acceptanceChecks: [] },
    outputs: [],
    gates,
    budget: { estimateMinutes: null, timeoutSeconds: 900 },
    revision: 0,
    createdAt: T0,
    updatedAt: T0,
  };
}

function taskPhase(phaseId: string, name: string) {
  return {
    schemaVersion: 1,
    phaseId,
    name,
    purpose: `Do the work for ${name}.`,
    mode: "solo",
    cast: {
      participants: [{ provider: "claude", persona: `${phaseId}-worker`, readOnly: true }],
      coordinator: null,
      grader: null,
    },
    inputs: ["docs"],
    rules: { standard: [], yours: [], requiredOutput: [], acceptanceChecks: [] },
    outputs: [],
    gates: [],
    budget: { estimateMinutes: 20, timeoutSeconds: 1_800 },
    revision: 0,
    createdAt: T0,
    updatedAt: T0,
  };
}

async function upsertSmallPreset(runtime: DaemonCommandRuntime, presetId: string) {
  const result = await invoke(
    runtime,
    request("preset.upsert", commandId(0), {
      preset: {
        presetId,
        name: "Small Two-Phase Preset",
        phases: [taskPhase("alpha", "Alpha"), chatPhase("ready", "Ready", ["build"])],
        appliesTo: null,
      },
      expectedRevision: null,
    }),
  );
  return unwrap(result, "preset.upsert");
}

describe("plan.propose", () => {
  it("builds a deterministic item list from the seeded iOS preset", async () => {
    const runtime = await openRuntime(await makeRoot());
    const result = unwrap(
      await invoke(
        runtime,
        request("plan.propose", commandId(1), {
          brief: { title: "Sample App", oneLiner: "A sample iOS app.", constraints: ["xcodegen"] },
          presetId: "ios-app-standard-0.4.0",
          projectId: null,
          repositoryId: null,
          source: null,
        }),
      ),
      "plan.propose",
    );
    expect(result.plan.state).toBe("draft");
    expect(result.plan.revision).toBe(0);
    expect(
      result.plan.items.map((item) => ({
        itemId: item.itemId,
        kind: item.kind,
        phase: item.phase,
      })),
    ).toEqual([
      { itemId: "contract", kind: "task", phase: "contract" },
      { itemId: "research", kind: "task", phase: "research" },
      { itemId: "brief", kind: "task", phase: "brief" },
      { itemId: "design", kind: "task", phase: "design" },
      { itemId: "architecture", kind: "task", phase: "architecture" },
      { itemId: "plan", kind: "task", phase: "plan" },
      { itemId: "ready", kind: "gate", phase: "ready" },
      { itemId: "build-seed-repo", kind: "task", phase: "build" },
      { itemId: "build-domain-model", kind: "task", phase: "build" },
      { itemId: "build-primary-screen", kind: "task", phase: "build" },
      { itemId: "build-states", kind: "task", phase: "build" },
      { itemId: "review", kind: "task", phase: "review" },
      { itemId: "release", kind: "gate", phase: "release" },
    ]);
    // Exactly one gate before build starts -- the scaffold gate -- and one after: the gate-density
    // rule this same shape is tested against structurally in packages/contracts/test/project-plan.test.ts.
    expect(
      result.plan.items.filter((item) => item.kind === "gate").map((item) => item.itemId),
    ).toEqual(["ready", "release"]);
    // Every item depends only on its immediate predecessor: a flat, skimmable order.
    for (const [index, item] of result.plan.items.entries()) {
      expect(item.dependsOn).toEqual(index === 0 ? [] : [result.plan.items[index - 1]?.itemId]);
    }
  });

  it("rejects proposing against an unknown preset", async () => {
    const runtime = await openRuntime(await makeRoot());
    await expect(
      invoke(
        runtime,
        request("plan.propose", commandId(1), {
          brief: { title: "X", oneLiner: "x", constraints: [] },
          presetId: "no-such-preset",
          projectId: null,
          repositoryId: null,
          source: null,
        }),
      ),
    ).rejects.toThrow(/no phase preset exists/iu);
  });
});

describe("plan.edit", () => {
  it("rejects a reorder/add-item combination that would over-gate the plan (gate-density rule)", async () => {
    const runtime = await openRuntime(await makeRoot());
    await upsertSmallPreset(runtime, "small-preset-gate-density");
    const proposed = unwrap(
      await invoke(
        runtime,
        request("plan.propose", commandId(1), {
          brief: { title: "X", oneLiner: "x", constraints: [] },
          presetId: "small-preset-gate-density",
          projectId: null,
          repositoryId: null,
          source: null,
        }),
      ),
      "plan.propose",
    );
    // The plan is currently [alpha(task), ready(gate)]. Adding a second gate before "build" starts
    // (this preset never reaches a "build" phase, so the whole plan counts as "before build")
    // must be rejected by the structural gate-density rule.
    await expect(
      invoke(
        runtime,
        request("plan.edit", commandId(2), {
          planId: proposed.plan.planId,
          expectedRevision: 0,
          edits: [
            {
              kind: "add-item",
              afterItemId: "ready",
              item: {
                itemId: "second-gate",
                kind: "gate",
                phase: "second-gate",
                title: "Second gate",
                detail: null,
                gate: { owner: "human", reason: "Another checkpoint." },
                dependsOn: ["ready"],
              },
            },
          ],
        }),
      ),
    ).rejects.toThrow(/at most one gate item/iu);
  });

  it("reorders items and round-trips the new order", async () => {
    const runtime = await openRuntime(await makeRoot());
    await upsertSmallPreset(runtime, "small-preset-reorder");
    const proposed = unwrap(
      await invoke(
        runtime,
        request("plan.propose", commandId(1), {
          brief: { title: "X", oneLiner: "x", constraints: [] },
          presetId: "small-preset-reorder",
          projectId: null,
          repositoryId: null,
          source: null,
        }),
      ),
      "plan.propose",
    );
    expect(proposed.plan.items.map((item) => item.itemId)).toEqual(["alpha", "ready"]);

    // Add a third, dependency-free item ("gamma") so there is a reorder that does not violate the
    // "dependsOn only ever points earlier in items[]" rule: "ready" depends on "alpha", so swapping
    // those two directly is invalid by construction (tested separately); "gamma" has no dependency
    // and can move freely.
    const withGamma = unwrap(
      await invoke(
        runtime,
        request("plan.edit", commandId(2), {
          planId: proposed.plan.planId,
          expectedRevision: 0,
          edits: [
            {
              kind: "add-item",
              afterItemId: null,
              item: {
                itemId: "gamma",
                kind: "task",
                phase: "gamma",
                title: "Gamma",
                detail: null,
                taskSpecDraft: {
                  objective: "Independent work.",
                  acceptanceCriteria: [{ id: "ac-1", statement: "Done.", verification: "review" }],
                  scope: { paths: ["docs"] },
                  phase: "gamma",
                },
                dependsOn: [],
              },
            },
          ],
        }),
      ),
      "plan.edit",
    );
    const originalOrder = withGamma.plan.items.map((item) => item.itemId);
    expect(originalOrder).toEqual(["alpha", "ready", "gamma"]);

    const edited = unwrap(
      await invoke(
        runtime,
        request("plan.edit", commandId(3), {
          planId: proposed.plan.planId,
          expectedRevision: 1,
          edits: [{ kind: "reorder", order: ["gamma", "alpha", "ready"] }],
        }),
      ),
      "plan.edit",
    );
    expect(edited.plan.items.map((item) => item.itemId)).toEqual(["gamma", "alpha", "ready"]);
    expect(edited.plan.revision).toBe(2);

    // Round-trip: reorder back to the original order.
    const restored = unwrap(
      await invoke(
        runtime,
        request("plan.edit", commandId(4), {
          planId: proposed.plan.planId,
          expectedRevision: 2,
          edits: [{ kind: "reorder", order: originalOrder }],
        }),
      ),
      "plan.edit",
    );
    expect(restored.plan.items.map((item) => item.itemId)).toEqual(originalOrder);
  });
});

// ---------------------------------------------------------------------------
// plan.execute chaining, against a real temp Git mirror. The "fake executor" plays the role of the
// coding agent + verified-execution pipeline: it directly drives an attempt queued -> running ->
// succeeded (mirroring packages/kernel/test/persistence.test.ts's own hand-built transitions) and
// produces a REAL broker commit via GitWorkspaceManager (mirroring
// packages/git-workspace/test/base-advance.test.ts's runVerifiedAttempt helper), so
// advanceImmutableMirrorBase actually runs for real.
// ---------------------------------------------------------------------------

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: {
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

function commitAll(repository: string, message: string): string {
  git(repository, ["add", "--all"]);
  git(repository, ["commit", "-m", message]);
  return git(repository, ["rev-parse", "HEAD"]);
}

const REPOSITORY_ID = "aa000000-0000-4000-8000-000000000001";
const PROJECT_ID = "aa000000-0000-4000-8000-000000000002";

type ChainFixture = Readonly<{
  gitWorkspace: GitWorkspaceManager;
  mirror: FactoryMirror;
  rootBinding: ImmutableMirrorBinding;
  source: string;
}>;

function sealChainFixture(): ChainFixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-plan-chain-")));
  gitTempRoots.push(root);
  const source = join(root, "source");
  const runtimeRoot = join(root, "runtime");
  spawnSync("mkdir", ["-p", source]);
  git(source, ["init", "--initial-branch=main"]);
  spawnSync("mkdir", ["-p", join(source, "src")]);
  writeFileSync(join(source, "src", "app.txt"), "v0\n");
  const baseSha = commitAll(source, "initial");
  const baseTree = git(source, ["rev-parse", `${baseSha}^{tree}`]);

  const gitWorkspace = new GitWorkspaceManager({ gitExecutable: GIT });
  const mirror = gitWorkspace.prepareImmutableMirror(
    {
      sourceRepositoryPath: source,
      sourceIdentityDigest: `sha256:${"a".repeat(64)}`,
      runtimeRoot,
      repositoryId: REPOSITORY_ID,
      baseCommit: baseSha,
      baseTree,
    },
    () => undefined,
  );
  const rootBinding: ImmutableMirrorBinding = {
    schemaVersion: 1,
    kind: "prepared-immutable-mirror",
    repositoryId: REPOSITORY_ID,
    sourceRepositoryPath: source,
    sourceIdentityDigest: `sha256:${"a".repeat(64)}`,
    mirrorPath: mirror.mirrorPath,
    baseCommit: baseSha,
    baseTree,
  };
  return { gitWorkspace, mirror, rootBinding, source };
}

/** The "fake executor": simulates one verified attempt producing a real broker commit against the
 * mirror's current base, exactly like base-advance.test.ts's runVerifiedAttempt. */
function fakeVerifiedAttempt(
  fixture: ChainFixture,
  attemptId: string,
  baseSha: string,
  fileBody: string,
): BrokerCommitRecord {
  const workspace = fixture.gitWorkspace.createAttemptWorkspace(fixture.mirror, attemptId, baseSha);
  writeFileSync(join(workspace.worktreePath, "src", "app.txt"), fileBody);
  const candidate = fixture.gitWorkspace.verifyCandidate(workspace, { authorizedScopes: ["src"] });
  return fixture.gitWorkspace.createOrReconcileBrokerCommit(
    fixture.mirror,
    {
      attemptId,
      baseSha: candidate.baseSha,
      candidateTreeId: candidate.candidateTreeId,
      diffDigest: candidate.diffDigest,
    },
    () => undefined,
  );
}

function driveAttemptToSucceeded(
  repositories: FactoryRepositories,
  attemptId: string,
  eventSeed: string,
): void {
  const attempt = repositories.attempts.findById(attemptId);
  if (attempt === null) throw new Error(`attempt ${attemptId} not found`);
  const createdEvent = repositories.events.listByAttempt(attemptId)[0];
  if (createdEvent === undefined) throw new Error(`attempt ${attemptId} has no created event`);
  const leaseKey = `attempt:${attemptId}`;
  repositories.leases.claim({
    leaseKey,
    attemptId,
    ownerId: "fake-executor",
    expectedAttemptRevision: attempt.revision,
    acquiredAt: LEASE_ACQUIRED_AT,
    expiresAt: "2026-08-16T13:00:00.000Z",
    event: {
      schemaVersion: 1,
      eventId: uuidFrom(`${eventSeed}-fence`),
      attemptId,
      sequence: 2,
      occurredAt: LEASE_ACQUIRED_AT,
      commandId: null,
      causationEventId: createdEvent.eventId,
      fence: 1,
      type: "attempt.fence-claimed",
      data: { previousFence: 0, newFence: 1, ownerId: "fake-executor" },
    },
  });
  const runningAt = "2026-08-16T12:05:00.000Z";
  repositories.transitionAttemptState({
    leaseKey,
    ownerId: "fake-executor",
    observedAt: runningAt,
    expectedRevision: 1,
    attempt: {
      ...attempt,
      state: "running",
      revision: 2,
      fence: 1,
      updatedAt: runningAt,
    },
    event: {
      schemaVersion: 1,
      eventId: uuidFrom(`${eventSeed}-running`),
      attemptId,
      sequence: 3,
      occurredAt: runningAt,
      commandId: null,
      causationEventId: uuidFrom(`${eventSeed}-fence`),
      fence: 1,
      type: "attempt.state-changed",
      data: { from: "queued", to: "running", blocker: null, outcome: null },
    },
  });
  const succeededAt = "2026-08-16T12:10:00.000Z";
  repositories.transitionAttemptState({
    leaseKey,
    ownerId: "fake-executor",
    observedAt: succeededAt,
    expectedRevision: 2,
    attempt: {
      ...attempt,
      state: "succeeded",
      revision: 3,
      fence: 1,
      currentStepId: null,
      outcome: { kind: "succeeded" },
      updatedAt: succeededAt,
      terminalAt: succeededAt,
    },
    event: {
      schemaVersion: 1,
      eventId: uuidFrom(`${eventSeed}-succeeded`),
      attemptId,
      sequence: 4,
      occurredAt: succeededAt,
      commandId: null,
      causationEventId: uuidFrom(`${eventSeed}-running`),
      fence: 1,
      type: "attempt.state-changed",
      data: { from: "running", to: "succeeded", blocker: null, outcome: { kind: "succeeded" } },
    },
  });
}

function uuidFrom(seed: string): string {
  // Deterministic, readable-enough test UUID: not cryptographically derived, just distinct per seed.
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const hex = hash.toString(16).padStart(8, "0");
  return `87${hex.slice(0, 6)}-0000-4000-8000-${hex.padStart(12, "0")}`;
}

describe("plan.execute chaining", () => {
  it("chains 2 tasks + 1 gate: task1 -> base advances -> gate pauses -> approve -> task2 -> complete", async () => {
    const fixture = sealChainFixture();
    const brokerCommits = new Map<string, BrokerCommitRecord>();
    const mirrorPort = createGitWorkspaceProjectPlanMirrorPortV1({
      gitWorkspace: fixture.gitWorkspace,
      resolveMirror: () => fixture.mirror,
      resolveRootBinding: () => fixture.rootBinding,
    });

    let repositories: FactoryRepositories | undefined;
    const root = await makeRoot();
    const runtime = await openDaemonCommandRuntime({
      runtimeDirectory: root,
      daemonVersion: "0.1.0-test",
      startedAt: T0,
      now: () => T0,
      initializeDatabase: (database) => {
        repositories = createFactoryRepositories(database);
      },
      planExecution: {
        mirror: mirrorPort,
        resolveBrokerCommit: (attempt: ExecutionAttemptV1) => {
          const found = brokerCommits.get(attempt.attemptId);
          if (found === undefined)
            throw new Error(`no fake broker commit recorded for ${attempt.attemptId}`);
          return found;
        },
        policyDigest: `sha256:${"1".repeat(64)}` as never,
      },
    });
    runtimes.push(runtime);
    if (repositories === undefined) throw new Error("repositories not captured");
    const repos = repositories;

    await upsertSmallPreset(runtime, "small-preset-chain");
    const proposed = unwrap(
      await invoke(
        runtime,
        request("plan.propose", commandId(1), {
          brief: { title: "Chain Test", oneLiner: "Two tasks, one gate.", constraints: [] },
          presetId: "small-preset-chain",
          projectId: PROJECT_ID,
          repositoryId: REPOSITORY_ID,
          source: null,
        }),
      ),
      "plan.propose",
    );
    expect(proposed.plan.items.map((item) => item.itemId)).toEqual(["alpha", "ready"]);

    // Add a second task item ("beta") after the gate: [alpha(task), ready(gate), beta(task)].
    const withBeta = unwrap(
      await invoke(
        runtime,
        request("plan.edit", commandId(2), {
          planId: proposed.plan.planId,
          expectedRevision: 0,
          edits: [
            {
              kind: "add-item",
              afterItemId: "ready",
              item: {
                itemId: "beta",
                kind: "task",
                phase: "beta",
                title: "Beta",
                detail: null,
                taskSpecDraft: {
                  objective: "Do the second task.",
                  acceptanceCriteria: [
                    { id: "ac-1", statement: "It works.", verification: "review" },
                  ],
                  scope: { paths: ["src"] },
                  phase: "beta",
                },
                dependsOn: ["ready"],
              },
            },
          ],
        }),
      ),
      "plan.edit",
    );
    expect(withBeta.plan.items.map((item) => item.itemId)).toEqual(["alpha", "ready", "beta"]);

    const approved = unwrap(
      await invoke(
        runtime,
        request("plan.approve", commandId(3), {
          planId: proposed.plan.planId,
          expectedRevision: 1,
        }),
      ),
      "plan.approve",
    );
    expect(approved.plan.state).toBe("approved");

    // plan.execute: submits "alpha".
    const executed1 = unwrap(
      await invoke(
        runtime,
        request("plan.execute", commandId(4), {
          planId: proposed.plan.planId,
          expectedRevision: 2,
        }),
      ),
      "plan.execute",
    );
    expect(executed1.plan.state).toBe("executing");
    const alphaItem = executed1.plan.items.find((item) => item.itemId === "alpha");
    if (alphaItem === undefined || alphaItem.kind !== "task" || alphaItem.attemptId === null) {
      throw new Error("alpha item was not submitted");
    }
    expect(alphaItem.status).toBe("running");

    // Fake executor: drive alpha's attempt to succeeded and record a REAL broker commit for it.
    driveAttemptToSucceeded(repos, alphaItem.attemptId, "alpha");
    const alphaBroker = fakeVerifiedAttempt(
      fixture,
      alphaItem.attemptId,
      fixture.rootBinding.baseCommit,
      "v1\n",
    );
    brokerCommits.set(alphaItem.attemptId, alphaBroker);

    // plan.tick: alpha succeeded -> base advances -> alpha done -> next item is the gate -> pauses.
    const ticked1 = unwrap(
      await invoke(runtime, request("plan.tick", commandId(5), { planId: proposed.plan.planId })),
      "plan.tick",
    );
    expect(ticked1.advanced).toBe(true);
    const alphaAfter = ticked1.plan.items.find((item) => item.itemId === "alpha");
    expect(alphaAfter?.status).toBe("done");
    const readyAfter = ticked1.plan.items.find((item) => item.itemId === "ready");
    expect(readyAfter?.status).toBe("proposed");
    expect(ticked1.plan.state).toBe("executing");

    // Another tick with nothing new to do: the gate is still pending, nothing advances.
    const stillPaused = unwrap(
      await invoke(runtime, request("plan.tick", commandId(6), { planId: proposed.plan.planId })),
      "plan.tick",
    );
    expect(stillPaused.advanced).toBe(false);

    // plan.approve-gate: clears "ready".
    const gateApproved = unwrap(
      await invoke(
        runtime,
        request("plan.approve-gate", commandId(7), {
          planId: ticked1.plan.planId,
          itemId: "ready",
          expectedRevision: ticked1.plan.revision,
        }),
      ),
      "plan.approve-gate",
    );
    expect(gateApproved.plan.items.find((item) => item.itemId === "ready")?.status).toBe(
      "approved",
    );

    // plan.tick: submits "beta" against the ADVANCED base.
    const ticked2 = unwrap(
      await invoke(
        runtime,
        request("plan.tick", commandId(8), { planId: gateApproved.plan.planId }),
      ),
      "plan.tick",
    );
    expect(ticked2.advanced).toBe(true);
    const betaItem = ticked2.plan.items.find((item) => item.itemId === "beta");
    if (betaItem === undefined || betaItem.kind !== "task" || betaItem.attemptId === null) {
      throw new Error("beta item was not submitted");
    }
    expect(betaItem.status).toBe("running");
    // beta's TaskSpec must build on alpha's advanced base, not the original root commit.
    const betaTaskSpec = repos.taskSnapshots.findById(betaItem.taskId as never);
    expect(betaTaskSpec?.base.commit).toBe(alphaBroker.commitSha);
    expect(betaTaskSpec?.base.commit).not.toBe(fixture.rootBinding.baseCommit);

    driveAttemptToSucceeded(repos, betaItem.attemptId, "beta");
    const betaBroker = fakeVerifiedAttempt(
      fixture,
      betaItem.attemptId,
      alphaBroker.commitSha,
      "v2\n",
    );
    brokerCommits.set(betaItem.attemptId, betaBroker);

    // plan.tick: beta succeeded -> base advances again -> beta done -> no items left -> complete.
    const ticked3 = unwrap(
      await invoke(runtime, request("plan.tick", commandId(9), { planId: ticked2.plan.planId })),
      "plan.tick",
    );
    expect(ticked3.advanced).toBe(true);
    expect(ticked3.plan.state).toBe("complete");
    expect(
      ticked3.plan.items.every((item) => item.status === "done" || item.status === "approved"),
    ).toBe(true);

    // A tick against a complete plan is a safe no-op.
    const ticked4 = unwrap(
      await invoke(runtime, request("plan.tick", commandId(10), { planId: ticked3.plan.planId })),
      "plan.tick",
    );
    expect(ticked4.advanced).toBe(false);
    expect(ticked4.plan.state).toBe("complete");
  });

  it("chains 2 tasks + 1 gate through the REAL Project-Registry-backed mirror port (Seam (b))", async () => {
    // Identical fixture/flow to the test above, except the mirror port is
    // `createRegistryBackedProjectPlanMirrorPortV1` (Seam (b) of the project-registry task) instead
    // of a hand-rolled `resolveMirror`/`resolveRootBinding` closure -- proving `plan.execute`/
    // `plan.tick` actually resolve the target project's mirror FROM THE REGISTRY, and refuse an
    // unregistered repositoryId, rather than merely composing the generic git-workspace port in the
    // abstract.
    const fixture = sealChainFixture();
    const registryRoot = await makeRoot();
    const registryDatabase = openMigratedFactoryDatabase(join(registryRoot, "registry.sqlite"));
    const projectRegistry = new ProjectRegistryRepository(registryDatabase);

    // The registry-backed port refuses an unregistered repositoryId before this project is
    // registered (`plan.mirror-not-registered`) -- proving the registry is consulted as an
    // authorization gate, not bypassed.
    const unregisteredPort = createRegistryBackedProjectPlanMirrorPortV1({
      gitWorkspace: fixture.gitWorkspace,
      gitRuntimeRoot: fixture.mirror.runtimeRoot,
      projectRegistry,
    });
    expect(() => unregisteredPort.currentBase(RepositoryIdSchema.parse(REPOSITORY_ID))).toThrow(
      /no registered project claims|mirror-not-registered/iu,
    );

    projectRegistry.upsert({
      command: {
        schemaVersion: 1,
        commandId: "aa000000-0000-4000-8000-0000000000e1",
        issuedAt: T0,
        origin: "system",
        kind: "project.register",
        register: {
          project: {
            projectId: PROJECT_ID,
            slug: "chain-registry-project",
            displayName: "Chain Registry Project",
            sourceRepositoryPath: fixture.source,
            repositoryId: REPOSITORY_ID,
            standardVersion: null,
            policyLockDigest: null,
            docsLayout: { docsDir: "docs" },
          },
          expectedRevision: null,
        },
      },
      recordedAt: T0,
    });

    const brokerCommits = new Map<string, BrokerCommitRecord>();
    const mirrorPort = createRegistryBackedProjectPlanMirrorPortV1({
      gitWorkspace: fixture.gitWorkspace,
      gitRuntimeRoot: fixture.mirror.runtimeRoot,
      projectRegistry,
    });

    let repositories: FactoryRepositories | undefined;
    const root = await makeRoot();
    const runtime = await openDaemonCommandRuntime({
      runtimeDirectory: root,
      daemonVersion: "0.1.0-test",
      startedAt: T0,
      now: () => T0,
      initializeDatabase: (database) => {
        repositories = createFactoryRepositories(database);
      },
      planExecution: {
        mirror: mirrorPort,
        resolveBrokerCommit: (attempt: ExecutionAttemptV1) => {
          const found = brokerCommits.get(attempt.attemptId);
          if (found === undefined)
            throw new Error(`no fake broker commit recorded for ${attempt.attemptId}`);
          return found;
        },
        policyDigest: `sha256:${"1".repeat(64)}` as never,
      },
    });
    runtimes.push(runtime);
    if (repositories === undefined) throw new Error("repositories not captured");
    const repos = repositories;

    await upsertSmallPreset(runtime, "small-preset-chain-registry");
    const proposed = unwrap(
      await invoke(
        runtime,
        request("plan.propose", commandId(101), {
          brief: {
            title: "Registry Chain Test",
            oneLiner: "Two tasks, one gate.",
            constraints: [],
          },
          presetId: "small-preset-chain-registry",
          projectId: PROJECT_ID,
          repositoryId: REPOSITORY_ID,
          source: null,
        }),
      ),
      "plan.propose",
    );
    expect(proposed.plan.items.map((item) => item.itemId)).toEqual(["alpha", "ready"]);

    const withBeta = unwrap(
      await invoke(
        runtime,
        request("plan.edit", commandId(102), {
          planId: proposed.plan.planId,
          expectedRevision: 0,
          edits: [
            {
              kind: "add-item",
              afterItemId: "ready",
              item: {
                itemId: "beta",
                kind: "task",
                phase: "beta",
                title: "Beta",
                detail: null,
                taskSpecDraft: {
                  objective: "Do the second task.",
                  acceptanceCriteria: [
                    { id: "ac-1", statement: "It works.", verification: "review" },
                  ],
                  scope: { paths: ["src"] },
                  phase: "beta",
                },
                dependsOn: ["ready"],
              },
            },
          ],
        }),
      ),
      "plan.edit",
    );
    expect(withBeta.plan.items.map((item) => item.itemId)).toEqual(["alpha", "ready", "beta"]);

    const approved = unwrap(
      await invoke(
        runtime,
        request("plan.approve", commandId(103), {
          planId: proposed.plan.planId,
          expectedRevision: 1,
        }),
      ),
      "plan.approve",
    );
    expect(approved.plan.state).toBe("approved");

    // plan.execute: currentBase is resolved through the REAL registry-backed port.
    const executed1 = unwrap(
      await invoke(
        runtime,
        request("plan.execute", commandId(104), {
          planId: proposed.plan.planId,
          expectedRevision: 2,
        }),
      ),
      "plan.execute",
    );
    expect(executed1.plan.state).toBe("executing");
    const alphaItem = executed1.plan.items.find((item) => item.itemId === "alpha");
    if (alphaItem === undefined || alphaItem.kind !== "task" || alphaItem.attemptId === null) {
      throw new Error("alpha item was not submitted");
    }
    expect(alphaItem.status).toBe("running");
    const alphaTaskSpec = repos.taskSnapshots.findById(alphaItem.taskId as never);
    expect(alphaTaskSpec?.base.commit).toBe(fixture.rootBinding.baseCommit);

    driveAttemptToSucceeded(repos, alphaItem.attemptId, "registry-alpha");
    const alphaBroker = fakeVerifiedAttempt(
      fixture,
      alphaItem.attemptId,
      fixture.rootBinding.baseCommit,
      "v1\n",
    );
    brokerCommits.set(alphaItem.attemptId, alphaBroker);

    // plan.tick: base advances through the REAL registry-backed port's advanceBase.
    const ticked1 = unwrap(
      await invoke(runtime, request("plan.tick", commandId(105), { planId: proposed.plan.planId })),
      "plan.tick",
    );
    expect(ticked1.advanced).toBe(true);
    expect(ticked1.plan.items.find((item) => item.itemId === "alpha")?.status).toBe("done");
    expect(ticked1.plan.state).toBe("executing");

    const gateApproved = unwrap(
      await invoke(
        runtime,
        request("plan.approve-gate", commandId(106), {
          planId: ticked1.plan.planId,
          itemId: "ready",
          expectedRevision: ticked1.plan.revision,
        }),
      ),
      "plan.approve-gate",
    );
    expect(gateApproved.plan.items.find((item) => item.itemId === "ready")?.status).toBe(
      "approved",
    );

    const ticked2 = unwrap(
      await invoke(
        runtime,
        request("plan.tick", commandId(107), { planId: gateApproved.plan.planId }),
      ),
      "plan.tick",
    );
    expect(ticked2.advanced).toBe(true);
    const betaItem = ticked2.plan.items.find((item) => item.itemId === "beta");
    if (betaItem === undefined || betaItem.kind !== "task" || betaItem.attemptId === null) {
      throw new Error("beta item was not submitted");
    }
    // beta's base is alpha's ADVANCED broker commit -- re-derived from the registry-resolved mirror.
    const betaTaskSpec = repos.taskSnapshots.findById(betaItem.taskId as never);
    expect(betaTaskSpec?.base.commit).toBe(alphaBroker.commitSha);

    driveAttemptToSucceeded(repos, betaItem.attemptId, "registry-beta");
    const betaBroker = fakeVerifiedAttempt(
      fixture,
      betaItem.attemptId,
      alphaBroker.commitSha,
      "v2\n",
    );
    brokerCommits.set(betaItem.attemptId, betaBroker);

    const ticked3 = unwrap(
      await invoke(runtime, request("plan.tick", commandId(108), { planId: ticked2.plan.planId })),
      "plan.tick",
    );
    expect(ticked3.advanced).toBe(true);
    expect(ticked3.plan.state).toBe("complete");
    registryDatabase.close();
  });

  it("halts the plan (no auto-retry) when a task item's attempt fails", async () => {
    const fixture = sealChainFixture();
    let repositories: FactoryRepositories | undefined;
    const root = await makeRoot();
    const runtime = await openDaemonCommandRuntime({
      runtimeDirectory: root,
      daemonVersion: "0.1.0-test",
      startedAt: T0,
      now: () => T0,
      initializeDatabase: (database) => {
        repositories = createFactoryRepositories(database);
      },
      planExecution: {
        mirror: createGitWorkspaceProjectPlanMirrorPortV1({
          gitWorkspace: fixture.gitWorkspace,
          resolveMirror: () => fixture.mirror,
          resolveRootBinding: () => fixture.rootBinding,
        }),
        resolveBrokerCommit: () => {
          throw new Error("not reached: the attempt fails before a broker commit is needed");
        },
        policyDigest: `sha256:${"1".repeat(64)}` as never,
      },
    });
    runtimes.push(runtime);
    if (repositories === undefined) throw new Error("repositories not captured");
    const repos = repositories;

    await upsertSmallPreset(runtime, "small-preset-failure");
    const proposed = unwrap(
      await invoke(
        runtime,
        request("plan.propose", commandId(1), {
          brief: { title: "Failure Test", oneLiner: "One task that fails.", constraints: [] },
          presetId: "small-preset-failure",
          projectId: PROJECT_ID,
          repositoryId: REPOSITORY_ID,
          source: null,
        }),
      ),
      "plan.propose",
    );
    await invoke(
      runtime,
      request("plan.approve", commandId(2), { planId: proposed.plan.planId, expectedRevision: 0 }),
    );
    const executed = unwrap(
      await invoke(
        runtime,
        request("plan.execute", commandId(3), {
          planId: proposed.plan.planId,
          expectedRevision: 1,
        }),
      ),
      "plan.execute",
    );
    const alphaItem = executed.plan.items.find((item) => item.itemId === "alpha");
    if (alphaItem === undefined || alphaItem.kind !== "task" || alphaItem.attemptId === null) {
      throw new Error("alpha item was not submitted");
    }

    const attempt = repos.attempts.findById(alphaItem.attemptId);
    if (attempt === null) throw new Error("attempt not found");
    const createdEvent = repos.events.listByAttempt(alphaItem.attemptId)[0];
    if (createdEvent === undefined) throw new Error("attempt has no created event");
    repos.leases.claim({
      leaseKey: `attempt:${alphaItem.attemptId}`,
      attemptId: alphaItem.attemptId,
      ownerId: "fake-executor",
      expectedAttemptRevision: attempt.revision,
      acquiredAt: LEASE_ACQUIRED_AT,
      expiresAt: "2026-08-16T13:00:00.000Z",
      event: {
        schemaVersion: 1,
        eventId: uuidFrom("fail-fence"),
        attemptId: alphaItem.attemptId,
        sequence: 2,
        occurredAt: LEASE_ACQUIRED_AT,
        commandId: null,
        causationEventId: createdEvent.eventId,
        fence: 1,
        type: "attempt.fence-claimed",
        data: { previousFence: 0, newFence: 1, ownerId: "fake-executor" },
      },
    });
    const runningAt = "2026-08-16T12:05:00.000Z";
    repos.transitionAttemptState({
      leaseKey: `attempt:${alphaItem.attemptId}`,
      ownerId: "fake-executor",
      observedAt: runningAt,
      expectedRevision: 1,
      attempt: { ...attempt, state: "running", revision: 2, fence: 1, updatedAt: runningAt },
      event: {
        schemaVersion: 1,
        eventId: uuidFrom("fail-running"),
        attemptId: alphaItem.attemptId,
        sequence: 3,
        occurredAt: runningAt,
        commandId: null,
        causationEventId: uuidFrom("fail-fence"),
        fence: 1,
        type: "attempt.state-changed",
        data: { from: "queued", to: "running", blocker: null, outcome: null },
      },
    });
    const failedAt = "2026-08-16T12:10:00.000Z";
    const failure = {
      code: "task.execution-failed",
      summary: "The fake executor failed this attempt deliberately.",
      retryable: true,
      detailArtifactDigest: null,
    };
    repos.transitionAttemptState({
      leaseKey: `attempt:${alphaItem.attemptId}`,
      ownerId: "fake-executor",
      observedAt: failedAt,
      expectedRevision: 2,
      attempt: {
        ...attempt,
        state: "failed",
        revision: 3,
        fence: 1,
        currentStepId: null,
        outcome: { kind: "failed", failure },
        updatedAt: failedAt,
        terminalAt: failedAt,
      },
      event: {
        schemaVersion: 1,
        eventId: uuidFrom("fail-failed"),
        attemptId: alphaItem.attemptId,
        sequence: 4,
        occurredAt: failedAt,
        commandId: null,
        causationEventId: uuidFrom("fail-running"),
        fence: 1,
        type: "attempt.state-changed",
        data: {
          from: "running",
          to: "failed",
          blocker: null,
          outcome: { kind: "failed", failure },
        },
      },
    });

    const ticked = unwrap(
      await invoke(runtime, request("plan.tick", commandId(4), { planId: proposed.plan.planId })),
      "plan.tick",
    );
    expect(ticked.advanced).toBe(true);
    expect(ticked.plan.items.find((item) => item.itemId === "alpha")?.status).toBe("failed");
    expect(ticked.plan.state).toBe("executing");

    // No auto-retry: a further tick makes no progress at all.
    const stuck = unwrap(
      await invoke(runtime, request("plan.tick", commandId(5), { planId: ticked.plan.planId })),
      "plan.tick",
    );
    expect(stuck.advanced).toBe(false);
    expect(stuck.plan.state).toBe("executing");
  });
});

async function openRuntime(root: string): Promise<DaemonCommandRuntime> {
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: root,
    daemonVersion: "0.1.0-test",
    startedAt: T0,
    now: () => T0,
  });
  runtimes.push(runtime);
  return runtime;
}
