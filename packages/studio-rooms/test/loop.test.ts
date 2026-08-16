import { RoomHumanHandleSchema, RoomPersonaSchema, type RoomId } from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  RoomModerator,
  RoomModeratorLoop,
  RoomRepository,
  type RoomRoundOutcome,
} from "../src/index.js";
import {
  FakeClock,
  FakeContributor,
  FakeProcess,
  FakeRevalidator,
  FakeScorer,
  ManualWait,
  ROOM_ID,
  ROOM_ID_2,
  cleanupTestDatabases,
  deferred,
  neverWait,
  openTestDatabase,
  plusMs,
  roomSpec,
  scoreAll,
  scoreOnly,
  sequentialIds,
} from "./helpers.js";

const HUMAN = RoomHumanHandleSchema.parse("priyansh");

afterEach(() => {
  cleanupTestDatabases();
});

function harness(options: { loopWait?: ManualWait; pid?: number } = {}) {
  const database = openTestDatabase();
  const repository = new RoomRepository(database);
  const clock = new FakeClock();
  const ids = sequentialIds();
  const scorer = new FakeScorer(scoreOnly("architect"));
  const contributor = new FakeContributor();
  const revalidator = new FakeRevalidator();
  const process = new FakeProcess(options.pid ?? 1000);
  const moderator = new RoomModerator({
    repository,
    scorer,
    contributor,
    revalidator,
    process,
    clock,
    ids,
    wait: neverWait,
  });
  const outcomes: Array<[RoomId, RoomRoundOutcome]> = [];
  const errors: unknown[] = [];
  const loopWait = options.loopWait ?? new ManualWait();
  const loop = new RoomModeratorLoop({
    moderator,
    repository,
    clock,
    wait: loopWait.port,
    onRound: (roomId, outcome) => outcomes.push([roomId, outcome]),
    onError: (error) => errors.push(error),
  });
  return {
    database,
    repository,
    clock,
    ids,
    scorer,
    contributor,
    moderator,
    loop,
    outcomes,
    errors,
    loopWait,
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function post(h: ReturnType<typeof harness>, body: string, roomId = ROOM_ID): void {
  h.repository.appendHumanMessage({
    roomId,
    messageId: h.ids.messageId(),
    handle: HUMAN,
    body,
    now: h.clock.advance(1_000),
  });
  h.loop.wake(roomId);
}

describe("RoomModeratorLoop", () => {
  it("drives a woken room through its human round and the bounded agent chain", async () => {
    const h = harness();
    h.repository.createRoom(roomSpec({ agentCooldownEvents: 1 }), h.clock.instant());
    h.scorer.setFallback((request) => {
      const first = request.candidates[0];
      return Object.fromEntries(
        request.candidates.map((candidate) => [candidate.persona, candidate === first ? 1 : 0]),
      );
    });
    h.loop.start();
    post(h, "go");
    await settle();
    expect(h.outcomes.map(([, outcome]) => outcome.kind)).toEqual([
      "granted",
      "granted",
      "granted",
      "refused",
    ]);
    expect(h.repository.requireRoom(ROOM_ID)).toMatchObject({
      pendingTrigger: null,
      activeGrantId: null,
      headSequence: 5,
    });
    expect(h.loop.activeRoomIds).toEqual([]);
    expect(h.errors).toEqual([]);
    await h.loop.stop();
  });

  it("does nothing before start, and start resumes rooms with durable pending triggers after a sweep", async () => {
    const h = harness({ pid: 2000 });
    h.repository.createRoom(roomSpec(), h.clock.instant());
    h.repository.createRoom(roomSpec({ roomId: ROOM_ID_2, title: "two" }), h.clock.instant());
    // A previous daemon (pid 1000) died holding room 1's lock with a pending human trigger.
    const now = h.clock.instant();
    h.repository.appendHumanMessage({
      roomId: ROOM_ID,
      messageId: h.ids.messageId(),
      handle: HUMAN,
      body: "hello?",
      now,
    });
    h.repository.createGrant({
      grantId: h.ids.grantId(),
      roomId: ROOM_ID,
      roundNumber: 1,
      persona: RoomPersonaSchema.parse("critic"),
      ownerPid: 1000,
      leaseExpiresAt: plusMs(now, 60_000),
      now,
      unattended: false,
    });
    h.loop.wake(ROOM_ID);
    await settle();
    expect(h.outcomes).toEqual([]);
    // wake() before start still sweeps.
    expect(h.loop.lastSweep?.orphaned).toHaveLength(1);
    h.loop.start();
    await settle();
    // The human's round runs first (architect answers); the chain then finds architect
    // excluded as author and the scorer bids nothing for the rest.
    expect(h.outcomes.map(([roomId, outcome]) => [roomId, outcome.kind])).toEqual([
      [ROOM_ID, "granted"],
      [ROOM_ID, "all-passed"],
    ]);
    const messages = h.repository
      .listMessages(ROOM_ID, 0, 100)
      .map((message) =>
        message.kind === "system" ? `system:${message.code}` : `${message.author.kind}`,
      );
    expect(messages).toEqual(["human", "system:grant-orphaned", "agent", "system:all-passed"]);
    await h.loop.stop();
  });

  it("waits for a typing signal to expire, and a wake cuts the wait short", async () => {
    const h = harness();
    h.repository.createRoom(roomSpec(), h.clock.instant());
    h.loop.start();
    h.repository.appendHumanMessage({
      roomId: ROOM_ID,
      messageId: h.ids.messageId(),
      handle: HUMAN,
      body: "start",
      now: h.clock.advance(1_000),
    });
    // The human keeps typing right after posting: the round waits for the signal to expire.
    const typingUntil = plusMs(h.clock.instant(), 4_000);
    h.repository.setHumanTyping(ROOM_ID, typingUntil);
    h.loop.wake(ROOM_ID);
    await settle();
    expect(h.outcomes.map(([, outcome]) => outcome)).toEqual([
      { kind: "deferred", reason: "human-typing", retryAt: typingUntil },
    ]);
    expect(h.loopWait.pendingMs).toEqual([4_000]);
    expect(h.repository.requireRoom(ROOM_ID).pendingTrigger?.kind).toBe("human-message");
    // The human posts instead: the defer wait is cut short, typing clears, the round runs.
    post(h, "here is more");
    await settle();
    expect(h.outcomes.map(([, outcome]) => outcome.kind)).toEqual([
      "deferred",
      "granted",
      "all-passed",
    ]);
    expect(h.loopWait.pendingMs).toEqual([]);
    // Typing again with a chain-style trigger pending: the wait fires when the signal expires.
    const typingAgain = plusMs(h.clock.instant(), 4_000);
    h.repository.setHumanTyping(ROOM_ID, typingAgain);
    h.repository.setPendingTrigger(ROOM_ID, {
      kind: "wake",
      requestedAt: h.clock.instant(),
      sourceSequence: 0,
    });
    h.loop.wake(ROOM_ID);
    await settle();
    expect(h.outcomes.at(-1)?.[1]).toEqual({
      kind: "deferred",
      reason: "human-typing",
      retryAt: typingAgain,
    });
    expect(h.loopWait.pendingMs).toEqual([4_000]);
    h.clock.advance(4_000);
    h.loopWait.fire(4_000);
    await settle();
    expect(h.outcomes.at(-1)?.[1]).toEqual({ kind: "all-passed", roundNumber: 3 });
    expect(h.loop.activeRoomIds).toEqual([]);
    await h.loop.stop();
  });

  it("stops without hanging on an in-flight defer wait and reports moderator errors", async () => {
    const h = harness();
    h.repository.createRoom(roomSpec(), h.clock.instant());
    h.loop.start();
    h.repository.setHumanTyping(ROOM_ID, plusMs(h.clock.instant(), 30_000));
    h.repository.setPendingTrigger(ROOM_ID, {
      kind: "wake",
      requestedAt: h.clock.instant(),
      sourceSequence: 0,
    });
    h.loop.wake(ROOM_ID);
    await settle();
    expect(h.loopWait.pendingMs).toEqual([30_000]);
    await h.loop.stop();
    expect(h.loop.activeRoomIds).toEqual([]);
    expect(h.errors).toEqual([]);
  });

  it("surfaces a moderator throw through onError without killing other rooms", async () => {
    const h = harness();
    h.repository.createRoom(roomSpec(), h.clock.instant());
    h.repository.createRoom(roomSpec({ roomId: ROOM_ID_2, title: "two" }), h.clock.instant());
    h.scorer.setFallback(scoreAll(0));
    h.loop.start();
    // Corrupt room 1 so its round throws inside the moderator.
    h.repository.setPendingTrigger(ROOM_ID, {
      kind: "wake",
      requestedAt: h.clock.instant(),
      sourceSequence: 0,
    });
    h.database
      .prepare('UPDATE rooms SET pending_trigger_json = \'{"kind":"bogus"}\' WHERE room_id = ?')
      .run(ROOM_ID);
    h.loop.wake(ROOM_ID);
    post(h, "hi", ROOM_ID_2);
    await settle();
    expect(h.errors).toHaveLength(1);
    expect(h.errors[0]).toBeInstanceOf(Error);
    expect(h.outcomes.map(([roomId, outcome]) => [roomId, outcome.kind])).toEqual([
      [ROOM_ID_2, "all-passed"],
    ]);
    await h.loop.stop();
  });

  it("records factory events and wakes the room", async () => {
    const h = harness();
    h.repository.createRoom(roomSpec({ unattendedEnabled: true }), h.clock.instant());
    h.loop.start();
    h.loop.notifyFactoryEvent(ROOM_ID, "Attempt 7 blocked on approval", h.ids.messageId());
    await settle();
    // No human has ever spoken: the room is dormant, unattended is on, so the factory event
    // gets a round.
    expect(h.outcomes.map(([, outcome]) => outcome.kind)).toEqual(["granted"]);
    expect(h.repository.listMessages(ROOM_ID, 0, 10).map((message) => message.kind)).toEqual([
      "system",
      "message",
    ]);
    await h.loop.stop();
  });

  it("does not spin when another process holds the room lock", async () => {
    const h = harness();
    h.repository.createRoom(roomSpec(), h.clock.instant());
    h.loop.start();
    const gate = deferred<undefined>();
    h.contributor.queue(async () => {
      await gate.promise;
      return { kind: "message", body: "late", tokensUsed: 1 };
    });
    post(h, "hi");
    await settle();
    // Round is in flight (lock held by this pid, promise pending). A concurrent wake for the
    // same room must not start a second driver or a second round.
    h.repository.setPendingTrigger(ROOM_ID, {
      kind: "wake",
      requestedAt: h.clock.instant(),
      sourceSequence: 0,
    });
    h.loop.wake(ROOM_ID);
    await settle();
    expect(h.contributor.calls).toHaveLength(1);
    expect(h.loop.activeRoomIds).toEqual([ROOM_ID]);
    gate.resolve(undefined);
    await settle();
    // The wake merged under the higher-priority chain trigger; the chain finds only
    // non-bidders and ends legibly.
    expect(h.outcomes.map(([, outcome]) => outcome.kind)).toEqual(["granted", "all-passed"]);
    expect(h.repository.requireRoom(ROOM_ID).pendingTrigger).toBeNull();
    await h.loop.stop();
  });
});
