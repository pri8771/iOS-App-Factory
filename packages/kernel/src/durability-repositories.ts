import {
  AttemptIdSchema,
  CommandIdSchema,
  CommandV1Schema,
  EventV1Schema,
  ExecutionAttemptV1Schema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  StepIdSchema,
  StepV1Schema,
  type CommandV1,
  type EventV1,
  type ExecutionAttemptV1,
  type StepV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

import { canonicalJson } from "./canonical-json.js";
import {
  assertAttemptSnapshotCoherence,
  assertLegalStepStateTransition,
  assertStepSnapshotCoherence,
} from "./state-machine.js";

type SetDesiredStateCommandV1 = Extract<CommandV1, { kind: "attempt.set-desired-state" }>;
type DesiredStateChangedEventV1 = Extract<EventV1, { type: "attempt.desired-state-changed" }>;
type FenceClaimedEventV1 = Extract<EventV1, { type: "attempt.fence-claimed" }>;
type StepCreatedEventV1 = Extract<EventV1, { type: "step.created" }>;
type StepStateChangedEventV1 = Extract<EventV1, { type: "step.state-changed" }>;

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

type StepRow = Readonly<{
  step_id: string;
  attempt_id: string;
  ordinal: number;
  operation: string;
  state: string;
  revision: number;
  last_fence: number;
  run_count: number;
  input_digest: string;
  output_digest: string | null;
  blocker_json: string | null;
  failure_json: string | null;
  started_at: string | null;
  finished_at: string | null;
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

type LeaseRow = Readonly<{
  lease_key: string;
  attempt_id: string | null;
  owner_id: string;
  fence: number;
  revision: number;
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
}>;

export type LeaseRecord = Readonly<{
  leaseKey: string;
  attemptId: string | null;
  ownerId: string;
  fence: number;
  revision: number;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}>;

export type ApplyDesiredStateCommandInput = Readonly<{
  command: unknown;
  expectedRevision: unknown;
  event: unknown;
}>;

export type DesiredStateCommandResult = Readonly<{
  command: SetDesiredStateCommandV1;
  event: DesiredStateChangedEventV1;
  duplicate: boolean;
}>;

export type CreateStepInput = Readonly<{
  step: unknown;
  event: unknown;
}>;

export type TransitionStepInput = Readonly<{
  expectedRevision: unknown;
  fence: unknown;
  step: unknown;
  event: unknown;
}>;

export type ClaimLeaseInput = Readonly<{
  leaseKey: unknown;
  attemptId: unknown;
  ownerId: unknown;
  expectedAttemptRevision: unknown;
  acquiredAt: unknown;
  expiresAt: unknown;
  event: unknown;
}>;

export type ClaimLeaseResult = Readonly<{
  lease: LeaseRecord;
  attempt: ExecutionAttemptV1;
  event: FenceClaimedEventV1;
}>;

export type HeartbeatLeaseInput = Readonly<{
  leaseKey: unknown;
  ownerId: unknown;
  fence: unknown;
  expectedRevision: unknown;
  heartbeatAt: unknown;
  expiresAt: unknown;
}>;

export type ReleaseLeaseInput = Readonly<{
  leaseKey: unknown;
  ownerId: unknown;
  fence: unknown;
}>;

function failInvariant(message: string): never {
  throw new Error(`Factory durability invariant failed: ${message}`);
}

function assertSame(label: string, actual: unknown, expected: unknown): void {
  if (actual !== expected) {
    failInvariant(
      `${label} must be ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`,
    );
  }
}

function assertJsonSame(label: string, actual: unknown, expected: unknown): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    failInvariant(`${label} does not match`);
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

function decodeStep(row: StepRow): StepV1 {
  const step = parseStoredJson("steps", row.step_id, row.payload_json, (value) =>
    StepV1Schema.parse(value),
  );
  assertSame("step_id projection", row.step_id, step.stepId);
  assertSame("step attempt_id projection", row.attempt_id, step.attemptId);
  assertSame("step ordinal projection", row.ordinal, step.ordinal);
  assertSame("step operation projection", row.operation, step.operation);
  assertSame("step state projection", row.state, step.state);
  assertSame("step revision projection", row.revision, step.revision);
  assertSame("step last_fence projection", row.last_fence, step.lastFence);
  assertSame("step run_count projection", row.run_count, step.runCount);
  assertSame("step input_digest projection", row.input_digest, step.inputDigest);
  assertSame("step output_digest projection", row.output_digest, step.outputDigest);
  assertJsonSame(
    "step blocker projection",
    row.blocker_json === null ? null : JSON.parse(row.blocker_json),
    step.blocker,
  );
  assertJsonSame(
    "step failure projection",
    row.failure_json === null ? null : JSON.parse(row.failure_json),
    step.failure,
  );
  assertSame("step started_at projection", row.started_at, step.startedAt);
  assertSame("step finished_at projection", row.finished_at, step.finishedAt);
  return assertStepSnapshotCoherence(step);
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

function parseSetDesiredStateCommand(value: unknown): SetDesiredStateCommandV1 {
  const command = CommandV1Schema.parse(value);
  if (command.kind !== "attempt.set-desired-state") {
    failInvariant(`expected attempt.set-desired-state command, received ${command.kind}`);
  }
  return command;
}

function parseDesiredStateEvent(value: unknown): DesiredStateChangedEventV1 {
  const event = EventV1Schema.parse(value);
  if (event.type !== "attempt.desired-state-changed") {
    failInvariant(`expected attempt.desired-state-changed event, received ${event.type}`);
  }
  return event;
}

function parseFenceEvent(value: unknown): FenceClaimedEventV1 {
  const event = EventV1Schema.parse(value);
  if (event.type !== "attempt.fence-claimed") {
    failInvariant(`expected attempt.fence-claimed event, received ${event.type}`);
  }
  return event;
}

function parseStepCreatedEvent(value: unknown): StepCreatedEventV1 {
  const event = EventV1Schema.parse(value);
  if (event.type !== "step.created") {
    failInvariant(`expected step.created event, received ${event.type}`);
  }
  return event;
}

function parseStepStateChangedEvent(value: unknown): StepStateChangedEventV1 {
  const event = EventV1Schema.parse(value);
  if (event.type !== "step.state-changed") {
    failInvariant(`expected step.state-changed event, received ${event.type}`);
  }
  return event;
}

function parseLeaseKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 300 ||
    !/^[A-Za-z0-9._:/-]+$/.test(value)
  ) {
    throw new TypeError("leaseKey must be 1-300 portable key characters");
  }
  return value;
}

function parseOwnerId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new TypeError("ownerId must be 1-200 portable identifier characters");
  }
  return value;
}

function readAttempt(database: Database.Database, attemptId: string): ExecutionAttemptV1 {
  const row = database.prepare("SELECT * FROM attempts WHERE attempt_id = ?").get(attemptId) as
    AttemptRow | undefined;
  if (row === undefined) {
    throw new Error(`Attempt does not exist: ${attemptId}`);
  }
  return decodeAttempt(row);
}

function nextEventSequence(database: Database.Database, attemptId: string): number {
  const row = database
    .prepare("SELECT MAX(sequence) AS sequence FROM events WHERE attempt_id = ?")
    .get(attemptId) as Readonly<{ sequence: number | null }>;
  return (row.sequence ?? 0) + 1;
}

function validateEventCause(database: Database.Database, event: EventV1): void {
  if (event.causationEventId === null) return;
  const cause = database
    .prepare("SELECT attempt_id FROM events WHERE event_id = ?")
    .get(event.causationEventId) as Readonly<{ attempt_id: string }> | undefined;
  if (cause === undefined) {
    failInvariant(`causation event does not exist: ${event.causationEventId}`);
  }
  assertSame("causation event attemptId", cause.attempt_id, event.attemptId);
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

function updateAttempt(
  database: Database.Database,
  attempt: ExecutionAttemptV1,
  expectedRevision: number,
  expectedFence: number,
): void {
  const result = database
    .prepare(
      `UPDATE attempts SET
         state = ?, desired_state = ?, revision = ?, fence = ?, current_step_id = ?,
         blocker_json = ?, outcome_json = ?, updated_at = ?, terminal_at = ?, payload_json = ?
       WHERE attempt_id = ? AND revision = ? AND fence = ?`,
    )
    .run(
      attempt.state,
      attempt.desiredState,
      attempt.revision,
      attempt.fence,
      attempt.currentStepId,
      attempt.blocker === null ? null : JSON.stringify(attempt.blocker),
      attempt.outcome === null ? null : JSON.stringify(attempt.outcome),
      attempt.updatedAt,
      attempt.terminalAt,
      JSON.stringify(attempt),
      attempt.attemptId,
      expectedRevision,
      expectedFence,
    );
  if (result.changes !== 1) {
    throw new Error(`Attempt revision/fence conflict: ${attempt.attemptId}`);
  }
}

function insertDesiredStateCommand(
  database: Database.Database,
  command: SetDesiredStateCommandV1,
): void {
  database
    .prepare(
      `INSERT INTO commands(
         command_id, schema_version, kind, origin, issued_at, task_id, attempt_id, payload_json
       ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(
      command.commandId,
      command.schemaVersion,
      command.kind,
      command.origin,
      command.issuedAt,
      command.attemptId,
      JSON.stringify(command),
    );
}

function decodeLease(row: LeaseRow): LeaseRecord {
  return {
    leaseKey: row.lease_key,
    attemptId: row.attempt_id,
    ownerId: row.owner_id,
    fence: row.fence,
    revision: row.revision,
    acquiredAt: row.acquired_at,
    heartbeatAt: row.heartbeat_at,
    expiresAt: row.expires_at,
  };
}

function assertAttemptCanMutate(attempt: ExecutionAttemptV1): void {
  if (
    attempt.state === "succeeded" ||
    attempt.state === "failed" ||
    attempt.state === "cancelled"
  ) {
    failInvariant(`terminal attempt ${attempt.attemptId} is immutable`);
  }
}

export class AttemptDesiredStateRepository {
  public constructor(private readonly database: Database.Database) {}

  public findOriginalResult(commandIdInput: unknown): DesiredStateCommandResult | null {
    const commandId = CommandIdSchema.parse(commandIdInput);
    const row = this.database
      .prepare("SELECT payload_json FROM commands WHERE command_id = ?")
      .get(commandId) as Readonly<{ payload_json: string }> | undefined;
    if (row === undefined) return null;

    const command = parseStoredJson("commands", commandId, row.payload_json, (value) =>
      parseSetDesiredStateCommand(value),
    );
    const eventRows = this.database
      .prepare("SELECT * FROM events WHERE command_id = ? ORDER BY sequence")
      .all(commandId) as readonly EventRow[];
    if (eventRows.length !== 1 || eventRows[0] === undefined) {
      failInvariant(`desired-state command ${commandId} must have exactly one result event`);
    }
    const event = decodeEvent(eventRows[0]);
    if (event.type !== "attempt.desired-state-changed") {
      failInvariant(`desired-state command ${commandId} has the wrong result event type`);
    }
    return { command, event, duplicate: true };
  }

  public apply(input: ApplyDesiredStateCommandInput): DesiredStateCommandResult {
    const command = parseSetDesiredStateCommand(input.command);
    const expectedRevision = NonNegativeSafeIntegerSchema.parse(input.expectedRevision);
    const event = parseDesiredStateEvent(input.event);

    const apply = this.database.transaction((): DesiredStateCommandResult => {
      const original = this.findOriginalResult(command.commandId);
      if (original !== null) {
        assertJsonSame("duplicate command payload", command, original.command);
        return original;
      }

      const current = readAttempt(this.database, command.attemptId);
      assertAttemptCanMutate(current);
      assertSame("expected attempt revision", current.revision, expectedRevision);
      assertSame("desired-state event attemptId", event.attemptId, current.attemptId);
      assertSame("desired-state event commandId", event.commandId, command.commandId);
      assertSame("desired-state event fence", event.fence, current.fence);
      assertSame(
        "desired-state event sequence",
        event.sequence,
        nextEventSequence(this.database, current.attemptId),
      );
      assertSame("desired-state event from", event.data.from, current.desiredState);
      assertSame("desired-state event to", event.data.to, command.desiredState);
      assertSame("desired-state event reason", event.data.reason, command.reason);
      if (event.occurredAt <= current.updatedAt || event.occurredAt < command.issuedAt) {
        failInvariant(
          "desired-state event time must advance the attempt and not precede the command",
        );
      }
      validateEventCause(this.database, event);

      const next = assertAttemptSnapshotCoherence({
        ...current,
        desiredState: command.desiredState,
        revision: current.revision + 1,
        updatedAt: event.occurredAt,
      });
      insertDesiredStateCommand(this.database, command);
      updateAttempt(this.database, next, current.revision, current.fence);
      insertEvent(this.database, event);
      return { command, event, duplicate: false };
    });

    return apply.immediate();
  }
}

export class StepRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(stepIdInput: unknown): StepV1 | null {
    const stepId = StepIdSchema.parse(stepIdInput);
    const row = this.database.prepare("SELECT * FROM steps WHERE step_id = ?").get(stepId) as
      StepRow | undefined;
    return row === undefined ? null : decodeStep(row);
  }

  public listByAttempt(attemptIdInput: unknown): readonly StepV1[] {
    const attemptId = AttemptIdSchema.parse(attemptIdInput);
    const rows = this.database
      .prepare("SELECT * FROM steps WHERE attempt_id = ? ORDER BY ordinal")
      .all(attemptId) as readonly StepRow[];
    return rows.map(decodeStep);
  }

  public create(input: CreateStepInput): StepV1 {
    const step = assertStepSnapshotCoherence(input.step);
    const event = parseStepCreatedEvent(input.event);

    const create = this.database.transaction(() => {
      const attempt = readAttempt(this.database, step.attemptId);
      assertAttemptCanMutate(attempt);
      assertSame("initial step revision", step.revision, 0);
      assertSame("initial step state", step.state, "pending");
      assertSame("initial step fence", step.lastFence, attempt.fence);
      assertSame("step-created event attemptId", event.attemptId, attempt.attemptId);
      assertSame("step-created event fence", event.fence, attempt.fence);
      assertSame("step-created event commandId", event.commandId, null);
      assertSame(
        "step-created event sequence",
        event.sequence,
        nextEventSequence(this.database, attempt.attemptId),
      );
      assertSame("step-created event stepId", event.data.stepId, step.stepId);
      assertSame("step-created event ordinal", event.data.ordinal, step.ordinal);
      assertSame("step-created event operation", event.data.operation, step.operation);
      assertSame("step-created event inputDigest", event.data.inputDigest, step.inputDigest);
      validateEventCause(this.database, event);

      this.database
        .prepare(
          `INSERT INTO steps(
             step_id, schema_version, attempt_id, ordinal, operation, state, revision,
             last_fence, run_count, input_digest, output_digest, blocker_json,
             failure_json, started_at, finished_at, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          step.stepId,
          step.schemaVersion,
          step.attemptId,
          step.ordinal,
          step.operation,
          step.state,
          step.revision,
          step.lastFence,
          step.runCount,
          step.inputDigest,
          step.outputDigest,
          null,
          null,
          step.startedAt,
          step.finishedAt,
          JSON.stringify(step),
        );
      insertEvent(this.database, event);
      return step;
    });

    return create.immediate();
  }

  public transition(input: TransitionStepInput): StepV1 {
    const expectedRevision = NonNegativeSafeIntegerSchema.parse(input.expectedRevision);
    const fence = NonNegativeSafeIntegerSchema.parse(input.fence);
    const next = assertStepSnapshotCoherence(input.step);
    const event = parseStepStateChangedEvent(input.event);

    const transition = this.database.transaction(() => {
      const row = this.database
        .prepare("SELECT * FROM steps WHERE step_id = ?")
        .get(next.stepId) as StepRow | undefined;
      if (row === undefined) throw new Error(`Step does not exist: ${next.stepId}`);
      const current = decodeStep(row);
      const attempt = readAttempt(this.database, current.attemptId);
      assertAttemptCanMutate(attempt);
      assertSame("step mutation fence", fence, attempt.fence);
      assertSame("expected step revision", current.revision, expectedRevision);
      assertLegalStepStateTransition(current.state, next.state);
      assertSame("next step revision", next.revision, current.revision + 1);
      assertSame("immutable step attemptId", next.attemptId, current.attemptId);
      assertSame("immutable step ordinal", next.ordinal, current.ordinal);
      assertSame("immutable step operation", next.operation, current.operation);
      assertSame("immutable step inputDigest", next.inputDigest, current.inputDigest);
      assertSame("next step fence", next.lastFence, fence);

      if (next.state === "running") {
        assertSame("running step runCount", next.runCount, current.runCount + 1);
        if (current.state === "pending") {
          assertSame("first start timestamp", next.startedAt, event.occurredAt);
        } else {
          assertSame("retry preserves first start timestamp", next.startedAt, current.startedAt);
        }
      } else {
        assertSame("non-running transition runCount", next.runCount, current.runCount);
        assertSame("transition preserves start timestamp", next.startedAt, current.startedAt);
      }
      if (next.state === "succeeded" || next.state === "failed" || next.state === "cancelled") {
        assertSame("terminal step finish timestamp", next.finishedAt, event.occurredAt);
      }

      assertSame("step-state event attemptId", event.attemptId, current.attemptId);
      assertSame("step-state event fence", event.fence, fence);
      assertSame(
        "step-state event sequence",
        event.sequence,
        nextEventSequence(this.database, current.attemptId),
      );
      assertSame("step-state event stepId", event.data.stepId, current.stepId);
      assertSame("step-state event from", event.data.from, current.state);
      assertSame("step-state event to", event.data.to, next.state);
      assertSame("step-state event outputDigest", event.data.outputDigest, next.outputDigest);
      assertSame(
        "step-state event failureCode",
        event.data.failureCode,
        next.failure === null ? null : next.failure.code,
      );
      validateEventCause(this.database, event);

      const result = this.database
        .prepare(
          `UPDATE steps SET
             state = ?, revision = ?, last_fence = ?, run_count = ?, output_digest = ?,
             blocker_json = ?, failure_json = ?, started_at = ?, finished_at = ?, payload_json = ?
           WHERE step_id = ? AND revision = ?`,
        )
        .run(
          next.state,
          next.revision,
          next.lastFence,
          next.runCount,
          next.outputDigest,
          next.blocker === null ? null : JSON.stringify(next.blocker),
          next.failure === null ? null : JSON.stringify(next.failure),
          next.startedAt,
          next.finishedAt,
          JSON.stringify(next),
          next.stepId,
          expectedRevision,
        );
      if (result.changes !== 1) {
        throw new Error(`Step revision conflict: ${next.stepId}`);
      }
      insertEvent(this.database, event);
      return next;
    });

    return transition.immediate();
  }
}

export class LeaseRepository {
  public constructor(private readonly database: Database.Database) {}

  public findByKey(leaseKeyInput: unknown): LeaseRecord | null {
    const leaseKey = parseLeaseKey(leaseKeyInput);
    const row = this.database.prepare("SELECT * FROM leases WHERE lease_key = ?").get(leaseKey) as
      LeaseRow | undefined;
    return row === undefined ? null : decodeLease(row);
  }

  public claim(input: ClaimLeaseInput): ClaimLeaseResult {
    const leaseKey = parseLeaseKey(input.leaseKey);
    const attemptId = AttemptIdSchema.parse(input.attemptId);
    const ownerId = parseOwnerId(input.ownerId);
    const expectedRevision = NonNegativeSafeIntegerSchema.parse(input.expectedAttemptRevision);
    const acquiredAt = IsoInstantSchema.parse(input.acquiredAt);
    const expiresAt = IsoInstantSchema.parse(input.expiresAt);
    const event = parseFenceEvent(input.event);
    if (expiresAt <= acquiredAt) failInvariant("lease expiresAt must follow acquiredAt");

    const claim = this.database.transaction((): ClaimLeaseResult => {
      const current = readAttempt(this.database, attemptId);
      assertAttemptCanMutate(current);
      assertSame("lease expected attempt revision", current.revision, expectedRevision);
      if (acquiredAt <= current.updatedAt) {
        failInvariant("lease acquisition must advance attempt updatedAt");
      }

      const active = this.database
        .prepare(
          `SELECT * FROM leases
           WHERE attempt_id = ? AND expires_at > ?
           ORDER BY lease_key LIMIT 1`,
        )
        .get(attemptId, acquiredAt) as LeaseRow | undefined;
      if (active !== undefined) {
        throw new Error(
          `Attempt lease is still active: ${active.lease_key} owned by ${active.owner_id}`,
        );
      }

      const previousLease = this.database
        .prepare("SELECT * FROM leases WHERE lease_key = ?")
        .get(leaseKey) as LeaseRow | undefined;
      if (previousLease !== undefined && previousLease.expires_at > acquiredAt) {
        throw new Error(
          `Lease key is still active: ${leaseKey} owned by ${previousLease.owner_id}`,
        );
      }
      const newFence = NonNegativeSafeIntegerSchema.parse(current.fence + 1);
      assertSame("fence event attemptId", event.attemptId, current.attemptId);
      assertSame("fence event commandId", event.commandId, null);
      assertSame(
        "fence event sequence",
        event.sequence,
        nextEventSequence(this.database, current.attemptId),
      );
      assertSame("fence event occurredAt", event.occurredAt, acquiredAt);
      assertSame("fence event envelope fence", event.fence, newFence);
      assertSame("fence event previousFence", event.data.previousFence, current.fence);
      assertSame("fence event newFence", event.data.newFence, newFence);
      assertSame("fence event ownerId", event.data.ownerId, ownerId);
      validateEventCause(this.database, event);

      const nextAttempt = assertAttemptSnapshotCoherence({
        ...current,
        fence: newFence,
        revision: current.revision + 1,
        updatedAt: acquiredAt,
      });
      updateAttempt(this.database, nextAttempt, current.revision, current.fence);

      const leaseRevision = NonNegativeSafeIntegerSchema.parse((previousLease?.revision ?? -1) + 1);
      this.database
        .prepare(
          `INSERT INTO leases(
             lease_key, attempt_id, owner_id, fence, revision,
             acquired_at, heartbeat_at, expires_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(lease_key) DO UPDATE SET
             attempt_id = excluded.attempt_id,
             owner_id = excluded.owner_id,
             fence = excluded.fence,
             revision = excluded.revision,
             acquired_at = excluded.acquired_at,
             heartbeat_at = excluded.heartbeat_at,
             expires_at = excluded.expires_at`,
        )
        .run(
          leaseKey,
          attemptId,
          ownerId,
          newFence,
          leaseRevision,
          acquiredAt,
          acquiredAt,
          expiresAt,
        );
      insertEvent(this.database, event);
      const lease = this.findByKey(leaseKey);
      if (lease === null) failInvariant("claimed lease was not persisted");
      return { lease, attempt: nextAttempt, event };
    });

    return claim.immediate();
  }

  public heartbeat(input: HeartbeatLeaseInput): LeaseRecord {
    const leaseKey = parseLeaseKey(input.leaseKey);
    const ownerId = parseOwnerId(input.ownerId);
    const fence = NonNegativeSafeIntegerSchema.parse(input.fence);
    const expectedRevision = NonNegativeSafeIntegerSchema.parse(input.expectedRevision);
    const heartbeatAt = IsoInstantSchema.parse(input.heartbeatAt);
    const expiresAt = IsoInstantSchema.parse(input.expiresAt);

    const heartbeat = this.database.transaction(() => {
      const row = this.database
        .prepare("SELECT * FROM leases WHERE lease_key = ?")
        .get(leaseKey) as LeaseRow | undefined;
      if (row === undefined) throw new Error(`Lease does not exist: ${leaseKey}`);
      const lease = decodeLease(row);
      assertSame("lease heartbeat owner", ownerId, lease.ownerId);
      assertSame("lease heartbeat fence", fence, lease.fence);
      assertSame("lease heartbeat revision", expectedRevision, lease.revision);
      if (lease.attemptId === null) failInvariant("attempt lease is missing attemptId");
      const attempt = readAttempt(this.database, lease.attemptId);
      assertSame("lease heartbeat current attempt fence", fence, attempt.fence);
      if (heartbeatAt <= lease.heartbeatAt) {
        failInvariant("lease heartbeatAt must advance");
      }
      if (heartbeatAt >= lease.expiresAt) {
        failInvariant("an expired lease cannot be revived by heartbeat");
      }
      if (expiresAt <= heartbeatAt) {
        failInvariant("lease expiresAt must follow heartbeatAt");
      }
      if (expiresAt <= lease.expiresAt) {
        failInvariant("lease heartbeat must extend expiresAt");
      }

      const nextRevision = NonNegativeSafeIntegerSchema.parse(expectedRevision + 1);

      const result = this.database
        .prepare(
          `UPDATE leases SET revision = ?, heartbeat_at = ?, expires_at = ?
           WHERE lease_key = ? AND owner_id = ? AND fence = ? AND revision = ?`,
        )
        .run(nextRevision, heartbeatAt, expiresAt, leaseKey, ownerId, fence, expectedRevision);
      if (result.changes !== 1) throw new Error(`Lease revision/fence conflict: ${leaseKey}`);
      const updated = this.findByKey(leaseKey);
      if (updated === null) failInvariant("heartbeat lease disappeared");
      return updated;
    });

    return heartbeat.immediate();
  }

  public release(input: ReleaseLeaseInput): LeaseRecord {
    const leaseKey = parseLeaseKey(input.leaseKey);
    const ownerId = parseOwnerId(input.ownerId);
    const fence = NonNegativeSafeIntegerSchema.parse(input.fence);

    const release = this.database.transaction(() => {
      const row = this.database
        .prepare("SELECT * FROM leases WHERE lease_key = ?")
        .get(leaseKey) as LeaseRow | undefined;
      if (row === undefined) throw new Error(`Lease does not exist: ${leaseKey}`);
      const lease = decodeLease(row);
      assertSame("lease release owner", ownerId, lease.ownerId);
      assertSame("lease release fence", fence, lease.fence);
      if (lease.attemptId === null) failInvariant("attempt lease is missing attemptId");
      const attempt = readAttempt(this.database, lease.attemptId);
      assertSame("lease release current attempt fence", fence, attempt.fence);
      const result = this.database
        .prepare("DELETE FROM leases WHERE lease_key = ? AND owner_id = ? AND fence = ?")
        .run(leaseKey, ownerId, fence);
      if (result.changes !== 1) throw new Error(`Lease fence conflict: ${leaseKey}`);
      return lease;
    });

    return release.immediate();
  }
}
