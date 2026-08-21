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
import type Database from "better-sqlite3";

import type {
  ContributorPort,
  QuotaGovernorPort,
  RevalidatePort,
  RoomClockPort,
  RoomContributionRequest,
  RoomContributionResult,
  RoomIdFactoryPort,
  RoomProcessPort,
  RoomProviderCatalogPort,
  RoomProviderModelInfo,
  RoomRevalidationDecision,
  RoomRevalidationRequest,
  RoomScorerRequest,
  RoomWaitPort,
  ScorerPort,
} from "../src/index.js";

export const T0 = IsoInstantSchema.parse("2026-08-16T10:00:00.000Z");
export const ROOM_ID = RoomIdSchema.parse("30000000-0000-4000-8000-000000000001");
export const ROOM_ID_2 = RoomIdSchema.parse("30000000-0000-4000-8000-000000000002");
export const PROJECT_ID = "30000000-0000-4000-8000-000000000010";

const directories: string[] = [];
const databases: Database.Database[] = [];

export function openTestDatabase(): Database.Database {
  const directory = mkdtempSync(join(tmpdir(), "studio-rooms-"));
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

export function iso(value: string): IsoInstant {
  return IsoInstantSchema.parse(value);
}

export function plusMs(base: IsoInstant, ms: number): IsoInstant {
  return IsoInstantSchema.parse(new Date(Date.parse(base) + ms).toISOString());
}

export function roomSpec(overrides: Partial<RoomCreateSpecV1> = {}): RoomCreateSpecV1 {
  return {
    roomId: ROOM_ID,
    title: "Design review",
    projectId: PROJECT_ID as RoomCreateSpecV1["projectId"],
    unattendedEnabled: false,
    agentCooldownEvents: 2,
    participants: [
      { persona: "architect", provider: "ollama", displayName: "Architect" },
      { persona: "critic", provider: "ollama", displayName: "Critic" },
      { persona: "planner", provider: "codex", displayName: "Planner" },
    ],
    budget: {
      dailyCeilingTokens: 10_000,
      unattendedDailyCeilingTokens: 2_000,
      maxTokensPerReply: 1_000,
    },
    ...overrides,
  } as RoomCreateSpecV1;
}

const DEFAULT_TEST_PROVIDER_MODELS: Readonly<Record<string, RoomProviderModelInfo>> = {
  ollama: { family: "ollama", model: "llama3.1" },
  codex: { family: "codex", model: "gpt-5-codex" },
  claude: { family: "claude", model: "claude-opus-4" },
  openrouter: { family: "openrouter", model: "anthropic/claude-3.5-sonnet" },
};

/** Resolves the standard test fixture's providers (ollama/codex/claude/openrouter) to a plausible
 *  family+model out of the box; `set` registers any other provider key a test invents. Throws for
 *  anything unregistered, matching the port's own "never fabricate" contract. */
export class FakeProviderCatalog implements RoomProviderCatalogPort {
  readonly #overrides = new Map<string, RoomProviderModelInfo>();

  public set(provider: string, info: RoomProviderModelInfo): this {
    this.#overrides.set(provider, info);
    return this;
  }

  public resolve(provider: string): RoomProviderModelInfo {
    const info = this.#overrides.get(provider) ?? DEFAULT_TEST_PROVIDER_MODELS[provider];
    if (info === undefined) {
      throw new Error(`FakeProviderCatalog: no model configured for provider "${provider}"`);
    }
    return info;
  }
}

export function fakeProviderCatalog(): FakeProviderCatalog {
  return new FakeProviderCatalog();
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

  public set(instantValue: IsoInstant): void {
    this.#current = Date.parse(instantValue);
  }
}

type PendingWait = Readonly<{
  ms: number;
  resolve: () => void;
  reject: (error: Error) => void;
}>;

/**
 * Manual wait: every wait is parked until the test fires it, or aborts it via
 * its signal. Lets lease timeouts and defer waits be driven deterministically.
 */
export class ManualWait {
  readonly #pending: PendingWait[] = [];

  public get port(): RoomWaitPort {
    return (ms, signal) =>
      new Promise<void>((resolve, reject) => {
        const entry: PendingWait = { ms, resolve, reject };
        const abort = (): void => {
          const index = this.#pending.indexOf(entry);
          if (index !== -1) this.#pending.splice(index, 1);
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        };
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener("abort", abort, { once: true });
        this.#pending.push(entry);
      });
  }

  public get pendingMs(): readonly number[] {
    return this.#pending.map((entry) => entry.ms);
  }

  /** Fires the oldest pending wait whose duration matches (or the oldest, when no ms given). */
  public fire(ms?: number): boolean {
    const index = ms === undefined ? 0 : this.#pending.findIndex((entry) => entry.ms === ms);
    if (index === -1 || this.#pending.length === 0) return false;
    const [entry] = this.#pending.splice(index, 1);
    entry?.resolve();
    return true;
  }
}

/** Wait that resolves immediately unless aborted (for tests that do not exercise timing). */
export const instantWait: RoomWaitPort = async (_ms, signal) => {
  if (signal.aborted) {
    const error = new Error("aborted");
    error.name = "AbortError";
    throw error;
  }
};

/** Wait that never resolves on its own (lease timers never fire). */
export const neverWait: RoomWaitPort = (_ms, signal) =>
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

export function sequentialIds(prefix = "40000000"): RoomIdFactoryPort {
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

export class FakeScorer implements ScorerPort {
  public readonly calls: RoomScorerRequest[] = [];
  #verdicts: ((request: RoomScorerRequest) => Readonly<Record<string, number>>)[] = [];
  #fallback: (request: RoomScorerRequest) => Readonly<Record<string, number>>;

  public constructor(
    fallback: (request: RoomScorerRequest) => Readonly<Record<string, number>> = (request) =>
      Object.fromEntries(request.candidates.map(({ persona }) => [persona, 0])),
  ) {
    this.#fallback = fallback;
  }

  public queue(verdict: (request: RoomScorerRequest) => Readonly<Record<string, number>>): this {
    this.#verdicts.push(verdict);
    return this;
  }

  public setFallback(
    fallback: (request: RoomScorerRequest) => Readonly<Record<string, number>>,
  ): this {
    this.#fallback = fallback;
    return this;
  }

  public score(request: RoomScorerRequest): Promise<Readonly<Record<string, number>>> {
    this.calls.push(request);
    const next = this.#verdicts.shift() ?? this.#fallback;
    return Promise.resolve(next(request));
  }
}

export function scoreAll(urgency: number) {
  return (request: RoomScorerRequest): Readonly<Record<string, number>> =>
    Object.fromEntries(request.candidates.map(({ persona }) => [persona, urgency]));
}

export function scoreOnly(persona: string, urgency = 3) {
  return (request: RoomScorerRequest): Readonly<Record<string, number>> =>
    Object.fromEntries(
      request.candidates.map((candidate) => [
        candidate.persona,
        candidate.persona === persona ? urgency : 0,
      ]),
    );
}

export type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}>;

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export class FakeContributor implements ContributorPort {
  public readonly calls: RoomContributionRequest[] = [];
  #handlers: ((request: RoomContributionRequest) => Promise<RoomContributionResult>)[] = [];
  #fallback: (request: RoomContributionRequest) => Promise<RoomContributionResult>;

  public constructor(
    fallback: (request: RoomContributionRequest) => Promise<RoomContributionResult> = (request) =>
      Promise.resolve({
        kind: "message",
        body: `${request.participant.persona} reply #${String(request.grant.roundNumber)}`,
        tokensUsed: 100,
        usage: null,
        costUsdMicros: null,
      }),
  ) {
    this.#fallback = fallback;
  }

  public queue(
    handler: (request: RoomContributionRequest) => Promise<RoomContributionResult>,
  ): this {
    this.#handlers.push(handler);
    return this;
  }

  public setFallback(
    fallback: (request: RoomContributionRequest) => Promise<RoomContributionResult>,
  ): this {
    this.#fallback = fallback;
    return this;
  }

  public contribute(request: RoomContributionRequest): Promise<RoomContributionResult> {
    this.calls.push(request);
    const next = this.#handlers.shift() ?? this.#fallback;
    return next(request);
  }
}

export class FakeRevalidator implements RevalidatePort {
  public readonly calls: RoomRevalidationRequest[] = [];
  #decisions: RoomRevalidationDecision[] = [];
  #fallback: RoomRevalidationDecision;

  public constructor(fallback: RoomRevalidationDecision = { decision: "post" }) {
    this.#fallback = fallback;
  }

  public queue(decision: RoomRevalidationDecision): this {
    this.#decisions.push(decision);
    return this;
  }

  public revalidate(request: RoomRevalidationRequest): Promise<RoomRevalidationDecision> {
    this.calls.push(request);
    return Promise.resolve(this.#decisions.shift() ?? this.#fallback);
  }
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

export class RecordingQuota implements QuotaGovernorPort {
  public readonly reserved: number[] = [];
  public readonly settled: number[] = [];
  public released = 0;
  public refuseUntil: Date | null = null;

  public reserve(request: Parameters<QuotaGovernorPort["reserve"]>[0]) {
    if (this.refuseUntil !== null) {
      return { granted: false as const, retryAt: this.refuseUntil };
    }
    this.reserved.push(request.tokens);
    return {
      granted: true as const,
      reservation: {
        settle: (actual: number) => {
          this.settled.push(actual);
        },
        release: () => {
          this.released += 1;
        },
      },
    };
  }
}

export function roomIdOf(value: string): RoomId {
  return RoomIdSchema.parse(value);
}
