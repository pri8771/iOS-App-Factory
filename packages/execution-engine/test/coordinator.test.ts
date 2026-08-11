import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AttemptIdSchema,
  RunIdSchema,
  TaskSpecV1Schema,
  VerificationClaimsV1Schema,
  type TaskSpecV1,
} from "@app-factory/contracts";
import { EvidenceStore } from "@app-factory/evidence-store";
import {
  GitWorkspaceManager,
  type FactoryMirror,
  type FactoryWorkspaceRecord,
} from "@app-factory/git-workspace";
import {
  computeReviewInputDigest,
  parseIndependentReviewInput,
  type IndependentReviewAdapter,
} from "@app-factory/independent-review";
import {
  assertActiveAttemptLease,
  createFactoryRepositories,
  openMigratedFactoryDatabase,
} from "@app-factory/kernel";
import { runTrustedVerification } from "@app-factory/trusted-verifier";
import { afterEach, describe, expect, it } from "vitest";

import {
  FileExecutionCheckpointStore,
  VerifiedCommitCoordinatorError,
  canonicalDigest,
  canonicalJsonBytes,
  coordinateVerifiedLocalCommit,
  parseExecutionCheckpoint,
  sha256Digest,
  verifyExecutionEvidenceIndex,
  type CoordinatorFenceCheckpoint,
  type CoordinatorSideEffect,
  type VerifiedCommitCoordinatorInput,
} from "../src/index.js";

const GIT = "/usr/bin/git";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const REPOSITORY_ID = "22222222-2222-4222-8222-222222222222";
const TASK_ID = "33333333-3333-4333-8333-333333333333";
const ATTEMPT_ID = AttemptIdSchema.parse("44444444-4444-4444-8444-444444444444");
const IMPLEMENTING_RUN_ID = RunIdSchema.parse("55555555-5555-4555-8555-555555555555");
const REVIEWER_RUN_ID = RunIdSchema.parse("66666666-6666-4666-8666-666666666666");
const STEP_ID = "12121212-1212-4212-8212-121212121212";
const temporaryRoots: string[] = [];

function git(cwd: string, args: readonly string[], allowed = [0]): string {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-08-11T12:00:00Z",
      GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_AUTHOR_NAME: "Fixture",
      GIT_COMMITTER_DATE: "2026-08-11T12:00:00Z",
      GIT_COMMITTER_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "Fixture",
      GIT_TERMINAL_PROMPT: "0",
      LC_ALL: "C",
    },
    shell: false,
  });
  if (!allowed.includes(result.status ?? -1)) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

type Fixture = Readonly<{
  root: string;
  source: string;
  runtime: string;
  evidenceRoot: string;
  checkpointRoot: string;
  manager: GitWorkspaceManager;
  mirror: FactoryMirror;
  workspace: FactoryWorkspaceRecord;
  taskSpec: TaskSpecV1;
  policyBytes: Buffer;
  eventBytes: Buffer;
  input: VerifiedCommitCoordinatorInput;
}>;

function passingReviewer(calls: { count: number }): IndependentReviewAdapter {
  return {
    reviewerId: "review.local",
    reviewerVersion: "1.0.0",
    reviewerRunId: REVIEWER_RUN_ID,
    capabilities: {
      readCandidate: true,
      writeCandidate: false,
      mutatePolicy: false,
      approveRelease: false,
    },
    review: ({ reviewInputDigest }) => {
      calls.count += 1;
      return {
        schemaVersion: 1,
        reviewerId: "review.local",
        reviewerVersion: "1.0.0",
        reviewInputDigest,
        verdict: "pass",
        findings: [],
      };
    },
  };
}

function fixture(
  options: Readonly<{ protectedEdit?: boolean; reviewer?: IndependentReviewAdapter }> = {},
): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-execution-")));
  temporaryRoots.push(root);
  const source = join(root, "source");
  const runtime = join(root, "runtime");
  const evidenceRoot = join(root, "evidence");
  const checkpointRoot = join(root, "checkpoints");
  mkdirSync(source, { mode: 0o700 });
  git(source, ["init", "--initial-branch=main"]);
  mkdirSync(join(source, "src"));
  mkdirSync(join(source, "tests"));
  writeFileSync(join(source, "src", "app.ts"), "export const value = 1;\n");
  writeFileSync(join(source, "tests", "app.test.ts"), "// trusted test\n");
  git(source, ["add", "--all"]);
  git(source, ["commit", "-m", "base"]);
  const baseSha = git(source, ["rev-parse", "HEAD"]);
  const policyBytes = Buffer.from("policy-v1\n", "utf8");
  const policyDigest = sha256Digest(policyBytes);
  const taskSpec = TaskSpecV1Schema.parse({
    schemaVersion: 1,
    taskId: TASK_ID,
    projectId: PROJECT_ID,
    createdAt: "2026-08-11T12:00:00.000Z",
    title: "Change the value",
    objective: "Change only the application implementation.",
    acceptanceCriteria: [
      {
        id: "value-updated",
        statement: "The value is updated.",
        verification: "automated",
      },
    ],
    base: { repositoryId: REPOSITORY_ID, commit: baseSha },
    requestedScope: { paths: ["src"] },
    policyDigest,
  });
  const manager = new GitWorkspaceManager({ gitExecutable: GIT });
  const mirror = manager.ensureMirror({
    sourceRepositoryPath: source,
    runtimeRoot: runtime,
    repositoryId: REPOSITORY_ID,
  });
  const workspace = manager.createAttemptWorkspace(mirror, ATTEMPT_ID, baseSha);
  if (options.protectedEdit === true) {
    writeFileSync(join(workspace.worktreePath, "tests", "app.test.ts"), "// weakened\n");
  } else {
    writeFileSync(join(workspace.worktreePath, "src", "app.ts"), "export const value = 2;\n");
  }
  const eventBytes = canonicalJsonBytes([
    {
      schemaVersion: 1,
      eventId: "13131313-1313-4313-8313-131313131313",
      runId: IMPLEMENTING_RUN_ID,
      attemptId: ATTEMPT_ID,
      stepId: STEP_ID,
      fence: 1,
      sequence: 1,
      occurredAt: "2026-08-11T12:00:01.000Z",
      type: "agent.started",
      data: { adapterId: "agent.local" },
    },
    {
      schemaVersion: 1,
      eventId: "14141414-1414-4414-8414-141414141414",
      runId: IMPLEMENTING_RUN_ID,
      attemptId: ATTEMPT_ID,
      stepId: STEP_ID,
      fence: 1,
      sequence: 2,
      occurredAt: "2026-08-11T12:00:02.000Z",
      type: "agent.finished",
      data: { status: "succeeded" },
    },
  ]);
  const fallbackCalls = { count: 0 };
  const input: VerifiedCommitCoordinatorInput = {
    attemptId: ATTEMPT_ID,
    fence: 7,
    taskSpec,
    taskSpecDigest: canonicalDigest(taskSpec),
    policyBytes,
    eventLogBytes: eventBytes,
    eventDigest: sha256Digest(eventBytes),
    implementingRunId: IMPLEMENTING_RUN_ID,
    reviewerRunId: REVIEWER_RUN_ID,
    mirror,
    attemptWorkspace: workspace,
    candidatePolicy: { authorizedScopes: ["src"] },
    verificationPlans: [
      {
        checkId: "tests.unit",
        executable: "/usr/bin/true",
        args: [],
        environment: { LANG: "C", LC_ALL: "C", PATH: "/usr/bin:/bin" },
        protectedFiles: {},
        timeoutMs: 5_000,
        terminationGraceMs: 100,
        maxStdoutBytes: 1_024,
        maxStderrBytes: 1_024,
        toolVersions: [{ name: "true", version: "macOS" }],
      },
    ],
    reviewer: options.reviewer ?? passingReviewer(fallbackCalls),
  };
  return {
    root,
    source,
    runtime,
    evidenceRoot,
    checkpointRoot,
    manager,
    mirror,
    workspace,
    taskSpec,
    policyBytes,
    eventBytes,
    input,
  };
}

function ports(
  f: Fixture,
  options: Readonly<{
    active?: (checkpoint: CoordinatorFenceCheckpoint) => void;
    effect?: (effect: CoordinatorSideEffect) => void;
  }> = {},
) {
  return {
    gitWorkspace: f.manager,
    evidenceStore: new EvidenceStore(f.evidenceRoot),
    checkpoints: new FileExecutionCheckpointStore(f.checkpointRoot),
    assertActive: options.active ?? (() => undefined),
    afterSideEffect: options.effect,
    now: () => new Date("2026-08-11T13:00:00.000Z"),
  };
}

function markerRef(): string {
  return `refs/app-factory/attempts/${ATTEMPT_ID}`;
}

function markerValue(f: Fixture): string | null {
  const value = git(
    f.root,
    [
      "--git-dir",
      f.mirror.mirrorPath,
      "rev-parse",
      "--verify",
      "--quiet",
      `${markerRef()}^{commit}`,
    ],
    [0, 1],
  );
  return value.length === 0 ? null : value;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    if (existsSync(root)) {
      chmodSync(root, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("verified local commit coordinator", () => {
  it("creates one broker-owned commit after trusted tests and distinct review, then replays idempotently", async () => {
    const reviewCalls = { count: 0 };
    const f = fixture({ reviewer: passingReviewer(reviewCalls) });
    const activeCalls: CoordinatorFenceCheckpoint[] = [];
    const first = await coordinateVerifiedLocalCommit(
      f.input,
      ports(f, { active: (checkpoint) => activeCalls.push(checkpoint) }),
    );

    expect(first.checkpoint.phase).toBe("completed");
    expect(first.checkpoint.revision).toBe(5);
    expect(first.evidence.testCount).toBe(1);
    expect(reviewCalls.count).toBe(1);
    expect(activeCalls).toEqual([
      "before-input-publication",
      "before-candidate-verification",
      "after-candidate-verification",
      "before-candidate-checkpoint",
      "before-tests",
      "after-tests",
      "before-test-bundle-publication",
      "before-tests-checkpoint",
      "before-review-evidence-publication",
      "before-review",
      "after-review",
      "before-review-checkpoint",
      "before-commit",
      "during-commit-mutation",
      "during-commit-mutation",
      "after-commit",
      "before-commit-checkpoint",
      "before-evidence-publication",
      "before-evidence-checkpoint",
    ]);
    expect(markerValue(f)).toBe(first.commit.commitSha);
    expect(git(f.workspace.worktreePath, ["rev-parse", "HEAD"])).toBe(f.taskSpec.base.commit);
    expect(git(f.workspace.worktreePath, ["status", "--porcelain"])).not.toBe("");
    expect(
      git(f.root, [
        "--git-dir",
        f.mirror.mirrorPath,
        "rev-parse",
        `${first.commit.commitSha}^{tree}`,
      ]),
    ).toBe(first.evidence.index.candidateTree);
    expect(
      git(f.root, [
        "--git-dir",
        f.mirror.mirrorPath,
        "show",
        "-s",
        "--format=%an <%ae>",
        first.commit.commitSha,
      ]),
    ).toBe("App Factory Broker <broker@app-factory.invalid>");
    const message = git(f.root, [
      "--git-dir",
      f.mirror.mirrorPath,
      "show",
      "-s",
      "--format=%B",
      first.commit.commitSha,
    ]);
    expect(message.match(/App-Factory-Attempt:/gu)).toHaveLength(1);
    expect(message).toContain(`App-Factory-Attempt: ${ATTEMPT_ID}`);

    const replay = await coordinateVerifiedLocalCommit(f.input, ports(f));
    expect(replay.commit).toEqual(first.commit);
    expect(replay.evidence.indexDigest).toBe(first.evidence.indexDigest);
    expect(replay.checkpoint.revision).toBe(5);
    expect(reviewCalls.count).toBe(1);

    const reclaimedReplay = await coordinateVerifiedLocalCommit(
      { ...f.input, fence: f.input.fence + 1 },
      ports(f),
    );
    expect(reclaimedReplay.evidence.indexDigest).toBe(first.evidence.indexDigest);
    expect(reclaimedReplay.checkpoint.revision).toBe(5);
    expect(reclaimedReplay.checkpoint.fence).toBe(f.input.fence);
    expect(reviewCalls.count).toBe(1);
  });

  it("rejects a protected-path candidate before tests, review, or commit", async () => {
    const f = fixture({ protectedEdit: true });

    await expect(coordinateVerifiedLocalCommit(f.input, ports(f))).rejects.toThrow(
      /tests and test baselines are protected/iu,
    );
    expect(markerValue(f)).toBeNull();
    expect(new FileExecutionCheckpointStore(f.checkpointRoot).load(ATTEMPT_ID)).toBeNull();
  });

  it("rejects arbitrary bytes presented as an agent event log even when the digest matches", async () => {
    const f = fixture();
    const arbitraryBytes = Buffer.from("not an agent event log", "utf8");

    await expect(
      coordinateVerifiedLocalCommit(
        {
          ...f.input,
          eventLogBytes: arbitraryBytes,
          eventDigest: sha256Digest(arbitraryBytes),
        },
        ports(f),
      ),
    ).rejects.toThrow(/agent event log is not JSON/iu);
    expect(markerValue(f)).toBeNull();
    expect(new FileExecutionCheckpointStore(f.checkpointRoot).load(ATTEMPT_ID)).toBeNull();
  });

  it("rejects a malformed independent review and never creates the commit marker", async () => {
    const malformed: IndependentReviewAdapter = {
      reviewerId: "review.local",
      reviewerVersion: "1.0.0",
      reviewerRunId: REVIEWER_RUN_ID,
      capabilities: {
        readCandidate: true,
        writeCandidate: false,
        mutatePolicy: false,
        approveRelease: false,
      },
      review: () => ({ verdict: "pass" }),
    };
    const f = fixture({ reviewer: malformed });

    await expect(coordinateVerifiedLocalCommit(f.input, ports(f))).rejects.toThrow();
    expect(markerValue(f)).toBeNull();
    expect(new FileExecutionCheckpointStore(f.checkpointRoot).load(ATTEMPT_ID)?.phase).toBe(
      "tests-passed",
    );
  });

  it("rejects verification claims that are not the exact configured trusted plan", async () => {
    const f = fixture();
    const portSet = ports(f);

    await expect(
      coordinateVerifiedLocalCommit(f.input, {
        ...portSet,
        runVerification: async (plan) => {
          const result = await runTrustedVerification(plan);
          return {
            ...result,
            claims: VerificationClaimsV1Schema.parse({
              ...result.claims,
              checkId: "tests.wrong",
            }),
          };
        },
      }),
    ).rejects.toThrow(/trusted verification did not pass cleanly/iu);
    expect(markerValue(f)).toBeNull();
    expect(new FileExecutionCheckpointStore(f.checkpointRoot).load(ATTEMPT_ID)?.phase).toBe(
      "candidate-verified",
    );
  });

  it("revalidates a durable test bundle before publishing a broker marker", async () => {
    const f = fixture();
    const portSet = ports(f);
    await expect(
      coordinateVerifiedLocalCommit(f.input, {
        ...portSet,
        runVerification: async (plan) => {
          const result = await runTrustedVerification(plan);
          return {
            ...result,
            claims: VerificationClaimsV1Schema.parse({
              ...result.claims,
              checkId: "tests.wrong",
            }),
          };
        },
      }),
    ).rejects.toThrow(/trusted verification did not pass cleanly/iu);
    const store = new FileExecutionCheckpointStore(f.checkpointRoot);
    const candidateCheckpoint = store.load(ATTEMPT_ID);
    if (candidateCheckpoint === null) throw new Error("Expected candidate checkpoint");
    const planInput = f.input.verificationPlans[0];
    if (planInput === undefined) throw new Error("Expected verification plan");
    const plan = { ...planInput, executable: realpathSync(planInput.executable) };
    const emptyDigest = portSet.evidenceStore.putBlob(Buffer.alloc(0));
    const forgedRecordDigest = portSet.evidenceStore.putBlob(
      canonicalJsonBytes({
        schemaVersion: 1,
        planDigest: canonicalDigest(plan),
        claims: {
          checkId: "tests.wrong",
          argv: [plan.executable, ...plan.args],
          checkoutTree: candidateCheckpoint.candidateVerification.candidateTreeId,
          startedAt: "2026-08-11T12:10:00.000Z",
          finishedAt: "2026-08-11T12:10:01.000Z",
          toolVersions: plan.toolVersions,
          passed: true,
          exitCode: 0,
        },
        stdoutDigest: emptyDigest,
        stderrDigest: emptyDigest,
      }),
    );
    const planBundleDigest = canonicalDigest({ schemaVersion: 1, plans: [plan] });
    const forgedBundleDigest = portSet.evidenceStore.putBlob(
      canonicalJsonBytes({
        schemaVersion: 1,
        candidateTree: candidateCheckpoint.candidateVerification.candidateTreeId,
        verificationPlanBundleDigest: planBundleDigest,
        recordDigests: [forgedRecordDigest],
      }),
    );
    store.compareAndSet(
      ATTEMPT_ID,
      candidateCheckpoint.revision,
      parseExecutionCheckpoint({
        ...candidateCheckpoint,
        revision: candidateCheckpoint.revision + 1,
        phase: "tests-passed",
        testBundleDigest: forgedBundleDigest,
        updatedAt: "2026-08-11T13:00:01.000Z",
      }),
    );

    await expect(coordinateVerifiedLocalCommit(f.input, ports(f))).rejects.toThrow(
      /did not execute its bound plan/iu,
    );
    expect(markerValue(f)).toBeNull();
  });

  it("revalidates durable reviewer identity before publishing a broker marker", async () => {
    let capturedReviewInput: ReturnType<typeof parseIndependentReviewInput> | null = null;
    const reviewer: IndependentReviewAdapter = {
      ...passingReviewer({ count: 0 }),
      review: ({ reviewInputDigest, input }) => {
        capturedReviewInput = input;
        return {
          schemaVersion: 1,
          reviewerId: "review.forged",
          reviewerVersion: "1.0.0",
          reviewInputDigest,
          verdict: "pass",
          findings: [],
        };
      },
    };
    const f = fixture({ reviewer });
    const portSet = ports(f);
    await expect(coordinateVerifiedLocalCommit(f.input, portSet)).rejects.toThrow(
      /wrong reviewer identity/iu,
    );
    if (capturedReviewInput === null) throw new Error("Expected captured review input");
    const reviewInput = parseIndependentReviewInput(capturedReviewInput);
    const reviewInputArtifactDigest = portSet.evidenceStore.putBlob(
      canonicalJsonBytes(reviewInput),
    );
    const reviewReportDigest = portSet.evidenceStore.putBlob(
      canonicalJsonBytes({
        schemaVersion: 1,
        reviewerId: "review.forged",
        reviewerVersion: "1.0.0",
        reviewInputDigest: computeReviewInputDigest(reviewInput),
        verdict: "pass",
        findings: [],
      }),
    );
    const store = new FileExecutionCheckpointStore(f.checkpointRoot);
    const testsCheckpoint = store.load(ATTEMPT_ID);
    if (testsCheckpoint === null) throw new Error("Expected tests checkpoint");
    store.compareAndSet(
      ATTEMPT_ID,
      testsCheckpoint.revision,
      parseExecutionCheckpoint({
        ...testsCheckpoint,
        revision: testsCheckpoint.revision + 1,
        phase: "review-passed",
        reviewInputArtifactDigest,
        reviewReportDigest,
        updatedAt: "2026-08-11T13:00:01.000Z",
      }),
    );

    await expect(coordinateVerifiedLocalCommit(f.input, ports(f))).rejects.toThrow(
      /independent review evidence is invalid/iu,
    );
    expect(markerValue(f)).toBeNull();
  });

  it("checks the active fence immediately before commit and fails stale without a commit", async () => {
    const f = fixture();

    await expect(
      coordinateVerifiedLocalCommit(
        f.input,
        ports(f, {
          active: (checkpoint) => {
            if (checkpoint === "before-commit") throw new Error("stale fence");
          },
        }),
      ),
    ).rejects.toThrow(/stale fence/u);
    expect(markerValue(f)).toBeNull();
    expect(new FileExecutionCheckpointStore(f.checkpointRoot).load(ATTEMPT_ID)?.phase).toBe(
      "review-passed",
    );
  });

  it("revalidates the fence after commit-object creation and before publishing the marker ref", async () => {
    const f = fixture();
    let mutationChecks = 0;

    await expect(
      coordinateVerifiedLocalCommit(
        f.input,
        ports(f, {
          active: (checkpoint) => {
            if (checkpoint === "during-commit-mutation") {
              mutationChecks += 1;
              if (mutationChecks === 2) throw new Error("lease reclaimed before ref publication");
            }
          },
        }),
      ),
    ).rejects.toThrow(/lease reclaimed before ref publication/u);
    expect(mutationChecks).toBe(2);
    expect(markerValue(f)).toBeNull();
    expect(new FileExecutionCheckpointStore(f.checkpointRoot).load(ATTEMPT_ID)?.phase).toBe(
      "review-passed",
    );
  });

  it("adopts a commit under a higher reclaimed fence and rejects the stale old-fence writer", async () => {
    const reviewCalls = { count: 0 };
    const f = fixture({ reviewer: passingReviewer(reviewCalls) });
    const database = openMigratedFactoryDatabase(join(f.root, "kernel.db"));
    const repositories = createFactoryRepositories(database);
    const commandId = "77777777-7777-4777-8777-777777777777";
    const createdEventId = "88888888-8888-4888-8888-888888888888";
    const firstFenceEventId = "99999999-9999-4999-8999-999999999999";
    const secondFenceEventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    repositories.createTaskAttempt({
      command: {
        schemaVersion: 1,
        commandId,
        issuedAt: "2026-08-11T12:00:00.000Z",
        origin: "cli",
        kind: "task.submit",
        initialDesiredState: "running",
        taskSpec: f.taskSpec,
      },
      taskSpecDigest: f.input.taskSpecDigest,
      attempt: {
        schemaVersion: 1,
        attemptId: ATTEMPT_ID,
        taskId: f.taskSpec.taskId,
        taskSpecDigest: f.input.taskSpecDigest,
        attemptNumber: 1,
        state: "queued",
        desiredState: "running",
        revision: 0,
        fence: 0,
        currentStepId: null,
        blocker: null,
        outcome: null,
        createdAt: "2026-08-11T12:00:00.000Z",
        updatedAt: "2026-08-11T12:00:00.000Z",
        terminalAt: null,
      },
      event: {
        schemaVersion: 1,
        eventId: createdEventId,
        attemptId: ATTEMPT_ID,
        sequence: 1,
        occurredAt: "2026-08-11T12:00:00.000Z",
        commandId,
        causationEventId: null,
        fence: 0,
        type: "attempt.created",
        data: { taskId: f.taskSpec.taskId, taskSpecDigest: f.input.taskSpecDigest },
      },
    });
    const firstLease = repositories.leases.claim({
      leaseKey: `attempt:${ATTEMPT_ID}`,
      attemptId: ATTEMPT_ID,
      ownerId: "worker.execution.first",
      expectedAttemptRevision: 0,
      acquiredAt: "2026-08-11T12:00:01.000Z",
      expiresAt: "2026-08-11T12:00:02.000Z",
      event: {
        schemaVersion: 1,
        eventId: firstFenceEventId,
        attemptId: ATTEMPT_ID,
        sequence: 2,
        occurredAt: "2026-08-11T12:00:01.000Z",
        commandId: null,
        causationEventId: createdEventId,
        fence: 1,
        type: "attempt.fence-claimed",
        data: { previousFence: 0, newFence: 1, ownerId: "worker.execution.first" },
      },
    }).lease;
    const firstKernelEventLogDigest = canonicalDigest(
      repositories.events.listByAttempt(ATTEMPT_ID),
    );
    const fenceAwarePorts = (
      inputFence: number,
      ownerId: string,
      observedAt: string,
      crashAfterCommit: boolean,
    ) =>
      ports(f, {
        active: () => {
          assertActiveAttemptLease(database, {
            leaseKey: `attempt:${ATTEMPT_ID}`,
            attemptId: ATTEMPT_ID,
            ownerId,
            fence: inputFence,
            observedAt,
          });
        },
        effect: (effect) => {
          if (effect === "commit" && crashAfterCommit) {
            throw new Error("simulated crash after commit");
          }
        },
      });
    await expect(
      coordinateVerifiedLocalCommit(
        { ...f.input, fence: firstLease.fence },
        fenceAwarePorts(firstLease.fence, firstLease.ownerId, "2026-08-11T12:00:01.500Z", true),
      ),
    ).rejects.toThrow(/simulated crash after commit/u);
    const orphanCheckpoint = new FileExecutionCheckpointStore(f.checkpointRoot).load(ATTEMPT_ID);
    expect(orphanCheckpoint?.phase).toBe("review-passed");
    if (orphanCheckpoint === null) throw new Error("Expected the pre-commit checkpoint");
    const createdCommit = markerValue(f);
    expect(createdCommit).not.toBeNull();

    const secondLease = repositories.leases.claim({
      leaseKey: `attempt:${ATTEMPT_ID}`,
      attemptId: ATTEMPT_ID,
      ownerId: "worker.execution.second",
      expectedAttemptRevision: 1,
      acquiredAt: "2026-08-11T12:00:03.000Z",
      expiresAt: "2026-08-11T12:00:05.000Z",
      event: {
        schemaVersion: 1,
        eventId: secondFenceEventId,
        attemptId: ATTEMPT_ID,
        sequence: 3,
        occurredAt: "2026-08-11T12:00:03.000Z",
        commandId: null,
        causationEventId: firstFenceEventId,
        fence: 2,
        type: "attempt.fence-claimed",
        data: { previousFence: 1, newFence: 2, ownerId: "worker.execution.second" },
      },
    }).lease;
    expect(canonicalDigest(repositories.events.listByAttempt(ATTEMPT_ID))).not.toBe(
      firstKernelEventLogDigest,
    );
    expect(sha256Digest(f.input.eventLogBytes)).toBe(f.input.eventDigest);
    const reconciledCommit = f.manager.inspectBrokerCommit(f.mirror, {
      attemptId: ATTEMPT_ID,
      baseSha: orphanCheckpoint.candidateVerification.baseSha,
      candidateTreeId: orphanCheckpoint.candidateVerification.candidateTreeId,
      diffDigest: orphanCheckpoint.candidateVerification.diffDigest,
    });
    const skippedPhase = parseExecutionCheckpoint({
      ...orphanCheckpoint,
      revision: orphanCheckpoint.revision + 1,
      phase: "completed",
      brokerCommit: reconciledCommit,
      evidenceIndexDigest: f.input.taskSpecDigest,
      updatedAt: "2026-08-11T12:00:03.200Z",
    });
    expect(() =>
      new FileExecutionCheckpointStore(f.checkpointRoot).compareAndSet(
        ATTEMPT_ID,
        orphanCheckpoint.revision,
        skippedPhase,
      ),
    ).toThrow(/not monotonic and bound/iu);

    const skippedAdoption = parseExecutionCheckpoint({
      ...orphanCheckpoint,
      fence: secondLease.fence,
      revision: orphanCheckpoint.revision + 1,
      phase: "commit-created",
      brokerCommit: reconciledCommit,
      updatedAt: "2026-08-11T12:00:03.250Z",
    });
    expect(() =>
      new FileExecutionCheckpointStore(f.checkpointRoot).compareAndSet(
        ATTEMPT_ID,
        orphanCheckpoint.revision,
        skippedAdoption,
      ),
    ).toThrow(/not monotonic and bound/iu);

    const reclaimedInput = { ...f.input, fence: secondLease.fence };
    const recovered = await coordinateVerifiedLocalCommit(
      reclaimedInput,
      fenceAwarePorts(secondLease.fence, secondLease.ownerId, "2026-08-11T12:00:03.500Z", false),
    );
    expect(recovered.commit.commitSha).toBe(createdCommit);
    expect(recovered.checkpoint.fence).toBe(secondLease.fence);
    expect(recovered.checkpoint.revision).toBe(6);
    expect(reviewCalls.count).toBe(1);
    expect(
      git(f.root, [
        "--git-dir",
        f.mirror.mirrorPath,
        "for-each-ref",
        markerRef(),
        "--format=%(objectname)",
      ]).split("\n"),
    ).toEqual([createdCommit]);

    const staleCheckpointWrite = parseExecutionCheckpoint({
      ...orphanCheckpoint,
      revision: orphanCheckpoint.revision + 1,
      phase: "commit-created",
      brokerCommit: recovered.commit,
      updatedAt: "2026-08-11T13:00:01.000Z",
    });
    expect(() =>
      new FileExecutionCheckpointStore(f.checkpointRoot).compareAndSet(
        ATTEMPT_ID,
        orphanCheckpoint.revision,
        staleCheckpointWrite,
      ),
    ).toThrow(/revision mismatch/iu);

    await expect(
      coordinateVerifiedLocalCommit(
        { ...f.input, fence: firstLease.fence },
        fenceAwarePorts(firstLease.fence, firstLease.ownerId, "2026-08-11T12:00:03.500Z", false),
      ),
    ).rejects.toThrow(/newer fence|active lease/iu);
    expect(markerValue(f)).toBe(createdCommit);
    database.close();
  });

  it("blocks recovery when an attempt marker conflicts with the expected base or tree", async () => {
    const f = fixture();
    await expect(
      coordinateVerifiedLocalCommit(
        f.input,
        ports(f, {
          effect: (effect) => {
            if (effect === "commit") throw new Error("stop after commit");
          },
        }),
      ),
    ).rejects.toThrow(/stop after commit/u);
    git(f.root, [
      "--git-dir",
      f.mirror.mirrorPath,
      "update-ref",
      markerRef(),
      f.taskSpec.base.commit,
    ]);

    await expect(coordinateVerifiedLocalCommit(f.input, ports(f))).rejects.toThrow(
      /conflicts with the expected base/iu,
    );
  });

  it("recomputes every evidence binding and rejects a tampered content-addressed blob", async () => {
    const f = fixture();
    const portSet = ports(f);
    const result = await coordinateVerifiedLocalCommit(f.input, portSet);
    expect(
      verifyExecutionEvidenceIndex({
        indexDigest: result.evidence.indexDigest,
        evidenceStore: portSet.evidenceStore,
        gitWorkspace: f.manager,
        mirror: f.mirror,
      }).index,
    ).toEqual(result.evidence.index);

    const testHex = result.evidence.index.testDigest.slice("sha256:".length);
    const testPath = join(f.evidenceRoot, "blobs", "sha256", testHex.slice(0, 2), testHex.slice(2));
    const bytes = readFileSync(testPath);
    bytes[0] = bytes[0] === 0x7b ? 0x5b : 0x7b;
    writeFileSync(testPath, bytes);

    expect(() =>
      verifyExecutionEvidenceIndex({
        indexDigest: result.evidence.indexDigest,
        evidenceStore: portSet.evidenceStore,
        gitWorkspace: f.manager,
        mirror: f.mirror,
      }),
    ).toThrow(/digest mismatch/iu);
  });

  it("rejects newly forged review artifacts that omit bound raw evidence", async () => {
    const f = fixture();
    const portSet = ports(f);
    const result = await coordinateVerifiedLocalCommit(f.input, portSet);
    const originalReviewInput = parseIndependentReviewInput(
      JSON.parse(
        portSet.evidenceStore
          .readBlob(result.evidence.index.reviewInputArtifactDigest)
          .toString("utf8"),
      ) as unknown,
    );
    const firstRawEvidenceDigest = originalReviewInput.rawEvidenceDigests[0];
    if (firstRawEvidenceDigest === undefined) throw new Error("Expected bound review evidence");
    const incompleteReviewInput = parseIndependentReviewInput({
      ...originalReviewInput,
      rawEvidenceDigests: [firstRawEvidenceDigest],
    });
    const incompleteReviewInputDigest = portSet.evidenceStore.putBlob(
      canonicalJsonBytes(incompleteReviewInput),
    );
    const forgedReport = {
      ...result.evidence.review,
      reviewInputDigest: computeReviewInputDigest(incompleteReviewInput),
    };
    const forgedReportDigest = portSet.evidenceStore.putBlob(canonicalJsonBytes(forgedReport));
    const forgedIndex = {
      ...result.evidence.index,
      reviewInputArtifactDigest: incompleteReviewInputDigest,
      reviewDigest: forgedReportDigest,
    };
    const forgedIndexDigest = portSet.evidenceStore.putBlob(canonicalJsonBytes(forgedIndex));

    expect(() =>
      verifyExecutionEvidenceIndex({
        indexDigest: forgedIndexDigest,
        evidenceStore: portSet.evidenceStore,
        gitWorkspace: f.manager,
        mirror: f.mirror,
      }),
    ).toThrow(/independent review evidence is invalid/iu);
  });

  it("requires distinct implementation and reviewer runs", async () => {
    const f = fixture();
    const badInput = { ...f.input, reviewerRunId: IMPLEMENTING_RUN_ID };

    await expect(coordinateVerifiedLocalCommit(badInput, ports(f))).rejects.toThrow(
      VerifiedCommitCoordinatorError,
    );
    expect(markerValue(f)).toBeNull();
  });
});
