import { describe, expect, it } from "vitest";

import {
  TokenUsageRecordV1Schema,
  TokenUsageSourceV1Schema,
  UsageSummaryRowV1Schema,
  UsageSummaryV1Schema,
} from "../src/index.js";

const NOW = "2026-08-20T09:00:00.000Z";
const ROOM_ID = "30000000-0000-4000-8000-000000000001";
const PHASE_RUN_ID = "60000000-0000-4000-8000-000000000001";
const SIGNAL_ID = "8a000000-0000-4000-8000-000000000001";

function roomUsageRecord(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    schemaVersion: 1,
    usageId: "70000000-0000-4000-8000-000000000001",
    occurredAt: NOW,
    providerFamily: "openrouter",
    providerKey: "openrouter-fast",
    model: "anthropic/claude-3.7-sonnet",
    source: "room",
    roomId: ROOM_ID,
    phaseRunId: null,
    signalId: null,
    inputTokens: 120,
    outputTokens: 40,
    cachedInputTokens: null,
    costUsdMicros: null,
    ...overrides,
  };
}

describe("TokenUsageSourceV1Schema", () => {
  it("accepts exactly room, phase, and signal", () => {
    expect(TokenUsageSourceV1Schema.options).toEqual(["room", "phase", "signal"]);
  });
});

describe("TokenUsageRecordV1Schema", () => {
  it("accepts a room-sourced record with fully honest nulls for unreported fields", () => {
    const parsed = TokenUsageRecordV1Schema.parse(roomUsageRecord());
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });

  it("accepts a phase-sourced record with only phaseRunId set", () => {
    expect(
      TokenUsageRecordV1Schema.safeParse(
        roomUsageRecord({ source: "phase", roomId: null, phaseRunId: PHASE_RUN_ID }),
      ).success,
    ).toBe(true);
  });

  it("accepts a signal-sourced record with only signalId set", () => {
    expect(
      TokenUsageRecordV1Schema.safeParse(
        roomUsageRecord({ source: "signal", roomId: null, signalId: SIGNAL_ID }),
      ).success,
    ).toBe(true);
  });

  it("rejects a record whose set foreign key does not match its source", () => {
    expect(
      TokenUsageRecordV1Schema.safeParse(
        roomUsageRecord({ source: "phase", phaseRunId: PHASE_RUN_ID }),
      ).success,
    ).toBe(false); // roomId AND phaseRunId both set
    expect(
      TokenUsageRecordV1Schema.safeParse(
        roomUsageRecord({ source: "signal", roomId: null, signalId: null }),
      ).success,
    ).toBe(false); // source says signal but no FK is set
  });

  it("rejects a record with no foreign key set at all", () => {
    expect(TokenUsageRecordV1Schema.safeParse(roomUsageRecord({ roomId: null })).success).toBe(
      false,
    );
  });

  it("rejects a record with more than one foreign key set", () => {
    expect(
      TokenUsageRecordV1Schema.safeParse(
        roomUsageRecord({ phaseRunId: PHASE_RUN_ID, signalId: SIGNAL_ID }),
      ).success,
    ).toBe(false);
  });

  it("leaves unreported token fields null independently -- OpenRouter reports completion but not prompt tokens", () => {
    const parsed = TokenUsageRecordV1Schema.parse(roomUsageRecord({ inputTokens: null }));
    expect(parsed.inputTokens).toBeNull();
    expect(parsed.outputTokens).toBe(40);
  });
});

describe("UsageSummaryRowV1Schema / UsageSummaryV1Schema", () => {
  function row(overrides: Readonly<Record<string, unknown>> = {}) {
    return {
      providerKey: "openrouter-fast",
      model: "anthropic/claude-3.7-sonnet",
      dayKey: "2026-08-20",
      inputTokens: 1_000,
      outputTokens: 250,
      cachedInputTokens: null,
      costUsdMicros: null,
      unreportedCount: 0,
      ...overrides,
    };
  }

  it("accepts a row with every token field null and a nonzero unreportedCount", () => {
    expect(
      UsageSummaryRowV1Schema.safeParse(
        row({ inputTokens: null, outputTokens: null, costUsdMicros: null, unreportedCount: 3 }),
      ).success,
    ).toBe(true);
  });

  it("rejects a negative unreportedCount", () => {
    expect(UsageSummaryRowV1Schema.safeParse(row({ unreportedCount: -1 })).success).toBe(false);
  });

  it("bounds sinceDays to 1..90 and accepts a bounded set of rows", () => {
    expect(UsageSummaryV1Schema.safeParse({ sinceDays: 0, rows: [] }).success).toBe(false);
    expect(UsageSummaryV1Schema.safeParse({ sinceDays: 91, rows: [] }).success).toBe(false);
    expect(UsageSummaryV1Schema.safeParse({ sinceDays: 30, rows: [row()] }).success).toBe(true);
  });
});
