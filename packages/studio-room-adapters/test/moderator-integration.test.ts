import {
  RoomHumanHandleSchema,
  type ProviderFamilyV1,
  type RoomTriggerV1,
} from "@app-factory/contracts";
import type { ScoreRequestInputV1, ScoreResultV1 } from "@app-factory/ollama-scorer";
import {
  RoomModerator,
  RoomRepository,
  type RoomProviderCatalogPort,
  type RoomRoundOutcome,
  type RoomWaitPort,
} from "@app-factory/studio-rooms";
import { afterEach, describe, expect, it } from "vitest";

import {
  createAlwaysDropRevalidator,
  createFactoryAwareQuotaGovernor,
  createOllamaRoomScorer,
  createRoomAdapterContributor,
  createRosterCharterProvider,
  type ParticipantAdapter,
} from "../src/index.js";
import {
  cleanupTestDatabases,
  FakeClock,
  FakeProcess,
  openTestDatabase,
  roomSpec,
  sequentialIds,
} from "./helpers.js";

const HUMAN = RoomHumanHandleSchema.parse("priyansh");

const neverResolvingWait: RoomWaitPort = (_ms, signal) =>
  new Promise<void>((_resolve, reject) => {
    const fail = (): void => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    };
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener("abort", fail, { once: true });
  });

function fakeParticipant(
  provider: string,
  reply: (personaSeen: string) => string,
): ParticipantAdapter {
  return {
    id: `fake.${provider}`,
    provider: provider as ParticipantAdapter["provider"],
    async contribute(context) {
      return { kind: "message", text: reply(context.persona), usage: { tokensUsed: 50 } };
    },
  };
}

/** Scores whichever personas are named `bids`; everyone else bids 0. */
function fakeOllamaScorer(bids: Readonly<Record<string, number>>) {
  return {
    async score(request: ScoreRequestInputV1): Promise<ScoreResultV1> {
      return {
        schemaVersion: 1,
        roundId: request.roundId,
        outcome: "scored",
        bids: request.personas.map((persona) => ({
          personaId: persona.id,
          urgency: (bids[persona.id] ?? 0) as 0 | 1 | 2 | 3,
        })),
        model: "fake-model",
        latencyMs: 5,
        prefixDigest: `sha256:${"0".repeat(64)}`,
        promptDigest: `sha256:${"0".repeat(64)}`,
        detail: "",
        usage: null,
      };
    },
  };
}

function harness(options: { bids: Readonly<Record<string, number>>; hasRunningAttempt?: boolean }) {
  const database = openTestDatabase();
  const repository = new RoomRepository(database);
  const clock = new FakeClock();
  const ids = sequentialIds();
  const process = new FakeProcess(2000);
  const charters = createRosterCharterProvider({
    transport: { post: async () => ({ status: 500, body: "unavailable in this test" }) },
  });
  const contributor = createRoomAdapterContributor({
    adapters: [
      fakeParticipant("codex", (persona) => `${persona}: I'll draft the plan.`),
      fakeParticipant("claude", (persona) => `${persona}: Here's my pushback.`),
      fakeParticipant("ollama", (persona) => `${persona}: Quick local take.`),
    ],
    charters,
  });
  const scorer = createOllamaRoomScorer({ scorer: fakeOllamaScorer(options.bids), charters });
  const revalidator = createAlwaysDropRevalidator();
  const quota = createFactoryAwareQuotaGovernor({
    activity: { hasRunningAttempt: () => options.hasRunningAttempt ?? false },
  });
  const providerCatalog: RoomProviderCatalogPort = {
    resolve: (provider) => ({
      family: provider as ProviderFamilyV1,
      model: `${provider}-test-model`,
    }),
  };
  const moderator = new RoomModerator({
    repository,
    scorer,
    contributor,
    revalidator,
    process,
    clock,
    ids,
    quota,
    providerCatalog,
    wait: neverResolvingWait,
    random: { fraction: () => 0.5 },
  });
  repository.createRoom(roomSpec(), clock.instant());
  return { database, repository, clock, ids, moderator };
}

function humanPosts(h: ReturnType<typeof harness>, body: string): RoomTriggerV1 {
  const now = h.clock.advance(1_000);
  const appended = h.repository.appendHumanMessage({
    roomId: roomSpec().roomId,
    messageId: h.ids.messageId(),
    handle: HUMAN,
    body,
    now,
  });
  const trigger = h.repository.takePendingTrigger(roomSpec().roomId);
  if (trigger === null) throw new Error("expected a human trigger");
  expect(appended.message.sequence).toBe(trigger.sourceSequence);
  return trigger;
}

afterEach(() => {
  cleanupTestDatabases();
});

describe("real RoomModerator + RoomRepository (SQLite) wired to the studio-room-adapters ports", () => {
  it("runs one full round: scores, grants the highest bidder, and commits its reply to the transcript", async () => {
    const h = harness({ bids: { "codex-planner": 3, "claude-critic": 1, "local-scout": 0 } });
    const trigger = humanPosts(h, "What's the riskiest assumption in shipping this?");

    const outcome: RoomRoundOutcome = await h.moderator.runRound(roomSpec().roomId, trigger);

    expect(outcome).toMatchObject({
      kind: "granted",
      persona: "codex-planner",
      outcome: { kind: "committed" },
    });
    const messages = h.repository.listMessages(roomSpec().roomId, 0, 10);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      kind: "message",
      author: { kind: "human", handle: "priyansh" },
    });
    expect(messages[1]).toMatchObject({
      kind: "message",
      author: { kind: "agent", persona: "codex-planner" },
      body: "codex-planner: I'll draft the plan.",
    });
  });

  it("throttles the round when the factory has a running attempt, without granting anyone the floor", async () => {
    const h = harness({
      bids: { "codex-planner": 3, "claude-critic": 1, "local-scout": 0 },
      hasRunningAttempt: true,
    });
    const trigger = humanPosts(h, "Are we blocked on anything?");
    const outcome = await h.moderator.runRound(roomSpec().roomId, trigger);
    expect(outcome.kind).toBe("throttled");
    const messages = h.repository.listMessages(roomSpec().roomId, 0, 10);
    // Only the human message and the "throttled" system line -- no agent spoke.
    expect(
      messages.some((message) => message.kind === "message" && message.author.kind === "agent"),
    ).toBe(false);
  });

  it("forces the mentioned persona to speak even when the scorer bids everyone at 0", async () => {
    const h = harness({ bids: { "codex-planner": 0, "claude-critic": 0, "local-scout": 0 } });
    const trigger = humanPosts(h, "@claude-critic what do you think?");
    const outcome = await h.moderator.runRound(roomSpec().roomId, trigger);
    expect(outcome).toMatchObject({ kind: "granted", persona: "claude-critic" });
  });

  it("posts 'all agents passed' when no one bids and no one is mentioned", async () => {
    const h = harness({ bids: {} });
    const trigger = humanPosts(h, "Just thinking out loud, no question here.");
    const outcome = await h.moderator.runRound(roomSpec().roomId, trigger);
    expect(outcome.kind).toBe("all-passed");
    const messages = h.repository.listMessages(roomSpec().roomId, 0, 10);
    expect(messages.at(-1)).toMatchObject({ kind: "system", code: "all-passed" });
  });
});
