import {
  RoomHumanHandleSchema,
  RoomPersonaSchema,
  type RoomTriggerV1,
} from "@app-factory/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  RoomAgentFailure,
  RoomModerator,
  RoomRepository,
  type RoomModeratorOptions,
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
  RecordingQuota,
  T0,
  cleanupTestDatabases,
  deferred,
  instantWait,
  neverWait,
  openTestDatabase,
  plusMs,
  roomSpec,
  scoreAll,
  scoreOnly,
  sequentialIds,
} from "./helpers.js";

const HUMAN = RoomHumanHandleSchema.parse("priyansh");
const ARCHITECT = RoomPersonaSchema.parse("architect");
const CRITIC = RoomPersonaSchema.parse("critic");

afterEach(() => {
  cleanupTestDatabases();
});

type Harness = ReturnType<typeof harness>;

function harness(overrides: Partial<RoomModeratorOptions> = {}, spec = roomSpec()) {
  const database = openTestDatabase();
  const repository = new RoomRepository(database);
  const clock = new FakeClock();
  const ids = sequentialIds();
  const scorer = new FakeScorer(scoreOnly("architect"));
  const contributor = new FakeContributor();
  const revalidator = new FakeRevalidator();
  const process = new FakeProcess(1000);
  const quota = new RecordingQuota();
  const moderator = new RoomModerator({
    repository,
    scorer,
    contributor,
    revalidator,
    process,
    clock,
    ids,
    quota,
    wait: neverWait,
    random: { fraction: () => 0.5 },
    ...overrides,
  });
  repository.createRoom(spec, clock.instant());
  return {
    database,
    repository,
    clock,
    ids,
    scorer,
    contributor,
    revalidator,
    process,
    quota,
    moderator,
  };
}

function humanPosts(h: Harness, body: string, roomId = ROOM_ID): RoomTriggerV1 {
  const now = h.clock.advance(1_000);
  const appended = h.repository.appendHumanMessage({
    roomId,
    messageId: h.ids.messageId(),
    handle: HUMAN,
    body,
    now,
  });
  const trigger = h.repository.takePendingTrigger(roomId);
  if (trigger === null) throw new Error("expected a human trigger");
  expect(appended.message.sequence).toBe(trigger.sourceSequence);
  return trigger;
}

/** A human post that leaves its trigger pending, as the daemon's command boundary does. */
function humanAppends(h: Harness, body: string, roomId = ROOM_ID): void {
  h.repository.appendHumanMessage({
    roomId,
    messageId: h.ids.messageId(),
    handle: HUMAN,
    body,
    now: h.clock.advance(1_000),
  });
}

/** Drains the room's pending trigger chain until nothing is pending, returning every outcome. */
async function drain(
  h: Harness,
  first: RoomTriggerV1,
  roomId = ROOM_ID,
): Promise<RoomRoundOutcome[]> {
  const outcomes: RoomRoundOutcome[] = [];
  let trigger: RoomTriggerV1 | null = first;
  while (trigger !== null) {
    h.clock.advance(1_000);
    outcomes.push(await h.moderator.runRound(roomId, trigger));
    const last = outcomes.at(-1);
    if (last?.kind === "deferred") break;
    trigger = h.repository.takePendingTrigger(roomId);
  }
  return outcomes;
}

/** Yields macrotasks until the contributor has been invoked `count` times. */
async function untilContributed(h: Harness, count = 1): Promise<void> {
  for (let attempt = 0; attempt < 100 && h.contributor.calls.length < count; attempt += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  if (h.contributor.calls.length < count) throw new Error("contributor was not invoked in time");
}

function transcript(h: Harness, roomId = ROOM_ID) {
  return h.repository
    .listMessages(roomId, 0, 1_000)
    .map((message) =>
      message.kind === "system"
        ? `system:${message.code}`
        : `${message.author.kind}:${message.author.kind === "human" ? message.author.handle : message.author.persona}`,
    );
}

describe("RoomModerator admission and grants", () => {
  it("grants the highest-urgency bidder, commits at the stamped head, and settles the reservation", async () => {
    const h = harness();
    const trigger = humanPosts(h, "What should we build first?");
    const outcome = await h.moderator.runRound(ROOM_ID, trigger);
    expect(outcome).toMatchObject({
      kind: "granted",
      roundNumber: 1,
      persona: "architect",
      outcome: { kind: "committed", messageSequence: 2, tokensUsed: 100, revalidated: false },
    });
    expect(h.scorer.calls).toHaveLength(1);
    expect(h.scorer.calls[0]?.candidates.map((candidate) => candidate.persona)).toEqual([
      "architect",
      "critic",
      "planner",
    ]);
    const room = h.repository.requireRoom(ROOM_ID);
    expect(room).toMatchObject({
      activeGrantId: null,
      roundCounter: 1,
      headSequence: 2,
      budget: { reservedTokens: 0, spentTokens: 100 },
      pendingTrigger: { kind: "agent-message", sourceSequence: 2 },
    });
    expect(h.quota.reserved).toEqual([1_000]);
    expect(h.quota.settled).toEqual([100]);
    const grants = h.repository.listGrants(ROOM_ID);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ state: "committed", headSequence: 1, ownerPid: 1000 });
    expect(transcript(h)).toEqual(["human:priyansh", "agent:architect"]);
  });

  it("posts 'all agents passed' on a zero-bid round and never grants", async () => {
    const h = harness();
    h.scorer.setFallback(scoreAll(0));
    const outcome = await h.moderator.runRound(ROOM_ID, humanPosts(h, "fyi only"));
    expect(outcome).toEqual({ kind: "all-passed", roundNumber: 1 });
    expect(transcript(h)).toEqual(["human:priyansh", "system:all-passed"]);
    expect(h.repository.listGrants(ROOM_ID)).toEqual([]);
    expect(h.quota.released).toBe(1);
    expect(h.repository.requireRoom(ROOM_ID).pendingTrigger).toBeNull();
    const line = h.repository.findMessage(ROOM_ID, 2);
    expect(line).toMatchObject({ kind: "system", body: "All agents passed.", roundNumber: 1 });
  });

  it("treats an admitted agent's PASS as success: a legible line, no bench, no hold", async () => {
    const h = harness();
    h.contributor.queue(() => Promise.resolve({ kind: "pass", tokensUsed: 12 }));
    const outcome = await h.moderator.runRound(ROOM_ID, humanPosts(h, "thoughts?"));
    expect(outcome).toMatchObject({ kind: "granted", outcome: { kind: "passed", tokensUsed: 12 } });
    expect(transcript(h)).toEqual(["human:priyansh", "system:agent-passed"]);
    const room = h.repository.requireRoom(ROOM_ID);
    expect(room.participants[0]?.benchedUntil).toBeNull();
    expect(room).toMatchObject({
      activeGrantId: null,
      budget: { reservedTokens: 0, spentTokens: 12 },
    });
    expect(h.repository.listGrants(ROOM_ID)[0]?.state).toBe("passed");
    expect(h.repository.listOpenGrants()).toEqual([]);
  });

  it("makes exactly one scorer call per round and fails closed on a malformed verdict", async () => {
    const h = harness();
    h.scorer.queue(() => ({ architect: 3 })); // missing personas
    let outcome = await h.moderator.runRound(ROOM_ID, humanPosts(h, "hi"));
    expect(outcome).toEqual({ kind: "scorer-failed", roundNumber: 1 });
    h.scorer.queue((request) => ({
      ...Object.fromEntries(request.candidates.map(({ persona }) => [persona, 0])),
      architect: 7,
    }));
    outcome = await h.moderator.runRound(ROOM_ID, humanPosts(h, "hi again"));
    expect(outcome).toEqual({ kind: "scorer-failed", roundNumber: 2 });
    h.scorer.queue(() => {
      throw new Error("model offline");
    });
    outcome = await h.moderator.runRound(ROOM_ID, humanPosts(h, "third"));
    expect(outcome).toEqual({ kind: "scorer-failed", roundNumber: 3 });
    expect(h.scorer.calls).toHaveLength(3);
    expect(transcript(h).filter((line) => line === "system:scorer-unavailable")).toHaveLength(3);
    expect(h.repository.listGrants(ROOM_ID)).toEqual([]);
    expect(h.quota.released).toBe(3);
  });

  it("excludes the source author, applies cooldown unless addressed, and forces @mentions", async () => {
    const h = harness();
    // Round 1: architect answers the human.
    await h.moderator.runRound(ROOM_ID, humanPosts(h, "kick off"));
    // Round 2 (chain from architect's message): architect is excluded (author), critic and
    // planner remain. Scorer picks critic.
    h.scorer.queue(scoreOnly("critic"));
    const chain = h.repository.takePendingTrigger(ROOM_ID);
    if (chain === null) throw new Error("expected chain trigger");
    expect(chain.kind).toBe("agent-message");
    await h.moderator.runRound(ROOM_ID, chain);
    expect(h.scorer.calls[1]?.candidates.map((candidate) => candidate.persona)).toEqual([
      "critic",
      "planner",
    ]);
    // Round 3 (chain from critic): critic is the author; architect spoke within the last 2
    // events (cooldown) -> only planner is eligible.
    h.scorer.queue(scoreOnly("planner"));
    const chain2 = h.repository.takePendingTrigger(ROOM_ID);
    if (chain2 === null) throw new Error("expected chain trigger");
    await h.moderator.runRound(ROOM_ID, chain2);
    expect(h.scorer.calls[2]?.candidates.map((candidate) => candidate.persona)).toEqual([
      "planner",
    ]);
    // Human addresses @architect: cooldown is bypassed and architect is a forced candidate that
    // wins ties even at urgency 0.
    h.scorer.queue(scoreAll(0));
    const outcome = await h.moderator.runRound(ROOM_ID, humanPosts(h, "@architect your call"));
    const candidates = h.scorer.calls[3]?.candidates ?? [];
    expect(candidates.find((candidate) => candidate.persona === "architect")?.forced).toBe(true);
    expect(outcome).toMatchObject({ kind: "granted", persona: "architect" });
  });

  it("caps consecutive agent-only messages at three and waits for a human (livelock cap)", async () => {
    const h = harness({}, roomSpec({ agentCooldownEvents: 1 }));
    h.scorer.setFallback((request) => {
      const first = request.candidates[0];
      return Object.fromEntries(
        request.candidates.map((candidate) => [candidate.persona, candidate === first ? 2 : 0]),
      );
    });
    const outcomes = await drain(h, humanPosts(h, "go"));
    expect(outcomes.map((outcome) => outcome.kind)).toEqual([
      "granted",
      "granted",
      "granted",
      "refused",
    ]);
    expect(outcomes.at(-1)).toEqual({ kind: "refused", reason: "chain-cap" });
    expect(transcript(h)).toEqual([
      "human:priyansh",
      "agent:architect",
      "agent:critic",
      "agent:architect",
      "system:chain-cap",
    ]);
    // Re-polling stays quiet (no duplicate cap line) until a human speaks.
    expect(
      await h.moderator.runRound(ROOM_ID, { kind: "wake", requestedAt: T0, sourceSequence: 0 }),
    ).toEqual({ kind: "refused", reason: "chain-cap" });
    expect(transcript(h).filter((line) => line === "system:chain-cap")).toHaveLength(1);
    // A human message resets the run.
    const after = await h.moderator.runRound(ROOM_ID, humanPosts(h, "thanks, continue"));
    expect(after.kind).toBe("granted");
    expect(h.repository.requireRoom(ROOM_ID).roundCounter).toBe(4);
  });

  it("refuses when the room lock is held by another process and keeps the trigger pending", async () => {
    const h = harness();
    const trigger = humanPosts(h, "hi");
    h.repository.createGrant({
      grantId: sequentialIds("42000000").grantId(),
      roomId: ROOM_ID,
      roundNumber: 1,
      persona: CRITIC,
      ownerPid: 999,
      leaseExpiresAt: plusMs(h.clock.instant(), 60_000),
      now: h.clock.instant(),
      unattended: false,
    });
    expect(await h.moderator.runRound(ROOM_ID, trigger)).toEqual({
      kind: "deferred",
      reason: "generation-in-flight",
      retryAt: null,
    });
    expect(h.repository.requireRoom(ROOM_ID).pendingTrigger).toEqual(trigger);
    expect(h.scorer.calls).toEqual([]);
  });

  it("defers while the human is typing and resumes when the signal expires", async () => {
    const h = harness();
    await h.moderator.runRound(ROOM_ID, humanPosts(h, "start"));
    const chain = h.repository.takePendingTrigger(ROOM_ID);
    if (chain === null) throw new Error("expected chain trigger");
    const typingUntil = plusMs(h.clock.instant(), 5_000);
    h.repository.setHumanTyping(ROOM_ID, typingUntil);
    expect(await h.moderator.runRound(ROOM_ID, chain)).toEqual({
      kind: "deferred",
      reason: "human-typing",
      retryAt: typingUntil,
    });
    expect(h.repository.requireRoom(ROOM_ID).pendingTrigger).toEqual(chain);
    h.clock.advance(6_000);
    h.scorer.queue(scoreOnly("critic"));
    expect((await h.moderator.runRound(ROOM_ID, chain)).kind).toBe("granted");
  });
});

describe("RoomModerator single-writer transcript (CAS on human post)", () => {
  it("holds a buffered completion for revalidation when the human posted, and posts the verdict", async () => {
    const h = harness();
    const gate = deferred<undefined>();
    h.contributor.queue(async () => {
      await gate.promise;
      return { kind: "message", body: "buffered answer", tokensUsed: 50 };
    });
    h.revalidator.queue({ decision: "revise", body: "revised answer" });
    const round = h.moderator.runRound(ROOM_ID, humanPosts(h, "question one"));
    await untilContributed(h);
    // Human posts while the agent is generating: the room lock is untouched, the head moves.
    const room = h.repository.requireRoom(ROOM_ID);
    expect(room.activeGrantId).not.toBeNull();
    humanAppends(h, "question two, ignore one");
    gate.resolve(undefined);
    const outcome = await round;
    expect(outcome).toMatchObject({
      kind: "granted",
      outcome: { kind: "committed", messageSequence: 3, tokensUsed: 50, revalidated: true },
    });
    expect(h.revalidator.calls).toHaveLength(1);
    expect(h.revalidator.calls[0]).toMatchObject({
      bufferedBody: "buffered answer",
      newMessages: [
        expect.objectContaining({ sequence: 2, author: { kind: "human", handle: "priyansh" } }),
      ],
      grant: expect.objectContaining({ state: "held" }),
    });
    expect(transcript(h)).toEqual([
      "human:priyansh",
      "human:priyansh",
      "agent:architect",
      "system:contribution-revised",
    ]);
    expect(h.repository.findMessage(ROOM_ID, 3)).toMatchObject({ body: "revised answer" });
    // The human's second message is still the pending (higher-priority) trigger.
    expect(h.repository.requireRoom(ROOM_ID).pendingTrigger).toMatchObject({
      kind: "human-message",
      sourceSequence: 2,
    });
    expect(h.repository.listGrants(ROOM_ID)[0]?.state).toBe("committed");
  });

  it("drops the buffered completion when the revalidator says so, with a legible line", async () => {
    const h = harness();
    const gate = deferred<undefined>();
    h.contributor.queue(async () => {
      await gate.promise;
      return { kind: "message", body: "now-irrelevant answer", tokensUsed: 50 };
    });
    h.revalidator.queue({ decision: "drop" });
    const round = h.moderator.runRound(ROOM_ID, humanPosts(h, "q1"));
    await untilContributed(h);
    humanAppends(h, "never mind");
    gate.resolve(undefined);
    const outcome = await round;
    expect(outcome).toMatchObject({
      kind: "granted",
      outcome: { kind: "dropped", reason: "revalidation-dropped" },
    });
    expect(transcript(h)).toEqual([
      "human:priyansh",
      "human:priyansh",
      "system:contribution-dropped",
    ]);
    expect(h.repository.requireRoom(ROOM_ID)).toMatchObject({
      activeGrantId: null,
      budget: { reservedTokens: 0, spentTokens: 0 },
    });
    expect(h.quota.released).toBe(1);
  });

  it("does not revalidate when only system lines moved the head; it simply appends after them", async () => {
    const h = harness();
    const gate = deferred<undefined>();
    h.contributor.queue(async () => {
      await gate.promise;
      return { kind: "message", body: "answer", tokensUsed: 10 };
    });
    const round = h.moderator.runRound(ROOM_ID, humanPosts(h, "q"));
    await untilContributed(h);
    h.repository.appendFactoryEvent({
      roomId: ROOM_ID,
      messageId: h.ids.messageId(),
      body: "build finished",
      now: h.clock.advance(10),
    });
    gate.resolve(undefined);
    const outcome = await round;
    expect(outcome).toMatchObject({
      kind: "granted",
      outcome: { kind: "committed", messageSequence: 3, revalidated: false },
    });
    expect(h.revalidator.calls).toEqual([]);
    expect(transcript(h)).toEqual(["human:priyansh", "system:factory-event", "agent:architect"]);
  });

  it("gives up after repeated human posts during revalidation instead of racing the human", async () => {
    const h = harness();
    const gate = deferred<undefined>();
    h.contributor.queue(async () => {
      await gate.promise;
      return { kind: "message", body: "answer", tokensUsed: 10 };
    });
    // Each revalidation says post, but the human keeps posting before the commit lands.
    const revalidator = new FakeRevalidator({ decision: "post" });
    const original = revalidator.revalidate.bind(revalidator);
    revalidator.revalidate = async (request) => {
      humanPosts(h, "and another thing");
      return await original(request);
    };
    const moderator = new RoomModerator({
      repository: h.repository,
      scorer: h.scorer,
      contributor: h.contributor,
      revalidator,
      process: h.process,
      clock: h.clock,
      ids: h.ids,
      quota: h.quota,
      wait: neverWait,
    });
    const round = moderator.runRound(ROOM_ID, humanPosts(h, "q"));
    await untilContributed(h);
    humanPosts(h, "wait");
    gate.resolve(undefined);
    const outcome = await round;
    expect(outcome).toMatchObject({
      kind: "granted",
      outcome: { kind: "dropped", reason: "revalidation-exhausted" },
    });
    expect(revalidator.calls).toHaveLength(3);
    expect(h.repository.requireRoom(ROOM_ID).activeGrantId).toBeNull();
    expect(transcript(h).at(-1)).toBe("system:contribution-dropped");
  });
});

describe("RoomModerator failures are typed events, never holds", () => {
  it.each([
    ["limit", 90_000, "provider-wide"],
    ["timeout", 60_000, "persona"],
    ["capacity", 20_000, "persona"],
    ["internal", 60_000, "persona"],
  ] as const)(
    "records a %s failure with bench-until and releases everything",
    async (code, benchMs, scope) => {
      const h = harness();
      h.contributor.queue(() =>
        Promise.reject(
          code === "internal"
            ? new Error("boom")
            : new RoomAgentFailure(code, `${code} hit`, code === "limit" ? 90_000 : null),
        ),
      );
      const trigger = humanPosts(h, "hello");
      const before = h.clock.instant();
      const outcome = await h.moderator.runRound(ROOM_ID, trigger);
      const benchedUntil = plusMs(before, benchMs);
      expect(outcome).toMatchObject({
        kind: "granted",
        persona: "architect",
        outcome: { kind: "failed", code, benchedUntil },
      });
      const room = h.repository.requireRoom(ROOM_ID);
      expect(room).toMatchObject({
        activeGrantId: null,
        budget: { reservedTokens: 0, spentTokens: 0 },
      });
      const [architect, critic, planner] = room.participants;
      expect(architect).toMatchObject({ benchedUntil, benchReason: code });
      if (scope === "provider-wide") {
        // critic shares architect's provider (ollama); planner (codex) is untouched.
        expect(critic).toMatchObject({ benchedUntil, benchReason: code });
        expect(planner?.benchedUntil).toBeNull();
      } else {
        expect(critic?.benchedUntil).toBeNull();
        expect(planner?.benchedUntil).toBeNull();
      }
      const grant = h.repository.listGrants(ROOM_ID)[0];
      expect(grant).toMatchObject({ state: "failed" });
      expect(grant?.state).not.toBe("held");
      expect(transcript(h)).toEqual(["human:priyansh", "system:agent-error"]);
      expect(h.repository.findMessage(ROOM_ID, 2)).toMatchObject({
        code: "agent-error",
        persona: "architect",
        errorCode: code,
        benchedUntil,
        retryAt: benchedUntil,
      });
      expect(h.quota.released).toBe(1);
      // A benched persona is not a candidate on the next round.
      h.scorer.queue(scoreAll(0));
      await h.moderator.runRound(ROOM_ID, humanPosts(h, "again"));
      expect(h.scorer.calls[1]?.candidates.map((candidate) => candidate.persona)).toEqual(
        scope === "provider-wide" ? ["planner"] : ["critic", "planner"],
      );
    },
  );

  it("classifies an off-shape contribution as an internal failure instead of posting it", async () => {
    const h = harness();
    h.contributor.queue(() =>
      Promise.resolve({ kind: "message", body: "", tokensUsed: 3 } as never),
    );
    const outcome = await h.moderator.runRound(ROOM_ID, humanPosts(h, "hi"));
    expect(outcome).toMatchObject({ outcome: { kind: "failed", code: "internal" } });
    expect(transcript(h)).toEqual(["human:priyansh", "system:agent-error"]);
    h.contributor.queue(() =>
      Promise.resolve({ kind: "message", body: "x".repeat(20_001), tokensUsed: 3 }),
    );
    h.scorer.queue(scoreOnly("critic"));
    const second = await h.moderator.runRound(ROOM_ID, humanPosts(h, "again"));
    expect(second).toMatchObject({
      persona: "critic",
      outcome: { kind: "failed", code: "internal" },
    });
    expect(h.repository.requireRoom(ROOM_ID).activeGrantId).toBeNull();
  });

  it("releases the room lock as an internal failure when completion itself throws", async () => {
    const h = harness();
    let failNextMessageId = false;
    const ids = {
      messageId: () => {
        if (failNextMessageId) {
          failNextMessageId = false;
          throw new Error("id generator crashed");
        }
        return h.ids.messageId();
      },
      grantId: () => h.ids.grantId(),
    };
    const gate = deferred<undefined>();
    h.contributor.queue(async () => {
      await gate.promise;
      return { kind: "message", body: "answer", tokensUsed: 5 };
    });
    const moderator = new RoomModerator({
      repository: h.repository,
      scorer: h.scorer,
      contributor: h.contributor,
      revalidator: h.revalidator,
      process: h.process,
      clock: h.clock,
      ids,
      quota: h.quota,
      wait: neverWait,
    });
    const round = moderator.runRound(ROOM_ID, humanPosts(h, "q"));
    await untilContributed(h);
    failNextMessageId = true;
    gate.resolve(undefined);
    // An infrastructure failure during commit is not a typed agent failure; the round
    // surfaces it, but never leaves the lock held or the reservation debited.
    await expect(round).rejects.toThrow(/id generator crashed/);
    const room = h.repository.requireRoom(ROOM_ID);
    expect(room).toMatchObject({ activeGrantId: null, budget: { reservedTokens: 0 } });
    expect(h.repository.listGrants(ROOM_ID)[0]).toMatchObject({
      state: "failed",
      outcome: { kind: "failed", code: "internal" },
    });
    expect(transcript(h)).toEqual(["human:priyansh", "system:agent-error"]);
    expect(h.quota.released).toBe(1);
  });

  it("jitters capacity retries deterministically from the random port", async () => {
    const h = harness({ random: { fraction: () => 1 } });
    h.contributor.queue(() =>
      Promise.resolve({ kind: "error", code: "capacity", retryAfterMs: null }),
    );
    const trigger = humanPosts(h, "hi");
    const before = h.clock.instant();
    const outcome = await h.moderator.runRound(ROOM_ID, trigger);
    // base 20s ± 50% with fraction 1 -> +10s.
    expect(outcome).toMatchObject({
      outcome: { kind: "failed", code: "capacity", benchedUntil: plusMs(before, 30_000) },
    });
  });

  it("aborts a contribution that outlives its wall-clock lease and classifies it as timeout", async () => {
    const wait = new ManualWait();
    const h = harness({ wait: wait.port, leaseDurationMs: 5_000 });
    let aborted = false;
    h.contributor.queue(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("killed"));
          });
        }),
    );
    const round = h.moderator.runRound(ROOM_ID, humanPosts(h, "slow"));
    await untilContributed(h);
    expect(wait.pendingMs).toEqual([5_000]);
    expect(h.moderator.inFlightGrantIds.size).toBe(1);
    wait.fire(5_000);
    const outcome = await round;
    expect(aborted).toBe(true);
    expect(outcome).toMatchObject({ outcome: { kind: "failed", code: "timeout" } });
    expect(h.moderator.inFlightGrantIds.size).toBe(0);
    expect(h.repository.requireRoom(ROOM_ID).activeGrantId).toBeNull();
  });
});

describe("RoomModerator budgets and quota", () => {
  it("throttles rooms when the shared window is depleted and says when to retry", async () => {
    const h = harness();
    h.quota.refuseUntil = new Date(plusMs(T0, 600_000));
    const outcome = await h.moderator.runRound(ROOM_ID, humanPosts(h, "hi"));
    expect(outcome).toEqual({ kind: "throttled", roundNumber: 1, retryAt: plusMs(T0, 600_000) });
    expect(transcript(h)).toEqual(["human:priyansh", "system:throttled"]);
    expect(h.repository.findMessage(ROOM_ID, 2)).toMatchObject({ retryAt: plusMs(T0, 600_000) });
    expect(h.scorer.calls).toEqual([]);
  });

  it("refuses grants once the daily ceiling would be breached and posts the reason once", async () => {
    const h = harness(
      {},
      roomSpec({
        budget: {
          dailyCeilingTokens: 1_500,
          unattendedDailyCeilingTokens: 0,
          maxTokensPerReply: 1_000,
        },
      }),
    );
    h.contributor.setFallback(() =>
      Promise.resolve({ kind: "message", body: "long", tokensUsed: 900 }),
    );
    expect((await h.moderator.runRound(ROOM_ID, humanPosts(h, "one"))).kind).toBe("granted");
    expect(await h.moderator.runRound(ROOM_ID, humanPosts(h, "two"))).toEqual({
      kind: "refused",
      reason: "budget-exhausted",
    });
    expect(await h.moderator.runRound(ROOM_ID, humanPosts(h, "three"))).toEqual({
      kind: "refused",
      reason: "budget-exhausted",
    });
    expect(transcript(h)).toEqual([
      "human:priyansh",
      "agent:architect",
      "human:priyansh",
      "system:budget-exhausted",
      "human:priyansh",
      "system:budget-exhausted",
    ]);
    // Next UTC day the room speaks again.
    h.clock.advance(24 * 60 * 60_000);
    expect((await h.moderator.runRound(ROOM_ID, humanPosts(h, "tomorrow"))).kind).toBe("granted");
  });

  it("holds exactly one reservation per room even when two rounds race the same lock", async () => {
    const h = harness();
    const gate = deferred<undefined>();
    h.contributor.setFallback(async () => {
      await gate.promise;
      return { kind: "message", body: "r", tokensUsed: 1 };
    });
    const first = h.moderator.runRound(ROOM_ID, humanPosts(h, "a"));
    await untilContributed(h);
    const second = await h.moderator.runRound(ROOM_ID, {
      kind: "wake",
      requestedAt: h.clock.instant(),
      sourceSequence: 0,
    });
    expect(second).toEqual({ kind: "deferred", reason: "generation-in-flight", retryAt: null });
    expect(h.repository.requireRoom(ROOM_ID).budget.reservedTokens).toBe(1_000);
    expect(h.quota.reserved).toEqual([1_000]);
    gate.resolve(undefined);
    await first;
    expect(h.repository.requireRoom(ROOM_ID).budget).toMatchObject({
      reservedTokens: 0,
      spentTokens: 1,
    });
  });
});

describe("RoomModerator unattended mode", () => {
  it("goes dormant ten minutes after the last human message; without opt-in agents stay silent", async () => {
    const h = harness();
    await h.moderator.runRound(ROOM_ID, humanPosts(h, "start"));
    const chain = h.repository.takePendingTrigger(ROOM_ID);
    if (chain === null) throw new Error("expected chain");
    h.clock.advance(10 * 60_000);
    expect(h.moderator.attendanceOf(h.repository.requireRoom(ROOM_ID))).toBe("dormant");
    expect(await h.moderator.runRound(ROOM_ID, chain)).toEqual({
      kind: "refused",
      reason: "room-dormant",
    });
    h.repository.appendFactoryEvent({
      roomId: ROOM_ID,
      messageId: h.ids.messageId(),
      body: "ci green",
      now: h.clock.advance(1_000),
    });
    const factory = h.repository.takePendingTrigger(ROOM_ID);
    if (factory === null) throw new Error("expected factory trigger");
    expect(await h.moderator.runRound(ROOM_ID, factory)).toEqual({
      kind: "refused",
      reason: "room-dormant",
    });
    expect(transcript(h)).toEqual([
      "human:priyansh",
      "agent:architect",
      "system:room-dormant",
      "system:factory-event",
      "system:room-dormant",
    ]);
    // The human returning wakes the room immediately.
    expect((await h.moderator.runRound(ROOM_ID, humanPosts(h, "back"))).kind).toBe("granted");
  });

  it("with opt-in, dormant rooms answer factory events only, never chain, and obey the unattended ceiling", async () => {
    const h = harness(
      {},
      roomSpec({
        unattendedEnabled: true,
        budget: {
          dailyCeilingTokens: 10_000,
          unattendedDailyCeilingTokens: 1_500,
          maxTokensPerReply: 1_000,
        },
      }),
    );
    h.contributor.setFallback(() =>
      Promise.resolve({ kind: "message", body: "on it", tokensUsed: 600 }),
    );
    await h.moderator.runRound(ROOM_ID, humanPosts(h, "watch the build"));
    h.repository.takePendingTrigger(ROOM_ID);
    h.clock.advance(11 * 60_000);
    // Agent chains do not run while dormant.
    expect(
      await h.moderator.runRound(ROOM_ID, {
        kind: "agent-message",
        requestedAt: T0,
        sourceSequence: 2,
      }),
    ).toEqual({ kind: "refused", reason: "no-chains-while-dormant" });
    // A factory event does, under the unattended ceiling, and does not chain afterwards.
    h.repository.appendFactoryEvent({
      roomId: ROOM_ID,
      messageId: h.ids.messageId(),
      body: "build failed",
      now: h.clock.advance(1_000),
    });
    const factory = h.repository.takePendingTrigger(ROOM_ID);
    if (factory === null) throw new Error("expected factory trigger");
    // architect spoke within the last two events (cooldown); critic takes the factory event.
    h.scorer.queue(scoreOnly("critic"));
    const outcome = await h.moderator.runRound(ROOM_ID, factory);
    expect(outcome).toMatchObject({
      kind: "granted",
      persona: "critic",
      outcome: { kind: "committed" },
    });
    const room = h.repository.requireRoom(ROOM_ID);
    expect(room.pendingTrigger).toBeNull();
    expect(room.budget).toMatchObject({ spentTokens: 1_200, unattendedSpentTokens: 600 });
    // Second event: 600 + 1000 reservation would breach the 1500 unattended ceiling.
    h.repository.appendFactoryEvent({
      roomId: ROOM_ID,
      messageId: h.ids.messageId(),
      body: "build failed again",
      now: h.clock.advance(1_000),
    });
    const factory2 = h.repository.takePendingTrigger(ROOM_ID);
    if (factory2 === null) throw new Error("expected factory trigger");
    expect(await h.moderator.runRound(ROOM_ID, factory2)).toEqual({
      kind: "refused",
      reason: "budget-exhausted",
    });
    expect(transcript(h).at(-1)).toBe("system:budget-exhausted");
  });
});

describe("RoomModerator lease sweep", () => {
  it("orphans grants owned by a dead daemon, kills their workers, releases the lock, and re-polls", () => {
    const h = harness({ process: new FakeProcess(2000, [555]) });
    const now = h.clock.instant();
    const stale = h.repository.createGrant({
      grantId: h.ids.grantId(),
      roomId: ROOM_ID,
      roundNumber: 1,
      persona: ARCHITECT,
      ownerPid: 1000,
      leaseExpiresAt: plusMs(now, 120_000),
      now,
      unattended: false,
    });
    h.repository.recordWorkerPid(stale.grantId, 555, now);
    h.repository.createRoom(roomSpec({ roomId: ROOM_ID_2, title: "two" }), now);
    const held = h.repository.createGrant({
      grantId: h.ids.grantId(),
      roomId: ROOM_ID_2,
      roundNumber: 1,
      persona: CRITIC,
      ownerPid: 1000,
      leaseExpiresAt: plusMs(now, 120_000),
      now,
      unattended: false,
    });
    h.repository.holdGrant(held.grantId, "buffered", now);
    const report = h.moderator.sweep();
    expect(report.orphaned).toEqual([
      { grantId: stale.grantId, roomId: ROOM_ID, persona: "architect", workerKilled: true },
      { grantId: held.grantId, roomId: ROOM_ID_2, persona: "critic", workerKilled: false },
    ]);
    for (const roomId of [ROOM_ID, ROOM_ID_2]) {
      const room = h.repository.requireRoom(roomId);
      expect(room).toMatchObject({
        activeGrantId: null,
        budget: { reservedTokens: 0 },
        pendingTrigger: { kind: "wake" },
      });
      expect(transcript(h, roomId)).toEqual(["system:grant-orphaned"]);
    }
    expect(h.repository.requireGrant(stale.grantId)).toMatchObject({
      state: "orphaned",
      outcome: { kind: "orphaned", workerKilled: true },
    });
    expect(h.repository.requireGrant(held.grantId).state).toBe("orphaned");
    expect(h.repository.listOpenGrants()).toEqual([]);
    expect(h.moderator.sweep()).toEqual({ orphaned: [] });
  });

  it("never sweeps a lease this process is still honouring, but sweeps its own expired leftovers", async () => {
    const h = harness();
    const gate = deferred<undefined>();
    h.contributor.queue(async () => {
      await gate.promise;
      return { kind: "message", body: "late", tokensUsed: 5 };
    });
    const round = h.moderator.runRound(ROOM_ID, humanPosts(h, "hi"));
    await untilContributed(h);
    h.clock.advance(DEFAULT_LEASE_MS_FOR_TEST + 1);
    expect(h.moderator.sweep()).toEqual({ orphaned: [] });
    gate.resolve(undefined);
    expect((await round).kind).toBe("granted");
    // A grant this pid left behind (e.g. crashed mid-round without a live promise) is swept
    // once its lease expired.
    const now = h.clock.instant();
    h.repository.createGrant({
      grantId: h.ids.grantId(),
      roomId: ROOM_ID,
      roundNumber: 99,
      persona: CRITIC,
      ownerPid: 1000,
      leaseExpiresAt: plusMs(now, 1_000),
      now,
      unattended: false,
    });
    expect(h.moderator.sweep()).toEqual({ orphaned: [] });
    h.clock.advance(1_000);
    expect(h.moderator.sweep().orphaned).toHaveLength(1);
  });

  it("uses factory-event and human message content as the source for exclusions", async () => {
    const h = harness();
    // A wake trigger falls back to the last chat message as its source.
    await h.moderator.runRound(ROOM_ID, humanPosts(h, "@critic please"));
    h.repository.takePendingTrigger(ROOM_ID);
    h.scorer.queue(scoreAll(0));
    const outcome = await h.moderator.runRound(ROOM_ID, {
      kind: "wake",
      requestedAt: h.clock.instant(),
      sourceSequence: 0,
    });
    // Source is architect's reply (last chat message): architect excluded, and the human's
    // earlier @critic mention no longer forces anyone.
    expect(outcome.kind).toBe("all-passed");
    expect(h.scorer.calls[1]?.candidates).toEqual([
      { persona: "critic", provider: "ollama", forced: false },
      { persona: "planner", provider: "codex", forced: false },
    ]);
  });
});

const DEFAULT_LEASE_MS_FOR_TEST = 120_000;

describe("RoomModerator constructor validation", () => {
  it("rejects invalid pids, durations, and jitter fractions", () => {
    const database = openTestDatabase();
    const repository = new RoomRepository(database);
    const base = {
      repository,
      scorer: new FakeScorer(),
      contributor: new FakeContributor(),
      revalidator: new FakeRevalidator(),
      wait: instantWait,
    };
    expect(() => new RoomModerator({ ...base, process: new FakeProcess(0) })).toThrow(TypeError);
    expect(
      () => new RoomModerator({ ...base, process: new FakeProcess(1), leaseDurationMs: 0 }),
    ).toThrow(TypeError);
    expect(
      () =>
        new RoomModerator({
          ...base,
          process: new FakeProcess(1),
          benchPolicy: {
            limitDefaultBenchMs: 1,
            timeoutBenchMs: 1,
            capacityBenchBaseMs: 1,
            capacityJitterFraction: 2,
            internalBenchMs: 1,
          },
        }),
    ).toThrow(TypeError);
  });
});
