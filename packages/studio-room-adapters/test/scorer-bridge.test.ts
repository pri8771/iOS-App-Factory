import type { RoomChatMessageV1, RoomScorerRequest, RoomV1 } from "@app-factory/contracts";
import type { ScoreRequestInputV1, ScoreResultV1 } from "@app-factory/ollama-scorer";
import { describe, expect, it } from "vitest";

import { createOllamaRoomScorer, createRosterCharterProvider } from "../src/index.js";
import { fakeOllamaTransport, roomIdOf } from "./helpers.js";

const ROOM_ID = roomIdOf("a0000000-0000-4000-8000-000000000001");

function fakeRoom(): RoomV1 {
  return {
    schemaVersion: 1,
    roomId: ROOM_ID,
    title: "Translation app risk review",
    projectId: null,
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    unattendedEnabled: false,
    headSequence: 1,
    headMessageId: null,
    lastHumanAt: "2026-08-16T10:00:00.000Z",
    humanTypingUntil: null,
    roundCounter: 0,
    activeGrantId: null,
    pendingTrigger: null,
    agentCooldownEvents: 2,
    participants: [
      {
        persona: "codex-planner",
        provider: "codex",
        displayName: "Codex Planner",
        position: 0,
        benchedUntil: null,
        benchReason: null,
      },
      {
        persona: "claude-critic",
        provider: "claude",
        displayName: "Claude Critic",
        position: 1,
        benchedUntil: null,
        benchReason: null,
      },
    ],
    budget: {
      dayKey: "2026-08-16",
      dailyCeilingTokens: 10_000,
      unattendedDailyCeilingTokens: 2_000,
      maxTokensPerReply: 1_000,
      spentTokens: 0,
      reservedTokens: 0,
      unattendedSpentTokens: 0,
    },
  } as RoomV1;
}

function chatMessage(sequence: number, body: string): RoomChatMessageV1 {
  return {
    schemaVersion: 1,
    roomId: ROOM_ID,
    messageId:
      `b0000000-0000-4000-8000-${String(sequence).padStart(12, "0")}` as RoomChatMessageV1["messageId"],
    sequence,
    occurredAt: "2026-08-16T10:00:00.000Z",
    roundNumber: null,
    grantId: null,
    kind: "message",
    author: { kind: "human", handle: "priyansh" } as RoomChatMessageV1["author"],
    body,
    mentions: [],
  };
}

function requestFor(room: RoomV1, transcript: RoomChatMessageV1[]): RoomScorerRequest {
  return {
    room,
    roundNumber: 1,
    transcript,
    candidates: room.participants.map((participant) => ({
      persona: participant.persona,
      provider: participant.provider,
      forced: false,
    })),
    signal: new AbortController().signal,
  };
}

describe("createOllamaRoomScorer", () => {
  it("forwards the shared charter/rolling-summary and the exact candidate personas, and maps bids back", async () => {
    const captured: ScoreRequestInputV1[] = [];
    const scorer = {
      async score(request: ScoreRequestInputV1): Promise<ScoreResultV1> {
        captured.push(request);
        return {
          schemaVersion: 1,
          roundId: request.roundId,
          outcome: "scored",
          bids: [
            { personaId: "codex-planner", urgency: 2 },
            { personaId: "claude-critic", urgency: 0 },
          ],
          model: "fake-model",
          latencyMs: 12,
          prefixDigest: `sha256:${"0".repeat(64)}`,
          promptDigest: `sha256:${"0".repeat(64)}`,
          detail: "",
          usage: null,
        };
      },
    };
    const charters = createRosterCharterProvider({
      transport: fakeOllamaTransport(async () => ({ status: 200, body: "{}" })),
    });
    const bridge = createOllamaRoomScorer({ scorer, charters });
    const room = fakeRoom();
    const transcript = [chatMessage(1, "What's the riskiest assumption?")];
    const bids = await bridge.score(requestFor(room, transcript));

    expect(bids).toEqual({ "codex-planner": 2, "claude-critic": 0 });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.roundId).toBe(`${ROOM_ID}:1`);
    expect(captured[0]?.personas.map((persona) => persona.id)).toEqual([
      "codex-planner",
      "claude-critic",
    ]);
    expect(captured[0]?.lastMessages).toEqual([
      { seq: 1, authorId: "priyansh", text: "What's the riskiest assumption?" },
    ]);
  });

  it("returns an empty record when the underlying scorer does not resolve to 'scored'", async () => {
    const scorer = {
      async score(request: ScoreRequestInputV1): Promise<ScoreResultV1> {
        return {
          schemaVersion: 1,
          roundId: request.roundId,
          outcome: "timeout",
          bids: [],
          model: "fake-model",
          latencyMs: 3_000,
          prefixDigest: `sha256:${"0".repeat(64)}`,
          promptDigest: `sha256:${"0".repeat(64)}`,
          detail: "no response within 3000ms",
          usage: null,
        };
      },
    };
    const charters = createRosterCharterProvider({
      transport: fakeOllamaTransport(async () => ({ status: 200, body: "{}" })),
    });
    const bridge = createOllamaRoomScorer({ scorer, charters });
    const bids = await bridge.score(requestFor(fakeRoom(), []));
    expect(bids).toEqual({});
  });
});
