import {
  AbsolutePathSchema,
  ArtifactRefV1Schema,
  AttemptIdSchema,
  CommandIdSchema,
  CommandV1Schema,
  EventV1Schema,
  ExecutionAttemptV1Schema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  Sha256DigestSchema,
  TaskIdSchema,
  TaskSpecV1Schema,
  type ArtifactRefV1,
  type CommandV1,
  type EventV1,
  type ExecutionAttemptV1,
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
  LeaseRepository,
  StepRepository,
} from "./durability-repositories.js";

type SubmitTaskCommandV1 = Extract<CommandV1, { kind: "task.submit" }>;
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

export type TransitionAttemptStateInput = Readonly<{
  expectedRevision: unknown;
  attempt: unknown;
  event: unknown;
}>;

export type RecordArtifactInput = Readonly<{
  artifact: unknown;
  storagePath: unknown;
  recordedAt: unknown;
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
  public readonly artifacts: ArtifactRepository;
  public readonly desiredStates: AttemptDesiredStateRepository;
  public readonly steps: StepRepository;
  public readonly leases: LeaseRepository;

  public constructor(private readonly database: Database.Database) {
    this.commands = new CommandRepository(database);
    this.taskSnapshots = new TaskSnapshotRepository(database);
    this.attempts = new AttemptRepository(database);
    this.events = new EventRepository(database);
    this.artifacts = new ArtifactRepository(database);
    this.desiredStates = new AttemptDesiredStateRepository(database);
    this.steps = new StepRepository(database);
    this.leases = new LeaseRepository(database);
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
    assertSame("initial attempt desiredState", attempt.desiredState, "running");
    assertSame("initial attempt revision", attempt.revision, 0);
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

  public transitionAttemptState(input: TransitionAttemptStateInput): ExecutionAttemptV1 {
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

      assertSame("state event attemptId", event.attemptId, current.attemptId);
      assertSame("state event fence", event.fence, current.fence);
      assertSame("state event occurredAt", event.occurredAt, nextAttempt.updatedAt);
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
