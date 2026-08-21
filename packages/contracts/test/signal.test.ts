import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  SignalInsightV1Schema,
  SignalScoutFindingV1Schema,
  SignalV1Schema,
  canonicalSignalInsightDigestInputV1,
  type SignalInsightDigestInputV1,
} from "../src/index.js";

function insightInput(): SignalInsightDigestInputV1 {
  return {
    schemaVersion: 1,
    insightId: "8b000000-0000-4000-8000-000000000001",
    signalId: "8a000000-0000-4000-8000-000000000001",
    discoveredAt: "2026-08-19T01:00:00.000Z",
    headline: "Searches for gothic streetwear are up sharply heading into October.",
    rationale: "Three competitor stores added black-based capsules in the last two weeks.",
    confidence: "moderate",
    citations: [{ url: "https://example.com/trend-report", title: "Trend report" }],
  };
}

function digestOf(input: SignalInsightDigestInputV1): string {
  return `sha256:${createHash("sha256")
    .update(canonicalSignalInsightDigestInputV1(input), "utf8")
    .digest("hex")}`;
}

describe("SignalV1Schema", () => {
  it("accepts a well-formed active signal that has never been checked", () => {
    const signal = SignalV1Schema.parse({
      schemaVersion: 1,
      signalId: "8a000000-0000-4000-8000-000000000001",
      name: "Halloween streetwear trends",
      watchDescription: "Fashion trends relevant to a Halloween-season streetwear Shopify store.",
      scoutProvider: "codex",
      status: "active",
      createdAt: "2026-08-19T00:00:00.000Z",
      lastCheckedAt: null,
      checkCount: 0,
      insightCount: 0,
    });
    expect(signal.status).toBe("active");
  });

  it("accepts an OpenRouter instance provider key as scoutProvider", () => {
    expect(() =>
      SignalV1Schema.parse({
        schemaVersion: 1,
        signalId: "8a000000-0000-4000-8000-000000000002",
        name: "Watch",
        watchDescription: "Watch something.",
        scoutProvider: "openrouter-fast",
        status: "active",
        createdAt: "2026-08-19T00:00:00.000Z",
        lastCheckedAt: null,
        checkCount: 0,
        insightCount: 0,
      }),
    ).not.toThrow();
  });

  it("defaults checkIntervalMinutes to null (manual-only) when omitted -- legacy signals predating the scheduler", () => {
    const parsed = SignalV1Schema.parse({
      schemaVersion: 1,
      signalId: "8a000000-0000-4000-8000-000000000004",
      name: "Watch",
      watchDescription: "Watch something.",
      scoutProvider: "codex",
      status: "active",
      createdAt: "2026-08-19T00:00:00.000Z",
      lastCheckedAt: null,
      checkCount: 0,
      insightCount: 0,
    });
    expect(parsed.checkIntervalMinutes).toBeNull();
  });

  it("bounds checkIntervalMinutes to 5..10080 minutes when set", () => {
    const base = {
      schemaVersion: 1 as const,
      signalId: "8a000000-0000-4000-8000-000000000005",
      name: "Watch",
      watchDescription: "Watch something.",
      scoutProvider: "codex" as const,
      status: "active" as const,
      createdAt: "2026-08-19T00:00:00.000Z",
      lastCheckedAt: null,
      checkCount: 0,
      insightCount: 0,
    };
    expect(SignalV1Schema.safeParse({ ...base, checkIntervalMinutes: 5 }).success).toBe(true);
    expect(SignalV1Schema.safeParse({ ...base, checkIntervalMinutes: 10_080 }).success).toBe(true);
    expect(SignalV1Schema.safeParse({ ...base, checkIntervalMinutes: 4 }).success).toBe(false);
    expect(SignalV1Schema.safeParse({ ...base, checkIntervalMinutes: 10_081 }).success).toBe(false);
  });

  it("rejects an unknown extra field (strict shape)", () => {
    expect(() =>
      SignalV1Schema.parse({
        schemaVersion: 1,
        signalId: "8a000000-0000-4000-8000-000000000003",
        name: "Watch",
        watchDescription: "Watch something.",
        scoutProvider: "codex",
        status: "active",
        createdAt: "2026-08-19T00:00:00.000Z",
        lastCheckedAt: null,
        checkCount: 0,
        insightCount: 0,
        unexpected: true,
      }),
    ).toThrow();
  });
});

describe("SignalScoutFindingV1Schema", () => {
  it("requires at least one citation", () => {
    expect(() =>
      SignalScoutFindingV1Schema.parse({
        schemaVersion: 1,
        headline: "Unsourced claim",
        rationale: "No evidence.",
        confidence: "weak",
        citations: [],
      }),
    ).toThrow();
  });

  it("requires each citation to carry a real URL", () => {
    expect(() =>
      SignalScoutFindingV1Schema.parse({
        schemaVersion: 1,
        headline: "Claim",
        rationale: "Reasoning.",
        confidence: "weak",
        citations: [{ url: "not a url", title: "Source" }],
      }),
    ).toThrow();
  });

  it("accepts a well-formed finding", () => {
    const finding = SignalScoutFindingV1Schema.parse({
      schemaVersion: 1,
      headline: "Searches for gothic streetwear are up sharply heading into October.",
      rationale: "Three competitor stores added black-based capsules in the last two weeks.",
      confidence: "strong",
      citations: [{ url: "https://example.com/trend-report", title: "Trend report" }],
    });
    expect(finding.confidence).toBe("strong");
  });
});

describe("SignalInsightV1Schema / canonicalSignalInsightDigestInputV1", () => {
  it("is deterministic regardless of input key order", () => {
    const input = insightInput();
    const reordered = {
      citations: input.citations,
      confidence: input.confidence,
      discoveredAt: input.discoveredAt,
      headline: input.headline,
      insightId: input.insightId,
      rationale: input.rationale,
      schemaVersion: input.schemaVersion,
      signalId: input.signalId,
    };
    expect(digestOf(input)).toBe(digestOf(reordered));
  });

  it("changes when the headline changes", () => {
    const input = insightInput();
    const changed = { ...input, headline: "A different headline entirely." };
    expect(digestOf(input)).not.toBe(digestOf(changed));
  });

  it("round-trips through SignalInsightV1Schema with its own digest attached", () => {
    const input = insightInput();
    const insight = SignalInsightV1Schema.parse({ ...input, insightDigest: digestOf(input) });
    expect(insight.insightDigest).toBe(digestOf(input));
  });

  it("rejects an insight with no citation, even with a correctly computed digest", () => {
    const input = { ...insightInput(), citations: [] };
    expect(() =>
      SignalInsightV1Schema.parse({ ...input, insightDigest: digestOf(input) }),
    ).toThrow();
  });
});
