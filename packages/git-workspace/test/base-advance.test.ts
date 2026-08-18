import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  GitWorkspaceManager,
  type AdvancedImmutableMirrorBinding,
  type BrokerCommitRecord,
  type FactoryMirror,
  type ImmutableMirrorBinding,
} from "../src/index.js";

const GIT = "/usr/bin/git";
const temporaryRoots: string[] = [];

type Fixture = Readonly<{
  root: string;
  source: string;
  runtime: string;
  manager: GitWorkspaceManager;
  baseSha: string;
  baseTree: string;
}>;

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync(GIT, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-08-11T12:00:00Z",
      GIT_AUTHOR_EMAIL: "factory-tests@example.invalid",
      GIT_AUTHOR_NAME: "Factory Tests",
      GIT_COMMITTER_DATE: "2026-08-11T12:00:00Z",
      GIT_COMMITTER_EMAIL: "factory-tests@example.invalid",
      GIT_COMMITTER_NAME: "Factory Tests",
      GIT_TERMINAL_PROMPT: "0",
      LC_ALL: "C",
    },
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function commitAll(repository: string, message: string): string {
  git(repository, ["add", "--all"]);
  git(repository, ["commit", "-m", message]);
  return git(repository, ["rev-parse", "HEAD"]);
}

function fixture(): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-base-advance-")));
  temporaryRoots.push(root);
  const source = join(root, "source");
  const runtime = join(root, "runtime");
  mkdirSync(source, { mode: 0o700 });
  git(source, ["init", "--initial-branch=main"]);
  mkdirSync(join(source, "src"));
  writeFileSync(join(source, "src", "app.ts"), "export const value = 1;\n");
  const baseSha = commitAll(source, "initial");
  const baseTree = git(source, ["rev-parse", `${baseSha}^{tree}`]);
  return {
    root,
    source,
    runtime,
    manager: new GitWorkspaceManager({ gitExecutable: GIT }),
    baseSha,
    baseTree,
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    if (existsSync(root)) {
      chmodSync(root, 0o700);
      rmSync(root, { force: true, recursive: true });
    }
  }
});

/** Seals a fresh prepared-immutable mirror and returns it with its root binding. */
function seal(
  f: Fixture,
  manager: GitWorkspaceManager = f.manager,
): { mirror: FactoryMirror; rootBinding: ImmutableMirrorBinding } {
  const input = {
    sourceRepositoryPath: f.source,
    sourceIdentityDigest: `sha256:${"a".repeat(64)}`,
    runtimeRoot: f.runtime,
    repositoryId: "sample-app",
    baseCommit: f.baseSha,
    baseTree: f.baseTree,
  } as const;
  const mirror = manager.prepareImmutableMirror(input, () => undefined);
  const rootBinding = JSON.parse(
    readFileSync(join(mirror.mirrorPath, "app-factory-immutable-binding.json"), "utf8"),
  ) as ImmutableMirrorBinding;
  return { mirror, rootBinding };
}

/**
 * Runs one attempt end to end (worktree, candidate verification, broker
 * commit) against the given base and returns the resulting broker commit
 * record, exactly mirroring what packages/execution-engine's coordinator
 * produces for a completed verified attempt.
 */
function runVerifiedAttempt(
  manager: GitWorkspaceManager,
  mirror: FactoryMirror,
  attemptId: string,
  baseSha: string,
  fileBody: string,
): BrokerCommitRecord {
  const workspace = manager.createAttemptWorkspace(mirror, attemptId, baseSha);
  writeFileSync(join(workspace.worktreePath, "src", "app.ts"), fileBody);
  const candidate = manager.verifyCandidate(workspace, { authorizedScopes: ["src"] });
  return manager.createOrReconcileBrokerCommit(
    mirror,
    {
      attemptId,
      baseSha: candidate.baseSha,
      candidateTreeId: candidate.candidateTreeId,
      diffDigest: candidate.diffDigest,
    },
    () => undefined,
  );
}

describe("advanceImmutableMirrorBase", () => {
  it("advances a sealed mirror through a chain of two verified attempts", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);

    const broker1 = runVerifiedAttempt(
      f.manager,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );

    // Before any advance the tip IS the sealed root binding.
    expect(f.manager.readImmutableMirrorBindingTip(mirror)).toEqual(rootBinding);

    const advance1 = f.manager.advanceImmutableMirrorBase(mirror, rootBinding, broker1);
    expect(advance1.kind).toBe("prepared-immutable-mirror-advance");
    expect(advance1.chainIndex).toBe(1);
    expect(f.manager.readImmutableMirrorBindingTip(mirror)).toEqual(advance1);
    expect(advance1.baseCommit).toBe(broker1.commitSha);
    expect(advance1.baseTree).toBe(broker1.candidateTreeId);
    expect(advance1.repositoryId).toBe(rootBinding.repositoryId);
    expect(advance1.sourceIdentityDigest).toBe(rootBinding.sourceIdentityDigest);
    expect(
      existsSync(
        join(mirror.mirrorPath, "app-factory-immutable-binding-advances", "0000000001.json"),
      ),
    ).toBe(true);

    // The original sealed binding file on disk is untouched by the advance.
    const rootBindingAfter = JSON.parse(
      readFileSync(join(mirror.mirrorPath, "app-factory-immutable-binding.json"), "utf8"),
    ) as ImmutableMirrorBinding;
    expect(rootBindingAfter).toEqual(rootBinding);

    // Worktree creation from the advanced base works: detached at the new
    // SHA taken from attempt-1's broker ref, with attempt-1's content.
    const workspaceAtAdvance1 = f.manager.createAttemptWorkspace(
      mirror,
      "attempt-2",
      advance1.baseCommit,
    );
    expect(git(workspaceAtAdvance1.worktreePath, ["rev-parse", "HEAD"])).toBe(advance1.baseCommit);
    // "HEAD" (rather than a branch name) proves the worktree is detached.
    expect(git(workspaceAtAdvance1.worktreePath, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe(
      "HEAD",
    );
    expect(readFileSync(join(workspaceAtAdvance1.worktreePath, "src", "app.ts"), "utf8")).toBe(
      "export const value = 2;\n",
    );

    // Second verified attempt, based on the now-current (advanced) base.
    writeFileSync(
      join(workspaceAtAdvance1.worktreePath, "src", "app.ts"),
      "export const value = 3;\n",
    );
    const candidate2 = f.manager.verifyCandidate(workspaceAtAdvance1, {
      authorizedScopes: ["src"],
    });
    const broker2 = f.manager.createOrReconcileBrokerCommit(
      mirror,
      {
        attemptId: "attempt-2",
        baseSha: candidate2.baseSha,
        candidateTreeId: candidate2.candidateTreeId,
        diffDigest: candidate2.diffDigest,
      },
      () => undefined,
    );
    expect(broker2.baseSha).toBe(advance1.baseCommit);

    const advance2 = f.manager.advanceImmutableMirrorBase(mirror, advance1, broker2);
    expect(advance2.chainIndex).toBe(2);
    expect(advance2.baseCommit).toBe(broker2.commitSha);
    // The tip reader walks the whole validated chain and returns its last link.
    expect(f.manager.readImmutableMirrorBindingTip(mirror)).toEqual(advance2);
    expect(advance2.previousBindingDigest).not.toBe(advance1.previousBindingDigest);
    expect(
      existsSync(
        join(mirror.mirrorPath, "app-factory-immutable-binding-advances", "0000000002.json"),
      ),
    ).toBe(true);

    const workspaceAtAdvance2 = f.manager.createAttemptWorkspace(
      mirror,
      "attempt-3",
      advance2.baseCommit,
    );
    expect(git(workspaceAtAdvance2.worktreePath, ["rev-parse", "HEAD"])).toBe(advance2.baseCommit);
    expect(readFileSync(join(workspaceAtAdvance2.worktreePath, "src", "app.ts"), "utf8")).toBe(
      "export const value = 3;\n",
    );

    // Re-opening the mirror through its original enrollment input still
    // resolves to the original, untouched allowed base: today's daemon
    // (unmodified by this task) keeps pinning allowedBaseCommit to whatever
    // it was enrolled with; advancing is purely additive.
    const reopened = f.manager.openPreparedImmutableMirror({
      sourceRepositoryPath: f.source,
      sourceIdentityDigest: rootBinding.sourceIdentityDigest as `sha256:${string}`,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
      baseCommit: rootBinding.baseCommit,
      baseTree: rootBinding.baseTree,
    });
    expect(reopened).toEqual(mirror);
  });

  it("replays an already-published advance idempotently instead of forking the chain", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker1 = runVerifiedAttempt(
      f.manager,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );

    const first = f.manager.advanceImmutableMirrorBase(mirror, rootBinding, broker1);
    const replay = f.manager.advanceImmutableMirrorBase(mirror, rootBinding, broker1);

    expect(replay).toEqual(first);
    expect(readdirSync(join(mirror.mirrorPath, "app-factory-immutable-binding-advances"))).toEqual([
      "0000000001.json",
    ]);
  });

  it("rejects a non-linear advance whose broker parent is not the current base", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);

    // Two sibling attempts both based directly on the sealed root.
    const brokerA = runVerifiedAttempt(
      f.manager,
      mirror,
      "attempt-a",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    const brokerB = runVerifiedAttempt(
      f.manager,
      mirror,
      "attempt-b",
      rootBinding.baseCommit,
      "export const value = 999;\n",
    );

    const advanceA = f.manager.advanceImmutableMirrorBase(mirror, rootBinding, brokerA);

    // attempt-b's broker commit is valid and real, but its parent is the
    // ROOT base, not the now-current advanced base: advancing the chain tip
    // with it would make the enrolled history non-linear.
    expect(() => f.manager.advanceImmutableMirrorBase(mirror, advanceA, brokerB)).toThrow(
      /parent .* not equal|non-linear/iu,
    );
  });

  it("fails closed when the broker commit does not exist at its attempt ref", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const forged: BrokerCommitRecord = {
      schemaVersion: 1,
      attemptId: "never-ran",
      attemptMarker: "never-ran",
      refName: "refs/app-factory/attempts/never-ran",
      baseSha: rootBinding.baseCommit,
      candidateTreeId: rootBinding.baseTree,
      diffDigest: `sha256:${"1".repeat(64)}`,
      commitSha: rootBinding.baseCommit,
      commitDigest: `sha256:${"2".repeat(64)}`,
    };

    expect(() => f.manager.advanceImmutableMirrorBase(mirror, rootBinding, forged)).toThrow(
      /no broker commit exists/iu,
    );
  });

  it("fails closed when the supplied broker commit record has tampered headers", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker1 = runVerifiedAttempt(
      f.manager,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    // Same expectation fields (attemptId/baseSha/candidateTreeId/diffDigest)
    // so the ref lookup still succeeds, but a forged commitSha/commitDigest
    // that do not match what is actually recorded at that ref.
    const tampered: BrokerCommitRecord = {
      ...broker1,
      commitSha: rootBinding.baseCommit,
      commitDigest: `sha256:${"3".repeat(64)}`,
    };

    expect(() => f.manager.advanceImmutableMirrorBase(mirror, rootBinding, tampered)).toThrow(
      /does not match the mirror.s own Git objects/iu,
    );
  });

  it("rejects a conflicting advance attempt from an already-superseded predecessor", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker1 = runVerifiedAttempt(
      f.manager,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    f.manager.advanceImmutableMirrorBase(mirror, rootBinding, broker1);

    const broker2 = runVerifiedAttempt(
      f.manager,
      mirror,
      "attempt-2",
      rootBinding.baseCommit,
      "export const value = 42;\n",
    );

    // Caller still holds the ROOT binding even though position 1 in the
    // chain has already been settled by attempt-1's broker commit. Replaying
    // exactly attempt-1's own (rootBinding, broker1) pair is safe (see the
    // idempotent-replay test above); attempting to settle that same position
    // with a DIFFERENT broker commit must be rejected as a conflict rather
    // than silently forking the chain or overwriting the earlier link.
    expect(() => f.manager.advanceImmutableMirrorBase(mirror, rootBinding, broker2)).toThrow(
      /already exists with different content/iu,
    );
  });

  it("fails closed on a gap in the on-disk advance chain", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker1 = runVerifiedAttempt(
      f.manager,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    const advance1 = f.manager.advanceImmutableMirrorBase(mirror, rootBinding, broker1);

    // Simulate corruption: a link at chain index 3 exists on disk with no
    // link at chain index 2 to precede it.
    const advanceDirectory = join(mirror.mirrorPath, "app-factory-immutable-binding-advances");
    const forgedLink: AdvancedImmutableMirrorBinding = {
      ...advance1,
      chainIndex: 3,
    };
    writeFileSync(
      join(advanceDirectory, "0000000003.json"),
      `${JSON.stringify(forgedLink, null, 2)}\n`,
    );

    const broker2 = runVerifiedAttempt(
      f.manager,
      mirror,
      "attempt-2",
      advance1.baseCommit,
      "export const value = 5;\n",
    );
    expect(() => f.manager.advanceImmutableMirrorBase(mirror, advance1, broker2)).toThrow(/gap/iu);
  });

  it.each(["binding-advance-after-verification", "binding-advance-after-write"] as const)(
    "reconciles a crash boundary at %s without forking the advance chain",
    (phase) => {
      const f = fixture();
      const { mirror, rootBinding } = seal(f);
      const broker1 = runVerifiedAttempt(
        f.manager,
        mirror,
        "attempt-1",
        rootBinding.baseCommit,
        "export const value = 2;\n",
      );

      let crash = true;
      const crashingManager = new GitWorkspaceManager({
        gitExecutable: GIT,
        publicationCheckpoint: (observed) => {
          if (crash && observed === phase) {
            crash = false;
            throw new Error(`simulated crash at ${phase}`);
          }
        },
      });

      expect(() =>
        crashingManager.advanceImmutableMirrorBase(mirror, rootBinding, broker1),
      ).toThrow(`simulated crash at ${phase}`);

      const recovered = f.manager.advanceImmutableMirrorBase(mirror, rootBinding, broker1);
      expect(recovered.chainIndex).toBe(1);
      expect(recovered.baseCommit).toBe(broker1.commitSha);
      expect(
        readdirSync(join(mirror.mirrorPath, "app-factory-immutable-binding-advances")),
      ).toEqual(["0000000001.json"]);

      const workspace = f.manager.createAttemptWorkspace(
        mirror,
        `attempt-after-${phase}`,
        recovered.baseCommit,
      );
      expect(git(workspace.worktreePath, ["rev-parse", "HEAD"])).toBe(recovered.baseCommit);
    },
  );

  it("rejects an unsealed mirror (no prepared-immutable binding to advance from)", () => {
    const f = fixture();
    const mirror = f.manager.ensureMirror({
      sourceRepositoryPath: f.source,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
    });
    const forgedRoot: ImmutableMirrorBinding = {
      schemaVersion: 1,
      kind: "prepared-immutable-mirror",
      repositoryId: "sample-app",
      sourceRepositoryPath: f.source,
      sourceIdentityDigest: `sha256:${"a".repeat(64)}`,
      mirrorPath: mirror.mirrorPath,
      baseCommit: f.baseSha,
      baseTree: f.baseTree,
    };
    const forgedBroker: BrokerCommitRecord = {
      schemaVersion: 1,
      attemptId: "attempt-1",
      attemptMarker: "attempt-1",
      refName: "refs/app-factory/attempts/attempt-1",
      baseSha: f.baseSha,
      candidateTreeId: f.baseTree,
      diffDigest: `sha256:${"1".repeat(64)}`,
      commitSha: f.baseSha,
      commitDigest: `sha256:${"2".repeat(64)}`,
    };

    expect(() => f.manager.advanceImmutableMirrorBase(mirror, forgedRoot, forgedBroker)).toThrow(
      /no sealed immutable binding/iu,
    );
  });
});
