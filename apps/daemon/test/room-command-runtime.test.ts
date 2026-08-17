import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CommandRequestV1Schema,
  canonicalRoomParticipantsCatalogDigestInputV1,
  type CommandRequestV1,
  type RoomCreateSpecV1,
  type RoomId,
  type RoomParticipantsCatalogV1,
} from "@app-factory/contracts";
import { RoomModerator, RoomRepository, RoomModeratorLoop } from "@app-factory/studio-rooms";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  openDaemonCommandRuntime,
  ROOMS_SUBSYSTEM_DISABLED_REASON_V1,
  type DaemonCommandRuntime,
  type RoomParticipantsCatalogSourceV1,
} from "../src/command-runtime.js";
import { CommandHandlerError } from "../src/unix-command-server.js";

const T0 = "2026-08-16T12:00:00.000Z";
const REQUEST_ID = "20000000-0000-4000-8000-000000000012";
const ROOM_ID = "30000000-0000-4000-8000-000000000001";
const PROJECT_ID = "30000000-0000-4000-8000-000000000010";
const noBridge = () => ({ enabled: false as const, cursor: null });

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function commandId(suffix: number): string {
  return `20000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function request(
  operation: CommandRequestV1["operation"],
  suffix: number,
  payload: unknown,
  issuedAt = T0,
): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId: commandId(suffix),
    issuedAt,
    origin: "cli",
    operation,
    payload,
  });
}

function spec(overrides: Partial<RoomCreateSpecV1> = {}): RoomCreateSpecV1 {
  return {
    roomId: ROOM_ID,
    title: "Kickoff",
    projectId: PROJECT_ID,
    unattendedEnabled: false,
    agentCooldownEvents: 2,
    participants: [
      { persona: "architect", provider: "ollama", displayName: "Architect" },
      { persona: "critic", provider: "ollama", displayName: "Critic" },
    ],
    budget: {
      dailyCeilingTokens: 5_000,
      unattendedDailyCeilingTokens: 1_000,
      maxTokensPerReply: 500,
    },
    ...overrides,
  } as RoomCreateSpecV1;
}

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-room-runtime-"));
  roots.push(root);
  return root;
}

async function openRuntime(
  root: string,
  overrides: Partial<Parameters<typeof openDaemonCommandRuntime>[0]> = {},
): Promise<DaemonCommandRuntime> {
  const runtime = await openDaemonCommandRuntime({
    runtimeDirectory: root,
    daemonVersion: "0.1.0-rooms-test",
    startedAt: T0,
    now: () => T0,
    ...overrides,
  });
  runtimes.push(runtime);
  return runtime;
}

async function invoke(runtime: DaemonCommandRuntime, command: CommandRequestV1) {
  return await runtime.handler(command, { requestId: REQUEST_ID });
}

describe("room.* command boundary", () => {
  it("creates, lists, posts, reads, and signals typing as a durable transcript with the moderator inert", async () => {
    const runtime = await openRuntime(await makeRoot());
    const created = await invoke(runtime, request("room.create", 1, spec()));
    expect(created).toMatchObject({
      operation: "room.create",
      duplicate: false,
      room: { roomId: ROOM_ID, headSequence: 0, activeGrantId: null, roundCounter: 0 },
    });
    // Same commandId replays byte-equivalently; a fresh commandId with the same spec is a
    // duplicate create, not an error.
    expect(await invoke(runtime, request("room.create", 1, spec()))).toEqual(created);
    expect(await invoke(runtime, request("room.create", 2, spec()))).toMatchObject({
      duplicate: true,
    });

    const listed = await invoke(runtime, request("room.list", 3, { limit: 10 }));
    expect(listed).toMatchObject({ operation: "room.list", rooms: [{ roomId: ROOM_ID }] });

    const posted = await invoke(
      runtime,
      request("room.post", 4, { roomId: ROOM_ID, handle: "priyansh", body: "@critic hello" }),
    );
    expect(posted).toMatchObject({
      operation: "room.post",
      message: {
        sequence: 1,
        kind: "message",
        author: { kind: "human", handle: "priyansh" },
        mentions: ["critic"],
      },
      room: { headSequence: 1, lastHumanAt: T0, pendingTrigger: { kind: "human-message" } },
    });
    // A retried post with the same commandId does not append a second message.
    expect(
      await invoke(
        runtime,
        request("room.post", 4, { roomId: ROOM_ID, handle: "priyansh", body: "@critic hello" }),
      ),
    ).toEqual(posted);

    const typing = await invoke(
      runtime,
      request("room.typing", 5, { roomId: ROOM_ID, handle: "priyansh", ttlMs: 4_000 }),
    );
    expect(typing).toEqual({
      operation: "room.typing",
      roomId: ROOM_ID,
      typingUntil: "2026-08-16T12:00:04.000Z",
    });

    const events = await invoke(
      runtime,
      request("room.events", 6, { roomId: ROOM_ID, afterSequence: 0, limit: 100 }),
    );
    expect(events).toMatchObject({
      operation: "room.events",
      moderator: {
        enabled: false,
        attendance: "attended",
        factoryBridge: { enabled: false, cursor: null },
      },
      messages: [{ sequence: 1, kind: "message" }],
      nextAfterSequence: 1,
      room: { headSequence: 1, humanTypingUntil: "2026-08-16T12:00:04.000Z" },
    });
    const empty = await invoke(
      runtime,
      request("room.events", 7, { roomId: ROOM_ID, afterSequence: 1, limit: 100 }),
    );
    expect(empty).toMatchObject({ messages: [], nextAfterSequence: 1 });
  });

  it("forwards typed room refusals as protocol errors with their room.* codes", async () => {
    const runtime = await openRuntime(await makeRoot());
    await expect(
      invoke(runtime, request("room.post", 1, { roomId: ROOM_ID, handle: "p", body: "x" })),
    ).rejects.toMatchObject({
      name: "CommandHandlerError",
      code: "room.not-found",
      retryable: false,
    });
    await invoke(runtime, request("room.create", 2, spec()));
    await expect(
      invoke(runtime, request("room.create", 3, spec({ title: "Different" }))),
    ).rejects.toMatchObject({ code: "room.identity-conflict" });
    await expect(
      invoke(
        runtime,
        request("room.events", 4, {
          roomId: "30000000-0000-4000-8000-000000000099",
          afterSequence: 0,
          limit: 1,
        }),
      ),
    ).rejects.toBeInstanceOf(CommandHandlerError);
  });

  it("wakes the composed moderator only after a post is durably journaled", async () => {
    const wake = vi.fn<(roomId: RoomId) => void>();
    let seenRepository: RoomRepository | null = null;
    const runtime = await openRuntime(await makeRoot(), {
      initializeRooms: (context) => {
        seenRepository = context.rooms;
        return { enabled: true, dormancyMs: 60_000, wake, factoryBridge: noBridge };
      },
    });
    expect(seenRepository).toBeInstanceOf(RoomRepository);
    await invoke(runtime, request("room.create", 1, spec()));
    expect(wake).not.toHaveBeenCalled();
    await invoke(runtime, request("room.post", 2, { roomId: ROOM_ID, handle: "p", body: "hi" }));
    expect(wake).toHaveBeenCalledTimes(1);
    expect(wake).toHaveBeenCalledWith(ROOM_ID);
    // Journaled replay: no second wake for the same command.
    await invoke(runtime, request("room.post", 2, { roomId: ROOM_ID, handle: "p", body: "hi" }));
    expect(wake).toHaveBeenCalledTimes(1);
    const events = await invoke(
      runtime,
      request("room.events", 3, { roomId: ROOM_ID, afterSequence: 0, limit: 10 }),
    );
    expect(events).toMatchObject({ moderator: { enabled: true, attendance: "attended" } });
  });

  it("does not wake when the post's result-ledger boundary fails, and reports dormancy after the threshold", async () => {
    const wake = vi.fn<(roomId: RoomId) => void>();
    let boundaryFailures = 1;
    let clock = T0;
    const runtime = await openRuntime(await makeRoot(), {
      now: () => clock,
      initializeRooms: () => ({ enabled: true, dormancyMs: 60_000, wake, factoryBridge: noBridge }),
      commandResultLedgerBoundary: ({ request: entry }) => {
        if (entry.operation === "room.post" && boundaryFailures > 0) {
          boundaryFailures -= 1;
          throw new Error("journal unavailable");
        }
      },
    });
    await invoke(runtime, request("room.create", 1, spec()));
    await expect(
      invoke(runtime, request("room.post", 2, { roomId: ROOM_ID, handle: "p", body: "hi" })),
    ).rejects.toMatchObject({ code: "command.result-persistence-ambiguous", retryable: true });
    expect(wake).not.toHaveBeenCalled();
    // The append itself was authoritative; the retry reconstructs the result and wakes once.
    const retried = await invoke(
      runtime,
      request("room.post", 2, { roomId: ROOM_ID, handle: "p", body: "hi" }),
    );
    expect(retried).toMatchObject({ message: { sequence: 1 } });
    expect(wake).toHaveBeenCalledTimes(1);
    clock = "2026-08-16T12:01:00.000Z";
    const events = await invoke(
      runtime,
      request("room.events", 3, { roomId: ROOM_ID, afterSequence: 0, limit: 10 }),
    );
    expect(events).toMatchObject({ moderator: { enabled: true, attendance: "dormant" } });
  });
});

describe("room.participants.list", () => {
  const CATALOG_SOURCE: RoomParticipantsCatalogSourceV1 = {
    providers: [
      { provider: "codex", model: "gpt-5-codex", cliVersion: "0.42.0" },
      { provider: "ollama", model: "qwen2.5-coder:14b", cliVersion: null },
    ],
    roster: [
      {
        roomId: ROOM_ID,
        kind: "research",
        charter: "Kickoff planning.",
        participants: [{ persona: "architect", oneLineCharter: "Owns structure and trade-offs." }],
      },
    ],
  };

  function expectedDigest(catalog: RoomParticipantsCatalogV1): string {
    return `sha256:${createHash("sha256")
      .update(canonicalRoomParticipantsCatalogDigestInputV1(catalog), "utf8")
      .digest("hex")}`;
  }

  it("answers honestly, without erroring, when no moderator is composed", async () => {
    const runtime = await openRuntime(await makeRoot());
    const result = await invoke(runtime, request("room.participants.list", 1, {}));
    expect(result).toMatchObject({
      operation: "room.participants.list",
      catalog: {
        schemaVersion: 1,
        enabled: false,
        unavailableReason: ROOMS_SUBSYSTEM_DISABLED_REASON_V1,
        providers: [],
        roster: [],
        sourcedAt: T0,
      },
    });
    if (result.operation !== "room.participants.list") throw new Error("unreachable");
    expect(result.catalog.sourceDigest).toBe(expectedDigest(result.catalog));
    // Read-only: no durable result is journaled, so a fresh commandId answers identically.
    expect(await invoke(runtime, request("room.participants.list", 2, {}))).toEqual(result);
  });

  it("serves the composed moderator's catalog verbatim, digested over its canonical content", async () => {
    let clock = T0;
    const runtime = await openRuntime(await makeRoot(), {
      now: () => clock,
      initializeRooms: () => ({
        enabled: true,
        dormancyMs: 60_000,
        wake: () => undefined,
        factoryBridge: noBridge,
        participantsCatalog: CATALOG_SOURCE,
      }),
    });
    const result = await invoke(runtime, request("room.participants.list", 1, {}));
    expect(result).toMatchObject({
      operation: "room.participants.list",
      catalog: {
        enabled: true,
        unavailableReason: null,
        providers: CATALOG_SOURCE.providers,
        roster: CATALOG_SOURCE.roster,
        sourcedAt: T0,
      },
    });
    if (result.operation !== "room.participants.list") throw new Error("unreachable");
    expect(result.catalog.sourceDigest).toBe(expectedDigest(result.catalog));
    // The digest binds content, not the instant it was read: a later read of the same
    // configuration carries a new sourcedAt and the identical sourceDigest.
    clock = "2026-08-16T12:05:00.000Z";
    const later = await invoke(runtime, request("room.participants.list", 2, {}));
    if (later.operation !== "room.participants.list") throw new Error("unreachable");
    expect(later.catalog.sourcedAt).toBe(clock);
    expect(later.catalog.sourceDigest).toBe(result.catalog.sourceDigest);
  });

  it("reports an enabled moderator with nothing configured as enabled and empty, not unavailable", async () => {
    const runtime = await openRuntime(await makeRoot(), {
      initializeRooms: () => ({
        enabled: true,
        dormancyMs: 60_000,
        wake: () => undefined,
        factoryBridge: noBridge,
      }),
    });
    const result = await invoke(runtime, request("room.participants.list", 1, {}));
    expect(result).toMatchObject({
      catalog: { enabled: true, unavailableReason: null, providers: [], roster: [] },
    });
  });
});

describe("room moderator composed against the runtime database", () => {
  it("runs a full human -> agent round through the repository the commands write to", async () => {
    let repository: RoomRepository | null = null;
    let loop: RoomModeratorLoop | null = null;
    const runtime = await openRuntime(await makeRoot(), {
      initializeRooms: (context) => {
        repository = context.rooms;
        const moderator = new RoomModerator({
          repository: context.rooms,
          scorer: {
            score: (scoreRequest) =>
              Promise.resolve(
                Object.fromEntries(
                  scoreRequest.candidates.map((candidate) => [
                    candidate.persona,
                    candidate.persona === "critic" ? 3 : 0,
                  ]),
                ),
              ),
          },
          contributor: {
            contribute: (contribution) =>
              Promise.resolve({
                kind: "message",
                body: `${contribution.participant.persona} here`,
                tokensUsed: 42,
              }),
          },
          revalidator: { revalidate: () => Promise.resolve({ decision: "post" }) },
          process: { pid: process.pid, isAlive: () => false, kill: () => false },
          clock: { now: () => new Date(T0) },
        });
        loop = new RoomModeratorLoop({
          moderator,
          repository: context.rooms,
          onError: (error) => {
            throw error;
          },
        });
        loop.start();
        return {
          enabled: true,
          dormancyMs: moderator.dormancyMs,
          wake: (roomId) => loop?.wake(roomId),
          factoryBridge: noBridge,
        };
      },
    });
    await invoke(runtime, request("room.create", 1, spec()));
    await invoke(
      runtime,
      request("room.post", 2, { roomId: ROOM_ID, handle: "p", body: "@critic go" }),
    );
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline) {
      if (repository === null) throw new Error("repository not composed");
      const room = repository.requireRoom(ROOM_ID);
      if (room.headSequence >= 3 && room.pendingTrigger === null && room.activeGrantId === null)
        break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const events = await invoke(
      runtime,
      request("room.events", 3, { roomId: ROOM_ID, afterSequence: 0, limit: 10 }),
    );
    if (events.operation !== "room.events") throw new Error("unexpected result");
    expect(
      events.messages.map((message) =>
        message.kind === "system" ? `system:${message.code}` : message.author.kind,
      ),
    ).toEqual(["human", "agent", "system:all-passed"]);
    expect(events.room.budget).toMatchObject({ reservedTokens: 0, spentTokens: 42 });
    if (loop === null) throw new Error("loop not composed");
    await loop.stop();
  });
});
