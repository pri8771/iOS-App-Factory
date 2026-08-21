import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CommandRequestV1Schema, type CommandRequestV1 } from "@app-factory/contracts";
import type { RoomRepository } from "@app-factory/studio-rooms";
import { afterEach, describe, expect, it } from "vitest";

import { openDaemonCommandRuntime, type DaemonCommandRuntime } from "../src/command-runtime.js";
import {
  createRoomsSubsystemHandle,
  createRoomSubsystem,
  type RoomsSubsystemHandle,
} from "../src/room-subsystem.js";

/**
 * Unit coverage for `RoomsSubsystemHandle` (Architecture decision 3): `swap` must stop whatever
 * subsystem is currently adopted -- awaiting an in-flight round so it finishes on its OWN captured
 * contributor closure -- BEFORE the next subsystem's adapters ever see a grant. This is the "Reload
 * races" mitigation the plan calls out; see `room-subsystem.ts`'s own doc comment on the type.
 */

const T0 = "2026-08-16T12:00:00.000Z";
const ROOM_ID = "30000000-0000-4000-8000-000000000001";

const roots: string[] = [];
const runtimes: DaemonCommandRuntime[] = [];

afterEach(async () => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "app-factory-room-subsystem-runtime-"));
  roots.push(root);
  return root;
}

function commandId(suffix: number): string {
  return `80000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function request(
  operation: CommandRequestV1["operation"],
  suffix: number,
  payload: unknown,
): CommandRequestV1 {
  return CommandRequestV1Schema.parse({
    schemaVersion: 1,
    commandId: commandId(suffix),
    issuedAt: T0,
    origin: "cli",
    operation,
    payload,
  });
}

async function invoke(runtime: DaemonCommandRuntime, command: CommandRequestV1) {
  return await runtime.handler(command, { requestId: commandId(9_999_999) });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolveFn!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolveFn = resolvePromise;
  });
  return { promise, resolve: resolveFn };
}

const scorer = {
  score: (scoreRequest: { candidates: readonly { persona: string }[] }) =>
    Promise.resolve(
      Object.fromEntries(
        scoreRequest.candidates.map((candidate) => [
          candidate.persona,
          candidate.persona === "critic" ? 3 : 0,
        ]),
      ),
    ),
};
const revalidator = { revalidate: () => Promise.resolve({ decision: "post" as const }) };
const providerCatalog = { resolve: () => ({ family: "ollama" as const, model: "test-model" }) };
const fakeProcess = { pid: process.pid, isAlive: () => false, kill: () => false };

const spec = {
  roomId: ROOM_ID,
  title: "Kickoff",
  projectId: "30000000-0000-4000-8000-000000000010",
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
};

describe("RoomsSubsystemHandle.swap (Architecture decision 3)", () => {
  it("lets an in-flight round finish on its OWN contributor closure before the next subsystem ever adopts", async () => {
    const root = await makeRoot();
    let repository: RoomRepository | null = null;
    const handleBox: { handle: RoomsSubsystemHandle | null } = { handle: null };

    const gate = deferred<undefined>();
    let contributeCallsOnA = 0;
    const contributorA = {
      contribute: async () => {
        contributeCallsOnA += 1;
        await gate.promise;
        return { kind: "message" as const, body: "from A", tokensUsed: 10 };
      },
    };
    let contributeCallsOnB = 0;
    const contributorB = {
      contribute: () => {
        contributeCallsOnB += 1;
        return Promise.resolve({ kind: "message" as const, body: "from B", tokensUsed: 20 });
      },
    };

    const runtime = await openDaemonCommandRuntime({
      runtimeDirectory: root,
      daemonVersion: "0.1.0-swap-test",
      startedAt: T0,
      now: () => T0,
      initializeRooms: (context) => {
        repository = context.rooms;
        const handle = createRoomsSubsystemHandle();
        handle.adopt(
          createRoomSubsystem(
            {
              enabled: true,
              scorer,
              contributor: contributorA,
              revalidator,
              providerCatalog,
              process: fakeProcess,
              clock: { now: () => new Date(T0) },
            },
            context.rooms,
          ),
        );
        handle.start();
        handleBox.handle = handle;
        return handle.statusPort;
      },
    });
    runtimes.push(runtime);
    const handle = handleBox.handle;
    if (handle === null || repository === null) throw new Error("handle not composed");
    const statusPortBeforeSwap = handle.statusPort;

    await invoke(runtime, request("room.create", 1, spec));
    await invoke(
      runtime,
      request("room.post", 2, { roomId: ROOM_ID, handle: "p", body: "@critic go" }),
    );

    // Let the round actually start and block inside contributorA.
    const startDeadline = Date.now() + 3_000;
    while (contributeCallsOnA === 0) {
      if (Date.now() >= startDeadline) throw new Error("round never reached the contributor");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    // Swap while the round is still in flight. `swap()` must not resolve until the round finishes.
    const nextSubsystem = createRoomSubsystem(
      {
        enabled: true,
        scorer,
        contributor: contributorB,
        revalidator,
        providerCatalog,
        process: fakeProcess,
        clock: { now: () => new Date(T0) },
      },
      repository,
    );
    let swapped = false;
    const swapPromise = handle.swap(nextSubsystem).then(() => {
      swapped = true;
    });

    // Still blocked: swap has not completed while the round holds the gate.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(swapped).toBe(false);
    expect(contributeCallsOnB).toBe(0);

    // Release the in-flight round; it finishes on contributorA (its own captured closure), THEN
    // swap adopts the next subsystem.
    gate.resolve();
    await swapPromise;
    expect(swapped).toBe(true);

    // The `statusPort` object identity is stable across the swap -- a caller that captured it once
    // (command-runtime.ts's `roomsStatus` dependency) needs no re-wiring.
    expect(handle.statusPort).toBe(statusPortBeforeSwap);

    const afterFirstRound = await invoke(
      runtime,
      request("room.events", 3, { roomId: ROOM_ID, afterSequence: 0, limit: 10 }),
    );
    if (afterFirstRound.operation !== "room.events") throw new Error("unexpected result");
    const agentMessage = afterFirstRound.messages.find(
      (message) => message.kind === "message" && message.author.kind === "agent",
    );
    expect(agentMessage).toMatchObject({ body: "from A" });
    expect(contributeCallsOnB).toBe(0);

    // A NEW round, after the swap, uses the NEW subsystem's contributor.
    await invoke(
      runtime,
      request("room.post", 4, { roomId: ROOM_ID, handle: "p", body: "@critic again" }),
    );
    const deadline = Date.now() + 3_000;
    let afterSecondRound;
    for (;;) {
      afterSecondRound = await invoke(
        runtime,
        request("room.events", 5, { roomId: ROOM_ID, afterSequence: 0, limit: 10 }),
      );
      if (afterSecondRound.operation !== "room.events") throw new Error("unexpected result");
      if (
        afterSecondRound.messages.some(
          (message) =>
            message.kind === "message" &&
            message.author.kind === "agent" &&
            message.body === "from B",
        )
      ) {
        break;
      }
      if (Date.now() >= deadline) throw new Error("second round's agent reply never landed");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(contributeCallsOnB).toBeGreaterThan(0);
  });
});
