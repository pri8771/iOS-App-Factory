import { mkdtemp, rm } from "node:fs/promises";

import { RoomProviderSchema } from "@app-factory/contracts";
import type {
  ParticipantAdapter,
  ParticipantContext,
  ParticipantContributionResult,
} from "@app-factory/studio-room-adapters";
import { afterEach, describe, expect, it } from "vitest";

import {
  createCommandClient,
  type CommandClient,
} from "../../../packages/command-client/src/index.js";
import {
  startFactoryDaemonService,
  type FactoryDaemonService,
} from "../src/factory-daemon-service.js";
import { runSignalScout } from "../src/signal-command-runtime.js";

const AUTHORIZATION = "signal-command-runtime-test-token-000000000001";

const roots: string[] = [];
const services: FactoryDaemonService[] = [];
const clients: CommandClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  for (const service of services.splice(0)) await service.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function scriptedAdapter(
  answer: (context: ParticipantContext) => ParticipantContributionResult,
): ParticipantAdapter {
  return {
    id: "test.scripted-scout",
    provider: RoomProviderSchema.parse("codex"),
    contribute: async (ctx) => answer(ctx),
  };
}

const FINDING_JSON = JSON.stringify({
  schemaVersion: 1,
  headline: "Searches for gothic streetwear are up sharply heading into October.",
  rationale: "Three competitor stores added black-based capsules in the last two weeks.",
  confidence: "moderate",
  citations: [{ url: "https://example.com/trend-report", title: "Trend report" }],
});

describe("runSignalScout (pure)", () => {
  const signal = {
    schemaVersion: 1 as const,
    signalId: "9a000000-0000-4000-8000-000000000001" as never,
    name: "Halloween streetwear",
    watchDescription: "Fashion trends relevant to a Halloween-season streetwear Shopify store.",
    scoutProvider: RoomProviderSchema.parse("codex"),
    status: "active" as const,
    createdAt: "2026-08-19T00:00:00.000Z" as never,
    lastCheckedAt: null,
    checkCount: 0,
    insightCount: 0,
  };

  it("reports scout-not-configured when the resolver has no adapter for the signal's provider", async () => {
    const outcome = await runSignalScout({ resolve: () => null }, signal, [], {
      signal: new AbortController().signal,
    });
    expect(outcome).toMatchObject({ kind: "scout-failed", code: "scout-not-configured" });
  });

  it("returns nothing-new on a pass, carrying the contribution's usage", async () => {
    const adapter = scriptedAdapter(() => ({
      kind: "pass",
      usage: { tokensUsed: 10, reported: null, costUsdMicros: null },
    }));
    const outcome = await runSignalScout({ resolve: () => adapter }, signal, [], {
      signal: new AbortController().signal,
    });
    expect(outcome).toMatchObject({ kind: "nothing-new" });
    if (outcome.kind !== "nothing-new") throw new Error("expected nothing-new");
    expect(outcome.usage).toEqual({ tokensUsed: 10, reported: null, costUsdMicros: null });
  });

  it("parses a well-formed finding, and feeds networkEnabled=true and prior headlines into the context", async () => {
    let seen: ParticipantContext | undefined;
    const adapter = scriptedAdapter((ctx) => {
      seen = ctx;
      return { kind: "message", text: FINDING_JSON, usage: { tokensUsed: 40 } };
    });
    const outcome = await runSignalScout(
      { resolve: () => adapter },
      signal,
      ["Already-known headline"],
      { signal: new AbortController().signal },
    );
    expect(outcome).toMatchObject({
      kind: "found",
      finding: {
        headline: "Searches for gothic streetwear are up sharply heading into October.",
        confidence: "moderate",
      },
    });
    expect(seen?.networkEnabled).toBe(true);
    expect(seen?.roomCharter).toBe(signal.watchDescription);
    expect(seen?.transcript).toEqual([
      { author: "scout (already reported)", body: "Already-known headline" },
    ]);
  });

  it("fails closed on a finding with no citation (rejected by the contract, not silently accepted)", async () => {
    const uncited = JSON.stringify({
      schemaVersion: 1,
      headline: "Unsourced claim",
      rationale: "No evidence.",
      confidence: "weak",
      citations: [],
    });
    const adapter = scriptedAdapter(() => ({
      kind: "message",
      text: uncited,
      usage: { tokensUsed: 5 },
    }));
    const outcome = await runSignalScout({ resolve: () => adapter }, signal, [], {
      signal: new AbortController().signal,
    });
    expect(outcome).toMatchObject({ kind: "scout-failed", code: "scout-malformed-finding" });
  });

  it("fails closed on non-JSON output", async () => {
    const adapter = scriptedAdapter(() => ({
      kind: "message",
      text: "not json at all",
      usage: { tokensUsed: 5 },
    }));
    const outcome = await runSignalScout({ resolve: () => adapter }, signal, [], {
      signal: new AbortController().signal,
    });
    expect(outcome).toMatchObject({ kind: "scout-failed", code: "scout-malformed-finding" });
  });

  it("folds a provider error into scout-error", async () => {
    const adapter = scriptedAdapter(() => ({
      kind: "error",
      code: "capacity",
      retryAfterMs: null,
    }));
    const outcome = await runSignalScout({ resolve: () => adapter }, signal, [], {
      signal: new AbortController().signal,
    });
    expect(outcome).toMatchObject({ kind: "scout-failed", code: "scout-error" });
  });
});

describe("signal.* / insight.list through a live daemon", () => {
  it(
    "creates a signal, runs its Scout to a real finding, persists the insight, then runs again to nothing-new -- pause/resume and not-found are honest",
    { timeout: 30_000 },
    async () => {
      // /private/tmp, not tmpdir(): the unix command socket path must stay under 100 bytes.
      const root = await mkdtemp("/private/tmp/af-signal-");
      roots.push(root);
      let calls = 0;
      const adapter = scriptedAdapter(() => {
        calls += 1;
        return calls === 1
          ? { kind: "message", text: FINDING_JSON, usage: { tokensUsed: 40 } }
          : { kind: "pass", usage: { tokensUsed: 5 } };
      });
      const service = await startFactoryDaemonService({
        runtimeDirectory: root,
        authorization: AUTHORIZATION,
        daemonVersion: "0.1.0-signal-test",
        phaseParticipants: {
          resolve: (provider) => (String(provider) === "codex" ? adapter : null),
        },
        phaseProviderCatalog: {
          resolve: (provider) => ({ family: "codex", model: `${provider}-test-model` }),
        },
      });
      services.push(service);
      const client = createCommandClient({
        socketPath: service.socketPath,
        authorization: AUTHORIZATION,
        origin: "cli",
      });
      clients.push(client);

      const created = await client.createSignal({
        name: "Halloween streetwear",
        watchDescription: "Fashion trends relevant to a Halloween-season streetwear Shopify store.",
        scoutProvider: "codex",
      });
      expect(created.signal).toMatchObject({ status: "active", checkCount: 0, insightCount: 0 });

      const firstRun = await client.runSignalNow(created.signal.signalId);
      expect(firstRun.outcome).toEqual({ kind: "found" });
      expect(firstRun.insight?.headline).toBe(
        "Searches for gothic streetwear are up sharply heading into October.",
      );
      expect(firstRun.signal).toMatchObject({ checkCount: 1, insightCount: 1 });

      const insights = await client.listInsights(created.signal.signalId);
      expect(insights.insights).toHaveLength(1);
      expect(insights.insights[0]?.citations).toEqual([
        { url: "https://example.com/trend-report", title: "Trend report" },
      ]);

      const secondRun = await client.runSignalNow(created.signal.signalId);
      expect(secondRun.outcome).toEqual({ kind: "nothing-new" });
      expect(secondRun.insight).toBeNull();
      expect(secondRun.signal).toMatchObject({ checkCount: 2, insightCount: 1 });

      const paused = await client.pauseSignal(created.signal.signalId);
      expect(paused.signal.status).toBe("paused");
      const resumed = await client.resumeSignal(created.signal.signalId);
      expect(resumed.signal.status).toBe("active");

      const listed = await client.listSignals();
      expect(listed.signals.map((s) => s.signalId)).toEqual([created.signal.signalId]);

      // Wave 7: the scout call that found something honestly recorded a source: "signal"
      // token_usage row, attributed through the SAME provider catalog phase.run uses.
      const usage = await client.usageSummary(1);
      expect(usage.summary.rows.some((row) => row.providerKey === "codex")).toBe(true);

      // Wave 7: signal.reschedule round-trips a check interval, and clears it back to manual-only.
      const rescheduled = await client.rescheduleSignal(created.signal.signalId, 15);
      expect(rescheduled.signal.checkIntervalMinutes).toBe(15);
      const cleared = await client.rescheduleSignal(created.signal.signalId, null);
      expect(cleared.signal.checkIntervalMinutes).toBeNull();
      await expect(
        client.rescheduleSignal("9a000000-0000-4000-8000-000000000099", 15),
      ).rejects.toMatchObject({ code: "signal.not-found" });

      await expect(
        client.runSignalNow("9a000000-0000-4000-8000-000000000099"),
      ).rejects.toMatchObject({ code: "signal.not-found" });
    },
  );

  it(
    "reports scout-not-configured honestly instead of erroring when no adapter answers the signal's provider",
    { timeout: 15_000 },
    async () => {
      const root = await mkdtemp("/private/tmp/af-signal-");
      roots.push(root);
      const service = await startFactoryDaemonService({
        runtimeDirectory: root,
        authorization: AUTHORIZATION,
        daemonVersion: "0.1.0-signal-test",
        // No phaseParticipants configured: the default resolver answers null for every provider.
      });
      services.push(service);
      const client = createCommandClient({
        socketPath: service.socketPath,
        authorization: AUTHORIZATION,
        origin: "cli",
      });
      clients.push(client);
      const created = await client.createSignal({
        name: "Unconfigured",
        watchDescription: "Watch something.",
        scoutProvider: "openrouter-fast",
      });
      const run = await client.runSignalNow(created.signal.signalId);
      expect(run.outcome).toMatchObject({ kind: "scout-failed", code: "scout-not-configured" });
      expect(run.signal).toMatchObject({ checkCount: 1, insightCount: 0 });
    },
  );
});
