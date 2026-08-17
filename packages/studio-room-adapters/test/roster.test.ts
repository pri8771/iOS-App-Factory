import type { RoomChatMessageV1, RoomParticipantV1, RoomV1 } from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import { createRosterCharterProvider, parseRoomRosterConfigV1 } from "../src/index.js";
import { fakeOllamaTransport, ollamaGenerateEnvelope, roomIdOf } from "./helpers.js";

const ROOM_ID = roomIdOf("80000000-0000-4000-8000-000000000001");

function fakeRoom(overrides: Partial<RoomV1> = {}): RoomV1 {
  return {
    schemaVersion: 1,
    roomId: ROOM_ID,
    title: "Translation app risk review",
    projectId: null,
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    unattendedEnabled: false,
    headSequence: 0,
    headMessageId: null,
    lastHumanAt: null,
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
    ...overrides,
  } as RoomV1;
}

function getFirstParticipant(room: RoomV1): RoomParticipantV1 {
  const participant = room.participants.at(0);
  if (participant === undefined) throw new Error("expected at least one participant");
  return participant;
}

function chatMessage(sequence: number, body: string): RoomChatMessageV1 {
  return {
    schemaVersion: 1,
    roomId: ROOM_ID,
    messageId:
      `90000000-0000-4000-8000-${String(sequence).padStart(12, "0")}` as RoomChatMessageV1["messageId"],
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

describe("parseRoomRosterConfigV1", () => {
  it("parses a well-formed roster", () => {
    const roster = parseRoomRosterConfigV1({
      schemaVersion: 1,
      rooms: [
        {
          roomId: ROOM_ID,
          kind: "research",
          charter: "Research room about translation apps.",
          participants: [{ persona: "codex-planner", oneLineCharter: "Plans the work." }],
        },
      ],
    });
    expect(roster.rooms).toHaveLength(1);
  });

  it("rejects an unknown room kind", () => {
    expect(() =>
      parseRoomRosterConfigV1({
        schemaVersion: 1,
        rooms: [{ roomId: ROOM_ID, kind: "banana", participants: [] }],
      }),
    ).toThrow();
  });
});

describe("createRosterCharterProvider", () => {
  it("falls back to a derived charter and persona charter when no roster entry exists", () => {
    const provider = createRosterCharterProvider({
      transport: fakeOllamaTransport(async () => ({ status: 200, body: "{}" })),
    });
    const room = fakeRoom();
    const snapshot = provider.charterFor(room, getFirstParticipant(room));
    expect(snapshot.roomCharter).toContain("Translation app risk review");
    expect(snapshot.personaCharter).toContain("Codex Planner");
    expect(snapshot.networkEnabled).toBe(false);
    expect(snapshot.rollingSummary).toBe("");
  });

  it("honors an explicit roster entry's charter, persona charter, and research network policy", () => {
    const roster = parseRoomRosterConfigV1({
      schemaVersion: 1,
      rooms: [
        {
          roomId: ROOM_ID,
          kind: "research",
          charter: "Custom charter text.",
          participants: [{ persona: "codex-planner", oneLineCharter: "Custom persona charter." }],
        },
      ],
    });
    const provider = createRosterCharterProvider({
      roster,
      transport: fakeOllamaTransport(async () => ({ status: 200, body: "{}" })),
    });
    const room = fakeRoom();
    const snapshot = provider.charterFor(room, getFirstParticipant(room));
    expect(snapshot.roomCharter).toBe("Custom charter text.");
    expect(snapshot.personaCharter).toBe("Custom persona charter.");
    expect(snapshot.networkEnabled).toBe(true);
  });

  it("observing new messages regenerates the rolling summary via the local model", async () => {
    const transport = fakeOllamaTransport(async () => ({
      status: 200,
      body: ollamaGenerateEnvelope("The room discussed shipping risk."),
    }));
    const provider = createRosterCharterProvider({
      transport,
      summarizerConfig: { everyMessages: 1 },
    });
    const room = fakeRoom();
    provider.observe(room.roomId, [chatMessage(1, "What's the biggest risk?")]);
    // Regeneration runs in the background; poll briefly for it to land.
    for (let attempt = 0; attempt < 50 && transport.requests.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(transport.requests.length).toBeGreaterThan(0);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const snapshot = provider.charterFor(room, getFirstParticipant(room));
      if (snapshot.rollingSummary.length > 0) {
        expect(snapshot.rollingSummary).toContain("shipping risk");
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("rolling summary was never regenerated");
  });

  it("never re-observes a message it has already fed to the summarizer (no duplicate-seq throw)", () => {
    const provider = createRosterCharterProvider({
      transport: fakeOllamaTransport(async () => ({ status: 200, body: "{}" })),
    });
    const room = fakeRoom();
    const messages = [chatMessage(1, "first"), chatMessage(2, "second")];
    provider.observe(room.roomId, messages);
    expect(() => provider.observe(room.roomId, messages)).not.toThrow();
  });

  it("rejects a duplicate roomId in the roster", () => {
    expect(() =>
      createRosterCharterProvider({
        roster: {
          schemaVersion: 1,
          rooms: [
            { roomId: ROOM_ID, kind: "project", participants: [] },
            { roomId: ROOM_ID, kind: "research", participants: [] },
          ],
        },
        transport: fakeOllamaTransport(async () => ({ status: 200, body: "{}" })),
      }),
    ).toThrow(TypeError);
  });
});
