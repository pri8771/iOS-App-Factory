import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  GitWorkspaceError,
  GitWorkspaceManager,
  classifyProtectedPath,
  decodeProtectedPathPolicyExtension,
  parseProtectedPathPolicyExtension,
  type FactoryMirror,
  type FactoryWorkspaceRecord,
} from "../src/index.js";

const GIT = "/usr/bin/git";
const temporaryRoots: string[] = [];

type Fixture = Readonly<{
  root: string;
  source: string;
  runtime: string;
  manager: GitWorkspaceManager;
  baseSha: string;
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

function commitIndex(repository: string, message: string): string {
  git(repository, ["commit", "-m", message]);
  return git(repository, ["rev-parse", "HEAD"]);
}

function fixture(): Fixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "app-factory-git-workspace-")));
  temporaryRoots.push(root);
  const source = join(root, "source");
  const runtime = join(root, "runtime");
  mkdirSync(source, { mode: 0o700 });
  git(source, ["init", "--initial-branch=main"]);
  mkdirSync(join(source, "src"));
  mkdirSync(join(source, "tests"));
  writeFileSync(join(source, "src", "app.ts"), "export const value = 1;\n");
  writeFileSync(join(source, "tests", "app.test.ts"), "// protected test\n");
  const baseSha = commitAll(source, "initial");
  return {
    root,
    source,
    runtime,
    manager: new GitWorkspaceManager({ gitExecutable: GIT }),
    baseSha,
  };
}

function prepare(
  f: Fixture,
  attemptId = "attempt-001",
): {
  mirror: FactoryMirror;
  workspace: FactoryWorkspaceRecord;
} {
  const mirror = f.manager.ensureMirror({
    sourceRepositoryPath: f.source,
    runtimeRoot: f.runtime,
    repositoryId: "sample-app",
  });
  const workspace = f.manager.createAttemptWorkspace(mirror, attemptId, f.baseSha);
  return { mirror, workspace };
}

function updateSource(workspace: FactoryWorkspaceRecord, body: string): void {
  writeFileSync(join(workspace.worktreePath, "src", "app.ts"), body);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    if (existsSync(root)) {
      chmodSync(root, 0o700);
      rmSync(root, { force: true, recursive: true });
    }
  }
});

describe("Factory-owned Git workspace", () => {
  it.each(["mirror-after-intent", "mirror-after-git", "mirror-after-marker"] as const)(
    "reconciles a crash boundary at %s without accepting a partial mirror",
    (phase) => {
      const f = fixture();
      let crash = true;
      const manager = new GitWorkspaceManager({
        gitExecutable: GIT,
        publicationCheckpoint: (observed) => {
          if (crash && observed === phase) {
            crash = false;
            throw new Error(`simulated crash at ${phase}`);
          }
        },
      });
      const input = {
        sourceRepositoryPath: f.source,
        runtimeRoot: f.runtime,
        repositoryId: "sample-app",
      };

      expect(() => manager.ensureMirror(input)).toThrow(`simulated crash at ${phase}`);
      const recovered = manager.ensureMirror(input);

      expect(git(f.root, ["--git-dir", recovered.mirrorPath, "rev-parse", f.baseSha])).toBe(
        f.baseSha,
      );
      expect(lstatSync(recovered.mirrorPath).isDirectory()).toBe(true);
    },
  );

  it.each(["workspace-after-intent", "workspace-after-git", "workspace-after-marker"] as const)(
    "reconciles a crash boundary at %s without accepting a partial worktree",
    (phase) => {
      const f = fixture();
      let crash = true;
      const manager = new GitWorkspaceManager({
        gitExecutable: GIT,
        publicationCheckpoint: (observed) => {
          if (crash && observed === phase) {
            crash = false;
            throw new Error(`simulated crash at ${phase}`);
          }
        },
      });
      const mirror = manager.ensureMirror({
        sourceRepositoryPath: f.source,
        runtimeRoot: f.runtime,
        repositoryId: "sample-app",
      });

      expect(() => manager.createAttemptWorkspace(mirror, "attempt-crash", f.baseSha)).toThrow(
        `simulated crash at ${phase}`,
      );
      const recovered = manager.createOrReconcileAttemptWorkspace(
        mirror,
        "attempt-crash",
        f.baseSha,
      );

      expect(git(recovered.worktreePath, ["rev-parse", "HEAD"])).toBe(f.baseSha);
      expect(git(recovered.worktreePath, ["status", "--porcelain"])).toBe("");
    },
  );

  it("reconciles a same-inode mirror-intent temporary link left by hard kill", () => {
    const f = fixture();
    let crash = true;
    const manager = new GitWorkspaceManager({
      gitExecutable: GIT,
      publicationCheckpoint: (phase) => {
        if (crash && phase === "mirror-after-intent") {
          crash = false;
          throw new Error("simulated hard kill after mirror intent link");
        }
      },
    });
    const input = {
      sourceRepositoryPath: f.source,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
    };
    expect(() => manager.ensureMirror(input)).toThrow("simulated hard kill");
    const intent = join(f.runtime, "publication-intents", "mirrors", "sample-app.json");
    const remnant = `${intent}.tmp-123-00000000-0000-4000-8000-000000000099`;
    linkSync(intent, remnant);

    const recovered = manager.ensureMirror(input);

    expect(git(f.root, ["--git-dir", recovered.mirrorPath, "rev-parse", f.baseSha])).toBe(
      f.baseSha,
    );
    expect(existsSync(remnant)).toBe(false);
  });

  it("reconciles a same-inode workspace-intent temporary link left by hard kill", () => {
    const f = fixture();
    const mirror = f.manager.ensureMirror({
      sourceRepositoryPath: f.source,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
    });
    let crash = true;
    const manager = new GitWorkspaceManager({
      gitExecutable: GIT,
      publicationCheckpoint: (phase) => {
        if (crash && phase === "workspace-after-intent") {
          crash = false;
          throw new Error("simulated hard kill after workspace intent link");
        }
      },
    });
    expect(() => manager.createAttemptWorkspace(mirror, "hard-link", f.baseSha)).toThrow(
      "simulated hard kill",
    );
    const intent = join(
      f.runtime,
      "publication-intents",
      "workspaces",
      "sample-app",
      "attempt-hard-link.json",
    );
    const remnant = `${intent}.tmp-123-00000000-0000-4000-8000-000000000099`;
    linkSync(intent, remnant);

    const recovered = manager.createOrReconcileAttemptWorkspace(mirror, "hard-link", f.baseSha);

    expect(git(recovered.worktreePath, ["status", "--porcelain"])).toBe("");
    expect(existsSync(remnant)).toBe(false);
  });

  it("fails closed when a publication intent has an unknown hard link", () => {
    const f = fixture();
    let crash = true;
    const manager = new GitWorkspaceManager({
      gitExecutable: GIT,
      publicationCheckpoint: (phase) => {
        if (crash && phase === "mirror-after-intent") {
          crash = false;
          throw new Error("simulated hard kill before unknown link");
        }
      },
    });
    const input = {
      sourceRepositoryPath: f.source,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
    };
    expect(() => manager.ensureMirror(input)).toThrow("simulated hard kill");
    linkSync(
      join(f.runtime, "publication-intents", "mirrors", "sample-app.json"),
      join(f.root, "unknown-intent-hard-link"),
    );

    expect(() => manager.ensureMirror(input)).toThrow("unknown hard link");
  });

  it("uses a clean detached worktree even when the user's checkout is dirty", () => {
    const f = fixture();
    writeFileSync(join(f.source, "src", "app.ts"), "uncommitted and unsafe\n");
    writeFileSync(join(f.source, "src", "untracked.ts"), "do not mirror me\n");

    const { workspace } = prepare(f);

    expect(workspace.worktreePath).not.toBe(f.source);
    expect(workspace.baseSha).toBe(f.baseSha);
    expect(workspace.initialHeadSha).toBe(f.baseSha);
    expect(git(workspace.worktreePath, ["rev-parse", "HEAD"])).toBe(f.baseSha);
    expect(git(workspace.worktreePath, ["status", "--porcelain"])).toBe("");
    expect(readFileSync(join(workspace.worktreePath, "src", "app.ts"), "utf8")).toBe(
      "export const value = 1;\n",
    );
    expect(existsSync(join(workspace.worktreePath, "src", "untracked.ts"))).toBe(false);
  });

  it("accepts tracked and untracked dirty edits without moving attempt HEAD", () => {
    const f = fixture();
    const { mirror, workspace } = prepare(f);
    updateSource(workspace, "export const value = 2;\n");
    writeFileSync(
      join(workspace.worktreePath, "src", "new-feature.ts"),
      "export const newFeature = true;\n",
    );

    const first = f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] });
    const second = f.manager.verifyCandidate(workspace, { authorizedScopes: ["src/"] });

    expect(first).toEqual(second);
    expect(first.baseSha).toBe(f.baseSha);
    expect(first.attemptHeadSha).toBe(f.baseSha);
    expect(git(workspace.worktreePath, ["rev-parse", "HEAD"])).toBe(f.baseSha);
    expect(first.candidateTreeId).not.toBe(
      git(workspace.worktreePath, ["rev-parse", "HEAD^{tree}"]),
    );
    expect(first.changedPaths).toEqual([
      expect.objectContaining({ path: "src/app.ts", status: "M", sizeBytes: 24 }),
      expect.objectContaining({ path: "src/new-feature.ts", status: "A", sizeBytes: 32 }),
    ]);
    expect(first.diffDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(first.treeDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(first.diffBytes).toBeGreaterThan(0);
    expect(
      f.manager
        .readVerifiedCandidatePatch(mirror, first, { authorizedScopes: ["src"] })
        .toString("utf8"),
    ).toContain("export const newFeature = true;");
  });

  it("reconciles the same owned attempt worktree with its uncommitted candidate intact", () => {
    const f = fixture();
    const { mirror, workspace } = prepare(f, "attempt-restart");
    const baseTree = git(f.source, ["rev-parse", "HEAD^{tree}"]);
    expect(() => f.manager.assertMirrorCommitTree(mirror, f.baseSha, baseTree)).not.toThrow();
    expect(() =>
      f.manager.assertMirrorCommitTree(mirror, f.baseSha, "f".repeat(baseTree.length)),
    ).toThrow(/reviewed tree/u);
    updateSource(workspace, "export const value = 42;\n");

    const recovered = f.manager.createOrReconcileAttemptWorkspace(
      mirror,
      "attempt-restart",
      f.baseSha,
    );

    expect(recovered).toEqual(workspace);
    expect(git(recovered.worktreePath, ["rev-parse", "HEAD"])).toBe(f.baseSha);
    expect(readFileSync(join(recovered.worktreePath, "src", "app.ts"), "utf8")).toBe(
      "export const value = 42;\n",
    );
    expect(() =>
      f.manager.createOrReconcileAttemptWorkspace(mirror, "attempt-restart", "f".repeat(40)),
    ).toThrow();
  });

  it("creates ownership-isolated read-only verification checkouts and safely cleans each", () => {
    const f = fixture();
    const { mirror, workspace } = prepare(f);
    updateSource(workspace, "export const value = 3;\n");
    const candidate = f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] });

    const verification = f.manager.createTrustedVerificationCheckout(mirror, workspace, candidate);
    const concurrent = f.manager.createTrustedVerificationCheckout(mirror, workspace, candidate);

    expect(verification.kind).toBe("verification");
    expect(concurrent.kind).toBe("verification");
    expect(concurrent.worktreePath).not.toBe(verification.worktreePath);
    expect(concurrent.ownershipNonce).not.toBe(verification.ownershipNonce);
    expect(verification.readOnly).toBe(true);
    expect(verification.candidateTreeId).toBe(candidate.candidateTreeId);
    expect(verification.worktreePath).not.toBe(workspace.worktreePath);
    expect(git(verification.worktreePath, ["rev-parse", "HEAD"])).toBe(verification.initialHeadSha);
    expect(git(verification.worktreePath, ["rev-parse", "HEAD^{tree}"])).toBe(
      candidate.candidateTreeId,
    );
    expect(git(workspace.worktreePath, ["rev-parse", "HEAD"])).toBe(f.baseSha);
    expect(git(workspace.worktreePath, ["status", "--porcelain"])).not.toBe("");
    expect(lstatSync(join(verification.worktreePath, "src", "app.ts")).mode & 0o222).toBe(0);

    f.manager.cleanupWorkspace(verification);
    expect(existsSync(concurrent.worktreePath)).toBe(true);
    expect(git(concurrent.worktreePath, ["rev-parse", "HEAD^{tree}"])).toBe(
      candidate.candidateTreeId,
    );
    f.manager.cleanupWorkspace(concurrent);
    f.manager.cleanupWorkspace(workspace);
    expect(existsSync(verification.worktreePath)).toBe(false);
    expect(existsSync(concurrent.worktreePath)).toBe(false);
    expect(existsSync(workspace.worktreePath)).toBe(false);
    expect(existsSync(f.source)).toBe(true);
  });

  it("rejects cleanup when a caller tampers with a Factory ownership record", () => {
    const f = fixture();
    const { workspace } = prepare(f);
    const tampered = { ...workspace, worktreePath: f.source } as FactoryWorkspaceRecord;

    expect(() => f.manager.cleanupWorkspace(tampered)).toThrow(GitWorkspaceError);
    expect(existsSync(f.source)).toBe(true);
    expect(existsSync(workspace.worktreePath)).toBe(true);
  });

  it("rejects protected tests even when the whole repository is authorized", () => {
    const f = fixture();
    const { workspace } = prepare(f);
    writeFileSync(join(workspace.worktreePath, "tests", "app.test.ts"), "// weakened test\n");

    expect(() => f.manager.verifyCandidate(workspace, { authorizedScopes: ["."] })).toThrow(
      /tests and test baselines are protected/u,
    );
  });

  it("rejects edits outside the explicitly authorized scope", () => {
    const f = fixture();
    const { workspace } = prepare(f);
    writeFileSync(join(workspace.worktreePath, "README.md"), "outside scope\n");

    expect(() => f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] })).toThrow(
      /outside authorized scopes: README\.md/u,
    );
  });

  it("rejects a changed symbolic link that escapes the repository", () => {
    const f = fixture();
    const { workspace } = prepare(f);
    symlinkSync("../../../outside", join(workspace.worktreePath, "src", "escape"));

    expect(() => f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] })).toThrow(
      /(?:symbolic link|unsafe git path)/iu,
    );
  });

  it("rejects a changed symbolic link into worktree Git administration data", () => {
    const f = fixture();
    const { workspace } = prepare(f);
    symlinkSync("../.git", join(workspace.worktreePath, "src", "git-admin"));

    expect(() => f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] })).toThrow(
      /Git administration data/iu,
    );
  });

  it("rejects a mixed-case Git-admin symlink target on case-insensitive filesystems", () => {
    const f = fixture();
    const { workspace } = prepare(f);
    symlinkSync("../.GIT", join(workspace.worktreePath, "src", "git-admin-mixed-case"));

    expect(() => f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] })).toThrow(
      /Git administration data/iu,
    );
  });

  it("rejects a changed file hard-linked to an inode outside the worktree", () => {
    const f = fixture();
    const { workspace } = prepare(f);
    const outside = join(f.root, "outside-private.txt");
    writeFileSync(outside, "outside private bytes\n");
    linkSync(outside, join(workspace.worktreePath, "src", "linked.ts"));

    expect(() => f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] })).toThrow(
      /multiple hard links/iu,
    );
  });

  it("rejects binary and oversized diffs", () => {
    const binaryFixture = fixture();
    const { workspace: binaryWorkspace } = prepare(binaryFixture, "attempt-binary");
    writeFileSync(
      join(binaryWorkspace.worktreePath, "src", "asset.bin"),
      Buffer.from([0, 1, 2, 3]),
    );
    expect(() =>
      binaryFixture.manager.verifyCandidate(binaryWorkspace, { authorizedScopes: ["src"] }),
    ).toThrow(/binary diffs are not allowed/iu);

    const largeFixture = fixture();
    const { workspace: largeWorkspace } = prepare(largeFixture, "attempt-large");
    updateSource(largeWorkspace, "x".repeat(65) + "\n");
    expect(() =>
      largeFixture.manager.verifyCandidate(largeWorkspace, {
        authorizedScopes: ["src"],
        maxChangedFileBytes: 64,
      }),
    ).toThrow(/changed file exceeds 64 bytes/iu);
  });

  it("rejects a coding-agent commit instead of treating it as the candidate", () => {
    const f = fixture();
    const { workspace } = prepare(f);
    updateSource(workspace, "export const value = 7;\n");
    commitAll(workspace.worktreePath, "agent must not commit");

    expect(() => f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] })).toThrow(
      /coding-agent commits are not accepted/iu,
    );
  });

  it("fails closed when candidate content mutates after hashing", () => {
    const f = fixture();
    let checkpointCalls = 0;
    const manager = new GitWorkspaceManager({
      gitExecutable: GIT,
      verificationCheckpoint: (worktreePath) => {
        checkpointCalls += 1;
        writeFileSync(join(worktreePath, "src", "app.ts"), "export const value = 99;\n");
      },
    });
    const mirror = manager.ensureMirror({
      sourceRepositoryPath: f.source,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
    });
    const workspace = manager.createAttemptWorkspace(mirror, "attempt-race", f.baseSha);
    updateSource(workspace, "export const value = 8;\n");

    expect(() => manager.verifyCandidate(workspace, { authorizedScopes: ["src"] })).toThrow(
      /candidate content changed during verification/iu,
    );
    expect(checkpointCalls).toBe(1);
    expect(git(workspace.worktreePath, ["rev-parse", "HEAD"])).toBe(f.baseSha);
  });

  it("keeps an existing attempt pinned when the source branch advances", () => {
    const f = fixture();
    const first = prepare(f, "attempt-before-advance");

    writeFileSync(join(f.source, "src", "app.ts"), "export const value = 9;\n");
    const advancedSha = commitAll(f.source, "advance main");
    const refreshedMirror = f.manager.ensureMirror({
      sourceRepositoryPath: f.source,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
    });
    const second = f.manager.createAttemptWorkspace(
      refreshedMirror,
      "attempt-after-advance",
      advancedSha,
    );

    expect(git(first.workspace.worktreePath, ["rev-parse", "HEAD"])).toBe(f.baseSha);
    expect(git(second.worktreePath, ["rev-parse", "HEAD"])).toBe(advancedSha);
    expect(first.workspace.baseSha).toBe(f.baseSha);
    expect(second.baseSha).toBe(advancedSha);
  });

  it("seals a prepared mirror and opens it without touching the source", () => {
    const f = fixture();
    const baseTree = git(f.source, ["rev-parse", `${f.baseSha}^{tree}`]);
    const input = {
      sourceRepositoryPath: f.source,
      sourceIdentityDigest: `sha256:${"a".repeat(64)}`,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
      baseCommit: f.baseSha,
      baseTree,
    } as const;
    let revalidations = 0;
    const prepared = f.manager.prepareImmutableMirror(input, () => {
      revalidations += 1;
      expect(
        git(f.root, [
          "--git-dir",
          join(f.runtime, "mirrors", "sample-app.git"),
          "rev-parse",
          f.baseSha,
        ]),
      ).toBe(f.baseSha);
    });
    expect(revalidations).toBe(1);
    expect(() => f.manager.ensureMirror(input)).toThrow(/cannot be refreshed/iu);

    rmSync(f.source, { recursive: true, force: false });
    const reopened = f.manager.openPreparedImmutableMirror(input);
    expect(reopened).toEqual(prepared);
    const workspace = f.manager.createAttemptWorkspace(
      reopened,
      "attempt-from-sealed-mirror",
      f.baseSha,
    );
    expect(git(workspace.worktreePath, ["rev-parse", "HEAD"])).toBe(f.baseSha);
  });

  it("does not publish an immutable binding when source revalidation fails", () => {
    const f = fixture();
    const baseTree = git(f.source, ["rev-parse", `${f.baseSha}^{tree}`]);
    const input = {
      sourceRepositoryPath: f.source,
      sourceIdentityDigest: `sha256:${"b".repeat(64)}`,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
      baseCommit: f.baseSha,
      baseTree,
    } as const;

    expect(() =>
      f.manager.prepareImmutableMirror(input, () => {
        throw new Error("source changed during enrollment");
      }),
    ).toThrow("source changed during enrollment");
    expect(
      existsSync(
        join(f.runtime, "mirrors", "sample-app.git", "app-factory-immutable-binding.json"),
      ),
    ).toBe(false);
  });

  it("rejects a tampered immutable mirror binding", () => {
    const f = fixture();
    const input = {
      sourceRepositoryPath: f.source,
      sourceIdentityDigest: `sha256:${"c".repeat(64)}`,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
      baseCommit: f.baseSha,
      baseTree: git(f.source, ["rev-parse", `${f.baseSha}^{tree}`]),
    } as const;
    const mirror = f.manager.prepareImmutableMirror(input, () => undefined);
    const bindingPath = join(mirror.mirrorPath, "app-factory-immutable-binding.json");
    const binding = JSON.parse(readFileSync(bindingPath, "utf8")) as Record<string, unknown>;
    binding.sourceIdentityDigest = `sha256:${"d".repeat(64)}`;
    writeFileSync(bindingPath, `${JSON.stringify(binding, null, 2)}\n`);

    expect(() => f.manager.openPreparedImmutableMirror(input)).toThrow(
      /binding does not match enrollment/iu,
    );
  });

  it("rejects submodules and case-colliding trees before creating an agent worktree", () => {
    const submoduleFixture = fixture();
    git(submoduleFixture.source, [
      "update-index",
      "--add",
      "--cacheinfo",
      `160000,${submoduleFixture.baseSha},vendor/library`,
    ]);
    const submoduleSha = commitIndex(submoduleFixture.source, "add gitlink");
    const submoduleMirror = submoduleFixture.manager.ensureMirror({
      sourceRepositoryPath: submoduleFixture.source,
      runtimeRoot: submoduleFixture.runtime,
      repositoryId: "sample-app",
    });
    expect(() =>
      submoduleFixture.manager.createAttemptWorkspace(
        submoduleMirror,
        "attempt-submodule",
        submoduleSha,
      ),
    ).toThrow(/submodules are not allowed/iu);

    const collisionFixture = fixture();
    const blob = git(collisionFixture.source, ["rev-parse", "HEAD:src/app.ts"]);
    git(collisionFixture.source, [
      "update-index",
      "--add",
      "--cacheinfo",
      `100644,${blob},src/App.ts`,
    ]);
    const collisionSha = commitIndex(collisionFixture.source, "case collision");
    const collisionMirror = collisionFixture.manager.ensureMirror({
      sourceRepositoryPath: collisionFixture.source,
      runtimeRoot: collisionFixture.runtime,
      repositoryId: "sample-app",
    });
    expect(() =>
      collisionFixture.manager.createAttemptWorkspace(
        collisionMirror,
        "attempt-collision",
        collisionSha,
      ),
    ).toThrow(/case-colliding Git paths are not allowed/iu);
  });

  it("rejects an escaping symlink already present in the requested base tree", () => {
    const f = fixture();
    symlinkSync("../../../outside", join(f.source, "src", "escape"));
    const unsafeBase = commitAll(f.source, "unsafe base symlink");
    const mirror = f.manager.ensureMirror({
      sourceRepositoryPath: f.source,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
    });

    expect(() =>
      f.manager.createAttemptWorkspace(mirror, "attempt-unsafe-base", unsafeBase),
    ).toThrow(/symbolic link/iu);
    expect(existsSync(join(f.runtime, "worktrees", "sample-app", "attempt-unsafe-base"))).toBe(
      false,
    );
  });

  it("requires normalized absolute roots and explicit full SHAs", () => {
    const f = fixture();
    expect(() =>
      f.manager.ensureMirror({
        sourceRepositoryPath: `${f.source}/..//source`,
        runtimeRoot: f.runtime,
        repositoryId: "sample-app",
      }),
    ).toThrow(/normalized absolute path/iu);

    const mirror = f.manager.ensureMirror({
      sourceRepositoryPath: f.source,
      runtimeRoot: f.runtime,
      repositoryId: "sample-app",
    });
    expect(() =>
      f.manager.createAttemptWorkspace(mirror, "attempt-short", f.baseSha.slice(0, 12)),
    ).toThrow(/40- or 64-character Git SHA/iu);
  });
});

// Locks the built-in, repo-agnostic classifier behavior. Every row here must
// classify identically with and without a policy extension argument, and
// identically before and after the T5.4 externalization refactor: this table
// was captured against the pre-refactor implementation first, then re-run
// unchanged after the refactor to prove byte-for-byte equivalence for the
// generic classes (tests, CI, policy files, baselines, build/dependency
// config, signing, credentials, submodule, and Git-attribute configuration).
const BUILT_IN_CLASSIFICATION_TABLE: ReadonlyArray<readonly [string, string | null]> = [
  // tests and test baselines
  ["TestSupport/FixtureLoader.swift", "tests"],
  ["HindsightTests/Support/FixtureLoader.swift", "tests"],
  ["HindsightUITests/Support/AppHarness.swift", "tests"],
  ["packages/testkit/src/index.ts", "tests"],
  ["conftest.py", "tests"],
  ["scripts/test.sh", "tests"],
  ["vitest.config.ts", "tests"],
  ["App.xctestplan", "tests"],
  ["src/App.test.tsx", "tests"],
  ["src/App.spec.ts", "tests"],
  ["ViewModelTests.swift", "tests"],
  ["__mocks__/network.ts", "tests"],
  ["__snapshots__/App.snap", "tests"],
  // CI configuration
  [".github/workflows/ci.yml", "CI"],
  [".circleci/config.yml", "CI"],
  [".gitlab-ci.yml", "CI"],
  ["Jenkinsfile", "CI"],
  ["bitrise.yml", "CI"],
  ["azure-pipelines.yml", "CI"],
  ["scripts/ci/deploy.sh", "CI"],
  // policy and agent rules (generic markers only)
  ["AGENTS.md", "policy"],
  ["CLAUDE.md", "policy"],
  [".cursorrules", "policy"],
  ["policy.md", "policy"],
  [".factory/policy-lock.json", "policy"],
  ["rules/repository.md", "policy"],
  ["guardrails/limits.md", "policy"],
  // quality thresholds and baselines
  ["quality/baselines/home.png", "baseline"],
  ["visual-baselines/screen.png", "baseline"],
  ["config/thresholds.json", "baseline"],
  ["codecov.yml", "baseline"],
  ["sonar-project.properties", "baseline"],
  // build, dependency, and verification configuration
  ["App.xcodeproj/project.pbxproj", "build"],
  ["App.xcodeproj/xcshareddata/xcschemes/App.xcscheme", "build"],
  ["package.json", "build"],
  ["tsconfig.json", "build"],
  ["App.xcworkspace/contents.xcworkspacedata", "build"],
  ["pnpm-lock.yaml", "build"],
  ["Podfile", "build"],
  ["eslint.config.js", "build"],
  ["requirements.txt", "build"],
  ["build.gradle", "build"],
  ["Taskfile.yml", "build"],
  ["xcodegen.yml", "build"],
  ["project.yaml", "build"],
  ["Tuist/ProjectDescriptionHelpers/Foo.swift", "build"],
  ["project.yml", "build"],
  // signing and release automation
  ["fastlane/Fastfile", "release"],
  ["scripts/release-app.sh", "release"],
  ["Config/Prod.xcconfig", "signing"],
  ["ExportOptions.plist", "signing"],
  ["Info.plist", "signing"],
  ["PrivacyInfo.xcprivacy", "signing"],
  ["App.entitlements", "signing"],
  // environment and credential material
  [".env.production", "credential"],
  [".envrc", "credential"],
  ["config/secrets.yml", "credential"],
  ["Certificates/app.p12", "credential"],
  ["profile.mobileprovision", "credential"],
  // submodule and Git-attribute configuration
  [".gitmodules", "submodule"],
  [".gitattributes", "classification"],
  // unprotected
  ["src/App.swift", null],
  ["README.md", null],
];

describe("protected path classification (built-in defaults)", () => {
  it.each(BUILT_IN_CLASSIFICATION_TABLE)(
    "classifies %s with no policy extension",
    (path, expected) => {
      if (expected === null) {
        expect(classifyProtectedPath(path)).toBeNull();
      } else {
        expect(classifyProtectedPath(path)).toMatch(new RegExp(expected, "iu"));
      }
    },
  );

  it.each(BUILT_IN_CLASSIFICATION_TABLE)(
    "classifies %s identically when an empty policy extension is supplied",
    (path, expected) => {
      const extension = parseProtectedPathPolicyExtension({
        schemaVersion: 1,
        additionalTrustBoundaryPathPrefixes: [],
        additionalTrustBoundarySegments: [],
        additionalPolicyMarkers: [],
        allowances: [],
      });
      const withExtension = classifyProtectedPath(path, extension);
      const withoutExtension = classifyProtectedPath(path);
      expect(withExtension).toBe(withoutExtension);
      if (expected === null) {
        expect(withExtension).toBeNull();
      } else {
        expect(withExtension).toMatch(new RegExp(expected, "iu"));
      }
    },
  );

  // Repo-specific knowledge (this monorepo's own package names, and its
  // app-specific "ios_app_factory_rules" marker) is no longer hardcoded into
  // the classifier. Without a reviewed policy extension, these paths are not
  // protected by classifyProtectedPath itself; a project that wants this
  // protection must grant it explicitly (see "reviewed policy extension"
  // below), the same way any other enrolled project would.
  it.each([
    "packages/trusted-verifier/src/index.ts",
    "packages/policy-engine/src/index.ts",
    "packages/kernel/src/repositories.ts",
    "packages/contracts/src/v1/task-spec.ts",
    "packages/quality/src/index.ts",
    "apps/daemon/src/index.ts",
    "docs/ios_app_factory_rules.md",
  ])("does not protect %s without a reviewed policy extension", (path) => {
    expect(classifyProtectedPath(path)).toBeNull();
  });
});

describe("reviewed protected-path policy extension", () => {
  const appFactoryOwnExtension = parseProtectedPathPolicyExtension({
    schemaVersion: 1,
    additionalTrustBoundaryPathPrefixes: [
      "apps/daemon",
      "apps/mcp",
      "packages/contracts",
      "packages/kernel",
      "packages/policy-engine",
      "packages/quality",
    ],
    additionalTrustBoundarySegments: [
      "agent-runner",
      "credential-broker",
      "evidence-store",
      "execution-engine",
      "git-workspace",
      "independent-review",
      "process-supervisor",
      "trusted-verifier",
    ],
    additionalPolicyMarkers: ["ios_app_factory_rules"],
    allowances: [],
  });

  it.each([
    "packages/trusted-verifier/src/index.ts",
    "packages/policy-engine/src/index.ts",
    "packages/kernel/src/repositories.ts",
    "packages/contracts/src/v1/task-spec.ts",
    "packages/quality/src/index.ts",
    "apps/daemon/src/index.ts",
  ])("extension reproduces trust-boundary protection for %s", (path) => {
    expect(classifyProtectedPath(path, appFactoryOwnExtension)).toMatch(/trust-boundary/iu);
  });

  it("extension adds policy protection via an additional marker", () => {
    expect(classifyProtectedPath("docs/ios_app_factory_rules.md")).toBeNull();
    expect(classifyProtectedPath("docs/ios_app_factory_rules.md", appFactoryOwnExtension)).toMatch(
      /policy/iu,
    );
  });

  it("extension additions never relax an unrelated generic protection", () => {
    // The trust-boundary and policy-marker additions above must not weaken
    // any built-in class: a test file inside a trust-boundary package is
    // still classified as a protected test, not merely trust-boundary code.
    expect(
      classifyProtectedPath("packages/kernel/tests/repositories.test.ts", appFactoryOwnExtension),
    ).toMatch(/tests/iu);
  });

  it("keeps Xcode project-membership files protected by default, even with an extension present", () => {
    expect(classifyProtectedPath("App.xcodeproj/project.pbxproj", appFactoryOwnExtension)).toMatch(
      /build/iu,
    );
    expect(classifyProtectedPath("project.yml", appFactoryOwnExtension)).toMatch(/build/iu);
  });

  it("grants the xcode-project-membership allowance only when the policy extension includes it", () => {
    const withAllowance = parseProtectedPathPolicyExtension({
      schemaVersion: 1,
      additionalTrustBoundaryPathPrefixes: [],
      additionalTrustBoundarySegments: [],
      additionalPolicyMarkers: [],
      allowances: ["xcode-project-membership"],
    });

    expect(classifyProtectedPath("App.xcodeproj/project.pbxproj", withAllowance)).toBeNull();
    expect(classifyProtectedPath("project.yml", withAllowance)).toBeNull();

    // The allowance is scoped to project-membership files only; it does not
    // relax any other build/dependency/verification configuration.
    expect(classifyProtectedPath("package.json", withAllowance)).toMatch(/build/iu);
    expect(classifyProtectedPath("project.yaml", withAllowance)).toMatch(/build/iu);
    expect(
      classifyProtectedPath("App.xcodeproj/xcshareddata/xcschemes/App.xcscheme", withAllowance),
    ).toMatch(/build/iu);
  });

  it("does not let the allowance override an unrelated protected class (ordering)", () => {
    const withAllowance = parseProtectedPathPolicyExtension({
      schemaVersion: 1,
      additionalTrustBoundaryPathPrefixes: [],
      additionalTrustBoundarySegments: [],
      additionalPolicyMarkers: [],
      allowances: ["xcode-project-membership"],
    });
    // Even inside a protected tests directory, a pbxproj file stays
    // protected: the allowance only relaxes the build-config class, not
    // classes evaluated earlier in priority order.
    expect(classifyProtectedPath("tests/Fixtures/project.pbxproj", withAllowance)).toMatch(
      /tests/iu,
    );
  });

  it("fails closed on an unknown relaxation key", () => {
    expect(() =>
      parseProtectedPathPolicyExtension({
        schemaVersion: 1,
        additionalTrustBoundaryPathPrefixes: [],
        additionalTrustBoundarySegments: [],
        additionalPolicyMarkers: [],
        allowances: ["made-up-relaxation"],
      }),
    ).toThrow(GitWorkspaceError);
  });

  it("fails closed on an extension payload with unexpected fields", () => {
    expect(() =>
      parseProtectedPathPolicyExtension({
        schemaVersion: 1,
        additionalTrustBoundaryPathPrefixes: [],
        additionalTrustBoundarySegments: [],
        additionalPolicyMarkers: [],
        allowances: [],
        extraField: true,
      }),
    ).toThrow(GitWorkspaceError);
  });

  it("decodes a reviewed policy extension payload and binds it to a digest", () => {
    const bytes = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        additionalTrustBoundaryPathPrefixes: [],
        additionalTrustBoundarySegments: [],
        additionalPolicyMarkers: [],
        allowances: ["xcode-project-membership"],
      }),
      "utf8",
    );
    const decoded = decodeProtectedPathPolicyExtension(bytes);
    expect(decoded.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(classifyProtectedPath("project.yml", decoded.extension)).toBeNull();
  });

  it("fails closed when decoding an unknown relaxation key from raw bytes", () => {
    const bytes = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        additionalTrustBoundaryPathPrefixes: [],
        additionalTrustBoundarySegments: [],
        additionalPolicyMarkers: [],
        allowances: ["made-up-relaxation"],
      }),
      "utf8",
    );
    expect(() => decodeProtectedPathPolicyExtension(bytes)).toThrow(GitWorkspaceError);
  });
});

describe("candidate verification threads the protected-path policy extension", () => {
  // These tests prove the extension actually reaches classifyProtectedPath
  // from inside verifyCandidate/verifyCandidateObject (not just that
  // classifyProtectedPath itself honors an extension when called directly,
  // which the suite above already covers).
  const pbxprojAllowance = parseProtectedPathPolicyExtension({
    schemaVersion: 1,
    additionalTrustBoundaryPathPrefixes: [],
    additionalTrustBoundarySegments: [],
    additionalPolicyMarkers: [],
    allowances: ["xcode-project-membership"],
  });
  const noAllowance = parseProtectedPathPolicyExtension({
    schemaVersion: 1,
    additionalTrustBoundaryPathPrefixes: [],
    additionalTrustBoundarySegments: [],
    additionalPolicyMarkers: [],
    allowances: [],
  });
  const extraTrustBoundary = parseProtectedPathPolicyExtension({
    schemaVersion: 1,
    additionalTrustBoundaryPathPrefixes: [],
    additionalTrustBoundarySegments: ["src"],
    additionalPolicyMarkers: [],
    allowances: [],
  });

  function withPbxproj(f: Fixture): { mirror: FactoryMirror; workspace: FactoryWorkspaceRecord } {
    const { mirror, workspace } = prepare(f);
    mkdirSync(join(workspace.worktreePath, "App.xcodeproj"));
    writeFileSync(
      join(workspace.worktreePath, "App.xcodeproj", "project.pbxproj"),
      "// pbxproj change\n",
    );
    return { mirror, workspace };
  }

  it("verifyCandidate is byte-identical whether the extension is omitted or explicitly undefined", () => {
    const f = fixture();
    const { workspace } = prepare(f);
    updateSource(workspace, "export const value = 7;\n");

    const omitted = f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] });
    const explicitUndefined = f.manager.verifyCandidate(workspace, {
      authorizedScopes: ["src"],
      protectedPathPolicyExtension: undefined,
    });

    expect(explicitUndefined).toEqual(omitted);
  });

  it("verifyCandidate still rejects an Xcode project-membership file with no extension", () => {
    const f = fixture();
    const { workspace } = withPbxproj(f);

    expect(() =>
      f.manager.verifyCandidate(workspace, { authorizedScopes: ["App.xcodeproj"] }),
    ).toThrow(/build, dependency, and verification configuration is protected/u);
  });

  it("verifyCandidate still rejects an Xcode project-membership file when the extension grants no allowance", () => {
    const f = fixture();
    const { workspace } = withPbxproj(f);

    expect(() =>
      f.manager.verifyCandidate(workspace, {
        authorizedScopes: ["App.xcodeproj"],
        protectedPathPolicyExtension: noAllowance,
      }),
    ).toThrow(/build, dependency, and verification configuration is protected/u);
  });

  it("verifyCandidate passes an Xcode project-membership change once the extension grants the allowance", () => {
    const f = fixture();
    const { workspace } = withPbxproj(f);

    const candidate = f.manager.verifyCandidate(workspace, {
      authorizedScopes: ["App.xcodeproj"],
      protectedPathPolicyExtension: pbxprojAllowance,
    });

    expect(candidate.changedPaths).toEqual([
      expect.objectContaining({ path: "App.xcodeproj/project.pbxproj", status: "A" }),
    ]);
  });

  it("verifyCandidateObject applies the same allowance on replay", () => {
    const f = fixture();
    const { mirror, workspace } = withPbxproj(f);
    const policy = {
      authorizedScopes: ["App.xcodeproj"],
      protectedPathPolicyExtension: pbxprojAllowance,
    };
    const candidate = f.manager.verifyCandidate(workspace, policy);

    const replayed = f.manager.verifyCandidateObject(mirror, candidate, policy);
    expect(replayed.candidateTreeId).toBe(candidate.candidateTreeId);
    expect(() =>
      f.manager.verifyCandidateObject(mirror, candidate, {
        authorizedScopes: ["App.xcodeproj"],
      }),
    ).toThrow(/build, dependency, and verification configuration is protected/u);
  });

  it("an extension's additional trust-boundary protection is enforced through verifyCandidate", () => {
    const f = fixture();
    const { workspace } = prepare(f);
    updateSource(workspace, "export const value = 99;\n");

    expect(() =>
      f.manager.verifyCandidate(workspace, {
        authorizedScopes: ["src"],
        protectedPathPolicyExtension: extraTrustBoundary,
      }),
    ).toThrow(/Factory trust-boundary code is protected/u);
    // The same edit is fine without the extension.
    expect(() => f.manager.verifyCandidate(workspace, { authorizedScopes: ["src"] })).not.toThrow();
  });
});
