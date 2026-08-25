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

import { afterEach, describe, expect, it } from "vitest";

import {
  GitWorkspaceError,
  GitWorkspaceManager,
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
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-promotion-")));
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
function seal(f: Fixture): { mirror: FactoryMirror; rootBinding: ImmutableMirrorBinding } {
  const input = {
    sourceRepositoryPath: f.source,
    sourceIdentityDigest: `sha256:${"a".repeat(64)}`,
    runtimeRoot: f.runtime,
    repositoryId: "sample-app",
    baseCommit: f.baseSha,
    baseTree: f.baseTree,
  } as const;
  const mirror = f.manager.prepareImmutableMirror(input, () => undefined);
  const rootBinding = JSON.parse(
    readFileSync(join(mirror.mirrorPath, "app-factory-immutable-binding.json"), "utf8"),
  ) as ImmutableMirrorBinding;
  return { mirror, rootBinding };
}

/**
 * Runs one attempt end to end (worktree, candidate verification, broker commit) against the given
 * base and returns the resulting broker commit record, exactly mirroring what
 * packages/execution-engine's coordinator produces for a completed verified attempt.
 */
function runVerifiedAttempt(
  f: Fixture,
  mirror: FactoryMirror,
  attemptId: string,
  baseSha: string,
  fileBody: string,
): BrokerCommitRecord {
  const workspace = f.manager.createAttemptWorkspace(mirror, attemptId, baseSha);
  writeFileSync(join(workspace.worktreePath, "src", "app.ts"), fileBody);
  const candidate = f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] });
  return f.manager.createOrReconcileBrokerCommit(
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

describe("promoteBrokerCommitToBranch", () => {
  it("fast-forwards the source repository's checked-out branch onto the verified broker commit", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker = runVerifiedAttempt(
      f,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );

    const result = f.manager.promoteBrokerCommitToBranch(
      mirror,
      {
        attemptId: "attempt-1",
        baseSha: broker.baseSha,
        candidateTreeId: broker.candidateTreeId,
        diffDigest: broker.diffDigest,
      },
      { targetRepositoryPath: f.source, branch: "main" },
    );

    expect(result).toEqual({
      repositoryId: "sample-app",
      attemptId: "attempt-1",
      fromCommit: rootBinding.baseCommit,
      toCommit: broker.commitSha,
      branch: "main",
      treeDigest: broker.candidateTreeId,
    });
    // The source repository's real working tree and branch actually moved.
    expect(git(f.source, ["rev-parse", "HEAD"])).toBe(broker.commitSha);
    expect(git(f.source, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("main");
    expect(readFileSync(join(f.source, "src", "app.ts"), "utf8")).toBe("export const value = 2;\n");
    // No force-update, no merge commit: HEAD's parent chain is a straight line.
    expect(git(f.source, ["log", "--format=%P", "-n", "1"]).trim()).toBe(rootBinding.baseCommit);
    // Never pushed, never touched any remote.
    expect(git(f.source, ["remote"])).toBe("");
  });

  it("is idempotent: promoting an already-promoted commit again is a safe no-op", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker = runVerifiedAttempt(
      f,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    const expectation = {
      attemptId: "attempt-1",
      baseSha: broker.baseSha,
      candidateTreeId: broker.candidateTreeId,
      diffDigest: broker.diffDigest,
    } as const;
    const first = f.manager.promoteBrokerCommitToBranch(mirror, expectation, {
      targetRepositoryPath: f.source,
      branch: "main",
    });
    const second = f.manager.promoteBrokerCommitToBranch(mirror, expectation, {
      targetRepositoryPath: f.source,
      branch: "main",
    });
    // The second call's `fromCommit` correctly reflects the CURRENT HEAD (already at the broker
    // commit), not the original pre-promotion base -- everything else about the record is stable.
    expect(second.fromCommit).toBe(second.toCommit);
    expect(second.toCommit).toBe(first.toCommit);
    expect(second.branch).toBe(first.branch);
    expect(second.attemptId).toBe(first.attemptId);
    expect(second.repositoryId).toBe(first.repositoryId);
    expect(second.treeDigest).toBe(first.treeDigest);
  });

  it("refuses a dirty target working tree (uncommitted staged/unstaged change)", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker = runVerifiedAttempt(
      f,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    writeFileSync(join(f.source, "src", "app.ts"), "export const value = 999;\n");

    expect(() =>
      f.manager.promoteBrokerCommitToBranch(
        mirror,
        {
          attemptId: "attempt-1",
          baseSha: broker.baseSha,
          candidateTreeId: broker.candidateTreeId,
          diffDigest: broker.diffDigest,
        },
        { targetRepositoryPath: f.source, branch: "main" },
      ),
    ).toThrow(/working tree is not clean/);
    // Refused before touching anything.
    expect(git(f.source, ["rev-parse", "HEAD"])).toBe(rootBinding.baseCommit);
  });

  it("refuses a dirty target working tree (untracked file)", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker = runVerifiedAttempt(
      f,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    writeFileSync(join(f.source, "src", "untracked.ts"), "export const scratch = true;\n");

    expect(() =>
      f.manager.promoteBrokerCommitToBranch(
        mirror,
        {
          attemptId: "attempt-1",
          baseSha: broker.baseSha,
          candidateTreeId: broker.candidateTreeId,
          diffDigest: broker.diffDigest,
        },
        { targetRepositoryPath: f.source, branch: "main" },
      ),
    ).toThrow(GitWorkspaceError);
  });

  it("refuses when the requested branch is not the one checked out", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker = runVerifiedAttempt(
      f,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    git(f.source, ["checkout", "-b", "other-branch"]);

    expect(() =>
      f.manager.promoteBrokerCommitToBranch(
        mirror,
        {
          attemptId: "attempt-1",
          baseSha: broker.baseSha,
          candidateTreeId: broker.candidateTreeId,
          diffDigest: broker.diffDigest,
        },
        { targetRepositoryPath: f.source, branch: "main" },
      ),
    ).toThrow(/not the requested branch/);
  });

  it("refuses a detached HEAD target", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker = runVerifiedAttempt(
      f,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    git(f.source, ["checkout", "--detach", "HEAD"]);

    expect(() =>
      f.manager.promoteBrokerCommitToBranch(
        mirror,
        {
          attemptId: "attempt-1",
          baseSha: broker.baseSha,
          candidateTreeId: broker.candidateTreeId,
          diffDigest: broker.diffDigest,
        },
        { targetRepositoryPath: f.source, branch: "main" },
      ),
    ).toThrow(/detached/);
  });

  it("refuses a diverged (non-fast-forwardable) target branch, never forcing or merge-committing", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker = runVerifiedAttempt(
      f,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    // The target repository gains its OWN local commit, independent of the broker commit.
    writeFileSync(join(f.source, "src", "app.ts"), "export const value = -1;\n");
    const divergedSha = commitAll(f.source, "local diverging change");

    expect(() =>
      f.manager.promoteBrokerCommitToBranch(
        mirror,
        {
          attemptId: "attempt-1",
          baseSha: broker.baseSha,
          candidateTreeId: broker.candidateTreeId,
          diffDigest: broker.diffDigest,
        },
        { targetRepositoryPath: f.source, branch: "main" },
      ),
    ).toThrow(/cannot be fast-forwarded/);
    // Refused, not force-updated and not merge-committed: HEAD is untouched.
    expect(git(f.source, ["rev-parse", "HEAD"])).toBe(divergedSha);
  });

  it("refuses a SHA that is not a genuine broker commit in this mirror", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    // No attempt was ever run for "attempt-ghost": there is no broker commit at all.
    expect(() =>
      f.manager.promoteBrokerCommitToBranch(
        mirror,
        {
          attemptId: "attempt-ghost",
          baseSha: rootBinding.baseCommit,
          candidateTreeId: rootBinding.baseTree,
          diffDigest: `sha256:${"b".repeat(64)}`,
        },
        { targetRepositoryPath: f.source, branch: "main" },
      ),
    ).toThrow(GitWorkspaceError);
  });

  it("refuses an expectation whose fields don't match the real broker commit for that attempt", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker = runVerifiedAttempt(
      f,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    expect(() =>
      f.manager.promoteBrokerCommitToBranch(
        mirror,
        {
          attemptId: "attempt-1",
          baseSha: broker.baseSha,
          candidateTreeId: broker.candidateTreeId,
          // Wrong digest: does not match what was actually recorded for this attempt.
          diffDigest: `sha256:${"c".repeat(64)}`,
        },
        { targetRepositoryPath: f.source, branch: "main" },
      ),
    ).toThrow(GitWorkspaceError);
  });

  it("refuses a target repository that is not this mirror's own recorded source", () => {
    const f = fixture();
    const { mirror, rootBinding } = seal(f);
    const broker = runVerifiedAttempt(
      f,
      mirror,
      "attempt-1",
      rootBinding.baseCommit,
      "export const value = 2;\n",
    );
    const otherRepository = join(f.root, "unrelated-repo");
    mkdirSync(otherRepository, { mode: 0o700 });
    git(otherRepository, ["init", "--initial-branch=main"]);
    writeFileSync(join(otherRepository, "readme.md"), "unrelated\n");
    commitAll(otherRepository, "unrelated initial");

    expect(() =>
      f.manager.promoteBrokerCommitToBranch(
        mirror,
        {
          attemptId: "attempt-1",
          baseSha: broker.baseSha,
          candidateTreeId: broker.candidateTreeId,
          diffDigest: broker.diffDigest,
        },
        { targetRepositoryPath: otherRepository, branch: "main" },
      ),
    ).toThrow(/not this mirror's own recorded source/);
  });

  it("refuses a mirror that was never enrolled through prepareImmutableMirror (no sealed binding)", () => {
    const f = fixture();
    // ensureMirror only -- never sealed via prepareImmutableMirror.
    const mirror = f.manager.ensureMirror({
      sourceRepositoryPath: f.source,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
    });
    const workspace = f.manager.createAttemptWorkspace(mirror, "attempt-1", f.baseSha);
    writeFileSync(join(workspace.worktreePath, "src", "app.ts"), "export const value = 2;\n");
    const candidate = f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] });
    const broker = f.manager.createOrReconcileBrokerCommit(
      mirror,
      {
        attemptId: "attempt-1",
        baseSha: candidate.baseSha,
        candidateTreeId: candidate.candidateTreeId,
        diffDigest: candidate.diffDigest,
      },
      () => undefined,
    );

    expect(() =>
      f.manager.promoteBrokerCommitToBranch(
        mirror,
        {
          attemptId: "attempt-1",
          baseSha: broker.baseSha,
          candidateTreeId: broker.candidateTreeId,
          diffDigest: broker.diffDigest,
        },
        { targetRepositoryPath: f.source, branch: "main" },
      ),
    ).toThrow(GitWorkspaceError);
  });
});
