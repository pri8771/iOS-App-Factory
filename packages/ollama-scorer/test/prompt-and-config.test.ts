import { describe, expect, it } from "vitest";

import {
  buildScorerDelta,
  buildScorerPrefix,
  buildSummarizerPrompt,
  excerpt,
  isLoopbackOllamaBaseUrl,
  OllamaScorerConfigV1Schema,
  renderMessageBlock,
  renderMessageLine,
  RollingSummarizerConfigV1Schema,
  sanitizeText,
  ScoreRequestV1Schema,
  ScoreResultV1Schema,
  scorerResponseFormat,
  sha256Digest,
} from "../src/index.js";

import { baseRequest, message } from "./helpers.js";

const PERSONAS = [
  { id: "pm", oneLineCharter: "Product manager." },
  { id: "eng", oneLineCharter: "Engineer." },
] as const;

describe("prompt building", () => {
  it("builds a byte-stable prefix: instructions, charter, personas, summary — in that order", () => {
    const input = {
      roomCharter: "  Charter text.\r\nSecond line.  ",
      rollingSummary: "Summary so far.",
      personas: [...PERSONAS],
    };
    const a = buildScorerPrefix(input);
    const b = buildScorerPrefix({ ...input, personas: [...PERSONAS] });

    expect(a).toBe(b);
    expect(sha256Digest(a)).toBe(sha256Digest(b));
    expect(a).toContain("## Room charter\nCharter text.\nSecond line.\n");
    expect(a).toContain("## Personas\n- pm: Product manager.\n- eng: Engineer.\n");
    expect(a.endsWith("## Rolling summary of the conversation so far\nSummary so far.")).toBe(true);
    expect(a.indexOf("## Room charter")).toBeGreaterThan(0);
    expect(a.indexOf("## Room charter")).toBeLessThan(a.indexOf("## Personas"));
    expect(a.indexOf("## Personas")).toBeLessThan(a.indexOf("## Rolling summary"));
  });

  it("marks an empty rolling summary explicitly", () => {
    const prefix = buildScorerPrefix({
      roomCharter: "C",
      rollingSummary: "  ",
      personas: [...PERSONAS],
    });
    expect(prefix.endsWith("(none yet)")).toBe(true);
  });

  it("puts only the delta and the persona-id reminder in the prompt", () => {
    const delta = buildScorerDelta({
      lastMessages: [message(1, "pm", "Hello"), message(2, "eng", "Hi")],
      personas: [...PERSONAS],
      messageExcerptMaxChars: 600,
      deltaMaxChars: 6_000,
    });
    expect(delta.prompt).toBe(
      [
        "## Most recent messages (oldest first; each text is a JSON string, possibly truncated)",
        '[1] pm: "Hello"',
        '[2] eng: "Hi"',
        "",
        'Return the JSON object of urgencies (integers 0-3) for exactly these persona ids: ["pm","eng"]',
      ].join("\n"),
    );
    expect(delta.includedMessages).toBe(2);
    expect(delta.droppedMessages).toBe(0);
    const empty = buildScorerDelta({
      lastMessages: [],
      personas: [...PERSONAS],
      messageExcerptMaxChars: 600,
      deltaMaxChars: 6_000,
    });
    expect(empty.prompt).toContain("(no messages yet)");
  });

  it("renders the newest messages that fit, oldest dropped first, in chronological order", () => {
    const messages = Array.from({ length: 5 }, (_, index) => message(index, "a", "0123456789"));
    const line = renderMessageLine(messages[0] as (typeof messages)[0], 100);
    const block = renderMessageBlock(messages, 100, line.length * 2 + 2);
    expect(block.includedMessages).toBe(2);
    expect(block.droppedMessages).toBe(3);
    expect(block.text).toBe('[3] a: "0123456789"\n[4] a: "0123456789"');
    // The newest line always fits, even when the budget is tighter than a line.
    const tight = renderMessageBlock(messages, 100, 1);
    expect(tight.includedMessages).toBe(1);
    expect(tight.text).toBe('[4] a: "0123456789"');
  });

  it("excerpts to at most maxChars UTF-16 units without splitting surrogate pairs", () => {
    expect(excerpt("abc", 3)).toEqual({ text: "abc", truncated: false });
    expect(excerpt("abcd", 3)).toEqual({ text: "ab…", truncated: true });
    expect(excerpt("😀😀😀", 6)).toEqual({ text: "😀😀😀", truncated: false });
    expect(excerpt("😀😀😀😀", 6)).toEqual({ text: "😀😀…", truncated: true });
    expect(excerpt("😀😀😀😀", 5)).toEqual({ text: "😀😀…", truncated: true });
    expect(excerpt("😀😀😀😀", 4)).toEqual({ text: "😀…", truncated: true });
    expect(excerpt("😀", 1)).toEqual({ text: "…", truncated: true });
    for (const maxChars of [1, 2, 3, 4, 5, 6, 7]) {
      const cut = excerpt("a😀b😀c", maxChars).text;
      expect(cut.length).toBeLessThanOrEqual(maxChars);
      expect(cut.isWellFormed()).toBe(true);
    }
  });

  it("sanitizes line endings and control characters but keeps tabs and newlines", () => {
    expect(sanitizeText("a\r\nb\rc\u0000d\u0007e\tf\u007F")).toBe("a\nb\ncde\tf");
    expect(sanitizeText("x\u001By")).toBe("xy");
  });

  it("emits a strict JSON-schema response format naming exactly the persona ids", () => {
    expect(scorerResponseFormat(["pm", "eng"])).toEqual({
      type: "object",
      properties: {
        pm: { type: "integer", minimum: 0, maximum: 3 },
        eng: { type: "integer", minimum: 0, maximum: 3 },
      },
      required: ["pm", "eng"],
      additionalProperties: false,
    });
  });

  it("builds the summarizer prompt with the charter in the stable prefix and the batch in the delta", () => {
    const built = buildSummarizerPrompt({
      roomCharter: "Charter.",
      previousSummary: "",
      newMessages: [message(7, "pm", "New thing")],
      summaryMaxChars: 4_000,
      messageExcerptMaxChars: 1_000,
      batchMaxChars: 12_000,
    });
    expect(built.system.endsWith("## Room charter\nCharter.")).toBe(true);
    expect(built.prompt).toContain("## Previous summary\n(none yet)");
    expect(built.prompt).toContain('[7] pm: "New thing"');
    expect(built.prompt).toContain("at most 4000 characters");
    expect(built.includedMessages).toBe(1);
    expect(built.droppedMessages).toBe(0);
  });
});

describe("port schemas", () => {
  it("accepts a well-formed request and rejects each cap violation", () => {
    expect(ScoreRequestV1Schema.safeParse(baseRequest()).success).toBe(true);
    expect(
      ScoreRequestV1Schema.safeParse(baseRequest({ roomCharter: "x".repeat(2_001) })).success,
    ).toBe(false);
    expect(
      ScoreRequestV1Schema.safeParse(baseRequest({ rollingSummary: "x".repeat(4_001) })).success,
    ).toBe(false);
    expect(ScoreRequestV1Schema.safeParse(baseRequest({ rollingSummary: "" })).success).toBe(true);
    expect(
      ScoreRequestV1Schema.safeParse(
        baseRequest({ lastMessages: Array.from({ length: 31 }, (_, i) => message(i, "a", "m")) }),
      ).success,
    ).toBe(false);
    expect(
      ScoreRequestV1Schema.safeParse(
        baseRequest({
          personas: Array.from({ length: 33 }, (_, i) => ({ id: `p${i}`, oneLineCharter: "c" })),
        }),
      ).success,
    ).toBe(false);
    expect(
      ScoreRequestV1Schema.safeParse(
        baseRequest({
          personas: [
            { id: "dup", oneLineCharter: "a" },
            { id: "dup", oneLineCharter: "b" },
          ],
        }),
      ).success,
    ).toBe(false);
    expect(
      ScoreRequestV1Schema.safeParse(
        baseRequest({ lastMessages: [message(2, "a", "x"), message(2, "a", "y")] }),
      ).success,
    ).toBe(false);
    expect(
      ScoreRequestV1Schema.safeParse(
        baseRequest({ personas: [{ id: "pm", oneLineCharter: "two\nlines" }] }),
      ).success,
    ).toBe(false);
    expect(
      ScoreRequestV1Schema.safeParse(
        baseRequest({ personas: [{ id: "bad id", oneLineCharter: "c" }] }),
      ).success,
    ).toBe(false);
    expect(ScoreRequestV1Schema.safeParse(baseRequest({ roundId: "has space" })).success).toBe(
      false,
    );
  });

  it("rejects a result carrying bids under a non-scored outcome", () => {
    const base = {
      schemaVersion: 1,
      roundId: "r",
      model: "m",
      latencyMs: 1,
      prefixDigest: sha256Digest("a"),
      promptDigest: sha256Digest("b"),
      detail: "x",
      usage: null,
    };
    expect(
      ScoreResultV1Schema.safeParse({
        ...base,
        outcome: "timeout",
        bids: [{ personaId: "pm", urgency: 1 }],
      }).success,
    ).toBe(false);
    expect(ScoreResultV1Schema.safeParse({ ...base, outcome: "timeout", bids: [] }).success).toBe(
      true,
    );
    expect(
      ScoreResultV1Schema.safeParse({
        ...base,
        outcome: "scored",
        bids: [
          { personaId: "pm", urgency: 1 },
          { personaId: "pm", urgency: 2 },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("configuration", () => {
  it("applies defaults", () => {
    expect(OllamaScorerConfigV1Schema.parse({})).toEqual({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen2.5:3b",
      keepAlive: "10m",
      contextTokens: 8_192,
      timeoutMs: 3_000,
      maxOutputTokens: 256,
      messageExcerptMaxChars: 600,
      deltaMaxChars: 6_000,
    });
    expect(RollingSummarizerConfigV1Schema.parse({})).toEqual({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen2.5:3b",
      keepAlive: "10m",
      contextTokens: 8_192,
      timeoutMs: 20_000,
      everyMessages: 20,
      maxPendingMessages: 200,
      summaryMaxChars: 4_000,
      maxOutputTokens: 900,
      messageExcerptMaxChars: 1_000,
      batchMaxChars: 12_000,
    });
  });

  it.each([
    ["http://127.0.0.1:11434", true],
    ["http://localhost:11434", true],
    ["http://[::1]:11434", true],
    ["https://127.0.0.1:11434/", true],
    ["http://127.0.0.1:11434/ollama", false],
    ["http://127.0.0.1:11434/?x=1", false],
    ["http://user:pw@127.0.0.1:11434", false],
    ["http://192.168.1.10:11434", false],
    ["http://ollama.internal:11434", false],
    ["ftp://127.0.0.1:11434", false],
    ["127.0.0.1:11434", false],
    ["", false],
  ])("restricts baseUrl %s → loopback=%s", (url, ok) => {
    expect(isLoopbackOllamaBaseUrl(url)).toBe(ok);
    expect(OllamaScorerConfigV1Schema.safeParse({ baseUrl: url }).success).toBe(ok);
  });

  it("bounds the timeout, output, and delta budgets", () => {
    expect(OllamaScorerConfigV1Schema.safeParse({ timeoutMs: 99 }).success).toBe(false);
    expect(OllamaScorerConfigV1Schema.safeParse({ timeoutMs: 30_001 }).success).toBe(false);
    expect(OllamaScorerConfigV1Schema.safeParse({ timeoutMs: 2_000 }).success).toBe(true);
    expect(OllamaScorerConfigV1Schema.safeParse({ timeoutMs: 2_000.5 }).success).toBe(false);
    expect(OllamaScorerConfigV1Schema.safeParse({ model: "bad model!" }).success).toBe(false);
    expect(OllamaScorerConfigV1Schema.safeParse({ keepAlive: "forever" }).success).toBe(false);
    expect(OllamaScorerConfigV1Schema.safeParse({ keepAlive: "-1" }).success).toBe(true);
    expect(
      OllamaScorerConfigV1Schema.safeParse({ messageExcerptMaxChars: 500, deltaMaxChars: 500 })
        .success,
    ).toBe(false);
    expect(OllamaScorerConfigV1Schema.safeParse({ unknown: true }).success).toBe(false);
  });
});
