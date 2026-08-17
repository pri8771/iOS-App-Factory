import {
  EventIdSchema,
  RoomHumanHandleSchema,
  RoomPersonaSchema,
  RoomProviderSchema,
} from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { RoomError, RoomHeadMovedError, RoomRepository } from "../src/index.js";
import {
  PROJECT_ID,
  ROOM_ID,
  ROOM_ID_2,
  T0,
  cleanupTestDatabases,
  openTestDatabase,
  plusMs,
  roomSpec,
  sequentialIds,
} from "./helpers.js";

const HUMAN = RoomHumanHandleSchema.parse("priyansh");
const ARCHITECT = RoomPersonaSchema.parse("architect");
const CRITIC = RoomPersonaSchema.parse("critic");

afterEach(() => {
  cleanupTestDatabases();
});

function setup() {
  const database = openTestDatabase();
  const repository = new RoomRepository(database);
  const ids = sequentialIds();
  return { database, repository, ids };
}

describe("RoomRepository rooms", () => {
  it("creates a room with participants and budget, and is idempotent for an identical spec", () => {
    const { repository } = setup();
    const created = repository.createRoom(roomSpec(), T0);
    expect(created.duplicate).toBe(false);
    expect(created.room).toMatchObject({
      roomId: ROOM_ID,
      title: "Design review",
      headSequence: 0,
      headMessageId: null,
      activeGrantId: null,
      pendingTrigger: null,
      roundCounter: 0,
      unattendedEnabled: false,
      agentCooldownEvents: 2,
      budget: {
        dayKey: "2026-08-16",
        dailyCeilingTokens: 10_000,
        unattendedDailyCeilingTokens: 2_000,
        maxTokensPerReply: 1_000,
        spentTokens: 0,
        reservedTokens: 0,
        unattendedSpentTokens: 0,
      },
    });
    expect(created.room.participants.map((participant) => participant.persona)).toEqual([
      "architect",
      "critic",
      "planner",
    ]);
    const again = repository.createRoom(roomSpec(), plusMs(T0, 1_000));
    expect(again.duplicate).toBe(true);
    expect(again.room).toEqual(created.room);
    expect(repository.listRooms(10)).toHaveLength(1);
  });

  it("refuses to rebind an existing roomId to a different spec", () => {
    const { repository } = setup();
    repository.createRoom(roomSpec(), T0);
    expect(() => repository.createRoom(roomSpec({ title: "Other" }), T0)).toThrow(RoomError);
    expect(() => repository.createRoom(roomSpec({ title: "Other" }), T0)).toThrow(
      /different specification/,
    );
  });

  it("rejects malformed specs, unknown rooms, and inconsistent budgets", () => {
    const { repository } = setup();
    expect(() => repository.createRoom({ ...roomSpec(), participants: [] }, T0)).toThrow();
    expect(() =>
      repository.createRoom(
        roomSpec({
          budget: {
            dailyCeilingTokens: 100,
            unattendedDailyCeilingTokens: 200,
            maxTokensPerReply: 10,
          },
        }),
        T0,
      ),
    ).toThrow(/unattended ceiling/);
    expect(repository.findRoom(ROOM_ID)).toBeNull();
    expect(() => repository.requireRoom(ROOM_ID)).toThrow(/No room exists/);
    expect(() =>
      repository.createRoom(
        roomSpec({
          participants: [
            { persona: ARCHITECT, provider: RoomProviderSchema.parse("ollama"), displayName: "A" },
            { persona: ARCHITECT, provider: RoomProviderSchema.parse("ollama"), displayName: "B" },
          ],
        }),
        T0,
      ),
    ).toThrow(/unique/);
  });

  it("lists rooms newest-updated first with a bounded limit", () => {
    const { repository, ids } = setup();
    repository.createRoom(roomSpec(), T0);
    repository.createRoom(roomSpec({ roomId: ROOM_ID_2, title: "Second" }), plusMs(T0, 10));
    repository.appendHumanMessage({
      roomId: ROOM_ID,
      messageId: ids.messageId(),
      handle: HUMAN,
      body: "hello",
      now: plusMs(T0, 20),
    });
    expect(repository.listRooms(10).map((room) => room.roomId)).toEqual([ROOM_ID, ROOM_ID_2]);
    expect(repository.listRooms(1)).toHaveLength(1);
    expect(() => repository.listRooms(0)).toThrow(TypeError);
  });
});

describe("RoomRepository transcript", () => {
  it("appends a human message, records attendance, parses mentions, and queues a human trigger", () => {
    const { repository, ids } = setup();
    repository.createRoom(roomSpec(), T0);
    const at = plusMs(T0, 5_000);
    repository.setHumanTyping(ROOM_ID, plusMs(at, 3_000));
    const appended = repository.appendHumanMessage({
      roomId: ROOM_ID,
      messageId: ids.messageId(),
      handle: HUMAN,
      body: "@critic what do you think? also @nobody and email@critic.example",
      now: at,
    });
    expect(appended.message).toMatchObject({
      sequence: 1,
      kind: "message",
      author: { kind: "human", handle: "priyansh" },
      mentions: ["critic"],
      roundNumber: null,
      grantId: null,
    });
    expect(appended.room).toMatchObject({
      headSequence: 1,
      headMessageId: appended.message.messageId,
      lastHumanAt: at,
      humanTypingUntil: null,
      pendingTrigger: { kind: "human-message", requestedAt: at, sourceSequence: 1 },
    });
    expect(repository.listMessages(ROOM_ID, 0, 10)).toEqual([appended.message]);
    expect(repository.findMessage(ROOM_ID, 1)).toEqual(appended.message);
    expect(repository.findMessage(ROOM_ID, 2)).toBeNull();
  });

  it("treats the message id as an idempotency key for human appends", () => {
    const { repository, ids } = setup();
    repository.createRoom(roomSpec(), T0);
    const messageId = ids.messageId();
    const first = repository.appendHumanMessage({
      roomId: ROOM_ID,
      messageId,
      handle: HUMAN,
      body: "once",
      now: T0,
    });
    const again = repository.appendHumanMessage({
      roomId: ROOM_ID,
      messageId,
      handle: HUMAN,
      body: "once",
      now: plusMs(T0, 5_000),
    });
    expect(first.duplicate).toBe(false);
    expect(again).toMatchObject({ duplicate: true, message: first.message });
    expect(repository.requireRoom(ROOM_ID).headSequence).toBe(1);
    expect(() =>
      repository.appendHumanMessage({
        roomId: ROOM_ID,
        messageId,
        handle: HUMAN,
        body: "different",
        now: T0,
      }),
    ).toThrow(/different content/);
  });

  it("enforces single-writer, append-only rows at the SQLite layer", () => {
    const { repository, ids, database } = setup();
    repository.createRoom(roomSpec(), T0);
    repository.appendHumanMessage({
      roomId: ROOM_ID,
      messageId: ids.messageId(),
      handle: HUMAN,
      body: "first",
      now: T0,
    });
    const insert = database.prepare(
      `INSERT INTO room_messages(room_id, sequence, message_id, schema_version, occurred_at, kind,
         author_kind, author_handle, system_code, round_number, grant_id, payload_json)
       VALUES (?, ?, ?, 1, ?, 'message', 'human', 'x', NULL, NULL, NULL, '{}')`,
    );
    // Stale head (sequence 1 again) and a gap (sequence 3) are both refused.
    expect(() => insert.run(ROOM_ID, 1, "40000000-0000-4000-8000-000000000099", T0)).toThrow(
      /head moved/,
    );
    expect(() => insert.run(ROOM_ID, 3, "40000000-0000-4000-8000-000000000098", T0)).toThrow(
      /head moved/,
    );
    expect(() =>
      database.prepare("UPDATE room_messages SET payload_json = '{}' WHERE sequence = 1").run(),
    ).toThrow(/append-only/);
    expect(() => database.prepare("DELETE FROM room_messages").run()).toThrow(/append-only/);
    expect(repository.requireRoom(ROOM_ID).headSequence).toBe(1);
  });

  it("merges pending triggers by priority and takes them atomically", () => {
    const { repository, ids } = setup();
    repository.createRoom(roomSpec(), T0);
    repository.setPendingTrigger(ROOM_ID, {
      kind: "agent-message",
      requestedAt: T0,
      sourceSequence: 0,
    });
    repository.setPendingTrigger(ROOM_ID, { kind: "wake", requestedAt: T0, sourceSequence: 0 });
    expect(repository.requireRoom(ROOM_ID).pendingTrigger?.kind).toBe("agent-message");
    repository.appendHumanMessage({
      roomId: ROOM_ID,
      messageId: ids.messageId(),
      handle: HUMAN,
      body: "hi",
      now: plusMs(T0, 1),
    });
    expect(repository.requireRoom(ROOM_ID).pendingTrigger?.kind).toBe("human-message");
    repository.setPendingTrigger(ROOM_ID, {
      kind: "factory-event",
      requestedAt: T0,
      sourceSequence: 0,
    });
    expect(repository.requireRoom(ROOM_ID).pendingTrigger?.kind).toBe("human-message");
    expect(repository.listRoomIdsWithPendingTriggers()).toEqual([ROOM_ID]);
    expect(repository.takePendingTrigger(ROOM_ID)?.kind).toBe("human-message");
    expect(repository.takePendingTrigger(ROOM_ID)).toBeNull();
    expect(repository.listRoomIdsWithPendingTriggers()).toEqual([]);
  });

  it("records factory events as system lines with a factory-event trigger", () => {
    const { repository, ids } = setup();
    repository.createRoom(roomSpec(), T0);
    const line = repository.appendFactoryEvent({
      roomId: ROOM_ID,
      messageId: ids.messageId(),
      body: "Attempt 12 succeeded",
      now: T0,
    });
    expect(line).toMatchObject({ kind: "system", code: "factory-event", sequence: 1 });
    expect(repository.requireRoom(ROOM_ID).pendingTrigger).toEqual({
      kind: "factory-event",
      requestedAt: T0,
      sourceSequence: 1,
    });
  });
});

describe("RoomRepository grants and budgets", () => {
  function roomWithHuman() {
    const context = setup();
    context.repository.createRoom(roomSpec(), T0);
    context.repository.appendHumanMessage({
      roomId: ROOM_ID,
      messageId: context.ids.messageId(),
      handle: HUMAN,
      body: "hello team",
      now: T0,
    });
    return context;
  }

  it("issues a grant that takes the room lock, stamps the head, and reserves budget atomically", () => {
    const { repository, ids } = roomWithHuman();
    const grant = repository.createGrant({
      grantId: ids.grantId(),
      roomId: ROOM_ID,
      roundNumber: 1,
      persona: ARCHITECT,
      ownerPid: 4242,
      leaseExpiresAt: plusMs(T0, 60_000),
      now: T0,
      unattended: false,
    });
    expect(grant).toMatchObject({
      state: "active",
      headSequence: 1,
      ownerPid: 4242,
      workerPid: null,
      reservedTokens: 1_000,
      outcome: null,
    });
    const room = repository.requireRoom(ROOM_ID);
    expect(room.activeGrantId).toBe(grant.grantId);
    expect(room.budget.reservedTokens).toBe(1_000);
    expect(repository.listOpenGrants().map((open) => open.grantId)).toEqual([grant.grantId]);

    // Single generation in flight per room.
    expect(() =>
      repository.createGrant({
        grantId: ids.grantId(),
        roomId: ROOM_ID,
        roundNumber: 2,
        persona: CRITIC,
        ownerPid: 4242,
        leaseExpiresAt: plusMs(T0, 60_000),
        now: T0,
        unattended: false,
      }),
    ).toThrow(/already has grant/);
    expect(repository.requireRoom(ROOM_ID).budget.reservedTokens).toBe(1_000);
  });

  it("gates on the reservation, not on spend alone (budget reservation race)", () => {
    const { repository, ids } = setup();
    repository.createRoom(
      roomSpec({
        budget: {
          dailyCeilingTokens: 1_500,
          unattendedDailyCeilingTokens: 0,
          maxTokensPerReply: 1_000,
        },
      }),
      T0,
    );
    const first = repository.createGrant({
      grantId: ids.grantId(),
      roomId: ROOM_ID,
      roundNumber: 1,
      persona: ARCHITECT,
      ownerPid: 1,
      leaseExpiresAt: plusMs(T0, 60_000),
      now: T0,
      unattended: false,
    });
    expect(repository.evaluateBudgetGate(ROOM_ID, false)).toEqual({
      admitted: false,
      ceilingTokens: 1_500,
      availableTokens: 500,
    });
    // Completion credits the reservation and records actual spend.
    repository.commitGrant({
      grantId: first.grantId,
      messageId: ids.messageId(),
      expectedHeadSequence: 0,
      body: "done",
      tokensUsed: 120,
      revalidated: false,
      unattended: false,
      now: plusMs(T0, 1),
    });
    expect(repository.requireRoom(ROOM_ID).budget).toMatchObject({
      reservedTokens: 0,
      spentTokens: 120,
    });
    expect(repository.evaluateBudgetGate(ROOM_ID, false)).toEqual({
      admitted: true,
      ceilingTokens: 1_500,
      availableTokens: 1_380,
    });
    const second = repository.createGrant({
      grantId: ids.grantId(),
      roomId: ROOM_ID,
      roundNumber: 2,
      persona: CRITIC,
      ownerPid: 1,
      leaseExpiresAt: plusMs(T0, 60_000),
      now: plusMs(T0, 2),
      unattended: false,
    });
    repository.finishGrant({
      grantId: second.grantId,
      outcome: { kind: "passed", tokensUsed: 400 },
      tokensUsed: 400,
      unattended: false,
      now: plusMs(T0, 3),
      systemLine: null,
    });
    // 520 spent: a third 1000-token reservation no longer fits under 1500.
    expect(() =>
      repository.createGrant({
        grantId: ids.grantId(),
        roomId: ROOM_ID,
        roundNumber: 3,
        persona: ARCHITECT,
        ownerPid: 1,
        leaseExpiresAt: plusMs(T0, 60_000),
        now: plusMs(T0, 4),
        unattended: false,
      }),
    ).toThrow(/cannot reserve/);
    // The next UTC day rolls spend over but never a live reservation.
    const rolled = repository.rolloverBudget(ROOM_ID, plusMs(T0, 24 * 60 * 60_000));
    expect(rolled).toMatchObject({ dayKey: "2026-08-17", spentTokens: 0, reservedTokens: 0 });
  });

  it("applies the unattended ceiling when the room is dormant", () => {
    const { repository, ids } = setup();
    repository.createRoom(
      roomSpec({
        budget: {
          dailyCeilingTokens: 10_000,
          unattendedDailyCeilingTokens: 1_500,
          maxTokensPerReply: 1_000,
        },
      }),
      T0,
    );
    const grant = repository.createGrant({
      grantId: ids.grantId(),
      roomId: ROOM_ID,
      roundNumber: 1,
      persona: ARCHITECT,
      ownerPid: 1,
      leaseExpiresAt: plusMs(T0, 60_000),
      now: T0,
      unattended: true,
    });
    repository.commitGrant({
      grantId: grant.grantId,
      messageId: ids.messageId(),
      expectedHeadSequence: 0,
      body: "night shift",
      tokensUsed: 800,
      revalidated: false,
      unattended: true,
      now: plusMs(T0, 1),
    });
    expect(repository.requireRoom(ROOM_ID).budget).toMatchObject({
      spentTokens: 800,
      unattendedSpentTokens: 800,
    });
    expect(repository.evaluateBudgetGate(ROOM_ID, true).admitted).toBe(false);
    expect(repository.evaluateBudgetGate(ROOM_ID, false).admitted).toBe(true);
  });

  it("commits by compare-and-swap against the stamped head and never posts over a moved head", () => {
    const { repository, ids } = roomWithHuman();
    const grant = repository.createGrant({
      grantId: ids.grantId(),
      roomId: ROOM_ID,
      roundNumber: 1,
      persona: ARCHITECT,
      ownerPid: 1,
      leaseExpiresAt: plusMs(T0, 60_000),
      now: T0,
      unattended: false,
    });
    // The human posts while the generation is in flight: the lock is untouched.
    repository.appendHumanMessage({
      roomId: ROOM_ID,
      messageId: ids.messageId(),
      handle: HUMAN,
      body: "actually, wait",
      now: plusMs(T0, 500),
    });
    expect(repository.requireRoom(ROOM_ID).activeGrantId).toBe(grant.grantId);
    let error: unknown;
    try {
      repository.commitGrant({
        grantId: grant.grantId,
        messageId: ids.messageId(),
        expectedHeadSequence: grant.headSequence,
        body: "stale reply",
        tokensUsed: 10,
        revalidated: false,
        unattended: false,
        now: plusMs(T0, 1_000),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RoomHeadMovedError);
    expect(error).toMatchObject({ expectedHeadSequence: 1, currentHeadSequence: 2 });
    expect(repository.listMessages(ROOM_ID, 0, 10).map((message) => message.sequence)).toEqual([
      1, 2,
    ]);
    expect(repository.requireGrant(grant.grantId).state).toBe("active");

    const held = repository.holdGrant(grant.grantId, "stale reply", plusMs(T0, 1_001));
    expect(held.state).toBe("held");
    const committed = repository.commitGrant({
      grantId: grant.grantId,
      messageId: ids.messageId(),
      expectedHeadSequence: 2,
      body: "revised reply",
      tokensUsed: 10,
      revalidated: true,
      unattended: false,
      now: plusMs(T0, 1_002),
    });
    expect(committed.message).toMatchObject({
      sequence: 3,
      author: { kind: "agent", persona: "architect" },
      grantId: grant.grantId,
      roundNumber: 1,
    });
    expect(committed.grant).toMatchObject({
      state: "committed",
      outcome: { kind: "committed", messageSequence: 3, tokensUsed: 10, revalidated: true },
    });
    expect(repository.requireRoom(ROOM_ID)).toMatchObject({ activeGrantId: null, headSequence: 3 });
    expect(() =>
      repository.commitGrant({
        grantId: grant.grantId,
        messageId: ids.messageId(),
        expectedHeadSequence: 3,
        body: "again",
        tokensUsed: 0,
        revalidated: false,
        unattended: false,
        now: plusMs(T0, 1_003),
      }),
    ).toThrow(/already committed/);
  });

  it("closes grants without a message and appends the legible system line in the same transaction", () => {
    const { repository, ids } = roomWithHuman();
    const grant = repository.createGrant({
      grantId: ids.grantId(),
      roomId: ROOM_ID,
      roundNumber: 1,
      persona: ARCHITECT,
      ownerPid: 1,
      leaseExpiresAt: plusMs(T0, 60_000),
      now: T0,
      unattended: false,
    });
    repository.recordWorkerPid(grant.grantId, 777, T0);
    expect(repository.requireGrant(grant.grantId).workerPid).toBe(777);
    const benchedUntil = plusMs(T0, 60_000);
    const finished = repository.finishGrant({
      grantId: grant.grantId,
      outcome: { kind: "failed", code: "timeout", benchedUntil },
      tokensUsed: 0,
      unattended: false,
      now: plusMs(T0, 10),
      systemLine: {
        messageId: ids.messageId(),
        code: "agent-error",
        body: "architect timed out",
        persona: ARCHITECT,
        errorCode: "timeout",
        benchedUntil,
        retryAt: benchedUntil,
        roundNumber: 1,
      },
    });
    expect(finished).toMatchObject({
      state: "failed",
      outcome: { kind: "failed", code: "timeout" },
    });
    expect(repository.requireRoom(ROOM_ID)).toMatchObject({
      activeGrantId: null,
      budget: { reservedTokens: 0, spentTokens: 0 },
    });
    expect(repository.listMessages(ROOM_ID, 1, 10)).toEqual([
      expect.objectContaining({
        kind: "system",
        code: "agent-error",
        grantId: grant.grantId,
        errorCode: "timeout",
        benchedUntil,
      }),
    ]);
    expect(repository.listOpenGrants()).toEqual([]);
    expect(() =>
      repository.finishGrant({
        grantId: grant.grantId,
        outcome: { kind: "passed", tokensUsed: 0 },
        tokensUsed: 0,
        unattended: false,
        now: plusMs(T0, 11),
        systemLine: null,
      }),
    ).toThrow(/already failed/);
  });

  it("benches personas and whole providers, never shortening an existing bench", () => {
    const { repository } = roomWithHuman();
    const later = plusMs(T0, 120_000);
    const sooner = plusMs(T0, 30_000);
    repository.benchPersona(ROOM_ID, ARCHITECT, later, "timeout");
    repository.benchPersona(ROOM_ID, ARCHITECT, sooner, "capacity");
    expect(repository.requireRoom(ROOM_ID).participants[0]).toMatchObject({
      persona: "architect",
      benchedUntil: later,
      benchReason: "timeout",
    });
    expect(repository.benchProvider(RoomProviderSchema.parse("ollama"), sooner, "limit")).toBe(1);
    const room = repository.requireRoom(ROOM_ID);
    expect(room.participants.map((participant) => participant.benchedUntil)).toEqual([
      later,
      sooner,
      null,
    ]);
    expect(() =>
      repository.benchPersona(ROOM_ID, RoomPersonaSchema.parse("ghost"), later, "limit"),
    ).toThrow(/not a participant/);
    expect(() =>
      repository.createGrant({
        grantId: sequentialIds("41000000").grantId(),
        roomId: ROOM_ID,
        roundNumber: 1,
        persona: ARCHITECT,
        ownerPid: 1,
        leaseExpiresAt: later,
        now: T0,
        unattended: false,
      }),
    ).toThrow(/benched until/);
  });

  it("re-parses stored rows through the contract schema so corruption fails closed", () => {
    const { repository, database } = roomWithHuman();
    database.prepare('UPDATE rooms SET pending_trigger_json = \'{"kind":"bogus"}\'').run();
    expect(() => repository.requireRoom(ROOM_ID)).toThrow();
  });
});

describe("RoomRepository factory-event cursor", () => {
  const EVENT_1 = EventIdSchema.parse("70000000-0000-4000-8000-000000000001");
  const EVENT_2 = EventIdSchema.parse("70000000-0000-4000-8000-000000000002");

  it("anchors once, idempotently, and refuses to bridge before anchoring or behind the cursor", () => {
    const { repository, ids } = setup();
    repository.createRoom(roomSpec(), T0);
    expect(repository.findFactoryEventCursor()).toBeNull();
    expect(() =>
      repository.bridgeFactoryEvent({
        ledgerPosition: 1,
        eventId: EVENT_1,
        eventOccurredAt: T0,
        deliveries: [],
        now: T0,
      }),
    ).toThrow(RoomError);
    const anchored = repository.anchorFactoryEventCursor({
      ledgerPosition: 0,
      eventId: null,
      eventOccurredAt: null,
      now: T0,
    });
    expect(anchored).toEqual({
      ledgerPosition: 0,
      eventId: null,
      eventOccurredAt: null,
      lastDeliveredEventId: null,
      lastDeliveredAt: null,
      deliveredCount: 0,
      updatedAt: T0,
    });
    // A second anchor never moves an existing cursor.
    expect(
      repository.anchorFactoryEventCursor({
        ledgerPosition: 99,
        eventId: EVENT_2,
        eventOccurredAt: T0,
        now: plusMs(T0, 1),
      }),
    ).toEqual(anchored);
    const later = plusMs(T0, 5_000);
    const lines = repository.bridgeFactoryEvent({
      ledgerPosition: 7,
      eventId: EVENT_1,
      eventOccurredAt: T0,
      deliveries: [{ roomId: ROOM_ID, messageId: ids.messageId(), body: "Factory: attempt done" }],
      now: later,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ code: "factory-event", sequence: 1, occurredAt: later });
    expect(repository.requireRoom(ROOM_ID).pendingTrigger?.kind).toBe("factory-event");
    expect(repository.findFactoryEventCursor()).toEqual({
      ledgerPosition: 7,
      eventId: EVENT_1,
      eventOccurredAt: T0,
      lastDeliveredEventId: EVENT_1,
      lastDeliveredAt: later,
      deliveredCount: 1,
      updatedAt: later,
    });
    // Same or earlier position: refused, and nothing is appended.
    expect(() =>
      repository.bridgeFactoryEvent({
        ledgerPosition: 7,
        eventId: EVENT_2,
        eventOccurredAt: T0,
        deliveries: [{ roomId: ROOM_ID, messageId: ids.messageId(), body: "again" }],
        now: later,
      }),
    ).toThrow(/not after the bridge cursor/);
    expect(repository.requireRoom(ROOM_ID).headSequence).toBe(1);
    // An empty delivery still advances the cursor but leaves the last-delivered facts alone.
    repository.bridgeFactoryEvent({
      ledgerPosition: 8,
      eventId: EVENT_2,
      eventOccurredAt: T0,
      deliveries: [],
      now: plusMs(later, 1),
    });
    expect(repository.findFactoryEventCursor()).toMatchObject({
      ledgerPosition: 8,
      eventId: EVENT_2,
      lastDeliveredEventId: EVENT_1,
      deliveredCount: 1,
    });
  });

  it("is atomic: a failing delivery rolls back the lines already appended and the cursor", () => {
    const { repository, ids } = setup();
    repository.createRoom(roomSpec(), T0);
    repository.anchorFactoryEventCursor({
      ledgerPosition: 0,
      eventId: null,
      eventOccurredAt: null,
      now: T0,
    });
    expect(() =>
      repository.bridgeFactoryEvent({
        ledgerPosition: 3,
        eventId: EVENT_1,
        eventOccurredAt: T0,
        deliveries: [
          { roomId: ROOM_ID, messageId: ids.messageId(), body: "first" },
          { roomId: ROOM_ID_2, messageId: ids.messageId(), body: "no such room" },
        ],
        now: T0,
      }),
    ).toThrow(RoomError);
    expect(repository.requireRoom(ROOM_ID).headSequence).toBe(0);
    expect(repository.findFactoryEventCursor()).toMatchObject({ ledgerPosition: 0 });
  });

  it("lists rooms bound to a project, never portfolio-wide rooms", () => {
    const { repository } = setup();
    repository.createRoom(roomSpec({ roomId: ROOM_ID }), T0);
    repository.createRoom(roomSpec({ roomId: ROOM_ID_2, projectId: null }), plusMs(T0, 1));
    expect(repository.listRoomIdsForProject(PROJECT_ID)).toEqual([ROOM_ID]);
    expect(repository.listRoomIdsForProject("30000000-0000-4000-8000-0000000000ff")).toEqual([]);
  });
});
