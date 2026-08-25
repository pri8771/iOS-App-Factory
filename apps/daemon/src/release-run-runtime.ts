import { createHash } from "node:crypto";

import {
  AttemptIdSchema,
  ReleaseIdSchema,
  ReleaseRunIdSchema,
  ReleaseRunV1Schema,
  type AttemptId,
  type CandidateCertificationV1,
  type CommandRequestV1,
  type CommandResultV1,
  type ExecutionAttemptV1,
  type IsoInstant,
  type ReleaseRunV1,
  type RepositoryId,
} from "@app-factory/contracts";
import type { EvidenceStore } from "@app-factory/evidence-store";
import type { VerifiedExecutionEvidence } from "@app-factory/execution-engine";
import type { FactoryMirror, GitWorkspaceManager } from "@app-factory/git-workspace";
import { ReleaseRunUpsertError, type FactoryRepositories } from "@app-factory/kernel";
import { certifyCandidateSubsetV1, type QualitySeverityV1 } from "@app-factory/quality";

import type { DaemonRuntimeIdFactory } from "./daemon-runtime-ids.js";
import type { RunExportMirrorPort } from "./run-export-command-runtime.js";
import { CommandHandlerError } from "./unix-command-server.js";

/**
 * Release Rail Wave 3: `release.start` and `release.promote`. Both run INSIDE the daemon's normal
 * serial command executor (`command-runtime.ts`'s default `serial.run(...)` path), not on the
 * `release.observe`-style bypass reserved for slow network/Keychain round trips (Architecture
 * decision 3 in the release-rail plan). Both operations here only ever do local, bounded work --
 * SQLite reads/writes and local `git` plumbing (fast-forward only, no network, no credentials) --
 * so there is no reason to exempt them from the same serialization and durable command-result
 * journaling every other mutating command already gets (`DURABLE_COMMAND_RESULT_OPERATIONS`), and
 * every reason to keep them inside it: two concurrent CLI callers racing on the SAME release run
 * must be resolved by the executor's serialization, exactly like `phase.upsert`/`plan.execute`.
 *
 * `release.start` certifies a verified broker commit into a fresh `ReleaseRunV1` (the honest
 * `candidate -> certified` subset, architecture decision 6 -- see `@app-factory/quality`'s
 * `certifyCandidateSubsetV1`). `release.promote` fast-forwards the run's already-certified source
 * commit onto the recorded branch in the real source repository (`GitWorkspaceManager
 * .promoteBrokerCommitToBranch`, this same wave). Neither ever advances `ReleaseRunV1.stage` past
 * `"certified"`: `ReleaseRunV1Schema`'s own `superRefine` requires BOTH `promotion` and `archive` to
 * be populated together the moment `stage` reaches `"archived"`, and archiving is Wave 4 -- so
 * `release.promote` performs and durably NOTES the promotion (`run.notes`) while holding `stage`
 * steady at `"certified"` (a legal, resumable-per-stage revision per `assertReleaseRunAdvancement`'s
 * own doc comment). Wave 4's `release.archive` is the one that will re-verify the promotion is still
 * current and finally populate `ReleaseRunV1.promotion` together with its own `archive` record when
 * it advances the run to `"archived"`.
 *
 * Both operations resolve "the commit to release" the same way: a release can only ever be started
 * or promoted for the repository's Factory mirror's CURRENT verified base -- the tip of
 * `GitWorkspaceManager.readImmutableMirrorBindingTip`'s advance chain, which is where the attempt
 * that produced it (`AdvancedImmutableMirrorBinding.brokerAttemptId`) is recorded. This is a
 * deliberate Wave 3 simplification (no lookup exists, or is added here, from an arbitrary historical
 * commit back to the attempt that produced it): only the single most-recently-verified commit for a
 * project can be released. Once resolved to an attempt, the FULL execution-evidence closure is
 * independently re-verified (never trusted from the stored run or from the mirror's chain alone) via
 * `resolveVerifiedExecutionEvidence`, exactly the same fail-closed seam
 * `project-plan-broker-commit-resolver.ts` uses for `plan.execute`/`plan.tick`.
 */

/**
 * The narrow, method-level slice of `FactoryRepositories` these two operations need -- mirrors
 * `run-export-command-runtime.ts`'s `RunExportRepositoriesPort` (picking individual METHODS off
 * each repository class, not the classes themselves) so tests can supply a plain fake object rather
 * than a real, class-typed, sqlite-backed repository for everything except the parts that
 * genuinely exercise `ReleaseRunRepository`'s own CAS logic.
 */
export type ReleaseRunRuntimeRepositoriesPort = Readonly<{
  releaseRuns: Pick<
    FactoryRepositories["releaseRuns"],
    "get" | "upsert" | "findRevisionByCommandId"
  >;
  attempts: Pick<FactoryRepositories["attempts"], "findById">;
}>;

export type ReleaseRunRuntimeDependencies = Readonly<{
  repositories: ReleaseRunRuntimeRepositoriesPort;
  /** Opens the sealed Factory mirror for a repository, exactly the port `run.export` already uses. */
  mirrors: RunExportMirrorPort;
  /** The durable evidence store: `release.start` reads the certified attempt's `EvidenceManifestV1`
   *  directly (in addition to what `resolveVerifiedExecutionEvidence` re-verifies internally) to
   *  build `certifyCandidateSubsetV1`'s `evidenceDigestsByEvidenceId`. */
  evidenceStore: EvidenceStore;
  /** Resolves a succeeded attempt's full re-verified execution-evidence closure (broker commit AND
   *  trusted-test claims); see the module doc comment. Defaults, in the real daemon composition, to
   *  `project-plan-broker-commit-resolver.ts`'s `createVerifiedExecutionEvidenceResolverV1` -- the
   *  exact same fail-closed re-verification `plan.execute`'s `resolveBrokerCommit` already uses,
   *  widened to also return the trusted-test claims. Tests inject a fake the same way
   *  `plan.execute`'s tests fake `resolveBrokerCommit`. */
  resolveVerifiedExecutionEvidence: (attempt: ExecutionAttemptV1) => VerifiedExecutionEvidence;
  idFactory: DaemonRuntimeIdFactory;
}>;

export type ReleaseStartCommandRequestV1 = Extract<
  CommandRequestV1,
  { operation: "release.start" }
>;
export type ReleasePromoteCommandRequestV1 = Extract<
  CommandRequestV1,
  { operation: "release.promote" }
>;

/**
 * Wave 1's `certifyCandidateSubsetV1` needs a `blockingSeverities` floor to weigh
 * `QualityFindingV1[]` against. No `ReleaseContractV1` is durably stored anywhere in the factory yet
 * (a later wave's concern -- see release-run.ts's own module doc comment), and nothing durably
 * produces `QualityFindingV1[]` either (`release.start` always passes `findings: []` below), so this
 * has no observable effect today. It is still the honest, fail-closed-by-default choice to make now
 * rather than defer to a source that does not exist: p0/p1 findings block certification the moment
 * a later wave starts producing them.
 */
const DEFAULT_RELEASE_BLOCKING_SEVERITIES_V1: readonly QualitySeverityV1[] = ["p0", "p1"];

function deterministicReleaseId(seed: string): string {
  const digest = createHash("sha256")
    .update(`app-factory.release-rail.v1\0release-id\0${seed}`)
    .digest("hex");
  const variant = ((Number.parseInt(digest.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

/**
 * One release lineage per project (Wave 3 scope decision): nothing else in the factory today mints
 * or tracks a `ReleaseId` distinct from `ReleaseRunV1.releaseRunId` itself, so every `release.start`
 * for the same project deterministically shares the same `releaseId` -- multiple release runs for a
 * project (retries, re-releases) are grouped under it, matching `ReleaseRunRepository.listByProject`.
 */
function deriveReleaseIdV1(projectId: string): string {
  return ReleaseIdSchema.parse(deterministicReleaseId(projectId));
}

function mapReleaseRunUpsertError(error: unknown): never {
  if (error instanceof ReleaseRunUpsertError) {
    throw new CommandHandlerError(
      error.code === "release-run.identity-conflict" ? "command.identity-conflict" : error.code,
      error.message,
      false,
    );
  }
  throw error;
}

/**
 * Resolves "the commit to release" for one repository, opening its Factory mirror and re-verifying
 * the FULL execution-evidence closure for the attempt that produced the mirror's CURRENT tip. Fails
 * closed (a typed `CommandHandlerError`) at every step; see the module doc comment for why only the
 * mirror's current tip is ever eligible.
 */
function resolveVerifiedReleaseSourceV1(
  dependencies: ReleaseRunRuntimeDependencies,
  repositoryId: RepositoryId,
  sourceCommit: string,
): Readonly<{
  gitWorkspace: GitWorkspaceManager;
  mirror: FactoryMirror;
  verified: VerifiedExecutionEvidence;
}> {
  let opened: ReturnType<RunExportMirrorPort["open"]>;
  try {
    opened = dependencies.mirrors.open(repositoryId);
  } catch (error) {
    throw new CommandHandlerError(
      "release.mirror-not-registered",
      `The Factory mirror for repository ${repositoryId} could not be opened${
        error instanceof Error ? ` (${error.message})` : ""
      }.`,
      false,
    );
  }

  let tip;
  try {
    tip = opened.gitWorkspace.readImmutableMirrorBindingTip(opened.mirror);
  } catch (error) {
    throw new CommandHandlerError(
      "release.no-verified-candidate",
      `Repository ${repositoryId} has no verified candidate to release yet${
        error instanceof Error ? ` (${error.message})` : ""
      }.`,
      false,
    );
  }
  if (tip.kind !== "prepared-immutable-mirror-advance") {
    throw new CommandHandlerError(
      "release.no-verified-candidate",
      `Repository ${repositoryId}'s Factory mirror has not advanced past its original enrollment; there is no verified attempt to release yet.`,
      false,
    );
  }
  if (tip.baseCommit !== sourceCommit) {
    throw new CommandHandlerError(
      "release.source-commit-not-current",
      `Commit ${sourceCommit} is not repository ${repositoryId}'s current verified base (${tip.baseCommit}); only the most recently verified commit can be released or promoted.`,
      false,
    );
  }

  const attempt = dependencies.repositories.attempts.findById(tip.brokerAttemptId);
  if (attempt === null) {
    throw new CommandHandlerError(
      "release.attempt-not-found",
      `Attempt ${tip.brokerAttemptId}, recorded on repository ${repositoryId}'s mirror binding chain, no longer exists.`,
      false,
    );
  }

  const verified = dependencies.resolveVerifiedExecutionEvidence(attempt);
  if (verified.brokerCommit.commitSha !== sourceCommit) {
    throw new CommandHandlerError(
      "release.broker-commit-mismatch",
      "The re-verified broker commit does not match the requested source commit.",
      false,
    );
  }
  return { gitWorkspace: opened.gitWorkspace, mirror: opened.mirror, verified };
}

/**
 * Picks the one `VerificationClaimsV1` `certifyCandidateSubsetV1` checks against a verified
 * attempt's (possibly several) trusted-test records: the first FAILING one if any exists (so
 * certification honestly reports the failure), otherwise the first -- when every trusted test
 * passed, any one of them is equally representative of "the plan's own verification passed".
 */
function selectVerificationClaimsV1(
  trustedTests: VerifiedExecutionEvidence["trustedTests"],
): VerifiedExecutionEvidence["trustedTests"][number]["claims"] {
  const first = trustedTests[0];
  if (first === undefined) {
    throw new CommandHandlerError(
      "release.no-verification-evidence",
      "The verified attempt carries no trusted verification check to certify against.",
      false,
    );
  }
  const failing = trustedTests.find((test) => !test.claims.passed);
  return (failing ?? first).claims;
}

function buildCertificationNotesV1(certification: CandidateCertificationV1): readonly string[] {
  return certification.checks.map(
    (check) =>
      `release.start: ${check.code} ${check.passed ? "passed" : "FAILED"} -- ${check.detail}`,
  );
}

/**
 * `release.start`: certifies the repository's currently verified commit (Wave 1's honest
 * `candidate -> certified` subset) into a fresh `ReleaseRunV1` at revision 1. Always creates a run --
 * even an uncertified one stays at stage `"candidate"` with its failing checks recorded in `notes`,
 * never silently dropped (architecture decision 6).
 */
export function executeReleaseStartCommand(
  dependencies: ReleaseRunRuntimeDependencies,
  request: ReleaseStartCommandRequestV1,
  observedAt: IsoInstant,
): CommandResultV1 {
  const { projectId, repositoryId, sourceCommit, branch } = request.payload;
  const { verified } = resolveVerifiedReleaseSourceV1(dependencies, repositoryId, sourceCommit);
  const attemptId: AttemptId = AttemptIdSchema.parse(verified.brokerCommit.attemptId);

  const manifestRecord = dependencies.evidenceStore.findManifestRecord(attemptId);
  if (manifestRecord === null) {
    throw new CommandHandlerError(
      "release.evidence-manifest-not-found",
      `No evidence manifest exists for attempt ${attemptId}.`,
      false,
    );
  }
  const storage = dependencies.evidenceStore.verify(attemptId);
  if (storage.manifestDigest !== manifestRecord.digest) {
    throw new CommandHandlerError(
      "release.evidence-integrity-failed",
      "The evidence manifest changed while it was being verified.",
      false,
    );
  }
  const evidenceDigestsByEvidenceId = Object.fromEntries(
    manifestRecord.manifest.entries.map((entry) => [entry.evidenceId, entry.digest]),
  );

  const claims = selectVerificationClaimsV1(verified.trustedTests);
  const releaseId = deriveReleaseIdV1(projectId);

  let certification: CandidateCertificationV1;
  try {
    certification = certifyCandidateSubsetV1({
      releaseId,
      projectId,
      candidateCommit: sourceCommit,
      verifiedBrokerCommit: verified.brokerCommit.commitSha,
      // The candidate here IS the broker commit itself -- synthesized via `commit-tree` from an
      // already fully verified candidate tree (`GitWorkspaceManager.createOrReconcileBrokerCommit`).
      // There is no separate mutable working tree to inspect at `release.start` time; a broker
      // commit's very construction already IS the "clean tree" proof.
      cleanTree: true,
      verification: claims,
      evidenceManifest: manifestRecord.manifest,
      evidenceDigestsByEvidenceId,
      findings: [],
      blockingSeverities: DEFAULT_RELEASE_BLOCKING_SEVERITIES_V1,
      evaluatedAt: observedAt,
    });
  } catch (error) {
    throw new CommandHandlerError(
      "release.certification-failed",
      `Candidate certification could not be computed${error instanceof Error ? `: ${error.message}` : ""}.`,
      false,
    );
  }

  const releaseRunId = ReleaseRunIdSchema.parse(
    dependencies.idFactory("release-run", request.commandId),
  );
  const run: ReleaseRunV1 = ReleaseRunV1Schema.parse({
    schemaVersion: 1,
    releaseRunId,
    projectId,
    repositoryId,
    releaseId,
    sourceCommit,
    branch,
    stage: certification.certified ? "certified" : "candidate",
    revision: 1,
    promotion: null,
    archive: null,
    upload: null,
    unevaluated: certification.unevaluated,
    notes: buildCertificationNotesV1(certification),
    createdAt: observedAt,
    updatedAt: observedAt,
  });

  try {
    const upserted = dependencies.repositories.releaseRuns.upsert({
      commandId: request.commandId,
      origin: request.origin,
      issuedAt: request.issuedAt,
      run,
      recordedAt: observedAt,
    });
    return { operation: "release.start", run: upserted.run, created: upserted.created };
  } catch (error) {
    mapReleaseRunUpsertError(error);
  }
}

/**
 * `release.promote`: fast-forwards the run's certified source commit onto its recorded branch in
 * the real source repository. Requires the run to be at stage `"certified"` (an uncertified or
 * already-archived run refuses). Holds `stage` at `"certified"` -- see the module doc comment for
 * why `ReleaseRunV1.promotion` is populated later, by Wave 4's `release.archive`, not here -- and
 * durably notes what moved.
 */
export function executeReleasePromoteCommand(
  dependencies: ReleaseRunRuntimeDependencies,
  request: ReleasePromoteCommandRequestV1,
  observedAt: IsoInstant,
): CommandResultV1 {
  const { releaseRunId, expectedRevision } = request.payload;
  // A retry of a commandId that already completed (e.g. the client never saw the response) must
  // return the SAME result rather than fail closed on a now-stale `expectedRevision` -- the
  // fast-forward and evidence re-verification below are not free to simply repeat, and the run may
  // have legitimately advanced further since. Checked before the CAS comparison, not after, exactly
  // so this replay path never even reaches it.
  const replayed = dependencies.repositories.releaseRuns.findRevisionByCommandId(request.commandId);
  if (replayed !== null) {
    return { operation: "release.promote", run: replayed };
  }
  const head = dependencies.repositories.releaseRuns.get(releaseRunId);
  if (head === null) {
    throw new CommandHandlerError(
      "release-run.not-found",
      `No release run exists for ID ${releaseRunId}.`,
      false,
    );
  }
  if (head.revision !== expectedRevision) {
    throw new CommandHandlerError(
      "release-run.revision-conflict",
      `Release run ${releaseRunId} is at revision ${String(head.revision)}, not ${String(expectedRevision)}.`,
      true,
    );
  }
  if (head.stage !== "certified") {
    throw new CommandHandlerError(
      "release-run.not-certified",
      `Release run ${releaseRunId} is at stage "${head.stage}"; only a certified run can be promoted.`,
      false,
    );
  }

  const { gitWorkspace, mirror, verified } = resolveVerifiedReleaseSourceV1(
    dependencies,
    head.repositoryId,
    head.sourceCommit,
  );
  const promoted = gitWorkspace.promoteBrokerCommitToBranch(
    mirror,
    {
      attemptId: verified.brokerCommit.attemptId,
      baseSha: verified.brokerCommit.baseSha,
      candidateTreeId: verified.brokerCommit.candidateTreeId,
      diffDigest: verified.brokerCommit.diffDigest,
    },
    { targetRepositoryPath: mirror.sourceRepositoryPath, branch: head.branch },
  );

  const next: ReleaseRunV1 = ReleaseRunV1Schema.parse({
    ...head,
    revision: head.revision + 1,
    updatedAt: observedAt,
    notes: [
      ...head.notes,
      `release.promote: fast-forwarded "${promoted.branch}" ${promoted.fromCommit} -> ${promoted.toCommit} (tree ${promoted.treeDigest}).`,
    ].slice(-50),
  });

  try {
    const upserted = dependencies.repositories.releaseRuns.upsert({
      commandId: request.commandId,
      origin: request.origin,
      issuedAt: request.issuedAt,
      run: next,
      recordedAt: observedAt,
    });
    return { operation: "release.promote", run: upserted.run };
  } catch (error) {
    mapReleaseRunUpsertError(error);
  }
}

/** `release.status`: read-only. */
export function buildReleaseStatusResultV1(
  repositories: Pick<ReleaseRunRuntimeRepositoriesPort, "releaseRuns">,
  request: Extract<CommandRequestV1, { operation: "release.status" }>,
): CommandResultV1 {
  const run = repositories.releaseRuns.get(request.payload.releaseRunId);
  if (run === null) {
    throw new CommandHandlerError(
      "release-run.not-found",
      `No release run exists for ID ${request.payload.releaseRunId}.`,
      false,
    );
  }
  return { operation: "release.status", run };
}
