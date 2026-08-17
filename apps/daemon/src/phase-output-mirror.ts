import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  GitBranchNameSchema,
  GitObjectIdSchema,
  RepositoryIdSchema,
  Sha256DigestSchema,
  type PhaseId,
  type PhaseRunId,
  type PhaseRunOutputV1,
  type ProjectId,
} from "@app-factory/contracts";
import {
  GitWorkspaceError,
  GitWorkspaceManager,
  type FactoryMirror,
  type FactoryWorkspaceRecord,
} from "@app-factory/git-workspace";

import type { PhaseInputDocumentV1, PhaseInputsReaderPort } from "./phase-run-executor.js";
import type { PhaseOutputFileV1 } from "./phase-run-types.js";

/**
 * Commits Phase Runner outputs (declared `docs/`-rooted text files) into the project's enrolled
 * Factory mirror as a broker commit on a `factory/phase/<phaseId>/<runId>` branch, scoped to
 * `docs/` only via git-workspace's own `CandidatePolicy` (the same "authorized write set"
 * enforcement every attempt commit uses) — a participant/executor bug that produced a stray write
 * outside `docs/` is rejected by `verifyCandidate` before anything is committed, not merely by this
 * module trusting its own path bookkeeping.
 *
 * There is no durable `ProjectId -> RepositoryId` registry in this daemon yet (see
 * `run-export-command-runtime.ts`'s `RunExportMirrorPort`, which resolves by `RepositoryId` given
 * directly from a `TaskSpec`, and `enrolled-project-execution.ts`, which is one-config-file-per-
 * daemon-process today). Phase Runner uses the project's own ID as its mirror's repository ID
 * directly — both are Factory-minted lowercase UUIDs — matching how a project is enrolled and its
 * mirror seeded 1:1 today; a real registry is future work, not a fake value invented here.
 *
 * A crash mid-commit leaves at most an orphaned worktree and no broker commit (verifyCandidate and
 * createOrReconcileBrokerCommit are each individually safe to retry); it never leaves a partial
 * commit, because the broker commit is only created after the full candidate tree verifies.
 */

export type PhaseOutputMirrorPort = Readonly<{
  resolveMirror(
    projectId: ProjectId,
  ): Readonly<{ gitWorkspace: GitWorkspaceManager; mirror: FactoryMirror }>;
  commitOutputs(
    input: Readonly<{
      projectId: ProjectId;
      phaseId: PhaseId;
      phaseRunId: PhaseRunId;
      files: readonly PhaseOutputFileV1[];
    }>,
  ): readonly PhaseRunOutputV1[];
}>;

export class PhaseOutputMirrorError extends Error {
  public constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PhaseOutputMirrorError";
  }
}

function sha256Hex(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function resolveHeadSha(gitExecutable: string, mirrorPath: string): string {
  try {
    return execFileSync(gitExecutable, ["-C", mirrorPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch (error) {
    throw new PhaseOutputMirrorError(
      `Could not resolve the mirror's HEAD commit at ${mirrorPath}.`,
      { cause: error },
    );
  }
}

function publishBranch(
  gitExecutable: string,
  mirrorPath: string,
  branch: string,
  commitSha: string,
): void {
  try {
    execFileSync(gitExecutable, [
      "-C",
      mirrorPath,
      "update-ref",
      `refs/heads/${branch}`,
      commitSha,
    ]);
  } catch (error) {
    throw new PhaseOutputMirrorError(`Could not publish branch ${branch} at ${commitSha}.`, {
      cause: error,
    });
  }
}

export type CreatePhaseOutputMirrorPortOptions = Readonly<{
  gitRuntimeRoot: string;
  gitExecutable?: string;
}>;

export function createPhaseOutputMirrorPort(
  options: CreatePhaseOutputMirrorPortOptions,
): PhaseOutputMirrorPort {
  const gitExecutable = options.gitExecutable ?? "/usr/bin/git";
  let gitWorkspace: GitWorkspaceManager | null = null;

  function resolveMirror(
    projectId: ProjectId,
  ): Readonly<{ gitWorkspace: GitWorkspaceManager; mirror: FactoryMirror }> {
    const repositoryId = RepositoryIdSchema.parse(projectId);
    const mirrorPath = join(options.gitRuntimeRoot, "mirrors", `${repositoryId}.git`);
    if (!existsSync(options.gitRuntimeRoot) || !existsSync(mirrorPath)) {
      throw new PhaseOutputMirrorError(`No Factory mirror exists for project ${projectId}.`);
    }
    gitWorkspace ??= new GitWorkspaceManager({ gitExecutable });
    const mirror = gitWorkspace.openExistingMirror({
      runtimeRoot: options.gitRuntimeRoot,
      repositoryId,
    });
    return { gitWorkspace, mirror };
  }

  function commitOutputs(
    input: Readonly<{
      projectId: ProjectId;
      phaseId: PhaseId;
      phaseRunId: PhaseRunId;
      files: readonly PhaseOutputFileV1[];
    }>,
  ): readonly PhaseRunOutputV1[] {
    const { gitWorkspace: workspace, mirror } = resolveMirror(input.projectId);
    const baseSha = resolveHeadSha(gitExecutable, mirror.mirrorPath);

    let record: FactoryWorkspaceRecord;
    try {
      record = workspace.createOrReconcileAttemptWorkspace(mirror, input.phaseRunId, baseSha);
    } catch (error) {
      throw new PhaseOutputMirrorError(
        `Could not materialize a Factory worktree for phase run ${input.phaseRunId}.`,
        { cause: error },
      );
    }

    try {
      for (const file of input.files) {
        const targetPath = join(record.worktreePath, ...file.path.split("/"));
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, file.content, "utf8");
      }

      let verification;
      try {
        verification = workspace.verifyCandidate(record, { authorizedScopes: ["docs"] });
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          throw new PhaseOutputMirrorError(
            `Phase run ${input.phaseRunId} produced a change outside its authorized docs/ scope: ${error.message}`,
            { cause: error },
          );
        }
        throw error;
      }

      const commitRecord = workspace.createOrReconcileBrokerCommit(
        mirror,
        {
          attemptId: input.phaseRunId,
          baseSha: verification.baseSha,
          candidateTreeId: verification.candidateTreeId,
          diffDigest: verification.diffDigest,
        },
        () => {
          // No external cancellation source for a synchronous phase.run command; always active.
        },
      );

      const branch = GitBranchNameSchema.parse(
        `factory/phase/${input.phaseId}/${input.phaseRunId}`,
      );
      publishBranch(gitExecutable, mirror.mirrorPath, branch, commitRecord.commitSha);

      const commit = GitObjectIdSchema.parse(commitRecord.commitSha);
      const tree = GitObjectIdSchema.parse(verification.candidateTreeId);
      return input.files.map((file): PhaseRunOutputV1 => ({
        path: file.path as PhaseRunOutputV1["path"],
        digest: Sha256DigestSchema.parse(`sha256:${sha256Hex(file.content)}`),
        evidence: { commit, tree, branch },
      }));
    } finally {
      try {
        workspace.cleanupWorkspace(record);
      } catch {
        // Best-effort: cleanup failure never masks the commit outcome above.
      }
    }
  }

  return { resolveMirror, commitOutputs };
}

const MAX_DOCS_TREE_FILES_V1 = 25;
const MAX_DOCS_TREE_FILE_BYTES_V1 = 50_000;

/**
 * A project's `docs/` tree routinely holds design assets (PNGs, PDFs) alongside its actual
 * documentation. Only these extensions are read as participant context; anything else (most
 * importantly binary files, which `git show` would otherwise hand back as corrupted "text") is
 * silently skipped rather than fed into a prompt as garbage.
 */
const TEXT_DOCUMENT_EXTENSIONS_V1 = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
]);

function isTextDocumentPath(path: string): boolean {
  const lastDot = path.lastIndexOf(".");
  if (lastDot < 0) return false;
  return TEXT_DOCUMENT_EXTENSIONS_V1.has(path.slice(lastDot).toLowerCase());
}

function listGitTree(gitExecutable: string, mirrorPath: string, prefix: string): readonly string[] {
  try {
    const output = execFileSync(
      gitExecutable,
      ["-C", mirrorPath, "ls-tree", "-r", "--name-only", "HEAD", "--", prefix],
      { encoding: "utf8" },
    );
    return output.split("\n").filter((line) => line.length > 0 && isTextDocumentPath(line));
  } catch {
    // No HEAD yet, or `prefix` does not exist at HEAD — an honestly empty tree, not an error.
    return [];
  }
}

function showGitFile(gitExecutable: string, mirrorPath: string, path: string): string | null {
  try {
    return execFileSync(gitExecutable, ["-C", mirrorPath, "show", `HEAD:${path}`], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * Read-only counterpart to {@link createPhaseOutputMirrorPort}: reads a project's `docs/` tree and
 * individual repo-relative files straight from its enrolled mirror's `HEAD`, via plain `git show`/
 * `git ls-tree` against the bare mirror — never a checkout, never a write.
 */
export function createPhaseInputsReaderPort(
  options: CreatePhaseOutputMirrorPortOptions,
): PhaseInputsReaderPort {
  const gitExecutable = options.gitExecutable ?? "/usr/bin/git";

  function mirrorPathFor(projectId: ProjectId): string | null {
    const repositoryId = RepositoryIdSchema.parse(projectId);
    const mirrorPath = join(options.gitRuntimeRoot, "mirrors", `${repositoryId}.git`);
    return existsSync(mirrorPath) ? mirrorPath : null;
  }

  return {
    readDocsTree(projectId): readonly PhaseInputDocumentV1[] {
      const mirrorPath = mirrorPathFor(projectId);
      if (mirrorPath === null) return [];
      const paths = listGitTree(gitExecutable, mirrorPath, "docs").slice(0, MAX_DOCS_TREE_FILES_V1);
      const documents: PhaseInputDocumentV1[] = [];
      for (const path of paths) {
        const content = showGitFile(gitExecutable, mirrorPath, path);
        if (content !== null) {
          documents.push({ path, content: content.slice(0, MAX_DOCS_TREE_FILE_BYTES_V1) });
        }
      }
      return documents;
    },
    readFile(projectId, path): string | null {
      const mirrorPath = mirrorPathFor(projectId);
      if (mirrorPath === null) return null;
      return showGitFile(gitExecutable, mirrorPath, path);
    },
  };
}
