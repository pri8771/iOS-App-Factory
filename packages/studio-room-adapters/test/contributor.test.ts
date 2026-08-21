import { RoomProviderSchema } from "@app-factory/contracts";
import type { RoomContributionRequest } from "@app-factory/studio-rooms";
import { describe, expect, it } from "vitest";

import {
  createRoomAdapterContributor,
  type ParticipantAdapter,
  type RoomCharterProvider,
} from "../src/index.js";
import { roomSpec } from "./helpers.js";

function fakeCharters(): RoomCharterProvider {
  const observed: unknown[] = [];
  return {
    observe: (roomId, transcript) => {
      observed.push({ roomId, count: transcript.length });
    },
    charterFor: (room, participant) => ({
      roomCharter: `Charter for ${room.title}`,
      rollingSummary: "summary so far",
      personaCharter: `Persona charter for ${participant.persona}`,
      networkEnabled: false,
    }),
  };
}

function fakeAdapter(
  provider: string,
  contribute: ParticipantAdapter["contribute"],
): ParticipantAdapter {
  return { id: `fake.${provider}`, provider: RoomProviderSchema.parse(provider), contribute };
}

function requestFor(overrides: Partial<RoomContributionRequest> = {}): RoomContributionRequest {
  const spec = roomSpec();
  const room = {
    schemaVersion: 1 as const,
    roomId: spec.roomId,
    title: spec.title,
    projectId: spec.projectId,
    createdAt: "2026-08-16T10:00:00.000Z",
    updatedAt: "2026-08-16T10:00:00.000Z",
    unattendedEnabled: spec.unattendedEnabled,
    headSequence: 0,
    headMessageId: null,
    lastHumanAt: null,
    humanTypingUntil: null,
    roundCounter: 0,
    activeGrantId: null,
    pendingTrigger: null,
    agentCooldownEvents: spec.agentCooldownEvents,
    participants: spec.participants.map((participant, index) => ({
      ...participant,
      position: index,
      benchedUntil: null,
      benchReason: null,
    })),
    budget: {
      dayKey: "2026-08-16",
      ...spec.budget,
      spentTokens: 0,
      reservedTokens: 0,
      unattendedSpentTokens: 0,
    },
  } as RoomContributionRequest["room"];
  const participant = room.participants.at(0);
  if (participant === undefined) throw new Error("expected at least one participant");
  return {
    room,
    grant: {
      schemaVersion: 1,
      grantId: "70000000-0000-4000-9000-000000000001",
      roomId: room.roomId,
      roundNumber: 1,
      persona: participant.persona,
      headSequence: 0,
      state: "active",
      ownerPid: 1,
      workerPid: null,
      reservedTokens: 1_000,
      leaseExpiresAt: "2026-08-16T10:02:00.000Z",
      createdAt: "2026-08-16T10:00:00.000Z",
      updatedAt: "2026-08-16T10:00:00.000Z",
      outcome: null,
    } as RoomContributionRequest["grant"],
    participant,
    transcript: [],
    maxTokens: 1_000,
    signal: new AbortController().signal,
    reportWorkerPid: () => undefined,
    ...overrides,
  };
}

describe("createRoomAdapterContributor", () => {
  it("routes to the adapter matching the participant's provider and observes the transcript first", async () => {
    const codex = fakeAdapter("codex", async (ctx) => ({
      kind: "message",
      text: `codex saw charter: ${ctx.roomCharter}`,
      usage: { tokensUsed: 5, reported: null, costUsdMicros: null },
    }));
    const contributor = createRoomAdapterContributor({
      adapters: [codex],
      charters: fakeCharters(),
    });
    const result = await contributor.contribute(requestFor());
    expect(result).toEqual({
      kind: "message",
      body: "codex saw charter: Charter for Translation app risk review",
      tokensUsed: 5,
      usage: null,
      costUsdMicros: null,
    });
  });

  it("plumbs an adapter's honest reported usage and cost through unchanged (the honest token ledger)", async () => {
    const codex = fakeAdapter("codex", async () => ({
      kind: "message",
      text: "answer",
      usage: {
        tokensUsed: 5,
        reported: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 2 },
        costUsdMicros: 1_234,
      },
    }));
    const result = await createRoomAdapterContributor({
      adapters: [codex],
      charters: fakeCharters(),
    }).contribute(requestFor());
    expect(result).toEqual({
      kind: "message",
      body: "answer",
      tokensUsed: 5,
      usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 2 },
      costUsdMicros: 1_234,
    });
  });

  it("maps pass and typed error results through unchanged", async () => {
    const codex = fakeAdapter("codex", async () => ({
      kind: "pass",
      usage: { tokensUsed: 3, reported: null, costUsdMicros: null },
    }));
    const passResult = await createRoomAdapterContributor({
      adapters: [codex],
      charters: fakeCharters(),
    }).contribute(requestFor());
    expect(passResult).toEqual({ kind: "pass", tokensUsed: 3, usage: null, costUsdMicros: null });

    const failing = fakeAdapter("codex", async () => ({
      kind: "error",
      code: "limit",
      retryAfterMs: 60_000,
    }));
    const errorResult = await createRoomAdapterContributor({
      adapters: [failing],
      charters: fakeCharters(),
    }).contribute(requestFor());
    expect(errorResult).toEqual({ kind: "error", code: "limit", retryAfterMs: 60_000 });
  });

  it("fails closed with error(internal) when no adapter is registered for the provider", async () => {
    const contributor = createRoomAdapterContributor({ adapters: [], charters: fakeCharters() });
    const result = await contributor.contribute(requestFor());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("fails closed with error(internal) when the adapter throws instead of returning a typed error", async () => {
    const throwing = fakeAdapter("codex", async () => {
      throw new Error("boom");
    });
    const contributor = createRoomAdapterContributor({
      adapters: [throwing],
      charters: fakeCharters(),
    });
    const result = await contributor.contribute(requestFor());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("rejects a duplicate ParticipantAdapter registration for the same provider", () => {
    const codexA = fakeAdapter("codex", async () => ({
      kind: "pass",
      usage: { tokensUsed: 0, reported: null, costUsdMicros: null },
    }));
    const codexB = fakeAdapter("codex", async () => ({
      kind: "pass",
      usage: { tokensUsed: 0, reported: null, costUsdMicros: null },
    }));
    expect(() =>
      createRoomAdapterContributor({ adapters: [codexA, codexB], charters: fakeCharters() }),
    ).toThrow(TypeError);
  });
});
