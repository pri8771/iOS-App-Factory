import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { isAbsolute } from "node:path";
import { TextDecoder } from "node:util";

import {
  COMMAND_PROTOCOL_VERSION_V1,
  AbsolutePathSchema,
  AssistantIntentPayloadV1Schema,
  AssistantIntentV1Schema,
  AssistantQueryV1Schema,
  AttemptIdSchema,
  AttemptListQueryV1Schema,
  CommandIdSchema,
  CommandAuthorizationV1Schema,
  CommandRequestFrameV1Schema,
  CommandResponseV1Schema,
  EffectListQueryV1Schema,
  GitBranchNameSchema,
  IsoInstantSchema,
  MirrorProjectionV1Schema,
  PhaseDefinitionUpsertV1Schema,
  PhasePresetUpsertV1Schema,
  PhaseRunCreateV1Schema,
  PhaseRunDecisionV1Schema,
  PhaseRunIdSchema,
  PhaseRunListQueryV1Schema,
  ProjectIdSchema,
  ProjectMilestoneUpsertV1Schema,
  ProjectPlanApproveGateV1Schema,
  ProjectPlanApproveV1Schema,
  ProjectPlanEditBatchV1Schema,
  ProjectPlanExecuteV1Schema,
  ProjectPlanIdSchema,
  ProjectPlanProposeV1Schema,
  ProjectRegisterSourceV1Schema,
  ProviderUpsertSpecV1Schema,
  RequestIdSchema,
  RoomCreateSpecV1Schema,
  RoomHumanHandleSchema,
  RoomIdSchema,
  RoomUpdateSpecV1Schema,
  Sha256DigestSchema,
  StableKeySchema,
  StudioSettingKeyV1Schema,
  TaskIdSchema,
  TaskSpecV1Schema,
  canonicalPortfolioReadModelDigestInputV1,
  canonicalReleaseProjectionDigestInputV1,
  canonicalRoomParticipantsCatalogDigestInputV1,
  canonicalStudioSnapshotDigestInputV1,
  type AbsolutePath,
  type AssistantIntentPayloadV1,
  type AssistantIntentV1,
  type AttemptId,
  type AttemptListCursorV1,
  type AttemptListScopeV1,
  type CommandOperationV1,
  type CommandOriginV1,
  type CommandRequestForOperationV1,
  type CommandResponseV1,
  type CommandResultForOperationV1,
  type CommandId,
  type EffectListCursorV1,
  type ExternalEffectStateV1,
  type ExternalProviderV1,
  type GitBranchName,
  type IsoInstant,
  type MirrorProjectionV1,
  type PhaseDefinitionUpsertV1,
  type PhasePresetUpsertV1,
  type PhaseRunCreateV1,
  type PhaseRunDecisionV1,
  type PhaseRunId,
  type PhaseRunListQueryV1,
  type ProjectId,
  type ProjectMilestoneUpsertV1,
  type ProjectPlanApproveGateV1,
  type ProjectPlanApproveV1,
  type ProjectPlanEditBatchV1,
  type ProjectPlanExecuteV1,
  type ProjectPlanId,
  type ProjectPlanProposeV1,
  type ProjectRegisterSourceV1,
  type ProviderUpsertSpecV1,
  type RequestId,
  type RoomCreateSpecV1,
  type RoomUpdateSpecV1,
  type Sha256Digest,
  type TaskId,
  type TaskSpecV1,
  RoomProviderSchema,
  SignalIdSchema,
} from "@app-factory/contracts";

export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
export const DEFAULT_CLIENT_MAX_REQUEST_BYTES = 1024 * 1024;
export const DEFAULT_CLIENT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_UNIX_SOCKET_PATH_BYTES = 100;

export type CommandClientOptions = Readonly<{
  socketPath: string;
  authorization: string;
  origin: CommandOriginV1;
  timeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  createRequestId?: () => string;
  createCommandId?: () => string;
  now?: () => Date;
}>;

export type CommandIdentity = Readonly<{
  requestId: RequestId;
  commandId: CommandId;
  issuedAt: IsoInstant;
}>;

export type RetryableCommandIdentity = Pick<CommandIdentity, "commandId" | "issuedAt">;

export class CommandClientError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly retryIdentity: RetryableCommandIdentity | null = null,
  ) {
    super(message);
    this.name = "CommandClientError";
  }
}

export class CommandRemoteError extends CommandClientError {
  public constructor(
    code: string,
    message: string,
    retryable: boolean,
    public readonly requestId: RequestId | null,
    retryIdentity: RetryableCommandIdentity | null = null,
  ) {
    super(code, message, retryable, retryIdentity);
    this.name = "CommandRemoteError";
  }
}

function validatePositiveInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return value;
}

function validateSocketPath(socketPath: string): string {
  if (!isAbsolute(socketPath) || Buffer.byteLength(socketPath) > MAX_UNIX_SOCKET_PATH_BYTES) {
    throw new CommandClientError(
      "client.invalid-socket-path",
      "The command socket path must be absolute and at most 100 UTF-8 bytes.",
      false,
    );
  }
  return socketPath;
}

export class CommandClient {
  readonly #socketPath: string;
  readonly #authorization: string;
  readonly #origin: CommandOriginV1;
  readonly #timeoutMs: number;
  readonly #maxRequestBytes: number;
  readonly #maxResponseBytes: number;
  readonly #createRequestId: () => string;
  readonly #createCommandId: () => string;
  readonly #now: () => Date;
  readonly #sockets = new Set<Socket>();
  #closed = false;

  public constructor(options: CommandClientOptions) {
    this.#socketPath = validateSocketPath(options.socketPath);
    this.#authorization = CommandAuthorizationV1Schema.parse(options.authorization);
    this.#origin = options.origin;
    this.#timeoutMs = validatePositiveInteger(
      "timeoutMs",
      options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    );
    this.#maxRequestBytes = validatePositiveInteger(
      "maxRequestBytes",
      options.maxRequestBytes ?? DEFAULT_CLIENT_MAX_REQUEST_BYTES,
    );
    this.#maxResponseBytes = validatePositiveInteger(
      "maxResponseBytes",
      options.maxResponseBytes ?? DEFAULT_CLIENT_MAX_RESPONSE_BYTES,
    );
    this.#createRequestId = options.createRequestId ?? randomUUID;
    this.#createCommandId = options.createCommandId ?? randomUUID;
    this.#now = options.now ?? (() => new Date());
  }

  public get closed(): boolean {
    return this.#closed;
  }

  public close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const socket of this.#sockets) socket.destroy();
    this.#sockets.clear();
  }

  public createIdentity(): CommandIdentity {
    return {
      requestId: RequestIdSchema.parse(this.#createRequestId()),
      commandId: CommandIdSchema.parse(this.#createCommandId()),
      issuedAt: IsoInstantSchema.parse(this.#now().toISOString()),
    };
  }

  public createRetryIdentity(
    original: Pick<CommandIdentity, "commandId" | "issuedAt">,
  ): CommandIdentity {
    return {
      requestId: RequestIdSchema.parse(this.#createRequestId()),
      commandId: CommandIdSchema.parse(original.commandId),
      issuedAt: IsoInstantSchema.parse(original.issuedAt),
    };
  }

  public async doctor(
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"doctor">> {
    return await this.#request("doctor", {}, identity, signal);
  }

  public async submit(
    taskSpec: TaskSpecV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"task.submit">> {
    return await this.#request(
      "task.submit",
      { taskSpec: TaskSpecV1Schema.parse(taskSpec) },
      identity,
      signal,
    );
  }

  public async run(
    taskSpec: TaskSpecV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"task.run">> {
    return await this.#request(
      "task.run",
      { taskSpec: TaskSpecV1Schema.parse(taskSpec) },
      identity,
      signal,
    );
  }

  public async status(
    attemptId: AttemptId,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.status">> {
    return await this.#request(
      "attempt.status",
      { attemptId: AttemptIdSchema.parse(attemptId) },
      identity,
      signal,
    );
  }

  public async events(
    attemptId: AttemptId,
    options: Readonly<{ afterSequence?: number; limit?: number }> = {},
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.events">> {
    return await this.#request(
      "attempt.events",
      {
        attemptId: AttemptIdSchema.parse(attemptId),
        afterSequence: options.afterSequence ?? 0,
        limit: options.limit ?? 100,
      },
      identity,
      signal,
    );
  }

  public async listAttempts(
    options: Readonly<{
      scope?: AttemptListScopeV1;
      projectId?: ProjectId | null;
      after?: AttemptListCursorV1 | null;
      limit?: number;
    }> = {},
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.list">> {
    const payload = AttemptListQueryV1Schema.parse({
      scope: options.scope ?? "active",
      projectId: options.projectId ?? null,
      after: options.after ?? null,
      limit: options.limit ?? 50,
    });
    return await this.#request("attempt.list", payload, identity, signal);
  }

  public async pause(
    attemptId: AttemptId,
    reason: string | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.pause">> {
    return await this.#request(
      "attempt.pause",
      {
        attemptId: AttemptIdSchema.parse(attemptId),
        reason,
      },
      identity,
      signal,
    );
  }

  public async resume(
    attemptId: AttemptId,
    reason: string | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.resume">> {
    return await this.#request(
      "attempt.resume",
      {
        attemptId: AttemptIdSchema.parse(attemptId),
        reason,
      },
      identity,
      signal,
    );
  }

  public async cancel(
    attemptId: AttemptId,
    reason: string | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.cancel">> {
    return await this.#request(
      "attempt.cancel",
      {
        attemptId: AttemptIdSchema.parse(attemptId),
        reason,
      },
      identity,
      signal,
    );
  }

  /** Retries a failed or cancelled terminal attempt as attempt N+1 of the same task. */
  public async retry(
    taskId: TaskId,
    attemptId: AttemptId,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"task.retry">> {
    return await this.#request(
      "task.retry",
      {
        taskId: TaskIdSchema.parse(taskId),
        attemptId: AttemptIdSchema.parse(attemptId),
      },
      identity,
      signal,
    );
  }

  /** Answers a blocker and resumes a blocked attempt's blocked step. */
  public async unblock(
    attemptId: AttemptId,
    answer: string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"attempt.unblock">> {
    return await this.#request(
      "attempt.unblock",
      {
        attemptId: AttemptIdSchema.parse(attemptId),
        answer,
      },
      identity,
      signal,
    );
  }

  public async reconcile(
    attemptId: AttemptId | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"daemon.reconcile">> {
    return await this.#request(
      "daemon.reconcile",
      {
        attemptId: attemptId === null ? null : AttemptIdSchema.parse(attemptId),
      },
      identity,
      signal,
    );
  }

  public async listEvidence(
    options: Readonly<{ afterAttemptId?: AttemptId | null; limit?: number }> = {},
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"evidence.list">> {
    return await this.#request(
      "evidence.list",
      {
        afterAttemptId:
          options.afterAttemptId === undefined || options.afterAttemptId === null
            ? null
            : AttemptIdSchema.parse(options.afterAttemptId),
        limit: options.limit ?? 50,
      },
      identity,
      signal,
    );
  }

  public async inspectEvidence(
    attemptId: AttemptId,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"evidence.inspect">> {
    return await this.#request(
      "evidence.inspect",
      { attemptId: AttemptIdSchema.parse(attemptId) },
      identity,
      signal,
    );
  }

  public async verifyEvidence(
    attemptId: AttemptId,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"evidence.verify">> {
    return await this.#request(
      "evidence.verify",
      { attemptId: AttemptIdSchema.parse(attemptId) },
      identity,
      signal,
    );
  }

  /**
   * Exports the canonical, digest-bound record of one verified run. The daemon
   * re-derives it from durable state (kernel row, evidence store, Factory
   * mirror) and fails closed if the attempt is not terminal or its evidence
   * does not verify.
   */
  public async exportRun(
    attemptId: AttemptId,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"run.export">> {
    return await this.#request(
      "run.export",
      { attemptId: AttemptIdSchema.parse(attemptId) },
      identity,
      signal,
    );
  }

  /** Scans an existing repository and persists an enrollment plan the operator can review or apply. */
  public async scanProject(
    repositoryRoot: AbsolutePath | string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"project.scan">> {
    return await this.#request(
      "project.scan",
      { repositoryRoot: AbsolutePathSchema.parse(repositoryRoot) },
      identity,
      signal,
    );
  }

  /** Reads one repository's mandated docs (STATUS/RELEASE_CHECKLIST/BUGS/RISKS/DECISIONS/quality)
   * read-only, off disk. Owner doctrine: the repository's own docs are the source of truth. */
  public async docsSnapshot(
    repositoryRoot: AbsolutePath | string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"project.docs.snapshot">> {
    return await this.#request(
      "project.docs.snapshot",
      { repositoryRoot: AbsolutePathSchema.parse(repositoryRoot) },
      identity,
      signal,
    );
  }

  /** Mirror direction (contract only, no live provider calls): projects a project's current repo
   * docs onto the bounded `MirrorProjectionV1` a Jira/Notion adapter may receive, and diffs it
   * against a caller-supplied previous projection (`null` for "no previous projection yet"). */
  public async mirrorPlan(
    projectId: ProjectId | string,
    repositoryRoot: AbsolutePath | string,
    previousProjection: MirrorProjectionV1 | null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"mirror.plan">> {
    return await this.#request(
      "mirror.plan",
      {
        projectId: ProjectIdSchema.parse(projectId),
        repositoryRoot: AbsolutePathSchema.parse(repositoryRoot),
        previousProjection:
          previousProjection === null ? null : MirrorProjectionV1Schema.parse(previousProjection),
      },
      identity,
      signal,
    );
  }

  /** Fetches the full stored enrollment plan for a digest returned by {@link scanProject}. */
  public async getEnrollmentPlan(
    planDigest: Sha256Digest | string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"project.enroll-plan">> {
    return await this.#request(
      "project.enroll-plan",
      { planDigest: Sha256DigestSchema.parse(planDigest) },
      identity,
      signal,
    );
  }

  /** Applies a previously scanned enrollment plan on a new branch. Durable and idempotent by command ID. */
  public async applyEnrollmentPlan(
    planDigest: Sha256Digest | string,
    branchName: GitBranchName | string | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"project.apply">> {
    return await this.#request(
      "project.apply",
      {
        planDigest: Sha256DigestSchema.parse(planDigest),
        branchName: branchName === null ? null : GitBranchNameSchema.parse(branchName),
      },
      identity,
      signal,
    );
  }

  /**
   * The from-scratch entry point: seeds a brand-new local repository (Git init, XcodeGen scaffold,
   * CI workflow, one passing test, README/`docs/STATUS.md`), commits it, and runs enrollment
   * scan-and-apply on it. `targetDirectory` must not exist or must be empty.
   */
  public async seedProject(
    targetDirectory: AbsolutePath | string,
    name: string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"project.seed">> {
    return await this.#request(
      "project.seed",
      { targetDirectory: AbsolutePathSchema.parse(targetDirectory), name },
      identity,
      signal,
    );
  }

  /**
   * The project's Studio timeline: its milestone plan next to the actuals its
   * attempts produced. Read-only; an undated milestone comes back with
   * `targetDate: null` and must be rendered as "won't guess", never defaulted.
   */
  public async listProjectMilestones(
    projectId: ProjectId | string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"project.milestones.list">> {
    return await this.#request(
      "project.milestones.list",
      { projectId: ProjectIdSchema.parse(projectId) },
      identity,
      signal,
    );
  }

  /**
   * Creates (`expectedRevision: null`) or compare-and-set updates one milestone.
   * Durable and idempotent by command ID; a retry with the same identity and
   * payload returns the original result.
   */
  public async upsertProjectMilestone(
    upsert: ProjectMilestoneUpsertV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"project.milestone.upsert">> {
    return await this.#request(
      "project.milestone.upsert",
      ProjectMilestoneUpsertV1Schema.parse(upsert),
      identity,
      signal,
    );
  }

  /**
   * The full list of durable Phase Presets (Studio Phase 4). Bounded and unpaginated: presets are
   * operator-authored and few compared to attempts or events. Never executes a phase — that is the
   * separate planner task.
   */
  public async listPresets(
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"preset.list">> {
    return await this.#request("preset.list", {}, identity, signal);
  }

  /**
   * Registers a project into the durable Project Registry (Seam (a) of the project-registry task):
   * either from a previously persisted `project.scan` result (`source.kind: "scan"`, the same
   * `planDigest` {@link getEnrollmentPlan}/{@link applyEnrollmentPlan} accept) or a bare repository
   * path (`source.kind: "path"`, which runs the scanner itself first). Requires zero `rules.*`
   * blockers; `safety.secret-material-detected` findings are surfaced on the result but never block
   * registration. Durable and idempotent: re-registering an already-registered repository path
   * reuses its existing identity rather than duplicating it.
   */
  public async registerProject(
    source: ProjectRegisterSourceV1,
    options: Readonly<{ displayName?: string | null; slug?: string | null }> = {},
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"project.register">> {
    return await this.#request(
      "project.register",
      {
        source: ProjectRegisterSourceV1Schema.parse(source),
        displayName: options.displayName ?? null,
        slug:
          options.slug === undefined || options.slug === null
            ? null
            : StableKeySchema.parse(options.slug),
      },
      identity,
      signal,
    );
  }

  /** Every registered project's head revision. Bounded, unpaginated: registered projects are
   * operator-initiated and few compared to attempts or events, exactly like {@link listPresets}. */
  public async listProjects(
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"project.list">> {
    return await this.#request("project.list", {}, identity, signal);
  }

  /** One registered project's full head record by ID. */
  public async showProject(
    projectId: ProjectId | string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"project.show">> {
    return await this.#request(
      "project.show",
      { projectId: ProjectIdSchema.parse(projectId) },
      identity,
      signal,
    );
  }

  /**
   * Creates (`expectedRevision: null`) or compare-and-set updates a Phase Preset. Durable and
   * idempotent by command ID. A preset embeds each phase's full, already-durable value at save
   * time — see {@link upsertPhase} for the phases it bundles.
   */
  public async upsertPreset(
    upsert: PhasePresetUpsertV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"preset.upsert">> {
    return await this.#request(
      "preset.upsert",
      PhasePresetUpsertV1Schema.parse(upsert),
      identity,
      signal,
    );
  }

  /**
   * Creates or compare-and-set updates one reusable phase definition in the phase library. Durable
   * and idempotent by command ID; fails closed if `rules.standard[]` names a ruleId the daemon's
   * compiled policy source does not declare.
   */
  public async upsertPhase(
    upsert: PhaseDefinitionUpsertV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"phase.upsert">> {
    return await this.#request(
      "phase.upsert",
      PhaseDefinitionUpsertV1Schema.parse(upsert),
      identity,
      signal,
    );
  }

  /** Builds a plan's item list deterministically from a `PhasePresetV1`. See `plan.propose`. */
  public async proposePlan(
    propose: ProjectPlanProposeV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"plan.propose">> {
    return await this.#request(
      "plan.propose",
      ProjectPlanProposeV1Schema.parse(propose),
      identity,
      signal,
    );
  }

  /** Applies a batch of edits (reorder, defer, retitle, edit-task-spec-draft, add/remove item, or
   * set-repository) to a plan. Durable and idempotent by command ID. */
  public async editPlan(
    edit: ProjectPlanEditBatchV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"plan.edit">> {
    return await this.#request(
      "plan.edit",
      ProjectPlanEditBatchV1Schema.parse(edit),
      identity,
      signal,
    );
  }

  /** Marks a draft plan approved, ready to execute. */
  public async approvePlan(
    approve: ProjectPlanApproveV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"plan.approve">> {
    return await this.#request(
      "plan.approve",
      ProjectPlanApproveV1Schema.parse(approve),
      identity,
      signal,
    );
  }

  /** Starts (or resumes) a plan's execution chain: submits the first ready item. */
  public async executePlan(
    execute: ProjectPlanExecuteV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"plan.execute">> {
    return await this.#request(
      "plan.execute",
      ProjectPlanExecuteV1Schema.parse(execute),
      identity,
      signal,
    );
  }

  /** Clears a pending gate item, unpausing the chain. */
  public async approvePlanGate(
    approveGate: ProjectPlanApproveGateV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"plan.approve-gate">> {
    return await this.#request(
      "plan.approve-gate",
      ProjectPlanApproveGateV1Schema.parse(approveGate),
      identity,
      signal,
    );
  }

  /** Reads the current head of one plan. */
  public async planStatus(
    planId: ProjectPlanId | string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"plan.status">> {
    return await this.#request(
      "plan.status",
      { planId: ProjectPlanIdSchema.parse(planId) },
      identity,
      signal,
    );
  }

  /** Advances a plan's execution chain by one step (submit-next / settle-current / complete). */
  public async tickPlan(
    planId: ProjectPlanId | string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"plan.tick">> {
    return await this.#request(
      "plan.tick",
      { planId: ProjectPlanIdSchema.parse(planId) },
      identity,
      signal,
    );
  }

  /**
   * Runs a phase end to end: resolves it (from a preset or the standalone library), executes its
   * cast by mode, commits any declared outputs into the project's enrolled mirror, grades them if
   * the phase declares a grader, and returns the run's terminal (or `awaiting-human`) state.
   * Durable and idempotent by command ID.
   */
  public async runPhase(
    create: PhaseRunCreateV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"phase.run">> {
    return await this.#request("phase.run", PhaseRunCreateV1Schema.parse(create), identity, signal);
  }

  public async phaseStatus(
    phaseRunId: PhaseRunId,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"phase.status">> {
    return await this.#request(
      "phase.status",
      { phaseRunId: PhaseRunIdSchema.parse(phaseRunId) },
      identity,
      signal,
    );
  }

  public async listPhaseRuns(
    query: PhaseRunListQueryV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"phase.list">> {
    return await this.#request(
      "phase.list",
      PhaseRunListQueryV1Schema.parse(query),
      identity,
      signal,
    );
  }

  /** Approves an `awaiting-human` phase run (owner authority): transitions it to `succeeded`. */
  public async approvePhaseRun(
    decision: PhaseRunDecisionV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"phase.approve">> {
    return await this.#request(
      "phase.approve",
      PhaseRunDecisionV1Schema.parse(decision),
      identity,
      signal,
    );
  }

  /** Rejects an `awaiting-human` phase run (owner authority): transitions it to `failed`. */
  public async rejectPhaseRun(
    decision: PhaseRunDecisionV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"phase.reject">> {
    return await this.#request(
      "phase.reject",
      PhaseRunDecisionV1Schema.parse(decision),
      identity,
      signal,
    );
  }

  public async portfolioSnapshot(
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"portfolio.snapshot">> {
    const result = await this.#request("portfolio.snapshot", {}, identity, signal);
    const expectedDigest = `sha256:${createHash("sha256")
      .update(canonicalPortfolioReadModelDigestInputV1(result.snapshot), "utf8")
      .digest("hex")}`;
    if (
      !timingSafeEqual(
        Buffer.from(result.snapshot.sourceSnapshotDigest, "utf8"),
        Buffer.from(expectedDigest, "utf8"),
      )
    ) {
      throw new CommandClientError(
        "protocol.portfolio-digest-mismatch",
        "The portfolio source digest does not match its contents.",
        false,
      );
    }
    return result;
  }

  /**
   * The single studio dashboard read on open. Verifies `sourceSnapshotDigest` exactly like
   * {@link portfolioSnapshot} verifies the portfolio read model's own digest.
   */
  public async studioSnapshot(
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"studio.snapshot">> {
    const result = await this.#request("studio.snapshot", {}, identity, signal);
    const expectedDigest = `sha256:${createHash("sha256")
      .update(canonicalStudioSnapshotDigestInputV1(result.snapshot), "utf8")
      .digest("hex")}`;
    if (
      !timingSafeEqual(
        Buffer.from(result.snapshot.sourceSnapshotDigest, "utf8"),
        Buffer.from(expectedDigest, "utf8"),
      )
    ) {
      throw new CommandClientError(
        "protocol.studio-snapshot-digest-mismatch",
        "The studio snapshot source digest does not match its contents.",
        false,
      );
    }
    return result;
  }

  /** Asks the corner-chat assistant a question; answered only from the current studio snapshot. */
  public async assistantQuery(
    question: string,
    options: Readonly<{ projectId?: ProjectId | null }> = {},
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"studio.assistant.query">> {
    const query = AssistantQueryV1Schema.parse({
      schemaVersion: 1,
      question,
      projectId: options.projectId ?? null,
    });
    return await this.#request("studio.assistant.query", { query }, identity, signal);
  }

  /** Proposes a typed intent from a fixed phrasing; nothing executes until {@link executeAssistantIntent}. */
  public async proposeAssistantIntent(
    utterance: string,
    intent: AssistantIntentPayloadV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"studio.assistant.intent.propose">> {
    return await this.#request(
      "studio.assistant.intent.propose",
      { utterance, intent: AssistantIntentPayloadV1Schema.parse(intent) },
      identity,
      signal,
    );
  }

  /** Confirms and dispatches a previously proposed intent, echoed back verbatim. */
  public async executeAssistantIntent(
    intent: AssistantIntentV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"studio.assistant.intent.execute">> {
    return await this.#request(
      "studio.assistant.intent.execute",
      { intent: AssistantIntentV1Schema.parse(intent) },
      identity,
      signal,
    );
  }

  /** Kernel-durable effect counts, pending outbox size, and the daemon's own pump activity. */
  public async effectsStatus(
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"effects.status">> {
    return await this.#request("effects.status", {}, identity, signal);
  }

  /** Bounded, keyset-paginated read model of durable effects, newest-updated first. */
  public async listEffects(
    options: Readonly<{
      state?: ExternalEffectStateV1 | null;
      provider?: ExternalProviderV1 | null;
      after?: EffectListCursorV1 | null;
      limit?: number;
    }> = {},
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"effects.list">> {
    const payload = EffectListQueryV1Schema.parse({
      state: options.state ?? null,
      provider: options.provider ?? null,
      after: options.after ?? null,
      limit: options.limit ?? 50,
    });
    return await this.#request("effects.list", payload, identity, signal);
  }

  /** Creates a Studio room (idempotent for an identical spec under the same roomId). */
  public async createRoom(
    spec: RoomCreateSpecV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"room.create">> {
    return await this.#request("room.create", RoomCreateSpecV1Schema.parse(spec), identity, signal);
  }

  public async listRooms(
    options: Readonly<{ limit?: number; includeArchived?: boolean }> = {},
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"room.list">> {
    return await this.#request(
      "room.list",
      { limit: options.limit ?? 50, includeArchived: options.includeArchived ?? false },
      identity,
      signal,
    );
  }

  /** Appends a human message to the single-writer transcript and wakes the moderator. */
  public async postToRoom(
    roomId: string,
    handle: string,
    body: string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"room.post">> {
    return await this.#request(
      "room.post",
      {
        roomId: RoomIdSchema.parse(roomId),
        handle: RoomHumanHandleSchema.parse(handle),
        body,
      },
      identity,
      signal,
    );
  }

  public async roomEvents(
    roomId: string,
    options: Readonly<{ afterSequence?: number; limit?: number }> = {},
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"room.events">> {
    return await this.#request(
      "room.events",
      {
        roomId: RoomIdSchema.parse(roomId),
        afterSequence: options.afterSequence ?? 0,
        limit: options.limit ?? 200,
      },
      identity,
      signal,
    );
  }

  /** Human typing signal: the moderator defers agent rounds until it expires. */
  public async signalRoomTyping(
    roomId: string,
    handle: string,
    ttlMs = 5_000,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"room.typing">> {
    return await this.#request(
      "room.typing",
      { roomId: RoomIdSchema.parse(roomId), handle: RoomHumanHandleSchema.parse(handle), ttlMs },
      identity,
      signal,
    );
  }

  /**
   * Studio Phase 6 step B: takes ONE fresh, strictly read-only App Store Connect observation through
   * the daemon's composed observer and persists it. Refused with `release.observer-not-configured`
   * when the daemon has no observer composed. `buildsLimit` bounds the newest-first builds read per
   * app (default 5, Apple's maximum 200).
   */
  public async observeRelease(
    options: Readonly<{ buildsLimit?: number }> = {},
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"release.observe">> {
    return await this.#request(
      "release.observe",
      { buildsLimit: options.buildsLimit ?? 5 },
      identity,
      signal,
    );
  }

  /**
   * The latest persisted App Store Connect observation (or an honest "none yet") plus whether the
   * daemon could take a fresh one; re-verifies `sourceDigest` against the projection's contents.
   */
  public async releaseProjection(
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"release.projection">> {
    const result = await this.#request("release.projection", {}, identity, signal);
    const expectedDigest = `sha256:${createHash("sha256")
      .update(canonicalReleaseProjectionDigestInputV1(result.projection), "utf8")
      .digest("hex")}`;
    if (
      !timingSafeEqual(
        Buffer.from(result.projection.sourceDigest, "utf8"),
        Buffer.from(expectedDigest, "utf8"),
      )
    ) {
      throw new CommandClientError(
        "protocol.release-projection-digest-mismatch",
        "The release projection source digest does not match its contents.",
        false,
      );
    }
    return result;
  }

  public async createSignal(
    input: Readonly<{
      name: string;
      watchDescription: string;
      scoutProvider: string;
      checkIntervalMinutes?: number | null;
    }>,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"signal.create">> {
    return await this.#request(
      "signal.create",
      {
        name: input.name,
        watchDescription: input.watchDescription,
        scoutProvider: RoomProviderSchema.parse(input.scoutProvider),
        checkIntervalMinutes: input.checkIntervalMinutes ?? null,
      },
      identity,
      signal,
    );
  }

  public async listSignals(
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"signal.list">> {
    return await this.#request("signal.list", {}, identity, signal);
  }

  public async pauseSignal(
    signalId: string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"signal.pause">> {
    return await this.#request(
      "signal.pause",
      { signalId: SignalIdSchema.parse(signalId) },
      identity,
      signal,
    );
  }

  public async resumeSignal(
    signalId: string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"signal.resume">> {
    return await this.#request(
      "signal.resume",
      { signalId: SignalIdSchema.parse(signalId) },
      identity,
      signal,
    );
  }

  /** Runs the signal's Scout once, right now. A real model/network round trip -- give it a longer
   *  client-side timeout than most commands via `signal` (an `AbortSignal.timeout(...)`). */
  public async runSignalNow(
    signalId: string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"signal.run-now">> {
    return await this.#request(
      "signal.run-now",
      { signalId: SignalIdSchema.parse(signalId) },
      identity,
      signal,
    );
  }

  public async listInsights(
    signalId: string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"insight.list">> {
    return await this.#request(
      "insight.list",
      { signalId: SignalIdSchema.parse(signalId) },
      identity,
      signal,
    );
  }

  /** The daemon's configured room participants (providers/models + roster); never errors when rooms are disabled. */
  public async listRoomParticipants(
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"room.participants.list">> {
    const result = await this.#request("room.participants.list", {}, identity, signal);
    const expectedDigest = `sha256:${createHash("sha256")
      .update(canonicalRoomParticipantsCatalogDigestInputV1(result.catalog), "utf8")
      .digest("hex")}`;
    if (
      !timingSafeEqual(
        Buffer.from(result.catalog.sourceDigest, "utf8"),
        Buffer.from(expectedDigest, "utf8"),
      )
    ) {
      throw new CommandClientError(
        "protocol.room-participants-digest-mismatch",
        "The room participants catalog source digest does not match its contents.",
        false,
      );
    }
    return result;
  }

  /** A durable CAS patch over an existing room (Architecture decision 7): title, ambient toggle,
   *  cooldown window, archive, budget policy, and participant add/remove. See
   *  `RoomUpdateSpecV1Schema`. */
  public async updateRoom(
    spec: RoomUpdateSpecV1,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"room.update">> {
    return await this.#request("room.update", RoomUpdateSpecV1Schema.parse(spec), identity, signal);
  }

  /**
   * The provider registry (Studio Settings -> Providers; Architecture decisions 2-3): the roster
   * of AI providers/instances the daemon can dispatch a room, phase, or signal contribution to.
   * `provider.list` is an owner surface -- it may return credential references, but the daemon
   * never puts a raw secret in any `provider.*` result.
   */
  public async listProviders(
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"provider.list">> {
    return await this.#request("provider.list", {}, identity, signal);
  }

  /** Creates or reconfigures one provider instance; never carries a credential -- see
   *  {@link setProviderCredential}. `expectedDigest` is a CAS guard against the provider config
   *  file's current digest (`provider.list`/a prior upsert's own `digest`); `null` accepts
   *  whatever the file currently holds. */
  public async upsertProvider(
    instance: ProviderUpsertSpecV1,
    expectedDigest: Sha256Digest | string | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"provider.upsert">> {
    return await this.#request(
      "provider.upsert",
      {
        instance: ProviderUpsertSpecV1Schema.parse(instance),
        expectedDigest: expectedDigest === null ? null : Sha256DigestSchema.parse(expectedDigest),
      },
      identity,
      signal,
    );
  }

  /** Removes one provider instance from the registry; `expectedDigest` is the same CAS guard as
   *  {@link upsertProvider}. */
  public async removeProvider(
    key: string,
    expectedDigest: Sha256Digest | string | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"provider.remove">> {
    return await this.#request(
      "provider.remove",
      {
        key: RoomProviderSchema.parse(key),
        expectedDigest: expectedDigest === null ? null : Sha256DigestSchema.parse(expectedDigest),
      },
      identity,
      signal,
    );
  }

  /** Carries the bare credential value ONCE, over the owner-only 0600 socket (Architecture
   *  decision 2) -- never journaled to a durable replay ledger. Returns only the
   *  `CredentialReferenceV1` the daemon just wrote to the Keychain, never the secret itself. */
  public async setProviderCredential(
    key: string,
    secret: string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"provider.credential.set">> {
    return await this.#request(
      "provider.credential.set",
      { key: RoomProviderSchema.parse(key), secret },
      identity,
      signal,
    );
  }

  /** Runs OUTSIDE the serial executor, like {@link observeRelease} (Architecture decision 3) -- a
   *  health probe is a real process/network round trip and must not stall every other command.
   *  `key: null` (the default) probes every configured instance. */
  public async providerHealth(
    key: string | null = null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"provider.health">> {
    return await this.#request(
      "provider.health",
      { key: key === null ? null : RoomProviderSchema.parse(key) },
      identity,
      signal,
    );
  }

  /** Reads one Studio setting (Architecture decision 4); `entry.value`/`entry.updatedAt` are both
   *  `null` until the first {@link setSetting}. */
  public async getSettings(
    key: string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"settings.get">> {
    return await this.#request(
      "settings.get",
      { key: StudioSettingKeyV1Schema.parse(key) },
      identity,
      signal,
    );
  }

  /** Sets one Studio setting; the daemon validates `value` against the live provider catalog at
   *  write time (Architecture decision 4). */
  public async setSetting(
    key: string,
    value: string,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"settings.set">> {
    return await this.#request(
      "settings.set",
      { key: StudioSettingKeyV1Schema.parse(key), value: RoomProviderSchema.parse(value) },
      identity,
      signal,
    );
  }

  /** The honest token ledger's read side (Architecture decision 6); see `UsageSummaryV1Schema` for
   *  its null-honest sums and `unreportedCount`. `sinceDays` bounds how far back the summary looks. */
  public async usageSummary(
    sinceDays = 7,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"usage.summary">> {
    return await this.#request("usage.summary", { sinceDays }, identity, signal);
  }

  /**
   * Sets or clears (`null`) a signal's scheduled check interval (Architecture decision 11). The
   * operation is fully recognized by the wire protocol and this method round-trips against any
   * server that answers it, but today's daemon build refuses every call with the honest
   * `command.operation-not-yet-implemented` -- the scheduler itself is Wave 7's work.
   */
  public async rescheduleSignal(
    signalId: string,
    checkIntervalMinutes: number | null,
    identity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<"signal.reschedule">> {
    return await this.#request(
      "signal.reschedule",
      { signalId: SignalIdSchema.parse(signalId), checkIntervalMinutes },
      identity,
      signal,
    );
  }

  async #request<Operation extends CommandOperationV1>(
    operation: Operation,
    payload: CommandRequestForOperationV1<Operation>["payload"],
    suppliedIdentity?: CommandIdentity,
    signal?: AbortSignal,
  ): Promise<CommandResultForOperationV1<Operation>> {
    if (this.#closed) {
      throw new CommandClientError("client.closed", "The command client is closed.", false);
    }
    if (signal !== undefined && !(signal instanceof AbortSignal)) {
      throw new TypeError("signal must be an AbortSignal");
    }
    if (signal?.aborted === true) {
      throw new CommandClientError("client.cancelled", "The command request was cancelled.", false);
    }

    const identity = suppliedIdentity ?? this.createIdentity();
    const requestId = RequestIdSchema.parse(identity.requestId);
    const commandId = CommandIdSchema.parse(identity.commandId);
    const issuedAt = IsoInstantSchema.parse(identity.issuedAt);
    const request = {
      schemaVersion: 1,
      commandId,
      issuedAt,
      origin: this.#origin,
      operation,
      payload,
    } as CommandRequestForOperationV1<Operation>;
    const frame = CommandRequestFrameV1Schema.parse({
      protocolVersion: COMMAND_PROTOCOL_VERSION_V1,
      requestId,
      authorization: this.#authorization,
      request,
    });
    const encoded = Buffer.from(`${JSON.stringify(frame)}\n`, "utf8");
    if (encoded.byteLength > this.#maxRequestBytes) {
      throw new CommandClientError(
        "client.request-too-large",
        "The command request exceeds the configured byte limit.",
        false,
      );
    }

    let response: CommandResponseV1;
    try {
      response = await this.#exchange(encoded, requestId, signal);
    } catch (error) {
      if (error instanceof CommandClientError && error.retryable) {
        throw new CommandClientError(error.code, error.message, true, { commandId, issuedAt });
      }
      throw error;
    }
    if (!response.ok) {
      throw new CommandRemoteError(
        response.error.code,
        response.error.message,
        response.error.retryable,
        response.requestId,
        response.error.retryable ? { commandId, issuedAt } : null,
      );
    }
    if (response.requestId !== requestId) {
      throw new CommandClientError(
        "protocol.response-id-mismatch",
        "The command response ID does not match the dispatched request; its outcome is unknown.",
        true,
        { commandId, issuedAt },
      );
    }
    if (response.result.operation !== operation) {
      throw new CommandClientError(
        "protocol.response-operation-mismatch",
        "The command response operation does not match the dispatched request; its outcome is unknown.",
        true,
        { commandId, issuedAt },
      );
    }
    return response.result as CommandResultForOperationV1<Operation>;
  }

  async #exchange(
    encoded: Buffer,
    requestId: RequestId,
    signal?: AbortSignal,
  ): Promise<CommandResponseV1> {
    return await new Promise<CommandResponseV1>((resolve, reject) => {
      const socket = createConnection({ path: this.#socketPath });
      this.#sockets.add(socket);
      let buffer = Buffer.alloc(0);
      let settled = false;
      let dispatched = false;
      const timer = setTimeout(() => {
        finish(new CommandClientError("transport.timeout", "The command request timed out.", true));
      }, this.#timeoutMs);
      timer.unref();

      const finish = (error?: CommandClientError, response?: CommandResponseV1) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        this.#sockets.delete(socket);
        socket.destroy();
        if (error !== undefined) reject(error);
        else if (response !== undefined) resolve(response);
      };

      const onAbort = (): void => {
        finish(
          dispatched
            ? new CommandClientError(
                "client.cancelled-after-dispatch",
                "The command request was cancelled after dispatch; its outcome is unknown.",
                true,
              )
            : new CommandClientError(
                "client.cancelled",
                "The command request was cancelled before dispatch.",
                false,
              ),
        );
      };
      signal?.addEventListener("abort", onAbort, { once: true });

      socket.once("connect", () => {
        dispatched = true;
        socket.write(encoded);
      });
      socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        if (buffer.byteLength > this.#maxResponseBytes) {
          finish(
            new CommandClientError(
              "protocol.response-too-large",
              "The dispatched command returned an oversized response; its outcome is unknown.",
              true,
            ),
          );
          return;
        }
      });
      socket.once("end", () => {
        const newline = buffer.indexOf(0x0a);
        if (newline < 0) {
          finish(
            new CommandClientError(
              "transport.remote-closed",
              "The command server closed before returning a complete response.",
              true,
            ),
          );
          return;
        }
        const trailing = buffer.subarray(newline + 1);
        if (
          trailing.some((byte) => byte !== 0x0d && byte !== 0x0a && byte !== 0x20 && byte !== 0x09)
        ) {
          finish(
            new CommandClientError(
              "protocol.multiple-responses",
              "The dispatched command returned multiple response frames; its outcome is unknown.",
              true,
            ),
          );
          return;
        }

        let decoded: unknown;
        try {
          decoded = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, newline)),
          );
        } catch {
          finish(
            new CommandClientError(
              "protocol.malformed-response",
              "The dispatched command returned malformed JSON; its outcome is unknown.",
              true,
            ),
          );
          return;
        }
        const parsed = CommandResponseV1Schema.safeParse(decoded);
        if (!parsed.success) {
          finish(
            new CommandClientError(
              "protocol.invalid-response",
              "The dispatched command returned an invalid protocol response; its outcome is unknown.",
              true,
            ),
          );
          return;
        }
        if (parsed.data.requestId !== null && parsed.data.requestId !== requestId) {
          finish(
            new CommandClientError(
              "protocol.response-id-mismatch",
              "The command response ID does not match the dispatched request; its outcome is unknown.",
              true,
            ),
          );
          return;
        }
        finish(undefined, parsed.data);
      });
      socket.once("error", () => {
        finish(
          new CommandClientError(
            "transport.connection-failed",
            "The command socket connection failed.",
            true,
          ),
        );
      });
      socket.once("close", () => {
        if (this.#closed) {
          finish(
            dispatched
              ? new CommandClientError(
                  "client.closed-after-dispatch",
                  "The command client closed after dispatch; the command outcome is unknown.",
                  true,
                )
              : new CommandClientError("client.closed", "The command client is closed.", false),
          );
        }
      });
    });
  }
}

export function createCommandClient(options: CommandClientOptions): CommandClient {
  return new CommandClient(options);
}
