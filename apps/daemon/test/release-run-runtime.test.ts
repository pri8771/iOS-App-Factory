import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  AttemptId,
  CommandRequestV1,
  ExecutionAttemptV1,
  IsoInstant,
} from "@app-factory/contracts";
import { EvidenceStore } from "@app-factory/evidence-store";
import type { VerifiedExecutionEvidence } from "@app-factory/execution-engine";
import {
  GitWorkspaceManager,
  type BrokerCommitRecord,
  type FactoryMirror,
  type ImmutableMirrorBinding,
} from "@app-factory/git-workspace";
import {
  createFactoryRepositories,
  openMigratedFactoryDatabase,
  type FactoryRepositories,
} from "@app-factory/kernel";
import { afterEach, describe, expect, it } from "vitest";

import { CommandHandlerError } from "../src/unix-command-server.js";
import {
  buildReleaseStatusResultV1,
  executeReleasePromoteCommand,
  executeReleaseStartCommand,
  type ReleaseRunRuntimeDependencies,
} from "../src/release-run-runtime.js";
import type { RunExportMirrorPort } from "../src/run-export-command-runtime.js";

/**
 * `release.start`/`release.promote` (Release Rail Wave 3), driven directly against
 * `release-run-runtime.ts`'s pure functions -- mirrors `run-export-command-runtime.test.ts`'s
 * isolated style, not `project-plan-command-runtime.test.ts`'s full `openDaemonCommandRuntime`
 * style: `ReleaseRunRuntimeDependencies` narrows `repositories` to method-level picks
 * (`ReleaseRunRuntimeRepositoriesPort`) specifically so `attempts.findById` and
 * `resolveVerifiedExecutionEvidence` can be faked, while `releaseRuns` is still the REAL,
 * sqlite-backed `ReleaseRunRepository` -- its CAS/idempotency logic is exactly what these tests
 * exercise. `mirrors` wraps a REAL `GitWorkspaceManager` over a real temp Git mirror: promotion's
 * fast-forward is real `git` plumbing, not something worth faking.
 */

const GIT = "/usr/bin/git";
const T0: IsoInstant = "2026-08-21T12:00:00.000Z" as IsoInstant;
const T1: IsoInstant = "2026-08-21T12:05:00.000Z" as IsoInstant;
const T2: IsoInstant = "2026-08-21T12:10:00.000Z" as IsoInstant;

const REPOSITORY_ID = "aa000000-0000-4000-8000-000000000003";
const PROJECT_ID = "aa000000-0000-4000-8000-000000000002";
const ATTEMPT_ID = "aa000000-0000-4000-8000-000000000001" as AttemptId;
const TASK_ID = "aa000000-0000-4000-8000-000000000004";

const roots: string[] = [];
const dbRoots: string[] = [];

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
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-release-run-")));
  roots.push(root);
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

/** One verified attempt, advanced onto the mirror's chain -- mirrors base-advance.test.ts. Advances
 *  from the mirror's CURRENT tip, so a second call in the same test lands a second, later attempt. */
function verifyAndAdvance(
  fixture: ChainFixture,
  fileBody: string,
  attemptId: AttemptId = ATTEMPT_ID,
): BrokerCommitRecord {
  const tip = fixture.gitWorkspace.readImmutableMirrorBindingTip(fixture.mirror);
  const workspace = fixture.gitWorkspace.createAttemptWorkspace(
    fixture.mirror,
    attemptId,
    tip.baseCommit,
  );
  writeFileSync(join(workspace.worktreePath, "src", "app.txt"), fileBody);
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
  fixture.gitWorkspace.advanceImmutableMirrorBase(fixture.mirror, tip, broker);
  return broker;
}

function fakeMirrorsPort(fixture: ChainFixture): RunExportMirrorPort {
  return {
    open(repositoryId) {
      if (repositoryId !== REPOSITORY_ID) {
        throw new Error(`No Factory mirror exists for repository ${repositoryId}`);
      }
      return { gitWorkspace: fixture.gitWorkspace, mirror: fixture.mirror };
    },
  };
}

function fakeAttempt(): ExecutionAttemptV1 {
  return {
    schemaVersion: 1,
    attemptId: ATTEMPT_ID,
    taskId: TASK_ID as ExecutionAttemptV1["taskId"],
    taskSpecDigest: `sha256:${"b".repeat(64)}` as ExecutionAttemptV1["taskSpecDigest"],
    attemptNumber: 1,
    state: "succeeded",
    desiredState: "running",
    revision: 3,
    fence: 1,
    currentStepId: null,
    blocker: null,
    outcome: { kind: "succeeded" },
    createdAt: T0,
    updatedAt: T1,
    terminalAt: T1,
  } as ExecutionAttemptV1;
}

/** A `VerifiedExecutionEvidence` closure for `broker`, with an execution-evidence-index/review shape
 *  that's never read by `release-run-runtime.ts` (only `.brokerCommit`/`.trustedTests` are). */
function fakeVerifiedExecutionEvidence(
  broker: BrokerCommitRecord,
  passed: boolean,
): VerifiedExecutionEvidence {
  const digest = (seed: string) => `sha256:${seed.repeat(64).slice(0, 64)}` as `sha256:${string}`;
  return {
    indexDigest: digest("c"),
    index: {
      schemaVersion: 1,
      attemptId: ATTEMPT_ID,
      fence: 1,
      inputDigest: digest("d"),
      repositoryId: REPOSITORY_ID,
      implementingRunId: "aa000000-0000-4000-8000-000000000005",
      reviewerRunId: "aa000000-0000-4000-8000-000000000006",
      taskSpecDigest: digest("b"),
      taskSpecArtifactDigest: digest("e"),
      policyDigest: digest("f"),
      policyArtifactDigest: digest("0"),
      candidatePolicyArtifactDigest: digest("1"),
      verificationPlanBundleDigest: digest("2"),
      reviewerDescriptorArtifactDigest: digest("3"),
      baseCommit: broker.baseSha,
      candidateTree: broker.candidateTreeId,
      treeDigest: digest("4"),
      diffDigest: broker.diffDigest,
      candidateVerificationArtifactDigest: digest("5"),
      candidatePatchArtifactDigest: digest("6"),
      testDigest: digest("7"),
      preReviewBundleDigest: digest("8"),
      reviewInputArtifactDigest: digest("9"),
      reviewDigest: digest("a"),
      commitSha: broker.commitSha,
      commitDigest: broker.commitDigest,
      commitRecordDigest: digest("1"),
      eventDigest: digest("2"),
      createdAt: T1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
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
        claims: passed
          ? {
              checkId: "release.verification",
              argv: ["/usr/bin/true"],
              checkoutTree: broker.candidateTreeId,
              startedAt: T0,
              finishedAt: T1,
              toolVersions: [],
              passed: true,
              exitCode: 0,
            }
          : {
              checkId: "release.verification",
              argv: ["/usr/bin/false"],
              checkoutTree: broker.candidateTreeId,
              startedAt: T0,
              finishedAt: T1,
              toolVersions: [],
              passed: false,
              exitCode: 1,
            },
      },
    ],
  };
}

function seedEvidenceManifest(evidenceStore: EvidenceStore): void {
  const subject = {
    taskSpecDigest: `sha256:${"b".repeat(64)}`,
    policyDigest: `sha256:${"f".repeat(64)}`,
    baseCommit: "0".repeat(40),
    candidateTree: "1".repeat(40),
    fence: 1,
  };
  const { digest } = evidenceStore.putEvidence({
    schemaVersion: 1,
    evidenceId: "aa000000-0000-4000-8000-000000000007",
    attemptId: ATTEMPT_ID,
    createdAt: T0,
    producer: "release.test-producer",
    subject,
    artifacts: [],
    kind: "commit",
    claims: { commit: "1".repeat(40), tree: "1".repeat(40), attemptMarker: ATTEMPT_ID },
  });
  evidenceStore.commitManifest({
    schemaVersion: 1,
    attemptId: ATTEMPT_ID,
    createdAt: T0,
    subject,
    entries: [{ evidenceId: "aa000000-0000-4000-8000-000000000007", digest }],
    requiredKinds: ["commit"],
  });
}

function makeEvidenceStore(): EvidenceStore {
  const root = mkdtempSync(join(tmpdir(), "app-factory-release-run-evidence-"));
  roots.push(root);
  return new EvidenceStore(root);
}

function makeRepositories(): FactoryRepositories {
  const root = mkdtempSync(join(tmpdir(), "app-factory-release-run-db-"));
  dbRoots.push(root);
  const database = openMigratedFactoryDatabase(join(root, "factory.sqlite3"));
  return createFactoryRepositories(database);
}

let commandCounter = 0;
function commandId(): string {
  commandCounter += 1;
  return `bb000000-0000-4000-8000-${commandCounter.toString().padStart(12, "0")}`;
}

function startRequest(
  overrides: Partial<{
    sourceCommit: string;
    branch: string;
    commandId: string;
    issuedAt: string;
  }> = {},
): Extract<CommandRequestV1, { operation: "release.start" }> {
  return {
    schemaVersion: 1,
    commandId: overrides.commandId ?? commandId(),
    issuedAt: overrides.issuedAt ?? T0,
    origin: "cli",
    operation: "release.start",
    payload: {
      projectId: PROJECT_ID,
      repositoryId: REPOSITORY_ID,
      sourceCommit: overrides.sourceCommit ?? "0".repeat(40),
      branch: overrides.branch ?? "main",
    },
  } as Extract<CommandRequestV1, { operation: "release.start" }>;
}

function promoteRequest(
  releaseRunId: string,
  expectedRevision: number,
  cmdId: string = commandId(),
): Extract<CommandRequestV1, { operation: "release.promote" }> {
  return {
    schemaVersion: 1,
    commandId: cmdId,
    issuedAt: T1,
    origin: "cli",
    operation: "release.promote",
    payload: { releaseRunId, expectedRevision },
  } as Extract<CommandRequestV1, { operation: "release.promote" }>;
}

let idCounter = 0;
function fakeIdFactory(): (purpose: string, commandId: string) => string {
  return () => {
    idCounter += 1;
    return `cc000000-0000-4000-8000-${idCounter.toString().padStart(12, "0")}`;
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const root of dbRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release.start", () => {
  it("certifies the mirror's current verified commit into a fresh, certified ReleaseRunV1", async () => {
    const fixture = sealChainFixture();
    const broker = verifyAndAdvance(fixture, "v1\n");
    const evidenceStore = makeEvidenceStore();
    seedEvidenceManifest(evidenceStore);
    const repositories = makeRepositories();
    const deps: ReleaseRunRuntimeDependencies = {
      repositories: { releaseRuns: repositories.releaseRuns, attempts: { findById: fakeAttempt } },
      mirrors: fakeMirrorsPort(fixture),
      evidenceStore,
      resolveVerifiedExecutionEvidence: () => fakeVerifiedExecutionEvidence(broker, true),
      idFactory: fakeIdFactory(),
    };

    const result = executeReleaseStartCommand(
      deps,
      startRequest({ sourceCommit: broker.commitSha, branch: "main" }),
      T0,
    );
    if (result.operation !== "release.start") throw new Error("wrong operation");
    expect(result.created).toBe(true);
    expect(result.run.stage).toBe("certified");
    expect(result.run.revision).toBe(1);
    expect(result.run.sourceCommit).toBe(broker.commitSha);
    expect(result.run.branch).toBe("main");
    expect(result.run.promotion).toBeNull();
    expect(result.run.unevaluated.length).toBeGreaterThan(0);
    expect(result.run.notes.some((note) => note.includes("passed"))).toBe(true);
    // Persisted: re-reading through the real repository returns the same run.
    expect(repositories.releaseRuns.get(result.run.releaseRunId)).toEqual(result.run);
  });

  it("stays at stage candidate, with the failing check recorded, when verification failed", () => {
    const fixture = sealChainFixture();
    const broker = verifyAndAdvance(fixture, "v1\n");
    const evidenceStore = makeEvidenceStore();
    seedEvidenceManifest(evidenceStore);
    const repositories = makeRepositories();
    const deps: ReleaseRunRuntimeDependencies = {
      repositories: { releaseRuns: repositories.releaseRuns, attempts: { findById: fakeAttempt } },
      mirrors: fakeMirrorsPort(fixture),
      evidenceStore,
      resolveVerifiedExecutionEvidence: () => fakeVerifiedExecutionEvidence(broker, false),
      idFactory: fakeIdFactory(),
    };

    const result = executeReleaseStartCommand(
      deps,
      startRequest({ sourceCommit: broker.commitSha, branch: "main" }),
      T0,
    );
    if (result.operation !== "release.start") throw new Error("wrong operation");
    expect(result.run.stage).toBe("candidate");
    expect(result.run.notes.some((note) => note.includes("FAILED"))).toBe(true);
  });

  it("refuses a sourceCommit that is not the mirror's current verified tip", () => {
    const fixture = sealChainFixture();
    verifyAndAdvance(fixture, "v1\n");
    const evidenceStore = makeEvidenceStore();
    const repositories = makeRepositories();
    const deps: ReleaseRunRuntimeDependencies = {
      repositories: { releaseRuns: repositories.releaseRuns, attempts: { findById: fakeAttempt } },
      mirrors: fakeMirrorsPort(fixture),
      evidenceStore,
      resolveVerifiedExecutionEvidence: () => {
        throw new Error("should not be called");
      },
      idFactory: fakeIdFactory(),
    };

    expect(() =>
      executeReleaseStartCommand(
        deps,
        startRequest({ sourceCommit: "f".repeat(40), branch: "main" }),
        T0,
      ),
    ).toThrow(CommandHandlerError);
    try {
      executeReleaseStartCommand(
        deps,
        startRequest({ sourceCommit: "f".repeat(40), branch: "main" }),
        T0,
      );
      throw new Error("expected refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandHandlerError);
      expect((error as CommandHandlerError).code).toBe("release.source-commit-not-current");
    }
  });

  it("refuses an unregistered repository's mirror", () => {
    const fixture = sealChainFixture();
    const broker = verifyAndAdvance(fixture, "v1\n");
    const evidenceStore = makeEvidenceStore();
    const repositories = makeRepositories();
    const deps: ReleaseRunRuntimeDependencies = {
      repositories: { releaseRuns: repositories.releaseRuns, attempts: { findById: fakeAttempt } },
      mirrors: fakeMirrorsPort(fixture),
      evidenceStore,
      resolveVerifiedExecutionEvidence: () => fakeVerifiedExecutionEvidence(broker, true),
      idFactory: fakeIdFactory(),
    };
    const request = startRequest({ sourceCommit: broker.commitSha, branch: "main" });
    const wrongRepositoryRequest = {
      ...request,
      payload: { ...request.payload, repositoryId: "ff000000-0000-4000-8000-000000000099" },
    } as Extract<CommandRequestV1, { operation: "release.start" }>;

    try {
      executeReleaseStartCommand(deps, wrongRepositoryRequest, T0);
      throw new Error("expected refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandHandlerError);
      expect((error as CommandHandlerError).code).toBe("release.mirror-not-registered");
    }
  });
});

describe("release.promote", () => {
  async function certifiedRun(): Promise<{
    fixture: ChainFixture;
    broker: BrokerCommitRecord;
    repositories: FactoryRepositories;
    deps: ReleaseRunRuntimeDependencies;
    releaseRunId: string;
  }> {
    const fixture = sealChainFixture();
    const broker = verifyAndAdvance(fixture, "v1\n");
    const evidenceStore = makeEvidenceStore();
    seedEvidenceManifest(evidenceStore);
    const repositories = makeRepositories();
    const deps: ReleaseRunRuntimeDependencies = {
      repositories: { releaseRuns: repositories.releaseRuns, attempts: { findById: fakeAttempt } },
      mirrors: fakeMirrorsPort(fixture),
      evidenceStore,
      resolveVerifiedExecutionEvidence: () => fakeVerifiedExecutionEvidence(broker, true),
      idFactory: fakeIdFactory(),
    };
    const started = executeReleaseStartCommand(
      deps,
      startRequest({ sourceCommit: broker.commitSha, branch: "main" }),
      T0,
    );
    if (started.operation !== "release.start") throw new Error("wrong operation");
    return { fixture, broker, repositories, deps, releaseRunId: started.run.releaseRunId };
  }

  it("fast-forwards the real source repository and durably notes what moved", async () => {
    const { fixture, broker, repositories, deps, releaseRunId } = await certifiedRun();

    const result = executeReleasePromoteCommand(deps, promoteRequest(releaseRunId, 1), T1);
    if (result.operation !== "release.promote") throw new Error("wrong operation");
    expect(result.run.stage).toBe("certified");
    expect(result.run.revision).toBe(2);
    expect(result.run.promotion).toBeNull();
    expect(result.run.notes.at(-1)).toContain(broker.commitSha);

    expect(git(fixture.source, ["rev-parse", "HEAD"])).toBe(broker.commitSha);
    expect(repositories.releaseRuns.get(releaseRunId)?.revision).toBe(2);
  });

  it("is resumable: replaying the exact same command is idempotent (duplicate result)", async () => {
    const { deps, releaseRunId } = await certifiedRun();
    const request = promoteRequest(releaseRunId, 1);

    const first = executeReleasePromoteCommand(deps, request, T1);
    const second = executeReleasePromoteCommand(deps, request, T1);
    expect(second).toEqual(first);
  });

  it("refuses a stale expectedRevision (CAS conflict)", async () => {
    const { deps, releaseRunId } = await certifiedRun();
    executeReleasePromoteCommand(deps, promoteRequest(releaseRunId, 1), T1);

    try {
      executeReleasePromoteCommand(deps, promoteRequest(releaseRunId, 1), T2);
      throw new Error("expected a CAS conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandHandlerError);
      expect((error as CommandHandlerError).code).toBe("release-run.revision-conflict");
    }
  });

  it("refuses to promote a release run that has not been certified", async () => {
    const fixture = sealChainFixture();
    const broker = verifyAndAdvance(fixture, "v1\n");
    const evidenceStore = makeEvidenceStore();
    seedEvidenceManifest(evidenceStore);
    const repositories = makeRepositories();
    const deps: ReleaseRunRuntimeDependencies = {
      repositories: { releaseRuns: repositories.releaseRuns, attempts: { findById: fakeAttempt } },
      mirrors: fakeMirrorsPort(fixture),
      evidenceStore,
      resolveVerifiedExecutionEvidence: () => fakeVerifiedExecutionEvidence(broker, false),
      idFactory: fakeIdFactory(),
    };
    const started = executeReleaseStartCommand(
      deps,
      startRequest({ sourceCommit: broker.commitSha, branch: "main" }),
      T0,
    );
    if (started.operation !== "release.start") throw new Error("wrong operation");
    expect(started.run.stage).toBe("candidate");

    try {
      executeReleasePromoteCommand(deps, promoteRequest(started.run.releaseRunId, 1), T1);
      throw new Error("expected refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandHandlerError);
      expect((error as CommandHandlerError).code).toBe("release-run.not-certified");
    }
  });

  it("refuses to promote an unknown release run", async () => {
    const { deps } = await certifiedRun();
    try {
      executeReleasePromoteCommand(
        deps,
        promoteRequest("dd000000-0000-4000-8000-000000000099", 1),
        T1,
      );
      throw new Error("expected refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandHandlerError);
      expect((error as CommandHandlerError).code).toBe("release-run.not-found");
    }
  });

  it("refuses when the mirror's tip has moved past the run's pinned source commit", async () => {
    const { fixture, deps, releaseRunId } = await certifiedRun();
    // A second, distinct verified attempt lands and advances the mirror past the run's pinned commit.
    verifyAndAdvance(fixture, "v2\n", "aa000000-0000-4000-8000-000000000009" as AttemptId);

    try {
      executeReleasePromoteCommand(deps, promoteRequest(releaseRunId, 1), T1);
      throw new Error("expected refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(CommandHandlerError);
      expect((error as CommandHandlerError).code).toBe("release.source-commit-not-current");
    }
  });
});

describe("release.status", () => {
  it("reads back a persisted release run", async () => {
    const { deps, releaseRunId } = await certifiedRunForStatus();
    const result = buildReleaseStatusResultV1(deps.repositories, {
      schemaVersion: 1,
      commandId: commandId(),
      issuedAt: T1,
      origin: "cli",
      operation: "release.status",
      payload: { releaseRunId },
    } as Extract<CommandRequestV1, { operation: "release.status" }>);
    if (result.operation !== "release.status") throw new Error("wrong operation");
    expect(result.run.releaseRunId).toBe(releaseRunId);
  });

  it("refuses an unknown release run", () => {
    const repositories = makeRepositories();
    expect(() =>
      buildReleaseStatusResultV1({ releaseRuns: repositories.releaseRuns }, {
        schemaVersion: 1,
        commandId: commandId(),
        issuedAt: T1,
        origin: "cli",
        operation: "release.status",
        payload: { releaseRunId: "dd000000-0000-4000-8000-000000000099" },
      } as Extract<CommandRequestV1, { operation: "release.status" }>),
    ).toThrow(CommandHandlerError);
  });

  async function certifiedRunForStatus(): Promise<{
    deps: ReleaseRunRuntimeDependencies;
    releaseRunId: string;
  }> {
    const fixture = sealChainFixture();
    const broker = verifyAndAdvance(fixture, "v1\n");
    const evidenceStore = makeEvidenceStore();
    seedEvidenceManifest(evidenceStore);
    const repositories = makeRepositories();
    const deps: ReleaseRunRuntimeDependencies = {
      repositories: { releaseRuns: repositories.releaseRuns, attempts: { findById: fakeAttempt } },
      mirrors: fakeMirrorsPort(fixture),
      evidenceStore,
      resolveVerifiedExecutionEvidence: () => fakeVerifiedExecutionEvidence(broker, true),
      idFactory: fakeIdFactory(),
    };
    const started = executeReleaseStartCommand(
      deps,
      startRequest({ sourceCommit: broker.commitSha, branch: "main" }),
      T0,
    );
    if (started.operation !== "release.start") throw new Error("wrong operation");
    return { deps, releaseRunId: started.run.releaseRunId };
  }
});
