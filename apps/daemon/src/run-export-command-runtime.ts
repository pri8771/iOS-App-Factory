import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  RunRecordV1Schema,
  Sha256DigestSchema,
  type AgentRunResultV1,
  type AttemptId,
  type CommandRequestV1,
  type CommandResultV1,
  type EvidenceV1,
  type ExecutionAttemptV1,
  type RepositoryId,
  type RunRecordV1,
  type Sha256Digest,
  type TaskSpecV1,
} from "@app-factory/contracts";
import { EvidenceStoreError, type EvidenceStore } from "@app-factory/evidence-store";
import {
  ExecutionEvidenceError,
  canonicalJsonBytes,
  parseAgentEventLogBytes,
  sha256Digest,
  verifyExecutionEvidenceIndex,
  type VerifiedExecutionEvidence,
} from "@app-factory/execution-engine";
import {
  GitWorkspaceError,
  GitWorkspaceManager,
  type FactoryMirror,
} from "@app-factory/git-workspace";
import { computeTaskSpecDigest, type FactoryRepositories } from "@app-factory/kernel";

import { CommandHandlerError } from "./unix-command-server.js";

export type RunExportCommandRequestV1 = Extract<CommandRequestV1, { operation: "run.export" }>;

/**
 * Read-only access to the sealed Factory mirror of one enrolled repository.
 * The default implementation ({@link createRunExportMirrorPort}) opens the
 * mirror straight from the daemon's git runtime root by repository ID -- the
 * mirror's own on-disk ownership marker is the only source of its identity --
 * so an export never depends on which projects the running daemon happens to
 * have composed in memory.
 */
export type RunExportMirrorPort = Readonly<{
  open(repositoryId: RepositoryId): Readonly<{
    gitWorkspace: GitWorkspaceManager;
    mirror: FactoryMirror;
  }>;
}>;

/** The two durable kernel reads an export needs: the attempt row and its immutable TaskSpec snapshot. */
export type RunExportRepositoriesPort = Readonly<{
  attempts: Pick<FactoryRepositories["attempts"], "findById">;
  taskSnapshots: Pick<FactoryRepositories["taskSnapshots"], "findById">;
}>;

export type RunExportDependencies = Readonly<{
  repositories: RunExportRepositoriesPort;
  evidenceStore: EvidenceStore;
  mirrors: RunExportMirrorPort;
}>;

const EXECUTION_EVIDENCE_INDEX_MEDIA_TYPE =
  "application/vnd.app-factory.execution-evidence-index.v1+json";
const EXECUTION_EVIDENCE_INDEX_LOGICAL_NAME = "execution-evidence-index.v1.json";
const AGENT_INVOCATION_DESCRIPTOR_MEDIA_TYPE =
  "application/vnd.app-factory.agent-invocation-descriptor.v1+json";
const AGENT_INVOCATION_DESCRIPTOR_LOGICAL_NAME = "agent-invocation-descriptor.v1.json";
const MAX_IDENTITY_TEXT_LENGTH = 200;

export function createRunExportMirrorPort(
  options: Readonly<{ gitRuntimeRoot: string; gitExecutable?: string }>,
): RunExportMirrorPort {
  let gitWorkspace: GitWorkspaceManager | null = null;
  return {
    open(repositoryId) {
      const mirrorPath = join(options.gitRuntimeRoot, "mirrors", `${repositoryId}.git`);
      // Refuse before touching git-workspace at all: opening the runtime root
      // would otherwise create it, and a daemon that never ran a verified
      // local attempt has nothing to export.
      if (!existsSync(options.gitRuntimeRoot) || !existsSync(mirrorPath)) {
        throw new GitWorkspaceError(`No Factory mirror exists for repository ${repositoryId}`);
      }
      gitWorkspace ??= new GitWorkspaceManager(
        options.gitExecutable === undefined ? {} : { gitExecutable: options.gitExecutable },
      );
      const mirror = gitWorkspace.openExistingMirror({
        runtimeRoot: options.gitRuntimeRoot,
        repositoryId,
      });
      return { gitWorkspace, mirror };
    },
  };
}

function exportError(
  code:
    | "run.export-not-terminal"
    | "run.export-not-verified"
    | "run.export-evidence-incomplete"
    | "run.export-mirror-unavailable"
    | "run.export-integrity-failed",
  message: string,
): CommandHandlerError {
  return new CommandHandlerError(code, message, false);
}

function integrityFailure(message: string): never {
  throw exportError("run.export-integrity-failed", message);
}

function requireTerminalSucceededAttempt(
  repositories: RunExportRepositoriesPort,
  attemptId: AttemptId,
): ExecutionAttemptV1 {
  const attempt = repositories.attempts.findById(attemptId);
  if (attempt === null) {
    throw new CommandHandlerError(
      "attempt.not-found",
      `No attempt exists for ID ${attemptId}.`,
      false,
    );
  }
  if (
    attempt.state !== "succeeded" &&
    attempt.state !== "failed" &&
    attempt.state !== "cancelled"
  ) {
    throw exportError(
      "run.export-not-terminal",
      `Attempt ${attemptId} is ${attempt.state}; only a terminal attempt can be exported.`,
    );
  }
  if (attempt.state !== "succeeded" || attempt.terminalAt === null) {
    throw exportError(
      "run.export-not-verified",
      `Attempt ${attemptId} is ${attempt.state}; only a succeeded, verified run has an exportable record.`,
    );
  }
  return attempt;
}

function requireTaskSpec(
  repositories: RunExportRepositoriesPort,
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

function readStore<T>(operation: () => T, failureMessage: string): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof CommandHandlerError) throw error;
    throw new CommandHandlerError(
      "evidence.integrity-failed",
      `${failureMessage}${error instanceof Error ? ` (${error.message})` : ""}`,
      false,
    );
  }
}

type PartitionedEvidence = Readonly<{
  eventLog: Extract<EvidenceV1, { kind: "event-log" }>;
  agentRun: Extract<EvidenceV1, { kind: "agent-run" }> | null;
  verification: readonly Extract<EvidenceV1, { kind: "verification" }>[];
  review: Extract<EvidenceV1, { kind: "review" }>;
  commit: Extract<EvidenceV1, { kind: "commit" }>;
}>;

function partitionEvidence(evidence: readonly EvidenceV1[]): PartitionedEvidence {
  const eventLogs = evidence.filter((item) => item.kind === "event-log");
  const agentRuns = evidence.filter((item) => item.kind === "agent-run");
  const verification = evidence.filter((item) => item.kind === "verification");
  const reviews = evidence.filter((item) => item.kind === "review");
  const commits = evidence.filter((item) => item.kind === "commit");
  const [eventLog] = eventLogs;
  const [review] = reviews;
  const [commit] = commits;
  if (
    eventLog === undefined ||
    eventLogs.length !== 1 ||
    review === undefined ||
    reviews.length !== 1 ||
    commit === undefined ||
    commits.length !== 1 ||
    verification.length < 1 ||
    agentRuns.length > 1
  ) {
    throw exportError(
      "run.export-evidence-incomplete",
      "The evidence manifest is not a complete verified-execution closure (expected exactly one event-log, review, and commit record, at least one verification record, and at most one agent-run record).",
    );
  }
  return { eventLog, agentRun: agentRuns[0] ?? null, verification, review, commit };
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

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalJsonBytes(left).equals(canonicalJsonBytes(right));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedIdentityText(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_IDENTITY_TEXT_LENGTH ||
    value.trim() !== value
  ) {
    integrityFailure(`The agent invocation descriptor's ${label} is not bounded identity text.`);
  }
  return value;
}

type AgentIdentity = Readonly<{
  adapterVersion: string | null;
  cliVersion: string | null;
  model: string | null;
  executableDigest: Sha256Digest | null;
}>;

/**
 * Reads the supervisor-V2 invocation descriptor the agent-run evidence
 * carries and returns the identity fields the run record exposes. Only the
 * fields the record needs are validated (the executor already validated the
 * full descriptor before publishing it); anything malformed still fails the
 * export closed rather than exporting a partial identity.
 */
function readAgentIdentity(
  store: EvidenceStore,
  agentRun: Extract<EvidenceV1, { kind: "agent-run" }>,
): AgentIdentity {
  const digest = singleArtifactDigest(
    agentRun,
    AGENT_INVOCATION_DESCRIPTOR_LOGICAL_NAME,
    AGENT_INVOCATION_DESCRIPTOR_MEDIA_TYPE,
  );
  if (digest === null) {
    return { adapterVersion: null, cliVersion: null, model: null, executableDigest: null };
  }
  const bytes = readStore(
    () => store.readBlob(digest),
    "The agent invocation descriptor could not be read from the evidence store.",
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    integrityFailure("The agent invocation descriptor is not JSON.");
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    integrityFailure("The agent invocation descriptor has an unsupported shape.");
  }
  if (parsed.adapterId !== agentRun.producer) {
    integrityFailure(
      "The agent invocation descriptor names a different adapter than its evidence.",
    );
  }
  const executableDigest = Sha256DigestSchema.safeParse(parsed.executableDigest);
  if (!executableDigest.success) {
    integrityFailure("The agent invocation descriptor has no valid executable digest.");
  }
  return {
    adapterVersion: boundedIdentityText(parsed.adapterVersion, "adapterVersion"),
    cliVersion: boundedIdentityText(parsed.cliVersion, "cliVersion"),
    model: parsed.model === null ? null : boundedIdentityText(parsed.model, "model"),
    executableDigest: executableDigest.data,
  };
}

function requireAgentRunResult(
  agentRun: Extract<EvidenceV1, { kind: "agent-run" }>,
  verified: VerifiedExecutionEvidence,
): AgentRunResultV1 {
  const { result } = agentRun.claims;
  if (
    result.status !== "succeeded" ||
    result.attemptId !== verified.index.attemptId ||
    result.runId !== verified.index.implementingRunId ||
    result.fence > verified.index.fence
  ) {
    integrityFailure("The agent-run evidence is not bound to the verified execution closure.");
  }
  return result;
}

function assertClosureMatchesManifest(
  attempt: ExecutionAttemptV1,
  taskSpec: TaskSpecV1,
  manifest: Readonly<{ subject: EvidenceV1["subject"] }>,
  evidence: PartitionedEvidence,
  verified: VerifiedExecutionEvidence,
): void {
  const { index } = verified;
  if (
    index.attemptId !== attempt.attemptId ||
    index.taskSpecDigest !== attempt.taskSpecDigest ||
    index.fence > attempt.fence ||
    taskSpec.base.commit !== index.baseCommit ||
    taskSpec.base.repositoryId !== index.repositoryId ||
    taskSpec.policyDigest !== index.policyDigest
  ) {
    integrityFailure("The execution evidence index is not bound to this attempt's durable task.");
  }
  if (
    !sameCanonical(manifest.subject, {
      taskSpecDigest: index.taskSpecDigest,
      policyDigest: index.policyDigest,
      baseCommit: index.baseCommit,
      candidateTree: index.candidateTree,
      fence: index.fence,
    })
  ) {
    integrityFailure("The evidence manifest subject does not match the execution evidence index.");
  }
  if (
    evidence.commit.claims.commit !== verified.brokerCommit.commitSha ||
    evidence.commit.claims.tree !== index.candidateTree ||
    evidence.commit.claims.tree !== verified.brokerCommit.candidateTreeId ||
    evidence.commit.claims.attemptMarker !== verified.brokerCommit.attemptMarker
  ) {
    integrityFailure(
      "The commit evidence does not match the broker commit re-derived from the mirror.",
    );
  }
  if (!sameCanonical(evidence.review.claims.report, verified.review)) {
    integrityFailure("The review evidence does not match the verified review report.");
  }
  if (
    evidence.verification.length !== verified.trustedTests.length ||
    !sameCanonical(
      evidence.verification.map((item) => item.claims),
      verified.trustedTests.map((test) => test.claims),
    )
  ) {
    integrityFailure("The verification evidence does not match the verified trusted test records.");
  }
  if (evidence.eventLog.claims.eventLogDigest !== index.eventDigest) {
    integrityFailure("The event-log evidence does not match the execution evidence index.");
  }
}

/**
 * Re-derives one verified run's canonical record from durable state only:
 * the kernel attempt row and TaskSpec snapshot, the immutable evidence store
 * (manifest, evidence records, artifacts), and the sealed Factory mirror the
 * broker commit lives in. Nothing is taken from the running daemon's memory.
 * Fails closed unless the attempt is terminal and succeeded, its manifest and
 * blobs verify, the execution closure semantically re-verifies against the
 * mirror, and every record in the manifest agrees with that closure.
 */
export function executeRunExportCommand(
  dependencies: RunExportDependencies,
  request: RunExportCommandRequestV1,
): CommandResultV1 {
  const { attemptId } = request.payload;
  const attempt = requireTerminalSucceededAttempt(dependencies.repositories, attemptId);
  const taskSpec = requireTaskSpec(dependencies.repositories, attempt);

  const store = dependencies.evidenceStore;
  const record = readStore(
    () => store.findManifestRecord(attemptId),
    "The private evidence store could not be read and verified.",
  );
  if (record === null) {
    throw new CommandHandlerError(
      "evidence.not-found",
      `No evidence manifest exists for attempt ${attemptId}.`,
      false,
    );
  }
  const storage = readStore(
    () => store.verify(attemptId),
    "The evidence manifest failed storage integrity verification.",
  );
  if (storage.manifestDigest !== record.digest) {
    throw new CommandHandlerError(
      "evidence.integrity-failed",
      "The evidence manifest changed while it was being verified.",
      false,
    );
  }
  const evidence = partitionEvidence(storage.evidence);
  const indexDigest = singleArtifactDigest(
    evidence.commit,
    EXECUTION_EVIDENCE_INDEX_LOGICAL_NAME,
    EXECUTION_EVIDENCE_INDEX_MEDIA_TYPE,
  );
  if (indexDigest === null) {
    throw exportError(
      "run.export-evidence-incomplete",
      "The commit evidence carries no execution evidence index artifact.",
    );
  }

  let opened: ReturnType<RunExportMirrorPort["open"]>;
  try {
    opened = dependencies.mirrors.open(taskSpec.base.repositoryId);
  } catch (error) {
    throw exportError(
      "run.export-mirror-unavailable",
      `The Factory mirror for repository ${taskSpec.base.repositoryId} could not be opened${
        error instanceof Error ? ` (${error.message})` : ""
      }.`,
    );
  }

  let verified: VerifiedExecutionEvidence;
  try {
    verified = verifyExecutionEvidenceIndex({
      indexDigest,
      evidenceStore: store,
      gitWorkspace: opened.gitWorkspace,
      mirror: opened.mirror,
    });
  } catch (error) {
    if (error instanceof CommandHandlerError) throw error;
    const detail =
      error instanceof ExecutionEvidenceError ||
      error instanceof GitWorkspaceError ||
      error instanceof EvidenceStoreError
        ? error.message
        : "the execution closure could not be re-verified";
    integrityFailure(`The execution closure did not re-verify against the mirror: ${detail}.`);
  }
  assertClosureMatchesManifest(attempt, taskSpec, record.manifest, evidence, verified);

  const eventLog = readStore(
    () =>
      parseAgentEventLogBytes(store.readBlob(verified.index.eventDigest), {
        attemptId: verified.index.attemptId,
        implementingRunId: verified.index.implementingRunId,
        maximumFence: verified.index.fence,
      }),
    "The agent event log could not be re-read from the evidence store.",
  );
  const firstEvent = eventLog[0];
  const lastEvent = eventLog.at(-1);
  if (firstEvent === undefined || lastEvent === undefined || firstEvent.type !== "agent.started") {
    integrityFailure("The agent event log does not begin with an agent.started event.");
  }
  const adapterId = firstEvent.data.adapterId;
  if (evidence.agentRun !== null && evidence.agentRun.producer !== adapterId) {
    integrityFailure("The agent-run evidence names a different adapter than the event log.");
  }
  const agentRunResult =
    evidence.agentRun === null ? null : requireAgentRunResult(evidence.agentRun, verified);
  const identity: AgentIdentity =
    evidence.agentRun === null
      ? { adapterVersion: null, cliVersion: null, model: null, executableDigest: null }
      : readAgentIdentity(store, evidence.agentRun);

  const runRecord: RunRecordV1 = RunRecordV1Schema.parse({
    schemaVersion: 1,
    attemptId: attempt.attemptId,
    taskId: attempt.taskId,
    attemptNumber: attempt.attemptNumber,
    state: "succeeded",
    implementingRunId: verified.index.implementingRunId,
    repositoryId: verified.index.repositoryId,
    taskSpecDigest: verified.index.taskSpecDigest,
    policyDigest: verified.index.policyDigest,
    baseCommit: verified.index.baseCommit,
    candidateTree: verified.index.candidateTree,
    fence: verified.index.fence,
    brokerCommit: {
      commit: verified.brokerCommit.commitSha,
      tree: verified.brokerCommit.candidateTreeId,
      commitDigest: verified.brokerCommit.commitDigest,
      attemptMarker: verified.brokerCommit.attemptMarker,
    },
    verification: verified.trustedTests.map((test) => test.claims),
    review: {
      reviewerId: verified.review.reviewerId,
      reviewerVersion: verified.review.reviewerVersion,
      reviewerRunId: verified.index.reviewerRunId,
      verdict: verified.review.verdict,
      findingCount: verified.review.findings.length,
      reviewInputDigest: verified.review.reviewInputDigest,
    },
    evidence: {
      manifestDigest: record.digest,
      indexDigest: verified.indexDigest,
      entryCount: record.manifest.entries.length,
      artifactCount: storage.artifactCount,
    },
    agent: {
      adapterId,
      adapterVersion: identity.adapterVersion,
      cliVersion: identity.cliVersion,
      model: identity.model,
      executableDigest: identity.executableDigest,
      usage: agentRunResult?.usage ?? null,
    },
    timings: {
      attemptCreatedAt: attempt.createdAt,
      attemptTerminalAt: attempt.terminalAt,
      agentStartedAt: firstEvent.occurredAt,
      agentFinishedAt: lastEvent.occurredAt,
      evidenceCreatedAt: record.manifest.createdAt,
    },
  });
  return {
    operation: "run.export",
    record: runRecord,
    recordDigest: computeRunRecordDigest(runRecord),
  };
}

/** SHA-256 of the record's canonical JSON (recursively key-sorted, no insignificant whitespace). */
export function computeRunRecordDigest(record: RunRecordV1): Sha256Digest {
  return sha256Digest(canonicalJsonBytes(RunRecordV1Schema.parse(record)));
}
