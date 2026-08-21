import { describe, expect, it } from "vitest";

import {
  RoomCreateSpecV1Schema,
  RoomFlavorV1Schema,
  RoomGrantOutcomeV1Schema,
  RoomUpdatePatchV1Schema,
  RoomUpdateSpecV1Schema,
  RoomV1Schema,
} from "../src/index.js";

const T0 = "2026-08-20T09:00:00.000Z";
const ROOM_ID = "30000000-0000-4000-8000-000000000001";

function roomCreateSpec(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    roomId: ROOM_ID,
    title: "Design review",
    projectId: null,
    unattendedEnabled: false,
    agentCooldownEvents: 2,
    participants: [{ persona: "architect", provider: "ollama", displayName: "Architect" }],
    budget: {
      dailyCeilingTokens: 10_000,
      unattendedDailyCeilingTokens: 1_000,
      maxTokensPerReply: 500,
    },
    ...overrides,
  };
}

function room(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    roomId: ROOM_ID,
    title: "Design review",
    projectId: null,
    createdAt: T0,
    updatedAt: T0,
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
        persona: "architect",
        provider: "ollama",
        displayName: "Architect",
        position: 0,
        benchedUntil: null,
        benchReason: null,
      },
    ],
    budget: {
      dayKey: "2026-08-20",
      dailyCeilingTokens: 10_000,
      unattendedDailyCeilingTokens: 1_000,
      maxTokensPerReply: 500,
      spentTokens: 0,
      reservedTokens: 0,
      unattendedSpentTokens: 0,
    },
    // Deliberately NOT including `flavor` or `archivedAt` -- this is exactly the shape every
    // room persisted before those fields existed.
    ...overrides,
  };
}

describe("RoomFlavorV1Schema", () => {
  it("accepts exactly room and direct", () => {
    expect(RoomFlavorV1Schema.options).toEqual(["room", "direct"]);
  });
});

describe("legacy compatibility: room and room-create-spec shapes predating flavor/archivedAt", () => {
  it("parses a stored room JSON with no flavor or archivedAt, defaulting flavor to room and archivedAt to null", () => {
    const parsed = RoomV1Schema.parse(room());
    expect(parsed.flavor).toBe("room");
    expect(parsed.archivedAt).toBeNull();
  });

  it("parses a room-create-spec with no flavor, defaulting to room", () => {
    const parsed = RoomCreateSpecV1Schema.parse(roomCreateSpec());
    expect(parsed.flavor).toBe("room");
  });

  it("still accepts an explicit direct flavor on both shapes", () => {
    expect(RoomV1Schema.parse(room({ flavor: "direct" })).flavor).toBe("direct");
    expect(RoomCreateSpecV1Schema.parse(roomCreateSpec({ flavor: "direct" })).flavor).toBe(
      "direct",
    );
  });

  it("rejects an unknown flavor", () => {
    expect(RoomV1Schema.safeParse(room({ flavor: "group" })).success).toBe(false);
  });
});

describe("RoomV1Schema.archivedAt", () => {
  it("accepts a non-null archivedAt for an archived room", () => {
    const parsed = RoomV1Schema.parse(room({ archivedAt: T0 }));
    expect(parsed.archivedAt).toBe(T0);
  });
});

describe("RoomUpdatePatchV1Schema / RoomUpdateSpecV1Schema", () => {
  it("rejects an empty patch (a no-op update is never valid)", () => {
    expect(RoomUpdatePatchV1Schema.safeParse({}).success).toBe(false);
    expect(
      RoomUpdateSpecV1Schema.safeParse({ roomId: ROOM_ID, expectedUpdatedAt: T0, patch: {} })
        .success,
    ).toBe(false);
  });

  it("accepts a single-field patch", () => {
    expect(RoomUpdatePatchV1Schema.safeParse({ title: "Renamed" }).success).toBe(true);
    expect(RoomUpdatePatchV1Schema.safeParse({ unattendedEnabled: true }).success).toBe(true);
    expect(RoomUpdatePatchV1Schema.safeParse({ archived: true }).success).toBe(true);
  });

  it("accepts add/removeParticipants and a replacement budget policy", () => {
    expect(
      RoomUpdatePatchV1Schema.safeParse({
        addParticipants: [{ persona: "critic", provider: "ollama", displayName: "Critic" }],
        removeParticipants: ["architect"],
        budget: {
          dailyCeilingTokens: 5_000,
          unattendedDailyCeilingTokens: 0,
          maxTokensPerReply: 200,
        },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown patch field (strict shape)", () => {
    expect(RoomUpdatePatchV1Schema.safeParse({ roomId: ROOM_ID }).success).toBe(false);
  });

  it("accepts a full update spec bound by a CAS expectedUpdatedAt", () => {
    expect(
      RoomUpdateSpecV1Schema.safeParse({
        roomId: ROOM_ID,
        expectedUpdatedAt: T0,
        patch: { unattendedEnabled: true },
      }).success,
    ).toBe(true);
  });
});

describe("RoomGrantOutcomeV1Schema usage/costUsdMicros", () => {
  it("defaults usage and costUsdMicros to null on a committed outcome missing them", () => {
    const parsed = RoomGrantOutcomeV1Schema.parse({
      kind: "committed",
      messageSequence: 2,
      tokensUsed: 100,
      revalidated: false,
    });
    expect(parsed).toMatchObject({ usage: null, costUsdMicros: null });
  });

  it("accepts a committed outcome with real reported usage and cost", () => {
    const parsed = RoomGrantOutcomeV1Schema.parse({
      kind: "committed",
      messageSequence: 2,
      tokensUsed: 100,
      revalidated: false,
      usage: { inputTokens: 80, outputTokens: 20, cachedInputTokens: null },
      costUsdMicros: 1_500,
    });
    expect(parsed.usage).toEqual({ inputTokens: 80, outputTokens: 20, cachedInputTokens: null });
  });

  it("defaults usage and costUsdMicros to null on a passed outcome missing them", () => {
    const parsed = RoomGrantOutcomeV1Schema.parse({ kind: "passed", tokensUsed: 10 });
    expect(parsed).toMatchObject({ usage: null, costUsdMicros: null });
  });

  it("leaves failed/dropped/orphaned outcomes unchanged (no usage field)", () => {
    expect(
      RoomGrantOutcomeV1Schema.safeParse({
        kind: "failed",
        code: "timeout",
        benchedUntil: T0,
      }).success,
    ).toBe(true);
    expect(
      RoomGrantOutcomeV1Schema.safeParse({
        kind: "failed",
        code: "timeout",
        benchedUntil: T0,
        usage: null,
      }).success,
    ).toBe(false);
  });
});
