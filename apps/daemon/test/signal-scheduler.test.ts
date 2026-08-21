import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { IsoInstantSchema, RoomProviderSchema, type SignalId } from "@app-factory/contracts";
import { createFactoryRepositories, openMigratedFactoryDatabase } from "@app-factory/kernel";
import type {
  ParticipantAdapter,
  ParticipantContext,
  ParticipantContributionResult,
} from "@app-factory/studio-room-adapters";
import type { RoomProviderCatalogPort } from "@app-factory/studio-rooms";
import { afterEach, describe, expect, it } from "vitest";

import type { DaemonLoopWait } from "../src/daemon-loop-wait.js";
import type { SignalScoutParticipantsPort } from "../src/signal-command-runtime.js";
import {
  computeSignalSlotIsoV1,
  createSignalSchedulerWorker,
  selectDueSignalV1,
  signalDueAtMs,
  SignalSchedulerLoop,
  type SignalSchedulerRepositories,
  type SignalSchedulerTickResult,
  type SignalSchedulerWorkerPort,
} from "../src/signal-scheduler.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function harness(): SignalSchedulerRepositories & {
  database: ReturnType<typeof openMigratedFactoryDatabase>;
} {
  const root = mkdtempSync(join(tmpdir(), "app-factory-signal-scheduler-"));
  roots.push(root);
  const database = openMigratedFactoryDatabase(join(root, "factory.sqlite"));
  const repositories = createFactoryRepositories(database);
  return {
    database,
    signals: repositories.signals,
    signalInsights: repositories.signalInsights,
    tokenUsage: repositories.tokenUsage,
  };
}

function signalId(suffix: number): SignalId {
  return `8c000000-0000-4000-8000-${String(suffix).padStart(12, "0")}` as SignalId;
}

const fakeProviderCatalog: RoomProviderCatalogPort = {
  resolve: (provider) => ({ family: "ollama", model: `${provider}-test-model` }),
};

function scriptedAdapter(
  answer: (context: ParticipantContext) => ParticipantContributionResult,
): ParticipantAdapter {
  return {
    id: "test.scripted-scout",
    provider: RoomProviderSchema.parse("codex"),
    contribute: async (ctx) => answer(ctx),
  };
}

function scoutParticipants(adapter: ParticipantAdapter | null): SignalScoutParticipantsPort {
  return { resolve: () => adapter };
}

const FINDING_JSON = JSON.stringify({
  schemaVersion: 1,
  headline: "Searches for gothic streetwear are up sharply heading into October.",
  rationale: "Three competitor stores added black-based capsules in the last two weeks.",
  confidence: "moderate",
  citations: [{ url: "https://example.com/trend-report", title: "Trend report" }],
});

describe("signalDueAtMs / selectDueSignalV1 (pure)", () => {
  const T0 = "2026-08-21T12:00:00.000Z";

  it("a manual-only signal (checkIntervalMinutes null) is never due", () => {
    const manual = {
      checkIntervalMinutes: null,
      lastCheckedAt: null,
      status: "active",
      signalId: signalId(1),
    } as never;
    expect(signalDueAtMs(manual)).toBe(Number.POSITIVE_INFINITY);
    expect(selectDueSignalV1([manual], T0)).toBeNull();
  });

  it("a never-checked scheduled signal is due immediately", () => {
    const fresh = {
      checkIntervalMinutes: 5,
      lastCheckedAt: null,
      status: "active",
      signalId: signalId(2),
    } as never;
    expect(signalDueAtMs(fresh)).toBe(Number.NEGATIVE_INFINITY);
    expect(selectDueSignalV1([fresh], T0)).toBe(fresh);
  });

  it("skips a signal checked more recently than its interval, and a paused one regardless", () => {
    const recentlyChecked = {
      checkIntervalMinutes: 30,
      lastCheckedAt: "2026-08-21T11:55:00.000Z", // 5 minutes ago, interval is 30
      status: "active",
      signalId: signalId(3),
    } as never;
    const pausedButOverdue = {
      checkIntervalMinutes: 5,
      lastCheckedAt: "2026-08-21T00:00:00.000Z",
      status: "paused",
      signalId: signalId(4),
    } as never;
    expect(selectDueSignalV1([recentlyChecked, pausedButOverdue], T0)).toBeNull();
  });

  it("picks the most-overdue signal, breaking ties deterministically by signalId", () => {
    const overdue = {
      checkIntervalMinutes: 5,
      lastCheckedAt: "2026-08-21T11:00:00.000Z", // due since 11:05, 55 min overdue
      status: "active",
      signalId: signalId(5),
    } as never;
    const barelyDue = {
      checkIntervalMinutes: 5,
      lastCheckedAt: "2026-08-21T11:54:00.000Z", // due since 11:59, 1 min overdue
      status: "active",
      signalId: signalId(6),
    } as never;
    expect(selectDueSignalV1([barelyDue, overdue], T0)).toBe(overdue);
  });
});

describe("computeSignalSlotIsoV1 (pure)", () => {
  it("aligns to epoch-relative interval boundaries, stable within a slot and distinct across one", () => {
    const withinFirstSlot = computeSignalSlotIsoV1("2026-08-21T12:03:40.000Z", 5);
    const stillFirstSlot = computeSignalSlotIsoV1("2026-08-21T12:04:59.999Z", 5);
    const nextSlot = computeSignalSlotIsoV1("2026-08-21T12:05:00.000Z", 5);
    expect(withinFirstSlot).toBe(stillFirstSlot);
    expect(nextSlot).not.toBe(withinFirstSlot);
    expect(withinFirstSlot).toBe("2026-08-21T12:00:00.000Z");
    expect(nextSlot).toBe("2026-08-21T12:05:00.000Z");
  });
});

describe("createSignalSchedulerWorker (real kernel repository, fake scout + clock)", () => {
  it("due selection: checks the one due signal, then reports idle once it is no longer due", async () => {
    const h = harness();
    h.signals.create({
      signalId: signalId(10),
      name: "Manual",
      watchDescription: "Watch manually.",
      scoutProvider: "codex",
      createdAt: "2026-08-21T00:00:00.000Z",
      checkIntervalMinutes: null,
    });
    const scheduled = h.signals.create({
      signalId: signalId(11),
      name: "Scheduled",
      watchDescription: "Watch on a schedule.",
      scoutProvider: "codex",
      createdAt: "2026-08-21T00:00:00.000Z",
      checkIntervalMinutes: 5,
    });
    const adapter = scriptedAdapter(() => ({
      kind: "pass",
      usage: { tokensUsed: 5, reported: null, costUsdMicros: null },
    }));
    let now = IsoInstantSchema.parse("2026-08-21T12:00:00.000Z");
    const worker = createSignalSchedulerWorker({
      repositories: {
        signals: h.signals,
        signalInsights: h.signalInsights,
        tokenUsage: h.tokenUsage,
      },
      scoutParticipants: scoutParticipants(adapter),
      providerCatalog: fakeProviderCatalog,
      clock: { now: () => new Date(now) },
    });

    const first = await worker.processNextDueSignal(new AbortController().signal);
    expect(first).toMatchObject({ kind: "checked", signalId: scheduled.signalId });
    expect(h.signals.findById(scheduled.signalId)).toMatchObject({
      checkCount: 1,
      lastCheckedAt: now,
    });

    // Still well inside the 5-minute interval: no longer due.
    now = IsoInstantSchema.parse("2026-08-21T12:01:00.000Z");
    const second = await worker.processNextDueSignal(new AbortController().signal);
    expect(second).toEqual({ kind: "idle" });
    expect(h.signals.findById(scheduled.signalId)?.checkCount).toBe(1);
    h.database.close();
  });

  it("failure still records the check: a scout error advances checkCount with no insight", async () => {
    const h = harness();
    const scheduled = h.signals.create({
      signalId: signalId(12),
      name: "Failing scout",
      watchDescription: "Watch something.",
      scoutProvider: "codex",
      createdAt: "2026-08-21T00:00:00.000Z",
      checkIntervalMinutes: 5,
    });
    const adapter = scriptedAdapter(() => ({
      kind: "error",
      code: "internal",
      retryAfterMs: null,
    }));
    const now = IsoInstantSchema.parse("2026-08-21T12:00:00.000Z");
    const worker = createSignalSchedulerWorker({
      repositories: {
        signals: h.signals,
        signalInsights: h.signalInsights,
        tokenUsage: h.tokenUsage,
      },
      scoutParticipants: scoutParticipants(adapter),
      providerCatalog: fakeProviderCatalog,
      clock: { now: () => new Date(now) },
    });

    const result = await worker.processNextDueSignal(new AbortController().signal);
    expect(result).toMatchObject({
      kind: "checked",
      signalId: scheduled.signalId,
      outcome: { kind: "scout-failed", code: "scout-error" },
    });
    expect(h.signals.findById(scheduled.signalId)).toMatchObject({
      checkCount: 1,
      insightCount: 0,
      lastCheckedAt: now,
    });
    // No usable usage on a typed error contribution: no token_usage row to attribute.
    expect(h.tokenUsage.summarize({ sinceDays: 1, asOf: now }).rows).toEqual([]);
    h.database.close();
  });

  it("slot idempotency: a crashed-and-retried check in the SAME slot dedupes via the insight digest, never a second row", async () => {
    const h = harness();
    const scheduled = h.signals.create({
      signalId: signalId(13),
      name: "Slot dedupe",
      watchDescription: "Watch something.",
      scoutProvider: "codex",
      createdAt: "2026-08-21T00:00:00.000Z",
      checkIntervalMinutes: 5,
    });
    const adapter = scriptedAdapter(() => ({
      kind: "message",
      text: FINDING_JSON,
      usage: {
        tokensUsed: 40,
        reported: { inputTokens: 100, outputTokens: 50, cachedInputTokens: null },
        costUsdMicros: null,
      },
    }));
    const now = IsoInstantSchema.parse("2026-08-21T12:00:00.000Z");
    const worker = createSignalSchedulerWorker({
      repositories: {
        signals: h.signals,
        signalInsights: h.signalInsights,
        tokenUsage: h.tokenUsage,
      },
      scoutParticipants: scoutParticipants(adapter),
      providerCatalog: fakeProviderCatalog,
      clock: { now: () => new Date(now) },
    });

    const first = await worker.processNextDueSignal(new AbortController().signal);
    expect(first).toMatchObject({ kind: "checked", outcome: { kind: "found" } });
    const afterFirst = h.signalInsights.listBySignal(scheduled.signalId);
    expect(afterFirst).toHaveLength(1);

    // Simulate a crash between finding the insight and the daemon otherwise moving on -- the
    // signal is made due again in the SAME slot (clock unchanged) by resetting lastCheckedAt
    // directly, exactly the retry window the slot-aligned insight identity exists to dedupe.
    h.database
      .prepare(`UPDATE signals SET last_checked_at = NULL WHERE signal_id = ?`)
      .run(scheduled.signalId);

    const second = await worker.processNextDueSignal(new AbortController().signal);
    expect(second).toMatchObject({ kind: "checked", outcome: { kind: "found" } });
    const afterSecond = h.signalInsights.listBySignal(scheduled.signalId);
    // Still exactly one row: the SAME slot-derived insight ID + matching digest deduped via
    // `SignalInsightRepository.record`'s own idempotency, never a second insight.
    expect(afterSecond).toHaveLength(1);
    expect(afterSecond[0]?.insightId).toBe(afterFirst[0]?.insightId);
    h.database.close();
  });
});

describe("SignalSchedulerLoop (fake worker + fake wait)", () => {
  it("idles at pollIntervalMs on 'idle', loops immediately again on 'checked'", async () => {
    let calls = 0;
    const worker: SignalSchedulerWorkerPort = {
      processNextDueSignal(): Promise<SignalSchedulerTickResult> {
        calls += 1;
        // First call finds work (loops immediately, no wait); every call after is idle.
        return Promise.resolve(
          calls === 1
            ? {
                kind: "checked",
                signalId: signalId(1),
                outcome: {
                  kind: "nothing-new",
                  usage: { tokensUsed: 0, reported: null, costUsdMicros: null },
                },
              }
            : { kind: "idle" },
        );
      },
    };
    const pollIntervalMs = 5_000;
    const loopRef: { current: SignalSchedulerLoop | null } = { current: null };
    let waitCalls = 0;
    const wait: DaemonLoopWait = (delayMs) => {
      waitCalls += 1;
      expect(delayMs).toBe(pollIntervalMs);
      if (waitCalls >= 2) loopRef.current?.requestStop();
      return Promise.resolve();
    };
    const loop = new SignalSchedulerLoop(worker, { pollIntervalMs, wait });
    loopRef.current = loop;
    loop.start();
    await loop.stopped();

    // Call 1: checked (no wait). Calls 2-3: idle, each followed by a wait; stop after the 2nd wait.
    expect(calls).toBe(3);
    expect(waitCalls).toBe(2);
    expect(loop.lastError).toBeNull();
  });

  it("backs off with growing bounded delays on persistent errors, never a hot loop", async () => {
    let attempts = 0;
    const worker: SignalSchedulerWorkerPort = {
      processNextDueSignal() {
        attempts += 1;
        return Promise.reject(new Error("simulated persistent failure"));
      },
    };
    const loopRef: { current: SignalSchedulerLoop | null } = { current: null };
    const delays: number[] = [];
    const wait: DaemonLoopWait = (delayMs) => {
      delays.push(delayMs);
      if (delays.length >= 4) loopRef.current?.requestStop();
      return Promise.resolve();
    };
    const loop = new SignalSchedulerLoop(worker, {
      pollIntervalMs: 100,
      maxBackoffMs: 1_000,
      wait,
    });
    loopRef.current = loop;
    loop.start();
    await loop.stopped();

    expect(attempts).toBe(4);
    expect(delays).toEqual([100, 200, 400, 800]);
    expect(loop.lastError).toBeInstanceOf(Error);
  });
});
