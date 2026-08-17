import {
  AbsolutePathSchema,
  ArtifactRefV1Schema,
  AttemptListItemV1Schema,
  AttemptListPageV1Schema,
  AttemptListQueryV1Schema,
  AttemptIdSchema,
  CommandIdSchema,
  CommandV1Schema,
  EventV1Schema,
  ExecutionAttemptV1Schema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  ProjectIdSchema,
  Sha256DigestSchema,
  TaskIdSchema,
  TaskSpecV1Schema,
  type ArtifactRefV1,
  type AttemptListItemV1,
  type AttemptListPageV1,
  type CommandV1,
  type EventV1,
  type ExecutionAttemptV1,
  type IsoInstant,
  type ProjectId,
  type TaskSpecV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

import { computeTaskSpecDigest } from "./canonical-json.js";
import {
  assertAttemptSnapshotCoherence,
  assertLegalAttemptStateTransition,
} from "./state-machine.js";
import {
  AttemptDesiredStateRepository,
  AttemptUnblockRepository,
  LeaseRepository,
  StepRepository,
  assertActiveAttemptLease,
} from "./durability-repositories.js";
import { ProjectMilestoneRepository } from "./milestone-repositories.js";
import { PhaseDefinitionRepository, PhasePresetRepository } from "./phase-repositories.js";
import { ProjectPlanRepository } from "./project-plan-repositories.js";
import { PhaseRunRepository } from "./phase-run-repositories.js";
import { ProjectRegistryRepository } from "./project-registry-repositories.js";

type SubmitTaskCommandV1 = Extract<CommandV1, { kind: "task.submit" }>;
type RetryTaskCommandV1 = Extract<CommandV1, { kind: "task.retry" }>;
type AttemptCreatedEventV1 = Extract<EventV1, { type: "attempt.created" }>;
type AttemptStateChangedEventV1 = Extract<EventV1, { type: "attempt.state-changed" }>;

export type CreateTaskAttemptInput = Readonly<{
  command: unknown;
  taskSpecDigest: unknown;
  attempt: unknown;
  event: unknown;
}>;

export type CreatedTaskAttempt = Readonly<{
  command: SubmitTaskCommandV1;
  taskSpec: TaskSpecV1;
  attempt: ExecutionAttemptV1;
  event: AttemptCreatedEventV1;
  duplicate: boolean;
}>;

export type RetryTaskAttemptInput = Readonly<{
  command: unknown;
  attempt: unknown;
  event: unknown;
}>;

export type RetriedTaskAttempt = Readonly<{
  command: RetryTaskCommandV1;
  priorAttempt: ExecutionAttemptV1;
  attempt: ExecutionAttemptV1;
  event: AttemptCreatedEventV1;
  duplicate: boolean;
}>;

export type TransitionAttemptStateInput = Readonly<{
  leaseKey: unknown;
  ownerId: unknown;
  observedAt: unknown;
  expectedRevision: unknown;
  attempt: unknown;
  event: unknown;
}>;

export type RecordArtifactInput = Readonly<{
  artifact: unknown;
  storagePath: unknown;
  recordedAt: unknown;
}>;

export type ListAttemptReconciliationCandidatesInput = Readonly<{
  limit: unknown;
}>;

export const MAX_LOCAL_PORTFOLIO_PROJECTS = 1_000;

export type LocalPortfolioProjectSummary = Readonly<{
  projectId: ProjectId;
  attemptCount: number;
  activeAttemptCount: number;
  blockerCount: number;
  lastActivityAt: IsoInstant;
  lastSuccessfulAttemptAt: IsoInstant | null;
}>;

type AttemptRow = Readonly<{
  attempt_id: string;
  task_id: string;
  task_spec_digest: string;
  attempt_number: number;
  state: string;
  desired_state: string;
  revision: number;
  fence: number;
  current_step_id: string | null;
  blocker_json: string | null;
  outcome_json: string | null;
  created_at: string;
  updated_at: string;
  terminal_at: string | null;
  payload_json: string;
}>;

type AttemptListRow = AttemptRow &
  Readonly<{
    task_project_id: string;
    task_snapshot_digest: string;
    task_payload_json: string;
  }>;

type EventRow = Readonly<{
  event_id: string;
  attempt_id: string;
  sequence: number;
  type: string;
  command_id: string | null;
  fence: number;
  payload_json: string;
}>;

function failInvariant(message: string): never {
  throw new Error(`Factory persistence invariant failed: ${message}`);
}

function assertSame(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failInvariant(
      `${label} must be ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`,
    );
  }
}

function assertJsonSame(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failInvariant(`${label} does not match its event payload`);
  }
}

function parseStoredJson<T>(
  table: string,
  identifier: string,
  payloadJson: string,
  parse: (value: unknown) => T,
): T {
  let value: unknown;
  try {
    value = JSON.parse(payloadJson) as unknown;
  } catch (error) {
    throw new Error(`${table} ${identifier} contains invalid JSON`, { cause: error });
  }

  try {
    return parse(value);
  } catch (error) {
    throw new Error(`${table} ${identifier} violates the current runtime contract`, {
      cause: error,
    });
  }
}

function parseSubmitTaskCommand(value: unknown): SubmitTaskCommandV1 {
  const command = CommandV1Schema.parse(value);
  if (command.kind !== "task.submit") {
    failInvariant(`createTaskAttempt requires task.submit, received ${command.kind}`);
  }
  return command;
}

function parseRetryTaskCommand(value: unknown): RetryTaskCommandV1 {
  const command = CommandV1Schema.parse(value);
  if (command.kind !== "task.retry") {
    failInvariant(`retryTaskAttempt requires task.retry, received ${command.kind}`);
  }
  return command;
}

function parseAttemptCreatedEvent(value: unknown): AttemptCreatedEventV1 {
  const event = EventV1Schema.parse(value);
  if (event.type !== "attempt.created") {
    failInvariant(`createTaskAttempt requires attempt.created, received ${event.type}`);
  }
  return event;
}

function parseAttemptStateChangedEvent(value: unknown): AttemptStateChangedEventV1 {
  const event = EventV1Schema.parse(value);
  if (event.type !== "attempt.state-changed") {
    failInvariant(`transitionAttemptState requires attempt.state-changed, received ${event.type}`);
  }
  return event;
}

function decodeAttempt(row: AttemptRow): ExecutionAttemptV1 {
  const attempt = parseStoredJson("attempts", row.attempt_id, row.payload_json, (value) =>
    ExecutionAttemptV1Schema.parse(value),
  );
  assertSame("attempt_id projection", row.attempt_id, attempt.attemptId);
  assertSame("task_id projection", row.task_id, attempt.taskId);
  assertSame("task_spec_digest projection", row.task_spec_digest, attempt.taskSpecDigest);
  assertSame("attempt_number projection", row.attempt_number, attempt.attemptNumber);
  assertSame("state projection", row.state, attempt.state);
  assertSame("desired_state projection", row.desired_state, attempt.desiredState);
  assertSame("revision projection", row.revision, attempt.revision);
  assertSame("fence projection", row.fence, attempt.fence);
  assertSame("current_step_id projection", row.current_step_id, attempt.currentStepId);
  assertJsonSame(
    "blocker projection",
    row.blocker_json === null ? null : JSON.parse(row.blocker_json),
    attempt.blocker,
  );
  assertJsonSame(
    "outcome projection",
    row.outcome_json === null ? null : JSON.parse(row.outcome_json),
    attempt.outcome,
  );
  assertSame("created_at projection", row.created_at, attempt.createdAt);
  assertSame("updated_at projection", row.updated_at, attempt.updatedAt);
  assertSame("terminal_at projection", row.terminal_at, attempt.terminalAt);
  return assertAttemptSnapshotCoherence(attempt);
}

function decodeAttemptListItem(row: AttemptListRow): AttemptListItemV1 {
  const attempt = decodeAttempt(row);
  const taskSpec = parseStoredJson("task_snapshots", row.task_id, row.task_payload_json, (value) =>
    TaskSpecV1Schema.parse(value),
  );
  assertSame("attempt-list task ID", taskSpec.taskId, attempt.taskId);
  assertSame("attempt-list task project projection", row.task_project_id, taskSpec.projectId);
  assertSame(
    "attempt-list task snapshot digest",
    row.task_snapshot_digest,
    computeTaskSpecDigest(taskSpec),
  );
  assertSame("attempt-list attempt task digest", attempt.taskSpecDigest, row.task_snapshot_digest);
  return AttemptListItemV1Schema.parse({
    schemaVersion: 1,
    projectId: taskSpec.projectId,
    title: taskSpec.title,
    phase: taskSpec.phase ?? null,
    attempt,
  });
}

function decodeEvent(row: EventRow): EventV1 {
  const event = parseStoredJson("events", row.event_id, row.payload_json, (value) =>
    EventV1Schema.parse(value),
  );
  assertSame("event attempt_id projection", row.attempt_id, event.attemptId);
  assertSame("event sequence projection", row.sequence, event.sequence);
  assertSame("event type projection", row.type, event.type);
  assertSame("event command_id projection", row.command_id, event.commandId);
  assertSame("event fence projection", row.fence, event.fence);
  return event;
}

function insertCommand(database: Database.Database, command: SubmitTaskCommandV1): void {
  database
    .prepare(
      `INSERT INTO commands(
         command_id, schema_version, kind, origin, issued_at, task_id, attempt_id, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .run(
      command.commandId,
      command.schemaVersion,
      command.kind,
      command.origin,
      command.issuedAt,
      command.taskSpec.taskId,
      JSON.stringify(command),
    );
}

function insertRetryCommand(database: Database.Database, command: RetryTaskCommandV1): void {
  database
    .prepare(
      `INSERT INTO commands(
         command_id, schema_version, kind, origin, issued_at, task_id, attempt_id, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      command.commandId,
      command.schemaVersion,
      command.kind,
      command.origin,
      command.issuedAt,
      command.taskId,
      command.priorAttemptId,
      JSON.stringify(command),
    );
}

function insertTaskSnapshot(
  database: Database.Database,
  command: SubmitTaskCommandV1,
  taskSpecDigest: string,
): void {
  const taskSpec = command.taskSpec;
  database
    .prepare(
      `INSERT INTO task_snapshots(
         task_id, schema_version, project_id, repository_id, base_commit,
         task_spec_digest, submitted_by_command_id, created_at, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      taskSpec.taskId,
      taskSpec.schemaVersion,
      taskSpec.projectId,
      taskSpec.base.repositoryId,
      taskSpec.base.commit,
      taskSpecDigest,
      command.commandId,
      taskSpec.createdAt,
      JSON.stringify(taskSpec),
    );
}

function insertAttempt(database: Database.Database, attempt: ExecutionAttemptV1): void {
  database
    .prepare(
      `INSERT INTO attempts(
         attempt_id, schema_version, task_id, task_spec_digest, attempt_number,
         state, desired_state, revision, fence, current_step_id, blocker_json,
         outcome_json, created_at, updated_at, terminal_at, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      attempt.attemptId,
      attempt.schemaVersion,
      attempt.taskId,
      attempt.taskSpecDigest,
      attempt.attemptNumber,
      attempt.state,
      attempt.desiredState,
      attempt.revision,
      attempt.fence,
      attempt.currentStepId,
      attempt.blocker === null ? null : JSON.stringify(attempt.blocker),
      attempt.outcome === null ? null : JSON.stringify(attempt.outcome),
      attempt.createdAt,
      attempt.updatedAt,
      attempt.terminalAt,
      JSON.stringify(attempt),
    );
}

function insertEvent(database: Database.Database, event: EventV1): void {
  database
    .prepare(
      `INSERT INTO events(
         event_id, schema_version, attempt_id, sequence, type, occurred_at,
         command_id, causation_event_id, fence, payload_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.eventId,
      event.schemaVersion,
      event.attemptId,
      event.sequence,
      event.type,
      event.occurredAt,
      event.commandId,
      event.causationEventId,
      event.fence,
      JSON.stringify(event),
    );
}

export class CommandRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(commandIdInput: unknown): CommandV1 | null {
    const commandId = CommandIdSchema.parse(commandIdInput);
    const row = this.database
      .prepare("SELECT payload_json FROM commands WHERE command_id = ?")
      .get(commandId) as Readonly<{ payload_json: string }> | undefined;
    return row === undefined
      ? null
      : parseStoredJson("commands", commandId, row.payload_json, (value) =>
          CommandV1Schema.parse(value),
        );
  }
}

export class TaskSnapshotRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(taskIdInput: unknown): TaskSpecV1 | null {
    const taskId = TaskIdSchema.parse(taskIdInput);
    const row = this.database
      .prepare("SELECT task_spec_digest, payload_json FROM task_snapshots WHERE task_id = ?")
      .get(taskId) as Readonly<{ task_spec_digest: string; payload_json: string }> | undefined;
    if (row === undefined) return null;
    const taskSpec = parseStoredJson("task_snapshots", taskId, row.payload_json, (value) =>
      TaskSpecV1Schema.parse(value),
    );
    assertSame("task snapshot taskId", taskSpec.taskId, taskId);
    assertSame(
      "task snapshot canonical digest",
      row.task_spec_digest,
      computeTaskSpecDigest(taskSpec),
    );
    return taskSpec;
  }
}

export class AttemptRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(attemptIdInput: unknown): ExecutionAttemptV1 | null {
    const attemptId = AttemptIdSchema.parse(attemptIdInput);
    const row = this.database
      .prepare("SELECT * FROM attempts WHERE attempt_id = ?")
      .get(attemptId) as AttemptRow | undefined;
    return row === undefined ? null : decodeAttempt(row);
  }

  /**
   * Returns a bounded navigation page ordered by the authoritative attempt
   * update tuple. This is a read model; callers must re-read one exact attempt
   * before acting on it.
   */
  public list(inputValue: unknown): AttemptListPageV1 {
    const input = AttemptListQueryV1Schema.parse(inputValue);
    const conditions: string[] = [];
    const parameters: Array<number | string> = [];

    if (input.scope === "active") {
      conditions.push("attempt.state NOT IN ('succeeded', 'failed', 'cancelled')");
    }
    if (input.projectId !== null) {
      conditions.push("task.project_id = ?");
      parameters.push(input.projectId);
    }
    if (input.after !== null) {
      conditions.push(
        "(attempt.updated_at < ? OR (attempt.updated_at = ? AND attempt.attempt_id < ?))",
      );
      parameters.push(input.after.updatedAt, input.after.updatedAt, input.after.attemptId);
    }

    const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
    const rows = this.database
      .prepare(
        `SELECT
           attempt.*,
           task.project_id AS task_project_id,
           task.task_spec_digest AS task_snapshot_digest,
           task.payload_json AS task_payload_json
         FROM attempts AS attempt
         JOIN task_snapshots AS task ON task.task_id = attempt.task_id
         ${where}
         ORDER BY attempt.updated_at DESC, attempt.attempt_id DESC
         LIMIT ?`,
      )
      .all(...parameters, input.limit + 1) as readonly AttemptListRow[];
    const decoded = rows.map(decodeAttemptListItem);
    const hasMore = decoded.length > input.limit;
    const attempts = decoded.slice(0, input.limit);
    const cursorSource = hasMore ? attempts.at(-1)?.attempt : undefined;
    return AttemptListPageV1Schema.parse({
      attempts,
      nextAfter:
        cursorSource === undefined
          ? null
          : { updatedAt: cursorSource.updatedAt, attemptId: cursorSource.attemptId },
      hasMore,
    });
  }

  /**
   * Returns the non-terminal attempts for which the scheduler can either run
   * work or reconcile persisted operator intent. Intent changes are ordered
   * ahead of ordinary work so pause/cancel commands are observed promptly.
   */
  public listReconciliationCandidates(
    input: ListAttemptReconciliationCandidatesInput,
  ): readonly ExecutionAttemptV1[] {
    const limit = PositiveSafeIntegerSchema.parse(input.limit);
    if (limit > 10_000) {
      throw new RangeError("attempt reconciliation candidate limit cannot exceed 10000");
    }
    const rows = this.database
      .prepare(
        `SELECT * FROM attempts
         WHERE state NOT IN ('succeeded', 'failed', 'cancelled')
           AND (
             (desired_state = 'running' AND state <> 'blocked')
             OR (desired_state = 'paused' AND state <> 'paused')
             OR desired_state = 'cancelled'
           )
         ORDER BY
           CASE desired_state
             WHEN 'cancelled' THEN 0
             WHEN 'paused' THEN 1
             ELSE 2
           END,
           updated_at,
           attempt_id
         LIMIT ?`,
      )
      .all(limit) as readonly AttemptRow[];
    return rows.map(decodeAttempt);
  }
}

export class EventRepository {
  public constructor(private readonly database: Database.Database) {}

  public listByAttempt(attemptIdInput: unknown): readonly EventV1[] {
    const attemptId = AttemptIdSchema.parse(attemptIdInput);
    const rows = this.database
      .prepare("SELECT * FROM events WHERE attempt_id = ? ORDER BY sequence")
      .all(attemptId) as readonly EventRow[];
    return rows.map(decodeEvent);
  }
}

type LocalPortfolioProjectSummaryRow = Readonly<{
  projectId: string;
  attemptCount: number;
  activeAttemptCount: number;
  blockerCount: number;
  lastActivityAt: string;
  lastSuccessfulAttemptAt: string | null;
}>;

export class PortfolioProjectionRepository {
  public constructor(private readonly database: Database.Database) {}

  /** Reads the transactionally maintained, provider-free local projection. */
  public listProjectSummaries(
    input: Readonly<{ limit: unknown }> = { limit: MAX_LOCAL_PORTFOLIO_PROJECTS },
  ): readonly LocalPortfolioProjectSummary[] {
    const limit = PositiveSafeIntegerSchema.parse(input.limit);
    if (limit > MAX_LOCAL_PORTFOLIO_PROJECTS) {
      throw new RangeError(
        `local portfolio project limit cannot exceed ${String(MAX_LOCAL_PORTFOLIO_PROJECTS)}`,
      );
    }
    const rows = this.database
      .prepare(
        `SELECT
           project_id AS projectId,
           attempt_count AS attemptCount,
           active_attempt_count AS activeAttemptCount,
           blocker_count AS blockerCount,
           last_activity_at AS lastActivityAt,
           last_successful_attempt_at AS lastSuccessfulAttemptAt
         FROM project_execution_projections
         ORDER BY project_id
         LIMIT ?`,
      )
      .all(limit + 1) as readonly LocalPortfolioProjectSummaryRow[];
    if (rows.length > limit) {
      throw new RangeError(`local portfolio contains more than ${String(limit)} projects`);
    }
    return rows.map((row) => ({
      projectId: ProjectIdSchema.parse(row.projectId),
      attemptCount: PositiveSafeIntegerSchema.parse(row.attemptCount),
      activeAttemptCount: NonNegativeSafeIntegerSchema.parse(row.activeAttemptCount),
      blockerCount: NonNegativeSafeIntegerSchema.parse(row.blockerCount),
      lastActivityAt: IsoInstantSchema.parse(row.lastActivityAt),
      lastSuccessfulAttemptAt:
        row.lastSuccessfulAttemptAt === null
          ? null
          : IsoInstantSchema.parse(row.lastSuccessfulAttemptAt),
    }));
  }
}

export class ArtifactRepository {
  public constructor(private readonly database: Database.Database) {}

  public record(input: RecordArtifactInput): ArtifactRefV1 {
    const artifact = ArtifactRefV1Schema.parse(input.artifact);
    const storagePath = AbsolutePathSchema.parse(input.storagePath);
    const recordedAt = IsoInstantSchema.parse(input.recordedAt);
    this.database
      .prepare(
        `INSERT INTO artifacts(
           digest, byte_length, media_type, logical_name, storage_path, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        artifact.digest,
        artifact.byteLength,
        artifact.mediaType,
        artifact.logicalName,
        storagePath,
        recordedAt,
      );
    return artifact;
  }

  public findByDigest(digestInput: unknown): ArtifactRefV1 | null {
    const digest = Sha256DigestSchema.parse(digestInput);
    const row = this.database
      .prepare(
        `SELECT digest, byte_length AS byteLength, media_type AS mediaType,
                logical_name AS logicalName
         FROM artifacts WHERE digest = ?`,
      )
      .get(digest) as ArtifactRefV1 | undefined;
    return row === undefined ? null : ArtifactRefV1Schema.parse(row);
  }
}

export class FactoryRepositories {
  public readonly commands: CommandRepository;
  public readonly taskSnapshots: TaskSnapshotRepository;
  public readonly attempts: AttemptRepository;
  public readonly events: EventRepository;
  public readonly portfolio: PortfolioProjectionRepository;
  public readonly artifacts: ArtifactRepository;
  public readonly desiredStates: AttemptDesiredStateRepository;
  public readonly steps: StepRepository;
  public readonly leases: LeaseRepository;
  public readonly unblocks: AttemptUnblockRepository;
  public readonly milestones: ProjectMilestoneRepository;
  public readonly phaseDefinitions: PhaseDefinitionRepository;
  public readonly phasePresets: PhasePresetRepository;
  public readonly projectPlans: ProjectPlanRepository;
  public readonly phaseRuns: PhaseRunRepository;
  public readonly projectRegistry: ProjectRegistryRepository;

  public constructor(private readonly database: Database.Database) {
    this.commands = new CommandRepository(database);
    this.taskSnapshots = new TaskSnapshotRepository(database);
    this.attempts = new AttemptRepository(database);
    this.events = new EventRepository(database);
    this.portfolio = new PortfolioProjectionRepository(database);
    this.artifacts = new ArtifactRepository(database);
    this.desiredStates = new AttemptDesiredStateRepository(database);
    this.steps = new StepRepository(database);
    this.leases = new LeaseRepository(database);
    this.unblocks = new AttemptUnblockRepository(database);
    this.milestones = new ProjectMilestoneRepository(database);
    this.phaseDefinitions = new PhaseDefinitionRepository(database);
    this.phasePresets = new PhasePresetRepository(database);
    this.projectPlans = new ProjectPlanRepository(database);
    this.phaseRuns = new PhaseRunRepository(database);
    this.projectRegistry = new ProjectRegistryRepository(database);
  }

  public createTaskAttempt(input: CreateTaskAttemptInput): CreatedTaskAttempt {
    const command = parseSubmitTaskCommand(input.command);
    const taskSpecDigest = Sha256DigestSchema.parse(input.taskSpecDigest);
    const attempt = ExecutionAttemptV1Schema.parse(input.attempt);
    const event = parseAttemptCreatedEvent(input.event);
    const taskSpec = command.taskSpec;

    assertSame("canonical taskSpecDigest", taskSpecDigest, computeTaskSpecDigest(taskSpec));
    assertAttemptSnapshotCoherence(attempt);

    assertSame("attempt taskId", attempt.taskId, taskSpec.taskId);
    assertSame("attempt taskSpecDigest", attempt.taskSpecDigest, taskSpecDigest);
    assertSame("initial attempt state", attempt.state, "queued");
    assertSame("initial attempt desiredState", attempt.desiredState, command.initialDesiredState);
    assertSame("initial attempt number", attempt.attemptNumber, 1);
    assertSame("initial attempt revision", attempt.revision, 0);
    assertSame("initial attempt fence", attempt.fence, 0);
    assertSame("initial attempt currentStepId", attempt.currentStepId, null);
    assertSame("initial attempt blocker", attempt.blocker, null);
    assertSame("initial attempt outcome", attempt.outcome, null);
    assertSame("initial attempt terminalAt", attempt.terminalAt, null);
    assertSame("initial attempt timestamps", attempt.updatedAt, attempt.createdAt);
    assertSame("created event attemptId", event.attemptId, attempt.attemptId);
    assertSame("created event sequence", event.sequence, 1);
    assertSame("created event commandId", event.commandId, command.commandId);
    assertSame("created event causationEventId", event.causationEventId, null);
    assertSame("created event fence", event.fence, attempt.fence);
    assertSame("created event occurredAt", event.occurredAt, attempt.createdAt);
    assertSame("created event taskId", event.data.taskId, taskSpec.taskId);
    assertSame("created event taskSpecDigest", event.data.taskSpecDigest, taskSpecDigest);

    const persist = this.database.transaction((): CreatedTaskAttempt => {
      const storedCommandRow = this.database
        .prepare("SELECT payload_json FROM commands WHERE command_id = ?")
        .get(command.commandId) as Readonly<{ payload_json: string }> | undefined;
      if (storedCommandRow !== undefined) {
        const storedCommand = parseSubmitTaskCommand(
          parseStoredJson("commands", command.commandId, storedCommandRow.payload_json, (value) =>
            CommandV1Schema.parse(value),
          ),
        );
        assertJsonSame("duplicate task-submit command", command, storedCommand);

        const taskRow = this.database
          .prepare(
            `SELECT task_spec_digest, payload_json
             FROM task_snapshots WHERE submitted_by_command_id = ?`,
          )
          .get(command.commandId) as
          Readonly<{ task_spec_digest: string; payload_json: string }> | undefined;
        if (taskRow === undefined) {
          failInvariant(`task-submit command ${command.commandId} has no task snapshot`);
        }
        const storedTaskSpec = parseStoredJson(
          "task_snapshots",
          storedCommand.taskSpec.taskId,
          taskRow.payload_json,
          (value) => TaskSpecV1Schema.parse(value),
        );
        assertSame("duplicate canonical taskSpecDigest", taskRow.task_spec_digest, taskSpecDigest);
        assertSame(
          "stored task snapshot canonical digest",
          taskRow.task_spec_digest,
          computeTaskSpecDigest(storedTaskSpec),
        );

        const attemptRow = this.database
          .prepare(
            `SELECT * FROM attempts
             WHERE task_id = ? AND task_spec_digest = ? AND attempt_number = 1`,
          )
          .get(storedTaskSpec.taskId, taskSpecDigest) as AttemptRow | undefined;
        if (attemptRow === undefined) {
          failInvariant(`task-submit command ${command.commandId} has no initial attempt`);
        }
        const storedAttempt = decodeAttempt(attemptRow);
        const eventRows = this.database
          .prepare("SELECT * FROM events WHERE command_id = ? ORDER BY sequence")
          .all(command.commandId) as readonly EventRow[];
        if (eventRows.length !== 1 || eventRows[0] === undefined) {
          failInvariant(`task-submit command ${command.commandId} must have one result event`);
        }
        const storedEvent = decodeEvent(eventRows[0]);
        if (storedEvent.type !== "attempt.created") {
          failInvariant(`task-submit command ${command.commandId} has the wrong result event`);
        }
        return {
          command: storedCommand,
          taskSpec: storedTaskSpec,
          attempt: storedAttempt,
          event: storedEvent,
          duplicate: true,
        };
      }

      insertCommand(this.database, command);
      insertTaskSnapshot(this.database, command, taskSpecDigest);
      insertAttempt(this.database, attempt);
      insertEvent(this.database, event);
      return { command, taskSpec, attempt, event, duplicate: false };
    });
    return persist.immediate();
  }

  /**
   * Creates attempt N+1 for a task from a failed or cancelled terminal attempt
   * N, reusing task N's exact snapshot digest. Idempotent by commandId, like
   * createTaskAttempt: a replayed command with identical content returns the
   * attempt it already created instead of creating a second one. Refuses a
   * prior attempt that is not terminal-failed/cancelled, belongs to a
   * different task, or has already been retried (task_id, attempt_number) is
   * UNIQUE, so at most one attempt N+1 can ever exist per task).
   */
  public retryTaskAttempt(input: RetryTaskAttemptInput): RetriedTaskAttempt {
    const command = parseRetryTaskCommand(input.command);
    const attempt = ExecutionAttemptV1Schema.parse(input.attempt);
    const event = parseAttemptCreatedEvent(input.event);

    assertAttemptSnapshotCoherence(attempt);
    assertSame("retry attempt taskId", attempt.taskId, command.taskId);
    assertSame("initial retry attempt state", attempt.state, "queued");
    assertSame(
      "initial retry attempt desiredState",
      attempt.desiredState,
      command.initialDesiredState,
    );
    assertSame("initial retry attempt revision", attempt.revision, 0);
    assertSame("initial retry attempt fence", attempt.fence, 0);
    assertSame("initial retry attempt currentStepId", attempt.currentStepId, null);
    assertSame("initial retry attempt blocker", attempt.blocker, null);
    assertSame("initial retry attempt outcome", attempt.outcome, null);
    assertSame("initial retry attempt terminalAt", attempt.terminalAt, null);
    assertSame("initial retry attempt timestamps", attempt.updatedAt, attempt.createdAt);
    assertSame("retry created event attemptId", event.attemptId, attempt.attemptId);
    assertSame("retry created event sequence", event.sequence, 1);
    assertSame("retry created event commandId", event.commandId, command.commandId);
    assertSame("retry created event causationEventId", event.causationEventId, null);
    assertSame("retry created event fence", event.fence, attempt.fence);
    assertSame("retry created event occurredAt", event.occurredAt, attempt.createdAt);
    assertSame("retry created event taskId", event.data.taskId, command.taskId);
    assertSame(
      "retry created event taskSpecDigest",
      event.data.taskSpecDigest,
      attempt.taskSpecDigest,
    );

    const persist = this.database.transaction((): RetriedTaskAttempt => {
      const storedCommandRow = this.database
        .prepare("SELECT payload_json FROM commands WHERE command_id = ?")
        .get(command.commandId) as Readonly<{ payload_json: string }> | undefined;
      if (storedCommandRow !== undefined) {
        const storedCommand = parseRetryTaskCommand(
          parseStoredJson("commands", command.commandId, storedCommandRow.payload_json, (value) =>
            CommandV1Schema.parse(value),
          ),
        );
        assertJsonSame("duplicate task-retry command", command, storedCommand);

        const eventRows = this.database
          .prepare("SELECT * FROM events WHERE command_id = ? ORDER BY sequence")
          .all(command.commandId) as readonly EventRow[];
        if (eventRows.length !== 1 || eventRows[0] === undefined) {
          failInvariant(`task-retry command ${command.commandId} must have one result event`);
        }
        const storedEvent = decodeEvent(eventRows[0]);
        if (storedEvent.type !== "attempt.created") {
          failInvariant(`task-retry command ${command.commandId} has the wrong result event`);
        }
        const priorAttemptRow = this.database
          .prepare("SELECT * FROM attempts WHERE attempt_id = ?")
          .get(storedCommand.priorAttemptId) as AttemptRow | undefined;
        if (priorAttemptRow === undefined) {
          failInvariant(`task-retry command ${command.commandId} has no prior attempt`);
        }
        const attemptRow = this.database
          .prepare("SELECT * FROM attempts WHERE attempt_id = ?")
          .get(storedEvent.attemptId) as AttemptRow | undefined;
        if (attemptRow === undefined) {
          failInvariant(`task-retry command ${command.commandId} has no retried attempt`);
        }
        return {
          command: storedCommand,
          priorAttempt: decodeAttempt(priorAttemptRow),
          attempt: decodeAttempt(attemptRow),
          event: storedEvent,
          duplicate: true,
        };
      }

      const priorAttemptRow = this.database
        .prepare("SELECT * FROM attempts WHERE attempt_id = ?")
        .get(command.priorAttemptId) as AttemptRow | undefined;
      if (priorAttemptRow === undefined) {
        failInvariant(
          `retry references a prior attempt that does not exist: ${command.priorAttemptId}`,
        );
      }
      const priorAttempt = decodeAttempt(priorAttemptRow);
      if (priorAttempt.taskId !== command.taskId) {
        failInvariant(
          `retry prior attempt ${priorAttempt.attemptId} does not belong to task ${command.taskId}`,
        );
      }
      if (priorAttempt.state !== "failed" && priorAttempt.state !== "cancelled") {
        failInvariant(
          `retry requires a failed or cancelled prior attempt; ${priorAttempt.attemptId} is ${priorAttempt.state}`,
        );
      }
      if (priorAttempt.taskSpecDigest !== attempt.taskSpecDigest) {
        failInvariant("retry attempt must reuse the prior attempt's task snapshot digest");
      }
      if (attempt.attemptNumber !== priorAttempt.attemptNumber + 1) {
        failInvariant("retry attempt number must immediately follow the prior attempt");
      }
      const nextAttemptRow = this.database
        .prepare(`SELECT attempt_id FROM attempts WHERE task_id = ? AND attempt_number = ?`)
        .get(command.taskId, priorAttempt.attemptNumber + 1) as
        Readonly<{ attempt_id: string }> | undefined;
      if (nextAttemptRow !== undefined) {
        failInvariant(
          `attempt ${priorAttempt.attemptId} has already been retried as ${nextAttemptRow.attempt_id}`,
        );
      }

      insertRetryCommand(this.database, command);
      insertAttempt(this.database, attempt);
      insertEvent(this.database, event);
      return { command, priorAttempt, attempt, event, duplicate: false };
    });
    return persist.immediate();
  }

  public transitionAttemptState(input: TransitionAttemptStateInput): ExecutionAttemptV1 {
    const observedAt = IsoInstantSchema.parse(input.observedAt);
    const expectedRevision = NonNegativeSafeIntegerSchema.parse(input.expectedRevision);
    const nextAttempt = ExecutionAttemptV1Schema.parse(input.attempt);
    const event = parseAttemptStateChangedEvent(input.event);

    const transition = this.database.transaction(() => {
      const row = this.database
        .prepare("SELECT * FROM attempts WHERE attempt_id = ?")
        .get(nextAttempt.attemptId) as AttemptRow | undefined;
      if (row === undefined) {
        throw new Error(`Attempt does not exist: ${nextAttempt.attemptId}`);
      }
      const current = decodeAttempt(row);

      assertAttemptSnapshotCoherence(current);
      assertAttemptSnapshotCoherence(nextAttempt);
      assertLegalAttemptStateTransition(current.state, nextAttempt.state);

      assertSame("expected revision", current.revision, expectedRevision);
      assertSame("next revision", nextAttempt.revision, current.revision + 1);
      assertSame("immutable taskId", nextAttempt.taskId, current.taskId);
      assertSame("immutable taskSpecDigest", nextAttempt.taskSpecDigest, current.taskSpecDigest);
      assertSame("immutable attemptNumber", nextAttempt.attemptNumber, current.attemptNumber);
      assertSame("immutable createdAt", nextAttempt.createdAt, current.createdAt);
      assertSame("state-transition desiredState", nextAttempt.desiredState, current.desiredState);
      assertSame("state-transition fence", nextAttempt.fence, current.fence);
      assertSame(
        "state-transition currentStepId",
        nextAttempt.currentStepId,
        current.currentStepId,
      );
      if (nextAttempt.updatedAt <= current.updatedAt) {
        failInvariant("attempt updatedAt must advance");
      }
      if (nextAttempt.state === "running" && current.desiredState !== "running") {
        failInvariant(
          `attempt ${current.attemptId} cannot enter or resume running while desiredState is ${current.desiredState}`,
        );
      }

      assertActiveAttemptLease(this.database, {
        leaseKey: input.leaseKey,
        attemptId: current.attemptId,
        ownerId: input.ownerId,
        fence: current.fence,
        observedAt,
      });

      assertSame("state event attemptId", event.attemptId, current.attemptId);
      assertSame("state event fence", event.fence, current.fence);
      assertSame("state event commandId", event.commandId, null);
      assertSame("state event occurredAt", event.occurredAt, nextAttempt.updatedAt);
      assertSame("state event trusted observedAt", event.occurredAt, observedAt);
      assertSame("state event from", event.data.from, current.state);
      assertSame("state event to", event.data.to, nextAttempt.state);
      assertJsonSame("state event blocker", event.data.blocker, nextAttempt.blocker);
      assertJsonSame("state event outcome", event.data.outcome, nextAttempt.outcome);

      const lastSequenceRow = this.database
        .prepare("SELECT MAX(sequence) AS sequence FROM events WHERE attempt_id = ?")
        .get(current.attemptId) as Readonly<{ sequence: number | null }>;
      assertSame("state event sequence", event.sequence, (lastSequenceRow.sequence ?? 0) + 1);

      if (event.causationEventId !== null) {
        const cause = this.database
          .prepare("SELECT attempt_id FROM events WHERE event_id = ?")
          .get(event.causationEventId) as Readonly<{ attempt_id: string }> | undefined;
        if (cause === undefined) {
          failInvariant(`causation event does not exist: ${event.causationEventId}`);
        }
        assertSame("causation event attemptId", cause.attempt_id, current.attemptId);
      }

      const result = this.database
        .prepare(
          `UPDATE attempts SET
             state = ?, desired_state = ?, revision = ?, fence = ?, current_step_id = ?,
             blocker_json = ?, outcome_json = ?, updated_at = ?, terminal_at = ?, payload_json = ?
           WHERE attempt_id = ? AND revision = ? AND fence = ?`,
        )
        .run(
          nextAttempt.state,
          nextAttempt.desiredState,
          nextAttempt.revision,
          nextAttempt.fence,
          nextAttempt.currentStepId,
          nextAttempt.blocker === null ? null : JSON.stringify(nextAttempt.blocker),
          nextAttempt.outcome === null ? null : JSON.stringify(nextAttempt.outcome),
          nextAttempt.updatedAt,
          nextAttempt.terminalAt,
          JSON.stringify(nextAttempt),
          nextAttempt.attemptId,
          expectedRevision,
          current.fence,
        );
      if (result.changes !== 1) {
        throw new Error(`Attempt revision/fence conflict: ${nextAttempt.attemptId}`);
      }
      insertEvent(this.database, event);
      return nextAttempt;
    });

    return transition.immediate();
  }
}

export function createFactoryRepositories(database: Database.Database): FactoryRepositories {
  return new FactoryRepositories(database);
}
