import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CommandRequestV1Schema,
  type CommandRequestV1,
  type CommandResultV1,
  type ExecutionAttemptV1,
  type TaskSpecV1,
} from "@app-factory/contracts";
import type { VerifiedExecutionEvidence } from "@app-factory/execution-engine";
import {
  GitWorkspaceManager,
  type BrokerCommitRecord,
  type FactoryMirror,
  type ImmutableMirrorBinding,
} from "@app-factory/git-workspace";
import { EvidenceStore } from "@app-factory/evidence-store";
import { createFactoryRepositories, type FactoryRepositories } from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import {
  openDaemonCommandRuntime,
  resolveDaemonRuntimePaths,
  type DaemonCommandRuntime,
} from "../src/command-runtime.js";
import type { RunExportMirrorPort } from "../src/run-export-command-runtime.js";

/**
 * `release.start` / `release.promote` / `release.status` driven through the REAL
 * `openDaemonCommandRuntime` -- proves the actual wiring (`command-runtime.ts`'s dispatch,
 * `DURABLE_COMMAND_RESULT_OPERATIONS` journaling, `idFactory` minting a `releaseRunId`, the real
 * sqlite-backed `ReleaseRunRepository`), on top of `release-run-runtime.test.ts`'s isolated-function
 * coverage of the underlying logic. `resolveVerifiedExecutionEvidence` is overridden (a supported
 * daemon composition seam, exactly like `planExecution.resolveBrokerCommit`) so this test needs a
 * real succeeded attempt and a real Factory mirror, but not a full real execution-evidence-index
 * closure (event log, review report) -- `release-run-runtime.test.ts` already covers that boundary.
 */

const GIT = "/usr/bin/git";
const T0 = "2026-08-21T12:00:00.000Z";
const T1 = "2026-08-21T12:05:00.000Z";
const LEASE_ACQUIRED_AT = "2026-08-21T12:01:00.000Z";
const REQUEST_ID = "dd000000-0000-4000-8000-000000000010";

const PROJECT_ID = "dd000000-0000-4000-8000-000000000001";
const REPOSITORY_ID = "dd000000-0000-4000-8000-000000000002";
const TASK_ID = "dd000000-0000-4000-8000-000000000003";

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];
const gitTempRoots: string[] = [];
const brokerByAttempt = new Map<string, BrokerCommitRecord>();

function commandId(index: number): string {
  return `dd000000-0000-4000-8000-${(900 + index).toString().padStart(12, "0")}`;
}

function request(
  operation: CommandRequestV1["operation"],
  id: string,
  payload: unknown,
): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId: id,
    issuedAt: T0,
    origin: "cli",
    operation,
    payload,
  });
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

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-release-run-cmd-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
  for (const root of gitTempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// A real succeeded attempt, driven the same way project-plan-command-runtime.test.ts does.
// ---------------------------------------------------------------------------

const taskSpec: TaskSpecV1 = {
  schemaVersion: 1,
  taskId: TASK_ID,
  projectId: PROJECT_ID,
  createdAt: T0,
  title: "Ship the release rail",
  objective: "Promote a verified change onto main.",
  acceptanceCriteria: [
    { id: "ff", statement: "The branch fast-forwards.", verification: "automated" },
  ],
  base: { repositoryId: REPOSITORY_ID, commit: "a".repeat(40) },
  requestedScope: { paths: ["src"] },
  policyDigest: `sha256:${"b".repeat(64)}`,
};

function driveAttemptToSucceeded(repositories: FactoryRepositories, attemptId: string): void {
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
    expiresAt: "2026-08-21T13:00:00.000Z",
    event: {
      schemaVersion: 1,
      eventId: "dd000000-0000-4000-8000-000000000601",
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
  const runningAt = "2026-08-21T12:02:00.000Z";
  repositories.transitionAttemptState({
    leaseKey,
    ownerId: "fake-executor",
    observedAt: runningAt,
    expectedRevision: 1,
    attempt: { ...attempt, state: "running", revision: 2, fence: 1, updatedAt: runningAt },
    event: {
      schemaVersion: 1,
      eventId: "dd000000-0000-4000-8000-000000000602",
      attemptId,
      sequence: 3,
      occurredAt: runningAt,
      commandId: null,
      causationEventId: "dd000000-0000-4000-8000-000000000601",
      fence: 1,
      type: "attempt.state-changed",
      data: { from: "queued", to: "running", blocker: null, outcome: null },
    },
  });
  const succeededAt = "2026-08-21T12:03:00.000Z";
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
      eventId: "dd000000-0000-4000-8000-000000000603",
      attemptId,
      sequence: 4,
      occurredAt: succeededAt,
      commandId: null,
      causationEventId: "dd000000-0000-4000-8000-000000000602",
      fence: 1,
      type: "attempt.state-changed",
      data: { from: "running", to: "succeeded", blocker: null, outcome: { kind: "succeeded" } },
    },
  });
}

// ---------------------------------------------------------------------------
// A real sealed Factory mirror, advanced by one verified attempt -- mirrors base-advance.test.ts.
// ---------------------------------------------------------------------------

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: {
      GIT_AUTHOR_DATE: "2026-08-21T12:00:00Z",
      GIT_AUTHOR_EMAIL: "factory-tests@example.invalid",
      GIT_AUTHOR_NAME: "Factory Tests",
      GIT_COMMITTER_DATE: "2026-08-21T12:00:00Z",
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

type ChainFixture = Readonly<{
  gitWorkspace: GitWorkspaceManager;
  mirror: FactoryMirror;
  rootBinding: ImmutableMirrorBinding;
  source: string;
}>;

function sealChainFixture(): ChainFixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-release-run-cmd-git-")));
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
  const rootBinding = gitWorkspace.readSealedRootBinding(mirror);
  return { gitWorkspace, mirror, rootBinding, source };
}

function verifyAndAdvance(fixture: ChainFixture, attemptId: string): BrokerCommitRecord {
  const workspace = fixture.gitWorkspace.createAttemptWorkspace(
    fixture.mirror,
    attemptId,
    fixture.rootBinding.baseCommit,
  );
  writeFileSync(join(workspace.worktreePath, "src", "app.txt"), "v1\n");
  const candidate = fixture.gitWorkspace.verifyCandidate(workspace, { authorizedScopes: ["src"] });
  const broker = fixture.gitWorkspace.createOrReconcileBrokerCommit(
    fixture.mirror,
    {
      attemptId,
      baseSha: candidate.baseSha,
      candidateTreeId: candidate.candidateTreeId,
      diffDigest: candidate.diffDigest,
    },
    () => undefined,
  );
  fixture.gitWorkspace.advanceImmutableMirrorBase(fixture.mirror, fixture.rootBinding, broker);
  return broker;
}

function fakeVerifiedExecutionEvidence(broker: BrokerCommitRecord): VerifiedExecutionEvidence {
  const digest = (seed: string) => `sha256:${seed.repeat(64).slice(0, 64)}` as `sha256:${string}`;
  return {
    indexDigest: digest("c"),
    // Never read by release-run-runtime.ts; only `.brokerCommit`/`.trustedTests` are.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    index: {} as any,
    review: {
      schemaVersion: 1,
      reviewerId: "release.test-reviewer",
      reviewerVersion: "0.0.0-test",
      reviewInputDigest: digest("9"),
      verdict: "pass",
      findings: [],
    },
    brokerCommit: broker,
    testCount: 1,
    trustedTests: [
      {
        recordDigest: digest("8"),
        stdoutDigest: digest("7"),
        stderrDigest: digest("6"),
        claims: {
          checkId: "release.verification",
          argv: ["/usr/bin/true"],
          checkoutTree: broker.candidateTreeId,
          startedAt: T0,
          finishedAt: T1,
          toolVersions: [],
          passed: true,
          exitCode: 0,
        },
      },
    ],
  };
}

function monotonicClock(): () => string {
  let tick = 0;
  return () => {
    const value = new Date(Date.parse(T0) + tick).toISOString();
    tick += 1;
    return value;
  };
}

function seedEvidenceManifest(evidenceStore: EvidenceStore, attemptId: string): void {
  const subject = {
    taskSpecDigest: `sha256:${"b".repeat(64)}`,
    policyDigest: `sha256:${"c".repeat(64)}`,
    baseCommit: "0".repeat(40),
    candidateTree: "1".repeat(40),
    fence: 1,
  };
  const evidenceId = "dd000000-0000-4000-8000-000000000700";
  const { digest } = evidenceStore.putEvidence({
    schemaVersion: 1,
    evidenceId,
    attemptId,
    createdAt: T0,
    producer: "release.test-producer",
    subject,
    artifacts: [],
    kind: "commit",
    claims: { commit: "1".repeat(40), tree: "1".repeat(40), attemptMarker: attemptId },
  });
  evidenceStore.commitManifest({
    schemaVersion: 1,
    attemptId,
    createdAt: T0,
    subject,
    entries: [{ evidenceId, digest }],
    requiredKinds: ["commit"],
  });
}

describe("release.start / release.promote / release.status through the real daemon runtime", () => {
  it("certifies, journals durably, fast-forwards, and reads status back", async () => {
    const fixture = sealChainFixture();
    let repositories: FactoryRepositories | undefined;
    const root = await makeRoot();
    const mirrorPort: RunExportMirrorPort = {
      open: (repositoryId) => {
        if (repositoryId !== REPOSITORY_ID)
          throw new Error(`unexpected repository ${repositoryId}`);
        return { gitWorkspace: fixture.gitWorkspace, mirror: fixture.mirror };
      },
    };
    const runtime = await openDaemonCommandRuntime({
      runtimeDirectory: root,
      daemonVersion: "0.1.0-test",
      startedAt: T0,
      // Strictly increasing (never fixed): `release_runs`' own SQL invariant requires each
      // revision's `updated_at` to be monotonic, and every command here shares one clock.
      now: monotonicClock(),
      initializeDatabase: (database) => {
        repositories = createFactoryRepositories(database);
      },
      runExportMirrors: mirrorPort,
      resolveVerifiedExecutionEvidence: (attempt: ExecutionAttemptV1) => {
        const broker = brokerByAttempt.get(attempt.attemptId);
        if (broker === undefined) throw new Error(`no fake broker commit for ${attempt.attemptId}`);
        return fakeVerifiedExecutionEvidence(broker);
      },
    });
    runtimes.push(runtime);
    if (repositories === undefined) throw new Error("repositories not captured");

    const submitted = unwrap(
      await invoke(runtime, request("task.run", commandId(1), { taskSpec })),
      "task.run",
    );
    const attemptId = submitted.attemptId;
    driveAttemptToSucceeded(repositories, attemptId);
    const broker = verifyAndAdvance(fixture, attemptId);
    brokerByAttempt.set(attemptId, broker);
    // The daemon's own evidence store, at the same on-disk path `initializeDatabase` runs under --
    // `release.start` reads a real `EvidenceManifestV1` for the attempt directly (in addition to
    // the injected `resolveVerifiedExecutionEvidence`).
    seedEvidenceManifest(new EvidenceStore(resolveDaemonRuntimePaths(root).evidence), attemptId);

    // `release.start`: certifies the mirror's current tip into a fresh, durable ReleaseRunV1.
    const started = unwrap(
      await invoke(
        runtime,
        request("release.start", commandId(2), {
          projectId: PROJECT_ID,
          repositoryId: REPOSITORY_ID,
          sourceCommit: broker.commitSha,
          branch: "main",
        }),
      ),
      "release.start",
    );
    expect(started.created).toBe(true);
    expect(started.run.stage).toBe("certified");
    expect(started.run.revision).toBe(1);

    // Durably journaled: replaying the exact same commandId returns the identical result.
    const replayedStart = unwrap(
      await invoke(
        runtime,
        request("release.start", commandId(2), {
          projectId: PROJECT_ID,
          repositoryId: REPOSITORY_ID,
          sourceCommit: broker.commitSha,
          branch: "main",
        }),
      ),
      "release.start",
    );
    expect(replayedStart).toEqual(started);

    // `release.promote`: fast-forwards the REAL source repository.
    const promoted = unwrap(
      await invoke(
        runtime,
        request("release.promote", commandId(3), {
          releaseRunId: started.run.releaseRunId,
          expectedRevision: 1,
        }),
      ),
      "release.promote",
    );
    expect(promoted.run.revision).toBe(2);
    expect(git(fixture.source, ["rev-parse", "HEAD"])).toBe(broker.commitSha);

    // A stale expectedRevision now correctly conflicts.
    await expect(
      invoke(
        runtime,
        request("release.promote", commandId(4), {
          releaseRunId: started.run.releaseRunId,
          expectedRevision: 1,
        }),
      ),
    ).rejects.toMatchObject({ code: "release-run.revision-conflict" });

    // `release.status`: reads the current durable state back.
    const status = unwrap(
      await invoke(
        runtime,
        request("release.status", commandId(5), { releaseRunId: started.run.releaseRunId }),
      ),
      "release.status",
    );
    expect(status.run).toEqual(promoted.run);
  });
});
