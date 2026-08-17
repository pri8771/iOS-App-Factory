import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { basename } from "node:path";

import {
  AbsolutePathSchema,
  GitObjectIdSchema,
  IsoInstantSchema,
  NamespacedCodeSchema,
  ProjectIdSchema,
  RepositoryIdSchema,
  Sha256DigestSchema,
  StableKeySchema,
  type CommandOriginV1,
  type CommandResultV1,
  type CommandRequestV1,
  type EnrollmentBlockerV1,
  type IsoInstant,
  type ProjectRegistryDraftV1,
  type ProjectRegistryV1,
  type Sha256Digest,
} from "@app-factory/contracts";
import { GitWorkspaceError, type GitWorkspaceManager } from "@app-factory/git-workspace";
import { type FactoryRepositories, ProjectRegistryUpsertError } from "@app-factory/kernel";
import { resolveDocsDirectoryName } from "@app-factory/project-docs";
import {
  EnrollmentPreservationError,
  EnrollmentScanError,
  EnrollmentScanV1Schema,
  scanExistingProject,
  type EnrollmentScanV1,
} from "@app-factory/project-sdk";
import type { EvidenceStore } from "@app-factory/evidence-store";

import { assertRepositoryPathIsUsable } from "./project-command-runtime.js";
import { CommandHandlerError } from "./unix-command-server.js";

/**
 * The Project Registry's daemon-side command handlers (Seam (a) of the project-registry task): a
 * durable `ProjectId -> {sourceRepositoryPath, mirror binding ref}` mapping, replacing the daemon's
 * previous ability to know at most ONE enrolled project. Mirrors `phase-command-runtime.ts`'s
 * role for `preset.*`/`phase.upsert`: this module is the daemon-side bridge between the durable
 * `ProjectRegistryRepository` (`@app-factory/kernel`) and the wire protocol, translating typed
 * repository errors into `CommandHandlerError`s the same way every other command-runtime module
 * does.
 *
 * `project.register` accepts either a previously persisted `project.scan` result (the same
 * `planDigest` `project.enroll-plan`/`project.apply` already accept) or a bare repository path (in
 * which case it runs the scanner itself, mirroring `executeProjectScanCommand`). Either way it
 * requires the resulting scan to carry zero `rules.*` BLOCKER-severity issues before registering —
 * `safety.secret-material-detected` findings are surfaced on the result but never block
 * registration, since they are owner-reviewed, not policy-authored. Registration itself calls
 * `GitWorkspaceManager.prepareImmutableMirror` to seal a real Factory mirror pinned to the scan's
 * observed HEAD commit/tree, exactly like `enrolled-project-execution.ts` does for the single
 * legacy-configured project — this is what makes the registry a REAL registry rather than a naming
 * table: every registered project has a durable, sealed mirror the same way the legacy path always
 * did, just generalized to more than one project.
 *
 * Re-registering an already-registered `sourceRepositoryPath` reuses that project's existing
 * `projectId`/`repositoryId`/`slug` (a compare-and-set update; `slug` and `repositoryId` are
 * immutable identity columns, see `project-registry-repositories.ts`) rather than minting a second
 * registry row for the same repository, so `project.register` is safe to call again idempotently.
 */

const GIT_EXECUTABLE = "/usr/bin/git";

export type ProjectRegistryCommandDependencies = Readonly<{
  repositories: FactoryRepositories;
  evidenceStore: EvidenceStore;
  gitWorkspace: GitWorkspaceManager;
  gitRuntimeRoot: string;
}>;

function nextInstant(observedAt: IsoInstant, after: IsoInstant): IsoInstant {
  const milliseconds = Math.max(Date.parse(observedAt), Date.parse(after) + 1);
  return IsoInstantSchema.parse(new Date(milliseconds).toISOString());
}

function slugFromRepositoryPath(repositoryRoot: string): string {
  const slug = basename(repositoryRoot)
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return (slug === "" ? "app" : slug).slice(0, 64);
}

function readPersistedScan(evidenceStore: EvidenceStore, planDigest: string): EnrollmentScanV1 {
  let bytes: Buffer;
  try {
    bytes = evidenceStore.readBlob(planDigest);
  } catch {
    throw new CommandHandlerError(
      "project.plan-not-found",
      `No persisted enrollment plan exists for digest ${planDigest}.`,
      false,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new CommandHandlerError(
      "project.plan-not-found",
      `The persisted evidence for digest ${planDigest} is not valid JSON.`,
      false,
    );
  }
  const result = EnrollmentScanV1Schema.safeParse(parsed);
  if (!result.success) {
    throw new CommandHandlerError(
      "project.plan-not-found",
      `The persisted evidence for digest ${planDigest} is not a valid enrollment scan.`,
      false,
    );
  }
  return result.data;
}

async function resolveScan(
  dependencies: ProjectRegistryCommandDependencies,
  request: Extract<CommandRequestV1, { operation: "project.register" }>,
): Promise<EnrollmentScanV1> {
  const { source } = request.payload;
  if (source.kind === "scan") {
    return readPersistedScan(dependencies.evidenceStore, source.planDigest);
  }
  await assertRepositoryPathIsUsable(source.repositoryRoot);
  try {
    return scanExistingProject({ repositoryRoot: source.repositoryRoot });
  } catch (error) {
    if (error instanceof EnrollmentPreservationError) {
      throw new CommandHandlerError("project.scan-preservation-violated", error.message, false);
    }
    if (error instanceof EnrollmentScanError) {
      throw new CommandHandlerError("project.scan-failed", error.message, false);
    }
    throw error;
  }
}

/**
 * Every issue this scan reports at BLOCKER severity whose code starts with `rules.` -- the only
 * category that refuses registration. Other blocker-severity issues (most importantly
 * `safety.secret-material-detected`) are surfaced separately, never here. Exported so
 * `project-seed-command-runtime.ts` can apply the SAME gate before deciding whether a freshly
 * seeded project converged enough to register, rather than reimplementing it.
 */
export function rulesBlockers(scan: EnrollmentScanV1): readonly EnrollmentBlockerV1[] {
  return scan.issues
    .filter((issue) => issue.severity === "blocker" && issue.code.startsWith("rules."))
    .map((issue) => ({
      issueId: issue.issueId,
      code: NamespacedCodeSchema.parse(issue.code),
      summary: issue.summary,
    }));
}

function secretFindings(scan: EnrollmentScanV1): readonly EnrollmentBlockerV1[] {
  return scan.issues
    .filter((issue) => issue.code === "safety.secret-material-detected")
    .map((issue) => ({
      issueId: issue.issueId,
      code: NamespacedCodeSchema.parse(issue.code),
      summary: issue.summary,
    }));
}

function runBoundedGit(repositoryRoot: string, args: readonly string[]): string {
  try {
    return execFileSync(GIT_EXECUTABLE, ["--no-pager", "-C", repositoryRoot, ...args], {
      encoding: "utf8",
      env: {
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
        LANG: "C",
        LC_ALL: "C",
        PATH: "/usr/bin:/bin",
        TZ: "UTC",
      },
      maxBuffer: 1024 * 1024,
      timeout: 5_000,
    }).trim();
  } catch (error) {
    throw new CommandHandlerError(
      "project.register-git-probe-failed",
      `A Git probe against ${repositoryRoot} failed${
        error instanceof Error ? `: ${error.message}` : ""
      }.`,
      false,
    );
  }
}

/** Computes a stable identity digest for a fresh mirror binding, the same shape
 * `enrolled-project-execution.ts` computes for its own single legacy-configured project. */
function computeSourceIdentityDigest(input: {
  repositoryId: string;
  sourceRepositoryPath: string;
  baseCommit: string;
  baseTree: string;
}): Sha256Digest {
  return Sha256DigestSchema.parse(
    `sha256:${createHash("sha256")
      .update(
        `${JSON.stringify({
          schemaVersion: 1,
          mode: "project-registry-v1",
          repositoryId: input.repositoryId,
          sourceRepositoryPath: input.sourceRepositoryPath,
          baseCommit: input.baseCommit,
          baseTree: input.baseTree,
        })}\n`,
        "utf8",
      )
      .digest("hex")}`,
  );
}

/**
 * Seals (or, replayed against an already-sealed mirror, re-opens) a Factory mirror for a freshly
 * registered project, pinned to the scan's observed HEAD commit/tree -- the same
 * `prepareImmutableMirror` primitive `enrolled-project-execution.ts` uses for the single
 * legacy-configured project, generalized to any registered project.
 */
function prepareProjectMirror(
  dependencies: ProjectRegistryCommandDependencies,
  repositoryId: string,
  scan: EnrollmentScanV1,
): void {
  const sourceRepositoryPath = scan.repositoryRoot;
  const baseCommit = GitObjectIdSchema.parse(scan.before.headSha);
  const baseTree = GitObjectIdSchema.parse(
    runBoundedGit(sourceRepositoryPath, ["rev-parse", "--verify", `${baseCommit}^{tree}`]),
  );
  const sourceIdentityDigest = computeSourceIdentityDigest({
    repositoryId,
    sourceRepositoryPath,
    baseCommit,
    baseTree,
  });
  try {
    dependencies.gitWorkspace.prepareImmutableMirror(
      {
        repositoryId,
        sourceRepositoryPath,
        sourceIdentityDigest,
        runtimeRoot: dependencies.gitRuntimeRoot,
        baseCommit,
        baseTree,
      },
      () => {
        const resolved = runBoundedGit(sourceRepositoryPath, [
          "rev-parse",
          "--verify",
          `${baseCommit}^{commit}`,
        ]);
        if (resolved !== baseCommit) {
          throw new CommandHandlerError(
            "project.register-source-changed",
            "The source repository no longer contains the exact commit this registration observed.",
            false,
          );
        }
      },
    );
  } catch (error) {
    if (error instanceof CommandHandlerError) throw error;
    if (error instanceof GitWorkspaceError) {
      throw new CommandHandlerError(
        "project.register-mirror-failed",
        `The project's Factory mirror could not be prepared: ${error.message}`,
        false,
      );
    }
    throw error;
  }
}

function mapUpsertError(error: unknown): never {
  if (error instanceof ProjectRegistryUpsertError) {
    throw new CommandHandlerError(
      error.code === "project.identity-conflict" ? "command.identity-conflict" : error.code,
      error.message,
      false,
    );
  }
  throw error;
}

/** True when every field a re-registration might legitimately change is unchanged, so an upsert
 * would be a genuine no-op -- used to decide whether a re-registration needs a new revision at all. */
function draftMatchesHead(draft: ProjectRegistryDraftV1, head: ProjectRegistryV1): boolean {
  return (
    draft.slug === head.slug &&
    draft.displayName === head.displayName &&
    draft.sourceRepositoryPath === head.sourceRepositoryPath &&
    draft.repositoryId === head.repositoryId &&
    draft.standardVersion === head.standardVersion &&
    draft.policyLockDigest === head.policyLockDigest &&
    draft.docsLayout.docsDir === head.docsLayout.docsDir
  );
}

/**
 * Creates the project at revision 0 (`existing: undefined`) or compare-and-set updates it
 * (`existing` its current head) journaling a synthetic `project.register` command, exactly like
 * every other CAS-upsert repository's daemon-layer caller. A no-op (`existing` already matches
 * `draft`) returns the existing head untouched rather than writing a pointless revision, which is
 * what makes both `project.register` and the daemon-start self-registration migration safe to call
 * repeatedly.
 */
function upsertProjectRegistryRecord(
  repositories: FactoryRepositories,
  existing: ProjectRegistryV1 | null,
  draft: ProjectRegistryDraftV1,
  recordedAt: IsoInstant,
  origin: CommandOriginV1,
): Readonly<{ project: ProjectRegistryV1; created: boolean }> {
  if (existing !== null && draftMatchesHead(draft, existing)) {
    return { project: existing, created: false };
  }
  const commandRecordedAt =
    existing === null ? recordedAt : nextInstant(recordedAt, existing.updatedAt);
  try {
    const upserted = repositories.projectRegistry.upsert({
      command: {
        schemaVersion: 1,
        commandId: randomUUID(),
        issuedAt: commandRecordedAt,
        origin,
        kind: "project.register",
        register: {
          project: draft,
          expectedRevision: existing === null ? null : existing.revision,
        },
      },
      recordedAt: commandRecordedAt,
    });
    return { project: upserted.project, created: upserted.created };
  } catch (error) {
    mapUpsertError(error);
  }
}

/**
 * The core registration write, shared by `project.register` and `project.seed`'s "register when
 * converged" step (decision 5 of `apps/studio-mac/docs/architecture/0004-studio-phase4-presets-
 * planner.md`): seals (or reuses) a Factory mirror and upserts the registry record for an ALREADY-
 * SCANNED repository. Callers decide separately what to do about `rules.*` blockers (`rulesBlockers`
 * above) before calling this -- it assumes registration should proceed.
 */
function registerScanV1(
  dependencies: ProjectRegistryCommandDependencies,
  scan: EnrollmentScanV1,
  requested: Readonly<{ displayName: string | null; slug: string | null }>,
  recordedAt: IsoInstant,
  origin: CommandOriginV1,
): Readonly<{ project: ProjectRegistryV1; created: boolean }> {
  const sourceRepositoryPath = AbsolutePathSchema.parse(scan.repositoryRoot);
  const docsDir = resolveDocsDirectoryName(sourceRepositoryPath);
  const existing =
    dependencies.repositories.projectRegistry
      .listAll()
      .find((project) => project.sourceRepositoryPath === sourceRepositoryPath) ?? null;

  // One identity, minted once: the mirror below is sealed under exactly the repositoryId that
  // becomes `project.repositoryId` -- an already-registered path reuses its existing identity and
  // mirror untouched instead of minting a second one.
  const projectId = ProjectIdSchema.parse(existing?.projectId ?? randomUUID());
  const repositoryId = RepositoryIdSchema.parse(existing?.repositoryId ?? projectId);
  if (existing === null) {
    prepareProjectMirror(dependencies, repositoryId, scan);
  }

  const draft: ProjectRegistryDraftV1 = {
    projectId,
    // `slug` is an immutable identity column once registered (see
    // `project-registry-repositories.ts`): a re-registration always keeps the existing slug,
    // regardless of what this request named, exactly like `repositoryId` and `sourceRepositoryPath`
    // below.
    slug:
      existing?.slug ??
      StableKeySchema.parse(requested.slug ?? slugFromRepositoryPath(sourceRepositoryPath)),
    displayName: requested.displayName ?? existing?.displayName ?? basename(sourceRepositoryPath),
    sourceRepositoryPath,
    repositoryId,
    standardVersion: existing?.standardVersion ?? null,
    policyLockDigest: existing?.policyLockDigest ?? null,
    docsLayout: { docsDir: docsDir === "absent" ? "docs" : docsDir },
  };

  return upsertProjectRegistryRecord(
    dependencies.repositories,
    existing,
    draft,
    recordedAt,
    origin,
  );
}

/**
 * `project.seed`'s "register when converged" step (`project-seed-command-runtime.ts`): applies the
 * SAME `rules.*`-blocker gate `project.register` enforces, and either registers the freshly seeded,
 * already-scanned repository or reports honestly that it did not. Never throws on a blocked scan --
 * an operator's from-scratch seed should not fail outright just because registration's own gate
 * (unrelated to the scaffold itself) did not clear; the caller sees `registered: false` and a null
 * `projectId`/`repositoryId`/`slug` instead.
 */
export function registerConvergedSeedV1(
  dependencies: ProjectRegistryCommandDependencies,
  scan: EnrollmentScanV1,
  requested: Readonly<{ displayName: string | null }>,
  recordedAt: IsoInstant,
  origin: CommandOriginV1,
): Readonly<{
  registered: boolean;
  project: ProjectRegistryV1 | null;
}> {
  if (rulesBlockers(scan).length > 0) return { registered: false, project: null };
  const { project } = registerScanV1(
    dependencies,
    scan,
    { displayName: requested.displayName, slug: null },
    recordedAt,
    origin,
  );
  return { registered: true, project };
}

export async function executeProjectRegisterCommand(
  dependencies: ProjectRegistryCommandDependencies,
  request: Extract<CommandRequestV1, { operation: "project.register" }>,
  observedAt: IsoInstant,
): Promise<CommandResultV1> {
  const scan = await resolveScan(dependencies, request);
  const blockers = rulesBlockers(scan);
  if (blockers.length > 0) {
    throw new CommandHandlerError(
      "project.register-blocked",
      `The repository at ${scan.repositoryRoot} has unresolved rules.* blocker(s): ${blockers
        .map((blocker) => blocker.summary)
        .join("; ")}`,
      false,
    );
  }

  const { project, created } = registerScanV1(
    dependencies,
    scan,
    { displayName: request.payload.displayName, slug: request.payload.slug },
    observedAt,
    request.origin,
  );

  return {
    operation: "project.register",
    project,
    created,
    secretFindings: [...secretFindings(scan)],
  };
}

export function buildProjectListResultV1(repositories: FactoryRepositories): CommandResultV1 {
  return { operation: "project.list", projects: [...repositories.projectRegistry.listAll()] };
}

export function buildProjectShowResultV1(
  repositories: FactoryRepositories,
  request: Extract<CommandRequestV1, { operation: "project.show" }>,
): CommandResultV1 {
  const project = repositories.projectRegistry.findById(request.payload.projectId);
  if (project === null) {
    throw new CommandHandlerError(
      "project.not-found",
      `No project is registered with ID ${request.payload.projectId}.`,
      false,
    );
  }
  return { operation: "project.show", project };
}

/**
 * The daemon-start migration: idempotently registers whichever single project
 * `enrolled-project-execution.ts` (the local execution profile in force) already prepared a
 * Factory mirror for, so nothing that used to work through the pre-registry single-enrolled-project
 * path regresses. Unlike `executeProjectRegisterCommand`, this never scans or prepares a mirror
 * itself — the local execution profile already did both — it only records the mapping, keyed by the
 * SAME `repositoryId` convention `phase-output-mirror.ts` already documented (a project's own ID
 * doubling as its mirror's repository ID). Safe to call on every daemon start: a call whose content
 * exactly matches the existing record is a complete no-op (no new revision).
 */
export function registerOrReconcileEnrolledProjectV1(
  repositories: FactoryRepositories,
  input: Readonly<{ repositoryId: string; sourceRepositoryPath: string }>,
  recordedAt: IsoInstant,
): ProjectRegistryV1 {
  const sourceRepositoryPath = AbsolutePathSchema.parse(input.sourceRepositoryPath);
  const projectId = ProjectIdSchema.parse(input.repositoryId);
  const repositoryId = RepositoryIdSchema.parse(input.repositoryId);
  const docsDir = resolveDocsDirectoryName(sourceRepositoryPath);
  const existing = repositories.projectRegistry.findById(projectId);
  const draft: ProjectRegistryDraftV1 = {
    projectId,
    slug: existing?.slug ?? StableKeySchema.parse(slugFromRepositoryPath(sourceRepositoryPath)),
    displayName: existing?.displayName ?? basename(sourceRepositoryPath),
    sourceRepositoryPath,
    repositoryId,
    standardVersion: existing?.standardVersion ?? null,
    policyLockDigest: existing?.policyLockDigest ?? null,
    docsLayout: { docsDir: docsDir === "absent" ? "docs" : docsDir },
  };
  const { project } = upsertProjectRegistryRecord(
    repositories,
    existing,
    draft,
    recordedAt,
    "system",
  );
  return project;
}
