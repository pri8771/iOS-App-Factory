// Regenerates Tests/StudioKitTests/Fixtures/usage-*.response.json, signal-*.response.json, and
// insight-*.response.json (Wave 8's honest token ledger and signals surfaces —
// token-usage.ts/signal.ts) through the real, built `@app-factory/contracts` — same "record
// through the real contracts" discipline as record-room-fixtures.mjs. Re-record with:
//   pnpm --filter @app-factory/contracts build && node apps/studio-mac/scripts/record-usage-signals-fixtures.mjs
import { writeFileSync } from "node:fs";
import { CommandResponseV1Schema } from "../../../packages/contracts/dist/index.js";

const rid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ok = (result) =>
  CommandResponseV1Schema.parse({ protocolVersion: 1, requestId: rid, ok: true, result });

// MARK: usage.summary — three (providerKey, model, dayKey) buckets: one fully reported (Claude
// self-reports cost), one partially reported (OpenRouter: completion tokens only, no prompt tokens
// or cost — the documented systematic undercount), one entirely unreported (Codex hardcodes 0
// today, so the ledger honestly records nothing rather than a fabricated number).
const usageRows = [
  {
    providerKey: "claude",
    model: "claude-sonnet-4-5",
    dayKey: "2026-08-16",
    inputTokens: 12_400,
    outputTokens: 3_100,
    cachedInputTokens: 2_000,
    costUsdMicros: 184_500,
    unreportedCount: 0,
  },
  {
    providerKey: "openrouter-fast",
    model: "google/gemini-2.5-flash",
    dayKey: "2026-08-16",
    inputTokens: null,
    outputTokens: 5_600,
    cachedInputTokens: null,
    costUsdMicros: null,
    unreportedCount: 0,
  },
  {
    providerKey: "codex",
    model: "gpt-5-codex",
    dayKey: "2026-08-16",
    inputTokens: null,
    outputTokens: null,
    cachedInputTokens: null,
    costUsdMicros: null,
    unreportedCount: 4,
  },
];

// MARK: Signals — one scheduled + active, one manual-only + paused.
const signalId1 = "90000001-0000-4000-8000-000000000001";
const signalId2 = "90000002-0000-4000-8000-000000000002";

const scheduledSignal = {
  schemaVersion: 1,
  signalId: signalId1,
  name: "OpenRouter pricing changes",
  watchDescription:
    "Watch for OpenRouter pricing or rate-limit changes that affect our configured models.",
  scoutProvider: "openrouter-fast",
  status: "active",
  createdAt: "2026-08-15T09:00:00.000Z",
  lastCheckedAt: "2026-08-16T18:00:00.000Z",
  checkCount: 5,
  insightCount: 2,
  checkIntervalMinutes: 60,
};

const manualSignal = {
  schemaVersion: 1,
  signalId: signalId2,
  name: "Competitor Shopify app launches",
  watchDescription: "Watch for new Shopify apps entering our category.",
  scoutProvider: "codex",
  status: "paused",
  createdAt: "2026-08-10T09:00:00.000Z",
  lastCheckedAt: null,
  checkCount: 0,
  insightCount: 0,
  checkIntervalMinutes: null,
};

const insight1 = {
  schemaVersion: 1,
  insightId: "91000001-0000-4000-8000-000000000001",
  signalId: signalId1,
  discoveredAt: "2026-08-16T18:00:03.000Z",
  headline: "OpenRouter added a 20% surcharge on Gemini 2.5 Flash during peak hours.",
  rationale:
    "Peak-hour pricing changes our per-reply cost model for the fast lane; worth flagging before the next budget review.",
  confidence: "strong",
  citations: [{ url: "https://openrouter.ai/docs/pricing", title: "OpenRouter pricing docs" }],
  insightDigest: `sha256:${"d".repeat(64)}`,
};

const insight2 = {
  ...insight1,
  insightId: "91000002-0000-4000-8000-000000000002",
  discoveredAt: "2026-08-14T12:00:00.000Z",
  headline: "OpenRouter deprecated the legacy Gemini 1.5 route.",
  confidence: "moderate",
  insightDigest: `sha256:${"e".repeat(64)}`,
};

const fixtures = {
  "usage-summary.response.json": ok({
    operation: "usage.summary",
    summary: { sinceDays: 7, rows: usageRows },
  }),

  "signal-create.response.json": ok({
    operation: "signal.create",
    signal: { ...scheduledSignal, lastCheckedAt: null, checkCount: 0, insightCount: 0 },
  }),
  "signal-list.response.json": ok({
    operation: "signal.list",
    signals: [scheduledSignal, manualSignal],
  }),
  "signal-pause.response.json": ok({
    operation: "signal.pause",
    signal: { ...scheduledSignal, status: "paused" },
  }),
  "signal-resume.response.json": ok({
    operation: "signal.resume",
    signal: { ...manualSignal, status: "active" },
  }),
  "signal-reschedule.response.json": ok({
    operation: "signal.reschedule",
    signal: { ...scheduledSignal, checkIntervalMinutes: 120 },
  }),

  // `signal.run-now`'s three outcomes — every client branch (`SignalRunOutcome`) in one recorder.
  "signal-run-now-found.response.json": ok({
    operation: "signal.run-now",
    signal: {
      ...scheduledSignal,
      checkCount: 6,
      insightCount: 3,
      lastCheckedAt: "2026-08-16T19:00:00.000Z",
    },
    insight: insight1,
    outcome: { kind: "found" },
  }),
  "signal-run-now-nothing-new.response.json": ok({
    operation: "signal.run-now",
    signal: { ...scheduledSignal, checkCount: 6, lastCheckedAt: "2026-08-16T19:00:00.000Z" },
    insight: null,
    outcome: { kind: "nothing-new" },
  }),
  "signal-run-now-scout-failed.response.json": ok({
    operation: "signal.run-now",
    signal: { ...manualSignal, checkCount: 1, lastCheckedAt: "2026-08-16T19:00:00.000Z" },
    insight: null,
    outcome: {
      kind: "scout-failed",
      code: "scout-error",
      message: "codex adapter timed out after 25s.",
    },
  }),

  "insight-list.response.json": ok({ operation: "insight.list", insights: [insight1, insight2] }),
};

const dir = new URL("../Tests/StudioKitTests/Fixtures/", import.meta.url).pathname;
for (const [name, value] of Object.entries(fixtures)) {
  writeFileSync(dir + name, JSON.stringify(value, null, 2) + "\n");
}
console.log("wrote", Object.keys(fixtures).length, "usage/signal fixtures");
