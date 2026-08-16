import {
  IsoInstantSchema,
  RoomBudgetV1Schema,
  RoomChatMessageV1Schema,
  RoomCreateSpecV1Schema,
  RoomDayKeySchema,
  RoomGrantOutcomeV1Schema,
  RoomGrantV1Schema,
  RoomIdSchema,
  RoomMessageV1Schema,
  RoomParticipantV1Schema,
  RoomPersonaSchema,
  RoomProviderSchema,
  RoomSystemMessageV1Schema,
  RoomTriggerV1Schema,
  RoomV1Schema,
  type IsoInstant,
  type RoomAgentErrorCodeV1,
  type RoomBudgetV1,
  type RoomChatMessageV1,
  type RoomCreateSpecV1,
  type RoomDayKey,
  type RoomGrantId,
  type RoomGrantOutcomeV1,
  type RoomGrantV1,
  type RoomHumanHandle,
  type RoomId,
  type RoomMessageId,
  type RoomMessageV1,
  type RoomParticipantV1,
  type RoomPersona,
  type RoomProvider,
  type RoomSystemCodeV1,
  type RoomSystemMessageV1,
  type RoomTriggerV1,
  type RoomV1,
} from "@app-factory/contracts";
import { canonicalJson } from "@app-factory/kernel";
import type Database from "better-sqlite3";

import { RoomError, RoomHeadMovedError } from "./errors.js";
import { parseMentions } from "./mentions.js";

const TRIGGER_PRIORITY = {
  "human-message": 3,
  "factory-event": 2,
  "agent-message": 1,
  wake: 0,
} as const;

type RoomRow = Readonly<{
  room_id: string;
  title: string;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  unattended_enabled: number;
  agent_cooldown_events: number;
  head_sequence: number;
  head_message_id: string | null;
  last_human_at: string | null;
  human_typing_until: string | null;
  round_counter: number;
  active_grant_id: string | null;
  pending_trigger_json: string | null;
  create_spec_json: string;
}>;

type ParticipantRow = Readonly<{
  persona: string;
  provider: string;
  display_name: string;
  position: number;
  benched_until: string | null;
  bench_reason: string | null;
}>;

type BudgetRow = Readonly<{
  day_key: string;
  daily_ceiling_tokens: number;
  unattended_daily_ceiling_tokens: number;
  max_tokens_per_reply: number;
  spent_tokens: number;
  reserved_tokens: number;
  unattended_spent_tokens: number;
}>;

type GrantRow = Readonly<{
  grant_id: string;
  room_id: string;
  round_number: number;
  persona: string;
  head_sequence: number;
  state: string;
  owner_pid: number;
  worker_pid: number | null;
  reserved_tokens: number;
  lease_expires_at: string;
  created_at: string;
  updated_at: string;
  held_text: string | null;
  outcome_json: string | null;
}>;

type MessageRow = Readonly<{ payload_json: string }>;

export type CreatedRoom = Readonly<{ room: RoomV1; duplicate: boolean }>;

export type AppendHumanMessageInput = Readonly<{
  roomId: RoomId;
  messageId: RoomMessageId;
  handle: RoomHumanHandle;
  body: string;
  now: IsoInstant;
}>;

export type AppendedHumanMessage = Readonly<{
  message: RoomChatMessageV1;
  room: RoomV1;
  /** True when this messageId was already appended with identical content (idempotent retry). */
  duplicate: boolean;
}>;

export type SystemLineInput = Readonly<{
  roomId: RoomId;
  messageId: RoomMessageId;
  code: RoomSystemCodeV1;
  body: string;
  now: IsoInstant;
  roundNumber?: number | null;
  grantId?: RoomGrantId | null;
  persona?: RoomPersona | null;
  errorCode?: RoomAgentErrorCodeV1 | null;
  benchedUntil?: IsoInstant | null;
  retryAt?: IsoInstant | null;
}>;

export type CreateGrantInput = Readonly<{
  grantId: RoomGrantId;
  roomId: RoomId;
  roundNumber: number;
  persona: RoomPersona;
  ownerPid: number;
  leaseExpiresAt: IsoInstant;
  now: IsoInstant;
  /** Which daily ceiling gates this grant (dormant rooms use the unattended ceiling). */
  unattended: boolean;
}>;

export type CommitGrantInput = Readonly<{
  grantId: RoomGrantId;
  messageId: RoomMessageId;
  expectedHeadSequence: number;
  body: string;
  tokensUsed: number;
  revalidated: boolean;
  unattended: boolean;
  now: IsoInstant;
}>;

export type CommittedGrant = Readonly<{ grant: RoomGrantV1; message: RoomChatMessageV1 }>;

export type FinishGrantInput = Readonly<{
  grantId: RoomGrantId;
  outcome: Exclude<RoomGrantOutcomeV1, { kind: "committed" }>;
  tokensUsed: number;
  unattended: boolean;
  now: IsoInstant;
  systemLine: Omit<SystemLineInput, "roomId" | "now" | "grantId"> | null;
}>;

export type BudgetGate = Readonly<{
  admitted: boolean;
  ceilingTokens: number;
  availableTokens: number;
}>;

function parseRoomId(value: unknown): RoomId {
  return RoomIdSchema.parse(value);
}

function iso(value: string): IsoInstant {
  return IsoInstantSchema.parse(value);
}

export function dayKeyOf(instant: IsoInstant): RoomDayKey {
  return RoomDayKeySchema.parse(instant.slice(0, 10));
}

function assertPositiveInteger(label: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function assertNonNegativeInteger(label: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

/**
 * The SQLite rows the moderator resumes from. Every mutation runs in an
 * IMMEDIATE transaction; every read re-parses through the contract schema so
 * a corrupted row fails closed instead of leaking a malformed shape.
 */
export class RoomRepository {
  readonly #database: Database.Database;

  public constructor(database: Database.Database) {
    this.#database = database;
  }

  public createRoom(specInput: unknown, now: IsoInstant): CreatedRoom {
    const spec: RoomCreateSpecV1 = RoomCreateSpecV1Schema.parse(specInput);
    const create = this.#database.transaction((): CreatedRoom => {
      const existing = this.#database
        .prepare("SELECT create_spec_json FROM rooms WHERE room_id = ?")
        .get(spec.roomId) as Readonly<{ create_spec_json: string }> | undefined;
      if (existing !== undefined) {
        if (existing.create_spec_json !== canonicalJson(spec)) {
          throw new RoomError(
            "room.identity-conflict",
            `Room ${spec.roomId} already exists with a different specification.`,
            false,
          );
        }
        return { room: this.requireRoom(spec.roomId), duplicate: true };
      }
      this.#database
        .prepare(
          `INSERT INTO rooms(
             room_id, schema_version, title, project_id, created_at, updated_at,
             unattended_enabled, agent_cooldown_events, create_spec_json
           ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          spec.roomId,
          spec.title,
          spec.projectId,
          now,
          now,
          spec.unattendedEnabled ? 1 : 0,
          spec.agentCooldownEvents,
          canonicalJson(spec),
        );
      const insertParticipant = this.#database.prepare(
        `INSERT INTO room_participants(room_id, persona, provider, display_name, position)
         VALUES (?, ?, ?, ?, ?)`,
      );
      spec.participants.forEach((participant, position) => {
        insertParticipant.run(
          spec.roomId,
          participant.persona,
          participant.provider,
          participant.displayName,
          position,
        );
      });
      this.#database
        .prepare(
          `INSERT INTO room_budgets(
             room_id, day_key, daily_ceiling_tokens, unattended_daily_ceiling_tokens,
             max_tokens_per_reply, spent_tokens, reserved_tokens, unattended_spent_tokens, updated_at
           ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?)`,
        )
        .run(
          spec.roomId,
          dayKeyOf(now),
          spec.budget.dailyCeilingTokens,
          spec.budget.unattendedDailyCeilingTokens,
          spec.budget.maxTokensPerReply,
          now,
        );
      return { room: this.requireRoom(spec.roomId), duplicate: false };
    });
    return create.immediate();
  }

  public findRoom(roomIdInput: unknown): RoomV1 | null {
    const roomId = parseRoomId(roomIdInput);
    const row = this.#database.prepare("SELECT * FROM rooms WHERE room_id = ?").get(roomId) as
      RoomRow | undefined;
    if (row === undefined) return null;
    return this.#assembleRoom(row);
  }

  public requireRoom(roomIdInput: unknown): RoomV1 {
    const room = this.findRoom(roomIdInput);
    if (room === null) {
      throw new RoomError("room.not-found", `No room exists for ID ${String(roomIdInput)}.`, false);
    }
    return room;
  }

  public listRooms(limit: number): readonly RoomV1[] {
    assertPositiveInteger("limit", limit);
    const rows = this.#database
      .prepare("SELECT * FROM rooms ORDER BY updated_at DESC, room_id DESC LIMIT ?")
      .all(limit) as readonly RoomRow[];
    return rows.map((row) => this.#assembleRoom(row));
  }

  public listRoomIdsWithPendingTriggers(): readonly RoomId[] {
    const rows = this.#database
      .prepare("SELECT room_id FROM rooms WHERE pending_trigger_json IS NOT NULL ORDER BY room_id")
      .all() as readonly Readonly<{ room_id: string }>[];
    return rows.map((row) => parseRoomId(row.room_id));
  }

  public listMessages(
    roomIdInput: unknown,
    afterSequence: number,
    limit: number,
  ): readonly RoomMessageV1[] {
    const roomId = parseRoomId(roomIdInput);
    assertNonNegativeInteger("afterSequence", afterSequence);
    assertPositiveInteger("limit", limit);
    const rows = this.#database
      .prepare(
        `SELECT payload_json FROM room_messages
         WHERE room_id = ? AND sequence > ?
         ORDER BY sequence ASC LIMIT ?`,
      )
      .all(roomId, afterSequence, limit) as readonly MessageRow[];
    return rows.map((row) => RoomMessageV1Schema.parse(JSON.parse(row.payload_json)));
  }

  /** The most recent `count` messages, oldest first. */
  public listRecentMessages(roomIdInput: unknown, count: number): readonly RoomMessageV1[] {
    const roomId = parseRoomId(roomIdInput);
    assertPositiveInteger("count", count);
    const rows = this.#database
      .prepare(
        `SELECT payload_json FROM room_messages
         WHERE room_id = ? ORDER BY sequence DESC LIMIT ?`,
      )
      .all(roomId, count) as readonly MessageRow[];
    return rows.map((row) => RoomMessageV1Schema.parse(JSON.parse(row.payload_json))).reverse();
  }

  public findMessage(roomIdInput: unknown, sequence: number): RoomMessageV1 | null {
    const roomId = parseRoomId(roomIdInput);
    assertPositiveInteger("sequence", sequence);
    const row = this.#database
      .prepare("SELECT payload_json FROM room_messages WHERE room_id = ? AND sequence = ?")
      .get(roomId, sequence) as MessageRow | undefined;
    return row === undefined ? null : RoomMessageV1Schema.parse(JSON.parse(row.payload_json));
  }

  /**
   * The human's post is the only write that may land while a generation is
   * in flight; it does not touch the room lock. It records attendance,
   * clears the typing signal, and queues a human-message trigger so the
   * moderator's next round is the human's, not an agent chain's.
   */
  public appendHumanMessage(input: AppendHumanMessageInput): AppendedHumanMessage {
    const append = this.#database.transaction((): AppendedHumanMessage => {
      const room = this.requireRoom(input.roomId);
      const existing = this.#findMessageById(input.messageId);
      if (existing !== null) {
        // The message id is the caller's idempotency key (the daemon derives it
        // from the command id): an identical retry returns the original append,
        // a different payload under the same id is refused.
        if (
          existing.kind !== "message" ||
          existing.author.kind !== "human" ||
          existing.roomId !== room.roomId ||
          existing.author.handle !== input.handle ||
          existing.body !== input.body
        ) {
          throw new RoomError(
            "room.identity-conflict",
            `Message ${input.messageId} already exists with different content.`,
            false,
          );
        }
        return { message: existing, room, duplicate: true };
      }
      const sequence = room.headSequence + 1;
      const message = RoomChatMessageV1Schema.parse({
        schemaVersion: 1,
        roomId: room.roomId,
        messageId: input.messageId,
        sequence,
        occurredAt: input.now,
        roundNumber: null,
        grantId: null,
        kind: "message",
        author: { kind: "human", handle: input.handle },
        body: input.body,
        mentions: parseMentions(
          input.body,
          room.participants.map((participant) => participant.persona),
        ),
      });
      this.#insertMessage(message);
      this.#database
        .prepare(
          `UPDATE rooms SET last_human_at = ?, human_typing_until = NULL, updated_at = ?
           WHERE room_id = ?`,
        )
        .run(input.now, input.now, room.roomId);
      this.#mergePendingTrigger(room.roomId, {
        kind: "human-message",
        requestedAt: input.now,
        sourceSequence: sequence,
      });
      return { message, room: this.requireRoom(room.roomId), duplicate: false };
    });
    return append.immediate();
  }

  #findMessageById(messageId: RoomMessageId): RoomMessageV1 | null {
    const row = this.#database
      .prepare("SELECT payload_json FROM room_messages WHERE message_id = ?")
      .get(messageId) as MessageRow | undefined;
    return row === undefined ? null : RoomMessageV1Schema.parse(JSON.parse(row.payload_json));
  }

  public appendSystemLine(input: SystemLineInput): RoomSystemMessageV1 {
    const append = this.#database.transaction((): RoomSystemMessageV1 => {
      const room = this.requireRoom(input.roomId);
      const message = RoomSystemMessageV1Schema.parse({
        schemaVersion: 1,
        roomId: room.roomId,
        messageId: input.messageId,
        sequence: room.headSequence + 1,
        occurredAt: input.now,
        roundNumber: input.roundNumber ?? null,
        grantId: input.grantId ?? null,
        kind: "system",
        code: input.code,
        body: input.body,
        persona: input.persona ?? null,
        errorCode: input.errorCode ?? null,
        benchedUntil: input.benchedUntil ?? null,
        retryAt: input.retryAt ?? null,
      });
      this.#insertMessage(message);
      return message;
    });
    return append.immediate();
  }

  /** Records a factory event in the transcript and queues a factory-event trigger. */
  public appendFactoryEvent(
    input: Readonly<{ roomId: RoomId; messageId: RoomMessageId; body: string; now: IsoInstant }>,
  ): RoomSystemMessageV1 {
    const append = this.#database.transaction((): RoomSystemMessageV1 => {
      const message = this.appendSystemLine({
        roomId: input.roomId,
        messageId: input.messageId,
        code: "factory-event",
        body: input.body,
        now: input.now,
      });
      this.#mergePendingTrigger(input.roomId, {
        kind: "factory-event",
        requestedAt: input.now,
        sourceSequence: message.sequence,
      });
      return message;
    });
    return append.immediate();
  }

  public setHumanTyping(roomIdInput: unknown, typingUntil: IsoInstant): RoomV1 {
    const roomId = parseRoomId(roomIdInput);
    const update = this.#database.transaction((): RoomV1 => {
      this.requireRoom(roomId);
      this.#database
        .prepare("UPDATE rooms SET human_typing_until = ? WHERE room_id = ?")
        .run(typingUntil, roomId);
      return this.requireRoom(roomId);
    });
    return update.immediate();
  }

  public setPendingTrigger(roomIdInput: unknown, trigger: RoomTriggerV1): void {
    const roomId = parseRoomId(roomIdInput);
    const update = this.#database.transaction(() => {
      this.requireRoom(roomId);
      this.#mergePendingTrigger(roomId, RoomTriggerV1Schema.parse(trigger));
    });
    update.immediate();
  }

  /** Atomically reads and clears the pending trigger. */
  public takePendingTrigger(roomIdInput: unknown): RoomTriggerV1 | null {
    const roomId = parseRoomId(roomIdInput);
    const take = this.#database.transaction((): RoomTriggerV1 | null => {
      const room = this.requireRoom(roomId);
      if (room.pendingTrigger === null) return null;
      this.#database
        .prepare("UPDATE rooms SET pending_trigger_json = NULL WHERE room_id = ?")
        .run(roomId);
      return room.pendingTrigger;
    });
    return take.immediate();
  }

  public beginRound(roomIdInput: unknown): number {
    const roomId = parseRoomId(roomIdInput);
    const begin = this.#database.transaction((): number => {
      const room = this.requireRoom(roomId);
      const roundNumber = room.roundCounter + 1;
      this.#database
        .prepare("UPDATE rooms SET round_counter = ? WHERE room_id = ?")
        .run(roundNumber, roomId);
      return roundNumber;
    });
    return begin.immediate();
  }

  /** Resets the day's spend when the UTC day rolled over; reservations survive (they are in flight). */
  public rolloverBudget(roomIdInput: unknown, now: IsoInstant): RoomBudgetV1 {
    const roomId = parseRoomId(roomIdInput);
    const rollover = this.#database.transaction((): RoomBudgetV1 => {
      const budget = this.#requireBudget(roomId);
      const today = dayKeyOf(now);
      if (budget.dayKey === today) return budget;
      this.#database
        .prepare(
          `UPDATE room_budgets
           SET day_key = ?, spent_tokens = 0, unattended_spent_tokens = 0, updated_at = ?
           WHERE room_id = ?`,
        )
        .run(today, now, roomId);
      return this.#requireBudget(roomId);
    });
    return rollover.immediate();
  }

  public evaluateBudgetGate(roomIdInput: unknown, unattended: boolean): BudgetGate {
    const budget = this.#requireBudget(parseRoomId(roomIdInput));
    return RoomRepository.#gate(budget, unattended);
  }

  static #gate(budget: RoomBudgetV1, unattended: boolean): BudgetGate {
    const dailyAvailable = budget.dailyCeilingTokens - budget.spentTokens - budget.reservedTokens;
    const unattendedAvailable =
      budget.unattendedDailyCeilingTokens - budget.unattendedSpentTokens - budget.reservedTokens;
    const availableTokens = unattended
      ? Math.min(dailyAvailable, unattendedAvailable)
      : dailyAvailable;
    return {
      admitted: availableTokens >= budget.maxTokensPerReply,
      ceilingTokens: unattended
        ? Math.min(budget.dailyCeilingTokens, budget.unattendedDailyCeilingTokens)
        : budget.dailyCeilingTokens,
      availableTokens: Math.max(0, availableTokens),
    };
  }

  /**
   * Issues the room's single in-flight grant: takes the room lock, stamps
   * the current head, and debits the budget reservation, all atomically.
   * Refuses (typed) when the room is locked, the persona is benched, or the
   * reservation would breach the ceiling. The partial unique index on
   * `room_grants` backs the lock even if two callers race this method.
   */
  public createGrant(input: CreateGrantInput): RoomGrantV1 {
    assertPositiveInteger("roundNumber", input.roundNumber);
    assertPositiveInteger("ownerPid", input.ownerPid);
    const create = this.#database.transaction((): RoomGrantV1 => {
      const room = this.requireRoom(input.roomId);
      if (room.activeGrantId !== null) {
        throw new RoomError(
          "room.generation-in-flight",
          `Room ${room.roomId} already has grant ${room.activeGrantId} in flight.`,
          true,
        );
      }
      const participant = room.participants.find(({ persona }) => persona === input.persona);
      if (participant === undefined) {
        throw new RoomError(
          "room.unknown-persona",
          `Persona ${input.persona} is not a participant of room ${room.roomId}.`,
          false,
        );
      }
      if (participant.benchedUntil !== null && participant.benchedUntil > input.now) {
        throw new RoomError(
          "room.persona-benched",
          `Persona ${input.persona} is benched until ${participant.benchedUntil}.`,
          true,
        );
      }
      const budget = this.rolloverBudget(room.roomId, input.now);
      const gate = RoomRepository.#gate(budget, input.unattended);
      if (!gate.admitted) {
        throw new RoomError(
          "room.budget-exhausted",
          `Room ${room.roomId} cannot reserve ${String(budget.maxTokensPerReply)} tokens; ${String(gate.availableTokens)} available under a ${String(gate.ceilingTokens)} ceiling.`,
          true,
        );
      }
      const grant = RoomGrantV1Schema.parse({
        schemaVersion: 1,
        grantId: input.grantId,
        roomId: room.roomId,
        roundNumber: input.roundNumber,
        persona: input.persona,
        headSequence: room.headSequence,
        state: "active",
        ownerPid: input.ownerPid,
        workerPid: null,
        reservedTokens: budget.maxTokensPerReply,
        leaseExpiresAt: input.leaseExpiresAt,
        createdAt: input.now,
        updatedAt: input.now,
        outcome: null,
      });
      this.#database
        .prepare(
          `INSERT INTO room_grants(
             grant_id, schema_version, room_id, round_number, persona, head_sequence, state,
             owner_pid, worker_pid, reserved_tokens, lease_expires_at, created_at, updated_at,
             held_text, outcome_json
           ) VALUES (?, 1, ?, ?, ?, ?, 'active', ?, NULL, ?, ?, ?, ?, NULL, NULL)`,
        )
        .run(
          grant.grantId,
          grant.roomId,
          grant.roundNumber,
          grant.persona,
          grant.headSequence,
          grant.ownerPid,
          grant.reservedTokens,
          grant.leaseExpiresAt,
          grant.createdAt,
          grant.updatedAt,
        );
      this.#database
        .prepare("UPDATE rooms SET active_grant_id = ?, updated_at = ? WHERE room_id = ?")
        .run(grant.grantId, input.now, room.roomId);
      this.#database
        .prepare(
          `UPDATE room_budgets SET reserved_tokens = reserved_tokens + ?, updated_at = ?
           WHERE room_id = ?`,
        )
        .run(grant.reservedTokens, input.now, room.roomId);
      return this.requireGrant(grant.grantId);
    });
    return create.immediate();
  }

  public findGrant(grantIdInput: unknown): RoomGrantV1 | null {
    const row = this.#database
      .prepare("SELECT * FROM room_grants WHERE grant_id = ?")
      .get(String(grantIdInput)) as GrantRow | undefined;
    return row === undefined ? null : RoomRepository.#parseGrant(row);
  }

  public requireGrant(grantIdInput: unknown): RoomGrantV1 {
    const grant = this.findGrant(grantIdInput);
    if (grant === null) {
      throw new RoomError(
        "room.grant-not-found",
        `No grant exists for ID ${String(grantIdInput)}.`,
        false,
      );
    }
    return grant;
  }

  public listGrants(roomIdInput: unknown): readonly RoomGrantV1[] {
    const roomId = parseRoomId(roomIdInput);
    const rows = this.#database
      .prepare("SELECT * FROM room_grants WHERE room_id = ? ORDER BY round_number, created_at")
      .all(roomId) as readonly GrantRow[];
    return rows.map((row) => RoomRepository.#parseGrant(row));
  }

  /** Grants still holding a room lock (`active` or `held`), oldest first. */
  public listOpenGrants(): readonly RoomGrantV1[] {
    const rows = this.#database
      .prepare(
        `SELECT * FROM room_grants WHERE state IN ('active', 'held')
         ORDER BY created_at, grant_id`,
      )
      .all() as readonly GrantRow[];
    return rows.map((row) => RoomRepository.#parseGrant(row));
  }

  public recordWorkerPid(grantIdInput: unknown, workerPid: number, now: IsoInstant): void {
    assertPositiveInteger("workerPid", workerPid);
    const update = this.#database.transaction(() => {
      const grant = this.requireGrant(grantIdInput);
      if (grant.state !== "active" && grant.state !== "held") return;
      this.#database
        .prepare("UPDATE room_grants SET worker_pid = ?, updated_at = ? WHERE grant_id = ?")
        .run(workerPid, now, grant.grantId);
    });
    update.immediate();
  }

  /**
   * Compare-and-swap commit: the agent message is appended only if the head
   * is still the one the caller expects; otherwise nothing is written and
   * `RoomHeadMovedError` carries the current head so the caller can decide
   * whether a human posted (revalidate) or only system lines did (retry).
   */
  public commitGrant(input: CommitGrantInput): CommittedGrant {
    assertNonNegativeInteger("tokensUsed", input.tokensUsed);
    const commit = this.#database.transaction((): CommittedGrant => {
      const grant = this.requireGrant(input.grantId);
      const room = this.requireRoom(grant.roomId);
      this.#assertGrantOpen(grant, room);
      if (room.headSequence !== input.expectedHeadSequence) {
        throw new RoomHeadMovedError(input.expectedHeadSequence, room.headSequence);
      }
      const message = RoomChatMessageV1Schema.parse({
        schemaVersion: 1,
        roomId: room.roomId,
        messageId: input.messageId,
        sequence: room.headSequence + 1,
        occurredAt: input.now,
        roundNumber: grant.roundNumber,
        grantId: grant.grantId,
        kind: "message",
        author: { kind: "agent", persona: grant.persona },
        body: input.body,
        mentions: parseMentions(
          input.body,
          room.participants.map((participant) => participant.persona),
        ),
      });
      this.#insertMessage(message);
      const outcome: RoomGrantOutcomeV1 = {
        kind: "committed",
        messageSequence: message.sequence,
        tokensUsed: input.tokensUsed,
        revalidated: input.revalidated,
      };
      this.#closeGrant(
        grant,
        room,
        "committed",
        outcome,
        input.tokensUsed,
        input.unattended,
        input.now,
      );
      return { grant: this.requireGrant(grant.grantId), message };
    });
    return commit.immediate();
  }

  /** Durably parks a completion whose head moved under a human post while the revalidator is consulted. */
  public holdGrant(grantIdInput: unknown, bufferedBody: string, now: IsoInstant): RoomGrantV1 {
    if (bufferedBody.length < 1 || bufferedBody.length > 20_000) {
      throw new TypeError("bufferedBody must be 1-20000 characters");
    }
    const hold = this.#database.transaction((): RoomGrantV1 => {
      const grant = this.requireGrant(grantIdInput);
      const room = this.requireRoom(grant.roomId);
      this.#assertGrantOpen(grant, room);
      this.#database
        .prepare(
          `UPDATE room_grants SET state = 'held', held_text = ?, updated_at = ? WHERE grant_id = ?`,
        )
        .run(bufferedBody, now, grant.grantId);
      return this.requireGrant(grant.grantId);
    });
    return hold.immediate();
  }

  /**
   * Closes an open grant without posting an agent message (pass, typed
   * failure, revalidation drop, or orphan sweep): credits the reservation,
   * releases the room lock, and optionally appends the legible system line
   * in the same transaction.
   */
  public finishGrant(input: FinishGrantInput): RoomGrantV1 {
    assertNonNegativeInteger("tokensUsed", input.tokensUsed);
    const finish = this.#database.transaction((): RoomGrantV1 => {
      const grant = this.requireGrant(input.grantId);
      const room = this.requireRoom(grant.roomId);
      this.#assertGrantOpen(grant, room);
      const state = RoomRepository.#stateForOutcome(input.outcome);
      this.#closeGrant(
        grant,
        room,
        state,
        input.outcome,
        input.tokensUsed,
        input.unattended,
        input.now,
      );
      if (input.systemLine !== null) {
        this.appendSystemLine({
          ...input.systemLine,
          roomId: room.roomId,
          grantId: grant.grantId,
          now: input.now,
        });
      }
      return this.requireGrant(grant.grantId);
    });
    return finish.immediate();
  }

  public benchPersona(
    roomIdInput: unknown,
    persona: RoomPersona,
    benchedUntil: IsoInstant,
    reason: RoomAgentErrorCodeV1,
  ): void {
    const roomId = parseRoomId(roomIdInput);
    const result = this.#database
      .prepare(
        `UPDATE room_participants SET benched_until = ?, bench_reason = ?
         WHERE room_id = ? AND persona = ?
           AND (benched_until IS NULL OR benched_until < ?)`,
      )
      .run(benchedUntil, reason, roomId, persona, benchedUntil);
    if (result.changes === 0 && !this.#participantExists(roomId, persona)) {
      throw new RoomError(
        "room.unknown-persona",
        `Persona ${persona} is not a participant of room ${roomId}.`,
        false,
      );
    }
  }

  /** Rate limits are provider-wide: bench every persona on the provider, in every room, until reset. */
  public benchProvider(
    provider: RoomProvider,
    benchedUntil: IsoInstant,
    reason: RoomAgentErrorCodeV1,
  ): number {
    const result = this.#database
      .prepare(
        `UPDATE room_participants SET benched_until = ?, bench_reason = ?
         WHERE provider = ? AND (benched_until IS NULL OR benched_until < ?)`,
      )
      .run(benchedUntil, reason, RoomProviderSchema.parse(provider), benchedUntil);
    return result.changes;
  }

  #participantExists(roomId: RoomId, persona: RoomPersona): boolean {
    return (
      this.#database
        .prepare("SELECT 1 FROM room_participants WHERE room_id = ? AND persona = ?")
        .get(roomId, persona) !== undefined
    );
  }

  #assertGrantOpen(grant: RoomGrantV1, room: RoomV1): void {
    if (grant.state !== "active" && grant.state !== "held") {
      throw new RoomError(
        "room.grant-closed",
        `Grant ${grant.grantId} is already ${grant.state}.`,
        false,
      );
    }
    if (room.activeGrantId !== grant.grantId) {
      throw new RoomError(
        "room.grant-not-current",
        `Grant ${grant.grantId} no longer holds the room lock for ${room.roomId}.`,
        false,
      );
    }
  }

  static #stateForOutcome(
    outcome: Exclude<RoomGrantOutcomeV1, { kind: "committed" }>,
  ): "passed" | "failed" | "dropped" | "orphaned" {
    switch (outcome.kind) {
      case "passed":
        return "passed";
      case "failed":
        return "failed";
      case "dropped":
        return "dropped";
      case "orphaned":
        return "orphaned";
    }
  }

  #closeGrant(
    grant: RoomGrantV1,
    room: RoomV1,
    state: "committed" | "passed" | "failed" | "dropped" | "orphaned",
    outcome: RoomGrantOutcomeV1,
    tokensUsed: number,
    unattended: boolean,
    now: IsoInstant,
  ): void {
    this.#database
      .prepare(
        `UPDATE room_grants
         SET state = ?, held_text = NULL, outcome_json = ?, updated_at = ?
         WHERE grant_id = ?`,
      )
      .run(state, canonicalJson(RoomGrantOutcomeV1Schema.parse(outcome)), now, grant.grantId);
    this.#database
      .prepare("UPDATE rooms SET active_grant_id = NULL, updated_at = ? WHERE room_id = ?")
      .run(now, room.roomId);
    const budget = this.rolloverBudget(room.roomId, now);
    const reservedAfter = Math.max(0, budget.reservedTokens - grant.reservedTokens);
    this.#database
      .prepare(
        `UPDATE room_budgets
         SET reserved_tokens = ?, spent_tokens = spent_tokens + ?,
             unattended_spent_tokens = unattended_spent_tokens + ?, updated_at = ?
         WHERE room_id = ?`,
      )
      .run(reservedAfter, tokensUsed, unattended ? tokensUsed : 0, now, room.roomId);
  }

  #mergePendingTrigger(roomId: RoomId, trigger: RoomTriggerV1): void {
    const room = this.requireRoom(roomId);
    const current = room.pendingTrigger;
    if (current !== null && TRIGGER_PRIORITY[current.kind] > TRIGGER_PRIORITY[trigger.kind]) {
      return;
    }
    this.#database
      .prepare("UPDATE rooms SET pending_trigger_json = ? WHERE room_id = ?")
      .run(canonicalJson(trigger), roomId);
  }

  #insertMessage(message: RoomMessageV1): void {
    const authorKind = message.kind === "system" ? "system" : message.author.kind;
    const authorHandle =
      message.kind === "system"
        ? null
        : message.author.kind === "human"
          ? message.author.handle
          : message.author.persona;
    try {
      this.#database
        .prepare(
          `INSERT INTO room_messages(
             room_id, sequence, message_id, schema_version, occurred_at, kind, author_kind,
             author_handle, system_code, round_number, grant_id, payload_json
           ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          message.roomId,
          message.sequence,
          message.messageId,
          message.occurredAt,
          message.kind,
          authorKind,
          authorHandle,
          message.kind === "system" ? message.code : null,
          message.roundNumber,
          message.grantId,
          canonicalJson(message),
        );
    } catch (error) {
      if (error instanceof Error && error.message.includes("room transcript head moved")) {
        const room = this.requireRoom(message.roomId);
        throw new RoomHeadMovedError(message.sequence - 1, room.headSequence);
      }
      throw error;
    }
  }

  #requireBudget(roomId: RoomId): RoomBudgetV1 {
    const row = this.#database
      .prepare("SELECT * FROM room_budgets WHERE room_id = ?")
      .get(roomId) as BudgetRow | undefined;
    if (row === undefined) {
      throw new RoomError("room.not-found", `No room exists for ID ${roomId}.`, false);
    }
    return RoomRepository.#parseBudget(row);
  }

  static #parseBudget(row: BudgetRow): RoomBudgetV1 {
    return RoomBudgetV1Schema.parse({
      dayKey: row.day_key,
      dailyCeilingTokens: row.daily_ceiling_tokens,
      unattendedDailyCeilingTokens: row.unattended_daily_ceiling_tokens,
      maxTokensPerReply: row.max_tokens_per_reply,
      spentTokens: row.spent_tokens,
      reservedTokens: row.reserved_tokens,
      unattendedSpentTokens: row.unattended_spent_tokens,
    });
  }

  static #parseGrant(row: GrantRow): RoomGrantV1 {
    return RoomGrantV1Schema.parse({
      schemaVersion: 1,
      grantId: row.grant_id,
      roomId: row.room_id,
      roundNumber: row.round_number,
      persona: row.persona,
      headSequence: row.head_sequence,
      state: row.state,
      ownerPid: row.owner_pid,
      workerPid: row.worker_pid,
      reservedTokens: row.reserved_tokens,
      leaseExpiresAt: row.lease_expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      outcome: row.outcome_json === null ? null : JSON.parse(row.outcome_json),
    });
  }

  #assembleRoom(row: RoomRow): RoomV1 {
    const participantRows = this.#database
      .prepare(
        `SELECT persona, provider, display_name, position, benched_until, bench_reason
         FROM room_participants WHERE room_id = ? ORDER BY position`,
      )
      .all(row.room_id) as readonly ParticipantRow[];
    const participants: RoomParticipantV1[] = participantRows.map((participant) =>
      RoomParticipantV1Schema.parse({
        persona: RoomPersonaSchema.parse(participant.persona),
        provider: participant.provider,
        displayName: participant.display_name,
        position: participant.position,
        benchedUntil: participant.benched_until,
        benchReason: participant.bench_reason,
      }),
    );
    const budgetRow = this.#database
      .prepare("SELECT * FROM room_budgets WHERE room_id = ?")
      .get(row.room_id) as BudgetRow | undefined;
    if (budgetRow === undefined) {
      throw new RoomError(
        "room.budget-missing",
        `Room ${row.room_id} has no budget row; the control plane is inconsistent.`,
        false,
      );
    }
    return RoomV1Schema.parse({
      schemaVersion: 1,
      roomId: row.room_id,
      title: row.title,
      projectId: row.project_id,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
      unattendedEnabled: row.unattended_enabled === 1,
      headSequence: row.head_sequence,
      headMessageId: row.head_message_id,
      lastHumanAt: row.last_human_at,
      humanTypingUntil: row.human_typing_until,
      roundCounter: row.round_counter,
      activeGrantId: row.active_grant_id,
      pendingTrigger:
        row.pending_trigger_json === null ? null : JSON.parse(row.pending_trigger_json),
      agentCooldownEvents: row.agent_cooldown_events,
      participants,
      budget: RoomRepository.#parseBudget(budgetRow),
    });
  }
}
