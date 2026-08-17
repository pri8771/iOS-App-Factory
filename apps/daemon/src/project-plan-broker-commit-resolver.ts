import { computeTaskSpecDigest, type FactoryRepositories } from "@app-factory/kernel";
import { EvidenceStoreError, type EvidenceStore } from "@app-factory/evidence-store";
import {
  ExecutionEvidenceError,
  verifyExecutionEvidenceIndex,
  type VerifiedExecutionEvidence,
} from "@app-factory/execution-engine";
import {
  GitWorkspaceError,
  GitWorkspaceManager,
  type BrokerCommitRecord,
} from "@app-factory/git-workspace";
import type {
  EvidenceV1,
  ExecutionAttemptV1,
  Sha256Digest,
  TaskSpecV1,
} from "@app-factory/contracts";

import { CommandHandlerError } from "./unix-command-server.js";

/**
 * Seam (b) of the project-registry task: `plan.execute`/`plan.tick`'s `resolveBrokerCommit` port
 * (`ProjectPlanExecutionDependencies`, `project-plan-command-runtime.ts`), re-deriving a succeeded
 * task item's verified `BrokerCommitRecord` from durable evidence only -- exactly the same closure
 * `run-export-command-runtime.ts`'s `executeRunExportCommand` re-verifies for `run.export`, scoped
 * down to just the broker commit a mirror-advance needs. Nothing here is taken from the running
 * daemon's memory: the attempt's immutable `TaskSpec` snapshot names its `repositoryId`; the private
 * evidence store's manifest names the commit evidence's `execution-evidence-index` artifact; that
 * index, re-verified against the project's own sealed Factory mirror
 * (`GitWorkspaceManager.inspectBrokerCommit`, via `verifyExecutionEvidenceIndex`), is the trusted
 * source of the full `BrokerCommitRecord` (`refName`/`baseSha`/`diffDigest`/`commitDigest` that the
 * evidence store's own `CommitEvidenceV1.claims` does not carry by itself).
 */

const EXECUTION_EVIDENCE_INDEX_MEDIA_TYPE =
  "application/vnd.app-factory.execution-evidence-index.v1+json";
const EXECUTION_EVIDENCE_INDEX_LOGICAL_NAME = "execution-evidence-index.v1.json";

export type CreateEvidenceBrokerCommitResolverOptions = Readonly<{
  repositories: FactoryRepositories;
  evidenceStore: EvidenceStore;
  gitRuntimeRoot: string;
  gitExecutable?: string;
}>;

function integrityFailure(message: string): never {
  throw new CommandHandlerError("plan.broker-commit-integrity-failed", message, false);
}

function readStore<T>(operation: () => T, failureMessage: string): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof CommandHandlerError) throw error;
    throw new CommandHandlerError(
      "plan.broker-commit-integrity-failed",
      `${failureMessage}${error instanceof Error ? ` (${error.message})` : ""}`,
      false,
    );
  }
}

function requireTaskSpec(
  repositories: FactoryRepositories,
  attempt: ExecutionAttemptV1,
): TaskSpecV1 {
  const taskSpec = repositories.taskSnapshots.findById(attempt.taskId);
  if (taskSpec === null) {
    integrityFailure(`Attempt ${attempt.attemptId} has no immutable TaskSpec snapshot.`);
  }
  if (computeTaskSpecDigest(taskSpec) !== attempt.taskSpecDigest) {
    integrityFailure(`Attempt ${attempt.attemptId}'s TaskSpec snapshot does not match its digest.`);
  }
  return taskSpec;
}

function singleArtifactDigest(
  evidence: EvidenceV1,
  logicalName: string,
  mediaType: string,
): Sha256Digest | null {
  const matches = evidence.artifacts.filter(
    (artifact) => artifact.logicalName === logicalName && artifact.mediaType === mediaType,
  );
  if (matches.length > 1) {
    integrityFailure(`Evidence ${evidence.evidenceId} carries more than one ${logicalName}.`);
  }
  return matches[0]?.digest ?? null;
}

/**
 * Builds the synchronous `resolveBrokerCommit` port `ProjectPlanExecutionDependencies` requires.
 * Fails closed (a thrown `CommandHandlerError`) rather than returning a guessed or partial record
 * whenever the attempt's evidence closure does not fully re-verify.
 */
export function createEvidenceBrokerCommitResolverV1(
  options: CreateEvidenceBrokerCommitResolverOptions,
): (attempt: ExecutionAttemptV1) => BrokerCommitRecord {
  const gitWorkspace = new GitWorkspaceManager(
    options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable },
  );

  return (attempt: ExecutionAttemptV1): BrokerCommitRecord => {
    const taskSpec = requireTaskSpec(options.repositories, attempt);
    const record = readStore(
      () => options.evidenceStore.findManifestRecord(attempt.attemptId),
      "The private evidence store could not be read.",
    );
    if (record === null) {
      integrityFailure(`No evidence manifest exists for attempt ${attempt.attemptId}.`);
    }
    const storage = readStore(
      () => options.evidenceStore.verify(attempt.attemptId),
      "The evidence manifest failed storage integrity verification.",
    );
    if (storage.manifestDigest !== record.digest) {
      integrityFailure("The evidence manifest changed while it was being verified.");
    }
    const commitEvidence = storage.evidence.find(
      (item): item is Extract<EvidenceV1, { kind: "commit" }> => item.kind === "commit",
    );
    if (commitEvidence === undefined) {
      integrityFailure(`Attempt ${attempt.attemptId}'s evidence carries no commit record.`);
    }
    const indexDigest = singleArtifactDigest(
      commitEvidence,
      EXECUTION_EVIDENCE_INDEX_LOGICAL_NAME,
      EXECUTION_EVIDENCE_INDEX_MEDIA_TYPE,
    );
    if (indexDigest === null) {
      integrityFailure("The commit evidence carries no execution evidence index artifact.");
    }

    let mirror;
    try {
      mirror = gitWorkspace.openExistingMirror({
        runtimeRoot: options.gitRuntimeRoot,
        repositoryId: taskSpec.base.repositoryId,
      });
    } catch (error) {
      throw new CommandHandlerError(
        "plan.mirror-not-registered",
        `The Factory mirror for repository ${taskSpec.base.repositoryId} could not be opened${
          error instanceof Error ? ` (${error.message})` : ""
        }.`,
        false,
      );
    }

    let verified: VerifiedExecutionEvidence;
    try {
      verified = verifyExecutionEvidenceIndex({
        indexDigest,
        evidenceStore: options.evidenceStore,
        gitWorkspace,
        mirror,
      });
    } catch (error) {
      const detail =
        error instanceof ExecutionEvidenceError ||
        error instanceof GitWorkspaceError ||
        error instanceof EvidenceStoreError
          ? error.message
          : "the execution closure could not be re-verified";
      integrityFailure(
        `Attempt ${attempt.attemptId}'s execution closure did not re-verify: ${detail}.`,
      );
    }
    return verified.brokerCommit;
  };
}
