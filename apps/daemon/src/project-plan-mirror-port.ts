import {
  GitObjectIdSchema,
  RepositoryIdSchema,
  type GitObjectId,
  type RepositoryId,
} from "@app-factory/contracts";
import {
  GitWorkspaceError,
  type BrokerCommitRecord,
  type FactoryMirror,
  type GitWorkspaceManager,
  type ImmutableMirrorBindingTip,
} from "@app-factory/git-workspace";
import type { ProjectRegistryRepository } from "@app-factory/kernel";

import { CommandHandlerError } from "./unix-command-server.js";

/**
 * `plan.execute`/`plan.tick`'s seam onto the Factory mirror's base-advance chain
 * (`GitWorkspaceManager.advanceImmutableMirrorBase`, `packages/git-workspace`) -- this is the
 * "chained tasks" primitive named in the planner's brief: each task item in a plan submits against
 * the repository's CURRENT allowed base, and once its attempt succeeds, the base advances to that
 * attempt's verified broker commit before the next item is submitted, so every task in a plan
 * builds directly on the previous one's real, verified result rather than racing against a fixed
 * base. This module owns only the seam; resolving a succeeded attempt's `BrokerCommitRecord` from
 * evidence is the caller's job (today, no daemon surface does that generically yet -- see the
 * module doc comment on `project-plan-command-runtime.ts`).
 */

export type ProjectPlanMirrorBaseV1 = Readonly<{
  repositoryId: RepositoryId;
  commit: GitObjectId;
}>;

export type ProjectPlanMirrorPort = Readonly<{
  /** The repository + commit the next task item for this repository should build on. */
  currentBase(repositoryId: RepositoryId): ProjectPlanMirrorBaseV1;
  /** Advances the mirror to a succeeded attempt's verified broker commit and returns the new base
   * every later task item in the plan builds on. Idempotent for the same `brokerCommit` (mirrors
   * `advanceImmutableMirrorBase`'s own idempotent replay). */
  advanceBase(
    repositoryId: RepositoryId,
    brokerCommit: BrokerCommitRecord,
  ): ProjectPlanMirrorBaseV1;
}>;

/** The safe default: no mirror is configured, so submitting or advancing a plan's task items fails
 * closed instead of guessing a base. Daemon composition opts in via
 * {@link createGitWorkspaceProjectPlanMirrorPortV1} (or a test double). */
export function createUnconfiguredProjectPlanMirrorPortV1(): ProjectPlanMirrorPort {
  const fail = (): never => {
    throw new CommandHandlerError(
      "plan.mirror-not-configured",
      "No project-plan mirror port is configured on this daemon; plan task items cannot be submitted or advanced.",
      false,
    );
  };
  return { currentBase: fail, advanceBase: fail };
}

/**
 * A real, git-workspace-backed mirror port. Each repository's binding tip is cached in daemon
 * process memory, seeded from `resolveBindingTip` on first use -- the mirror's REAL current base,
 * `GitWorkspaceManager.readImmutableMirrorBindingTip` (the sealed root binding when nothing has
 * advanced, else the validated advance chain's last link) -- and advanced in place by
 * `GitWorkspaceManager.advanceImmutableMirrorBase` (the exact primitive
 * `packages/git-workspace/test/base-advance.test.ts` exercises) every time a task item's attempt
 * succeeds. Because the seed is the on-disk tip, a daemon restarted mid-plan resumes from the last
 * advance instead of a stale root (the v1 gap this port used to document); the durable chain on the
 * mirror is the source of truth and this cache is only a hot copy of it.
 */
export function createGitWorkspaceProjectPlanMirrorPortV1(options: {
  gitWorkspace: GitWorkspaceManager;
  resolveMirror: (repositoryId: RepositoryId) => FactoryMirror;
  resolveBindingTip: (repositoryId: RepositoryId) => ImmutableMirrorBindingTip;
}): ProjectPlanMirrorPort {
  const tips = new Map<RepositoryId, ImmutableMirrorBindingTip>();

  function tipFor(repositoryIdInput: RepositoryId): ImmutableMirrorBindingTip {
    const repositoryId = RepositoryIdSchema.parse(repositoryIdInput);
    const existing = tips.get(repositoryId);
    if (existing !== undefined) return existing;
    const tip = options.resolveBindingTip(repositoryId);
    tips.set(repositoryId, tip);
    return tip;
  }

  return {
    currentBase(repositoryIdInput) {
      const repositoryId = RepositoryIdSchema.parse(repositoryIdInput);
      const tip = tipFor(repositoryId);
      return { repositoryId, commit: GitObjectIdSchema.parse(tip.baseCommit) };
    },
    advanceBase(repositoryIdInput, brokerCommit) {
      const repositoryId = RepositoryIdSchema.parse(repositoryIdInput);
      const mirror = options.resolveMirror(repositoryId);
      const tip = tipFor(repositoryId);
      let advanced: ImmutableMirrorBindingTip;
      try {
        advanced = options.gitWorkspace.advanceImmutableMirrorBase(mirror, tip, brokerCommit);
      } catch (error) {
        throw new CommandHandlerError(
          "plan.mirror-advance-failed",
          `The project-plan mirror for repository ${repositoryId} could not be advanced${
            error instanceof GitWorkspaceError ? `: ${error.message}` : ""
          }.`,
          false,
        );
      }
      tips.set(repositoryId, advanced);
      return { repositoryId, commit: GitObjectIdSchema.parse(advanced.baseCommit) };
    },
  };
}

/**
 * The production composition Seam (b) of the project-registry task wires in: identical to
 * {@link createGitWorkspaceProjectPlanMirrorPortV1} except `resolveMirror`/`resolveBindingTip` are
 * generated from the Project Registry (`ProjectRegistryRepository`) instead of being supplied ad
 * hoc by the caller. A plan's target `repositoryId` must be a registered project's own mirror
 * binding ref (`ProjectRegistryRepository.findByRepositoryId`) before its mirror is ever touched —
 * this is what "resolves the target project's mirror from the registry" means: the registry is
 * consulted as the authorization/lookup layer in front of `GitWorkspaceManager`, not merely a
 * naming table. A plan whose `repositoryId` no project has registered fails closed
 * (`plan.mirror-not-registered`) rather than guessing at an unregistered mirror.
 */
export function createRegistryBackedProjectPlanMirrorPortV1(options: {
  gitWorkspace: GitWorkspaceManager;
  gitRuntimeRoot: string;
  projectRegistry: ProjectRegistryRepository;
}): ProjectPlanMirrorPort {
  function requireRegisteredMirror(repositoryId: RepositoryId): FactoryMirror {
    const project = options.projectRegistry.findByRepositoryId(repositoryId);
    if (project === null) {
      throw new CommandHandlerError(
        "plan.mirror-not-registered",
        `No registered project claims mirror binding ${repositoryId}; run project.register first.`,
        false,
      );
    }
    return options.gitWorkspace.openExistingMirror({
      runtimeRoot: options.gitRuntimeRoot,
      repositoryId,
    });
  }

  return createGitWorkspaceProjectPlanMirrorPortV1({
    gitWorkspace: options.gitWorkspace,
    resolveMirror: requireRegisteredMirror,
    resolveBindingTip: (repositoryId) =>
      options.gitWorkspace.readImmutableMirrorBindingTip(requireRegisteredMirror(repositoryId)),
  });
}
