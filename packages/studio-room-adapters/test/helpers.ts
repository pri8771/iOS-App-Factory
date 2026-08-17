import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  IsoInstantSchema,
  RoomGrantIdSchema,
  RoomIdSchema,
  RoomMessageIdSchema,
  type IsoInstant,
  type RoomCreateSpecV1,
  type RoomId,
} from "@app-factory/contracts";
import { openMigratedFactoryDatabase } from "@app-factory/kernel";
import type { RoomClockPort, RoomIdFactoryPort, RoomProcessPort } from "@app-factory/studio-rooms";
import type Database from "better-sqlite3";

export const T0 = IsoInstantSchema.parse("2026-08-16T10:00:00.000Z");
export const ROOM_ID = RoomIdSchema.parse("50000000-0000-4000-8000-000000000001");
export const PROJECT_ID = "50000000-0000-4000-8000-000000000010";

const directories: string[] = [];
const databases: Database.Database[] = [];

export function openTestDatabase(): Database.Database {
  const directory = mkdtempSync(join(tmpdir(), "studio-room-adapters-"));
  directories.push(directory);
  const database = openMigratedFactoryDatabase(join(directory, "control-plane.sqlite"));
  databases.push(database);
  return database;
}

export function cleanupTestDatabases(): void {
  for (const database of databases.splice(0)) {
    if (database.open) database.close();
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
}

export function roomSpec(overrides: Partial<RoomCreateSpecV1> = {}): RoomCreateSpecV1 {
  return {
    roomId: ROOM_ID,
    title: "Translation app risk review",
    projectId: PROJECT_ID as RoomCreateSpecV1["projectId"],
    unattendedEnabled: false,
    agentCooldownEvents: 2,
    participants: [
      { persona: "codex-planner", provider: "codex", displayName: "Codex Planner" },
      { persona: "claude-critic", provider: "claude", displayName: "Claude Critic" },
      { persona: "local-scout", provider: "ollama", displayName: "Local Scout" },
    ],
    budget: {
      dailyCeilingTokens: 10_000,
      unattendedDailyCeilingTokens: 2_000,
      maxTokensPerReply: 1_000,
    },
    ...overrides,
  } as RoomCreateSpecV1;
}

export class FakeClock implements RoomClockPort {
  #current: number;

  public constructor(start: IsoInstant = T0) {
    this.#current = Date.parse(start);
  }

  public now(): Date {
    return new Date(this.#current);
  }

  public instant(): IsoInstant {
    return IsoInstantSchema.parse(new Date(this.#current).toISOString());
  }

  public advance(ms: number): IsoInstant {
    this.#current += ms;
    return this.instant();
  }
}

export function sequentialIds(prefix = "60000000"): RoomIdFactoryPort {
  let messages = 0;
  let grants = 0;
  return {
    messageId: () => {
      messages += 1;
      return RoomMessageIdSchema.parse(
        `${prefix}-0000-4000-8000-${String(messages).padStart(12, "0")}`,
      );
    },
    grantId: () => {
      grants += 1;
      return RoomGrantIdSchema.parse(
        `${prefix}-0000-4000-9000-${String(grants).padStart(12, "0")}`,
      );
    },
  };
}

export class FakeProcess implements RoomProcessPort {
  public readonly killed: number[] = [];
  readonly #alive: Set<number>;

  public constructor(
    public readonly pid: number,
    alive: readonly number[] = [],
  ) {
    this.#alive = new Set(alive);
  }

  public isAlive(pid: number): boolean {
    return this.#alive.has(pid);
  }

  public kill(pid: number): boolean {
    this.killed.push(pid);
    return this.#alive.delete(pid);
  }
}

export function roomIdOf(value: string): RoomId {
  return RoomIdSchema.parse(value);
}

export function neverAbortedSignal(): AbortSignal {
  return new AbortController().signal;
}

export type RecordedOllamaRequest = Readonly<{
  url: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
}>;

export type FakeOllamaTransport = Readonly<{
  post: (request: {
    url: string;
    body: string;
    signal: AbortSignal;
  }) => Promise<{ status: number; body: string }>;
  requests: RecordedOllamaRequest[];
}>;

/** A local `/api/generate` transport double: behavior decided per call by `respond`. */
export function fakeOllamaTransport(
  respond: (
    request: RecordedOllamaRequest,
    index: number,
  ) => Promise<{ status: number; body: string }>,
): FakeOllamaTransport {
  const requests: RecordedOllamaRequest[] = [];
  return {
    requests,
    async post(request) {
      const recorded: RecordedOllamaRequest = {
        url: request.url,
        body: JSON.parse(request.body) as Record<string, unknown>,
        signal: request.signal,
      };
      requests.push(recorded);
      return respond(recorded, requests.length - 1);
    },
  };
}

export function ollamaGenerateEnvelope(
  response: unknown,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    model: "qwen2.5-coder:14b",
    created_at: "2026-08-16T00:00:00Z",
    response: typeof response === "string" ? response : JSON.stringify(response),
    done: true,
    prompt_eval_count: 200,
    eval_count: 14,
    ...extra,
  });
}
