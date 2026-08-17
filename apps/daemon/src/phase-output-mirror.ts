import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  GitBranchNameSchema,
  GitObjectIdSchema,
  PhaseRunOutputPathV1Schema,
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
import type { ProjectRegistryRepository } from "@app-factory/kernel";

import type { PhaseInputDocumentV1, PhaseInputsReaderPort } from "./phase-run-executor.js";
import type { PhaseOutputFileV1 } from "./phase-run-types.js";

/**
 * Commits Phase Runner outputs (declared `docs/`- or `Docs/`-rooted text files, per the project's
 * OWN registered docs layout) into the project's enrolled Factory mirror as a broker commit on a
 * `factory/phase/<phaseId>/<runId>` branch, scoped to that docs directory only via git-workspace's
 * own `CandidatePolicy` (the same "authorized write set" enforcement every attempt commit uses) — a
 * participant/executor bug that produced a stray write outside the docs directory is rejected by
 * `verifyCandidate` before anything is committed, not merely by this module trusting its own path
 * bookkeeping.
 *
 * The project's mirror `repositoryId` and its docs directory (`"docs"` or `"Docs"`) are both read
 * from the Project Registry (`ProjectRegistryRepository`, Seam (a) of the project-registry task) —
 * this is what previously had to assume "a project's own ID doubles as its mirror's repository ID"
 * with no registry to actually confirm it (`phase-output-mirror.ts`'s own prior doc comment
 * documented that gap explicitly). A project not yet registered fails closed
 * (`phase.project-not-registered`) rather than guessing at an unregistered mirror or a hardcoded
 * lowercase `docs/`.
 *
 * `docs/` vs `Docs/` matters beyond spelling: APFS (and other common developer filesystems) is
 * case-insensitive by default while a Git tree diff is always case-sensitive, so a mirror whose
 * storage volume folds case can silently collide two paths Git considers entirely distinct (for
 * example a phase declaring `Docs/status.md` while the tree already has `docs/status.md`).
 * {@link commitOutputs} probes each mirror's own storage volume once (a throwaway probe file
 * written directly into the bare mirror directory, the same directory `git-workspace`'s own
 * `app-factory-mirror.json` marker already lives in) and, on a case-insensitive volume, fails closed
 * before writing anything if a declared output's case-folded path collides with an existing
 * different-case path already in the mirror's tree (or with another declared output in the very
 * same commit). A case-sensitive volume skips this check entirely — Git's own tree already
 * disambiguates every path exactly.
 *
 * A crash mid-commit leaves at most an orphaned worktree and no broker commit (verifyCandidate and
 * createOrReconcileBrokerCommit are each individually safe to retry); it never leaves a partial
 * commit, because the broker commit is only created after the full candidate tree verifies.
 */

export type PhaseOutputMirrorPort = Readonly<{
  resolveMirror(
    projectId: ProjectId,
  ): Readonly<{ gitWorkspace: GitWorkspaceManager; mirror: FactoryMirror; docsDir: string }>;
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

const CASE_PROBE_FILE_PREFIX = ".app-factory-case-probe-";

/**
 * Probes whether `directory` sits on a case-insensitive storage volume by writing a uniquely named
 * throwaway file and checking whether an UPPERCASED variant of that exact same name resolves back
 * to it (same device/inode). Cleans up after itself; safe to call repeatedly (each call uses a
 * fresh random name, so concurrent probes never collide with each other).
 */
function probeCaseInsensitiveVolume(directory: string): boolean {
  const name = `${CASE_PROBE_FILE_PREFIX}${randomUUID()}`;
  const lowerPath = join(directory, name);
  const upperPath = join(directory, name.toUpperCase());
  try {
    writeFileSync(lowerPath, "", { flag: "wx" });
    if (!existsSync(upperPath)) return false;
    const lowerStats = statSync(lowerPath);
    const upperStats = statSync(upperPath);
    return lowerStats.dev === upperStats.dev && lowerStats.ino === upperStats.ino;
  } catch {
    // A probe that cannot even be written is treated as case-sensitive (the safe default: the
    // collision check below is then simply skipped rather than blocking every commit on a probe
    // failure unrelated to case-folding).
    return false;
  } finally {
    try {
      unlinkSync(lowerPath);
    } catch {
      // Best-effort cleanup only; never masks the probe's own result.
    }
  }
}

const caseInsensitiveVolumeCache = new Map<string, boolean>();

function isCaseInsensitiveMirrorVolume(mirrorPath: string): boolean {
  const cached = caseInsensitiveVolumeCache.get(mirrorPath);
  if (cached !== undefined) return cached;
  const result = probeCaseInsensitiveVolume(mirrorPath);
  caseInsensitiveVolumeCache.set(mirrorPath, result);
  return result;
}

function foldPathCase(path: string): string {
  return path.toLowerCase();
}

function listAllTrackedPaths(
  gitExecutable: string,
  mirrorPath: string,
  ref: string,
): readonly string[] {
  try {
    const output = execFileSync(
      gitExecutable,
      ["-C", mirrorPath, "ls-tree", "-r", "--name-only", ref],
      { encoding: "utf8" },
    );
    return output.split("\n").filter((line) => line.length > 0);
  } catch {
    // No commits reachable from `ref` yet -- an honestly empty tree, not an error.
    return [];
  }
}

/**
 * Fails closed (`PhaseOutputMirrorError`) when this mirror's storage volume is case-insensitive AND
 * either two of the phase's own declared outputs case-fold to the same path, or a declared output
 * case-folds to an existing tracked path at `baseSha` it is not identical to. On a case-sensitive
 * volume this is a complete no-op: Git's own tree already disambiguates every path exactly, so there
 * is nothing this daemon-level check needs to add.
 */
function assertNoCaseFoldingCollisions(
  gitExecutable: string,
  mirrorPath: string,
  baseSha: string,
  files: readonly PhaseOutputFileV1[],
): void {
  if (!isCaseInsensitiveMirrorVolume(mirrorPath)) return;

  const declaredByFold = new Map<string, string>();
  for (const file of files) {
    const folded = foldPathCase(file.path);
    const existingDeclared = declaredByFold.get(folded);
    if (existingDeclared !== undefined && existingDeclared !== file.path) {
      throw new PhaseOutputMirrorError(
        `Declared outputs ${existingDeclared} and ${file.path} collide on this mirror's ` +
          "case-insensitive storage volume even though Git treats them as distinct paths.",
      );
    }
    declaredByFold.set(folded, file.path);
  }

  const trackedByFold = new Map<string, string>();
  for (const trackedPath of listAllTrackedPaths(gitExecutable, mirrorPath, baseSha)) {
    trackedByFold.set(foldPathCase(trackedPath), trackedPath);
  }
  for (const file of files) {
    const existingTracked = trackedByFold.get(foldPathCase(file.path));
    if (existingTracked !== undefined && existingTracked !== file.path) {
      throw new PhaseOutputMirrorError(
        `Declared output ${file.path} collides with the existing tracked path ${existingTracked} ` +
          "on this mirror's case-insensitive storage volume even though Git treats them as distinct paths.",
      );
    }
  }
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
  /** Resolves the project's registered docs directory (`"docs"` or `"Docs"`); see the module doc
   * comment. */
  projectRegistry: ProjectRegistryRepository;
}>;

export function createPhaseOutputMirrorPort(
  options: CreatePhaseOutputMirrorPortOptions,
): PhaseOutputMirrorPort {
  const gitExecutable = options.gitExecutable ?? "/usr/bin/git";
  let gitWorkspace: GitWorkspaceManager | null = null;

  function resolveMirror(
    projectId: ProjectId,
  ): Readonly<{ gitWorkspace: GitWorkspaceManager; mirror: FactoryMirror; docsDir: string }> {
    const repositoryId = RepositoryIdSchema.parse(projectId);
    const registered = options.projectRegistry.findById(projectId);
    if (registered === null) {
      throw new PhaseOutputMirrorError(
        `Project ${projectId} is not registered; run project.register first.`,
      );
    }
    const mirrorPath = join(options.gitRuntimeRoot, "mirrors", `${repositoryId}.git`);
    if (!existsSync(options.gitRuntimeRoot) || !existsSync(mirrorPath)) {
      throw new PhaseOutputMirrorError(`No Factory mirror exists for project ${projectId}.`);
    }
    gitWorkspace ??= new GitWorkspaceManager({ gitExecutable });
    const mirror = gitWorkspace.openExistingMirror({
      runtimeRoot: options.gitRuntimeRoot,
      repositoryId,
    });
    return { gitWorkspace, mirror, docsDir: registered.docsLayout.docsDir };
  }

  function commitOutputs(
    input: Readonly<{
      projectId: ProjectId;
      phaseId: PhaseId;
      phaseRunId: PhaseRunId;
      files: readonly PhaseOutputFileV1[];
    }>,
  ): readonly PhaseRunOutputV1[] {
    const { gitWorkspace: workspace, mirror, docsDir } = resolveMirror(input.projectId);
    const baseSha = resolveHeadSha(gitExecutable, mirror.mirrorPath);
    assertNoCaseFoldingCollisions(gitExecutable, mirror.mirrorPath, baseSha, input.files);

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
        verification = workspace.verifyCandidate(record, { authorizedScopes: [docsDir] });
      } catch (error) {
        if (error instanceof GitWorkspaceError) {
          throw new PhaseOutputMirrorError(
            `Phase run ${input.phaseRunId} produced a change outside its authorized ${docsDir}/ scope: ${error.message}`,
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
      // The path a declared output actually lands at in the committed tree can differ in case from
      // what was declared/written (see the module doc comment and `PhaseRunOutputPathV1Schema`'s own
      // doc comment): on a case-insensitive volume, writing "docs/x" into a worktree that already
      // has "Docs" resolves onto the existing directory, and Git's own diff -- case-sensitive --
      // reports the real casing. Resolve each declared file's REAL committed path from the
      // verification's own changed-path list (case-fold matched) rather than trusting the declared
      // string, so the evidence this returns is always actually readable back from the tree.
      const realPathByFold = new Map(
        verification.changedPaths.map((changed) => [foldPathCase(changed.path), changed.path]),
      );
      return input.files.map((file): PhaseRunOutputV1 => {
        const realPath = realPathByFold.get(foldPathCase(file.path)) ?? file.path;
        return {
          path: PhaseRunOutputPathV1Schema.parse(realPath),
          digest: Sha256DigestSchema.parse(`sha256:${sha256Hex(file.content)}`),
          evidence: { commit, tree, branch },
        };
      });
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
      const docsDir = options.projectRegistry.findById(projectId)?.docsLayout.docsDir ?? "docs";
      const paths = listGitTree(gitExecutable, mirrorPath, docsDir).slice(
        0,
        MAX_DOCS_TREE_FILES_V1,
      );
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
