import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRollingSummarizer,
  EMPTY_ROLLING_SUMMARY,
  OllamaScorerError,
  ROLLING_SUMMARY_MAX_CHARS,
  type OllamaTransportResponse,
  type RollingSummarizerEvent,
} from "../src/index.js";

import {
  fakeTransport,
  manualClock,
  message,
  ollamaEnvelope,
  respondingTransport,
} from "./helpers.js";

const CHARTER = "Design review room for the Hindsight iOS app.";

afterEach(() => {
  vi.useRealTimers();
});

function deferredTransport() {
  const resolvers: Array<(response: OllamaTransportResponse) => void> = [];
  const transport = fakeTransport(
    () =>
      new Promise<OllamaTransportResponse>((resolve) => {
        resolvers.push(resolve);
      }),
  );
  return {
    transport,
    resolveNext(body: string, status = 200): void {
      const resolve = resolvers.shift();
      if (resolve === undefined) throw new Error("no in-flight request to resolve");
      resolve({ status, body });
    },
    inFlight: () => resolvers.length,
  };
}

describe("createRollingSummarizer — cadence", () => {
  it("regenerates once every N observed messages, asynchronously, via the same model", async () => {
    const transport = respondingTransport(200, ollamaEnvelope("Summary after three messages."));
    const events: RollingSummarizerEvent[] = [];
    const summarizer = createRollingSummarizer({
      transport,
      roomCharter: CHARTER,
      config: { everyMessages: 3, model: "qwen2.5:3b" },
      onEvent: (event) => events.push(event),
    });

    expect(summarizer.current()).toEqual(EMPTY_ROLLING_SUMMARY);
    expect(summarizer.observe(message(1, "owner", "First."))).toEqual({
      scheduled: false,
      pendingMessages: 1,
    });
    expect(summarizer.observe(message(2, "pm", "Second."))).toEqual({
      scheduled: false,
      pendingMessages: 2,
    });
    expect(transport.requests).toHaveLength(0);

    const third = summarizer.observe(message(3, "designer", "Third."));
    expect(third.scheduled).toBe(true);
    // observe() returned synchronously; the model call is in the background.
    expect(summarizer.current().generation).toBe(0);

    await summarizer.idle();

    expect(transport.requests).toHaveLength(1);
    expect(transport.requests[0]?.url).toBe("http://127.0.0.1:11434/api/generate");
    expect(transport.requests[0]?.body).toMatchObject({
      model: "qwen2.5:3b",
      stream: false,
      options: { temperature: 0, num_ctx: 8_192, num_predict: 900 },
    });
    expect(transport.requests[0]?.body).not.toHaveProperty("format");
    expect(summarizer.current()).toEqual({
      schemaVersion: 1,
      text: "Summary after three messages.",
      generation: 1,
      coversThroughSeq: 3,
    });
    expect(summarizer.pendingMessages()).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "regenerated",
      truncated: false,
      messagesSummarized: 3,
      messagesDropped: 0,
      usage: { promptEvalCount: 321, evalCount: 12 },
    });

    // Two more do nothing; the sixth triggers the second regeneration.
    summarizer.observe(message(4, "owner", "Fourth."));
    summarizer.observe(message(5, "pm", "Fifth."));
    await summarizer.idle();
    expect(transport.requests).toHaveLength(1);
    summarizer.observe(message(6, "pm", "Sixth."));
    await summarizer.idle();
    expect(transport.requests).toHaveLength(2);
    expect(summarizer.current().generation).toBe(2);
    expect(summarizer.current().coversThroughSeq).toBe(6);
  });

  it("feeds the previous summary plus only the new messages, with the charter in the stable prefix", async () => {
    const transport = respondingTransport(200, ollamaEnvelope("Gen summary."));
    const summarizer = createRollingSummarizer({
      transport,
      roomCharter: CHARTER,
      config: { everyMessages: 2 },
      initialSummary: {
        schemaVersion: 1,
        text: "Earlier summary.",
        generation: 4,
        coversThroughSeq: 40,
      },
    });

    summarizer.observe(message(41, "owner", "New A."));
    summarizer.observe(message(42, "pm", "New B."));
    await summarizer.idle();
    summarizer.observe(message(43, "owner", "New C."));
    summarizer.observe(message(44, "pm", "New D."));
    await summarizer.idle();

    const [first, second] = transport.requests;
    expect(String(first?.body.system)).toContain(CHARTER);
    expect(first?.body.system).toBe(second?.body.system);
    expect(String(first?.body.prompt)).toContain("## Previous summary\nEarlier summary.");
    expect(String(first?.body.prompt)).toContain('[41] owner: "New A."');
    expect(String(first?.body.prompt)).toContain('[42] pm: "New B."');
    expect(String(second?.body.prompt)).toContain("## Previous summary\nGen summary.");
    expect(String(second?.body.prompt)).toContain('[43] owner: "New C."');
    expect(String(second?.body.prompt)).not.toContain("New A.");
    expect(summarizer.current().generation).toBe(6);
    expect(summarizer.current().coversThroughSeq).toBe(44);
  });

  it("runs at most one regeneration at a time and chains the next once the first completes", async () => {
    const deferred = deferredTransport();
    const summarizer = createRollingSummarizer({
      transport: deferred.transport,
      roomCharter: CHARTER,
      config: { everyMessages: 2 },
    });

    summarizer.observe(message(1, "a", "1"));
    expect(summarizer.observe(message(2, "a", "2")).scheduled).toBe(true);
    await vi.waitFor(() => expect(deferred.inFlight()).toBe(1));
    // Threshold crossed again while the first call is in flight: no second call yet.
    expect(summarizer.observe(message(3, "a", "3")).scheduled).toBe(false);
    expect(summarizer.observe(message(4, "a", "4")).scheduled).toBe(false);
    await Promise.resolve();
    expect(deferred.transport.requests).toHaveLength(1);

    deferred.resolveNext(ollamaEnvelope("Summary one."));
    await vi.waitFor(() => expect(deferred.transport.requests).toHaveLength(2));
    // The first regeneration folded only its snapshot (seq 1-2); 3-4 are the second batch.
    expect(String(deferred.transport.requests[1]?.body.prompt)).toContain('[3] a: "3"');
    expect(String(deferred.transport.requests[1]?.body.prompt)).not.toContain('[1] a: "1"');
    deferred.resolveNext(ollamaEnvelope("Summary two."));
    await summarizer.idle();

    expect(summarizer.current()).toMatchObject({
      text: "Summary two.",
      generation: 2,
      coversThroughSeq: 4,
    });
    expect(summarizer.pendingMessages()).toBe(0);
  });
});

describe("createRollingSummarizer — fail-closed behavior", () => {
  it("keeps the previous summary and the backlog when the model times out, and retries on the next observation", async () => {
    vi.useFakeTimers();
    const clock = manualClock();
    let calls = 0;
    const transport = fakeTransport(() => {
      calls += 1;
      if (calls === 1) return new Promise<OllamaTransportResponse>(() => undefined);
      return Promise.resolve({ status: 200, body: ollamaEnvelope("Recovered summary.") });
    });
    const events: RollingSummarizerEvent[] = [];
    const summarizer = createRollingSummarizer({
      transport,
      clock,
      roomCharter: CHARTER,
      config: { everyMessages: 2, timeoutMs: 1_000 },
      onEvent: (event) => events.push(event),
    });

    summarizer.observe(message(1, "a", "1"));
    summarizer.observe(message(2, "a", "2"));
    clock.advance(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    await summarizer.idle();

    expect(summarizer.current()).toEqual(EMPTY_ROLLING_SUMMARY);
    expect(summarizer.pendingMessages()).toBe(2);
    expect(events).toEqual([
      {
        kind: "regeneration-failed",
        reason: "timeout",
        detail: "no response within 1000ms",
        latencyMs: 1_000,
        pendingMessages: 2,
      },
    ]);

    // Next observation retries with the full backlog (1-3).
    expect(summarizer.observe(message(3, "a", "3")).scheduled).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    await summarizer.idle();
    expect(transport.requests).toHaveLength(2);
    expect(String(transport.requests[1]?.body.prompt)).toContain('[1] a: "1"');
    expect(String(transport.requests[1]?.body.prompt)).toContain('[3] a: "3"');
    expect(summarizer.current()).toMatchObject({
      text: "Recovered summary.",
      generation: 1,
      coversThroughSeq: 3,
    });
    expect(summarizer.pendingMessages()).toBe(0);
  });

  it.each([
    ["http-error", 500, JSON.stringify({ error: "runner crashed" }), "HTTP 500: runner crashed"],
    ["malformed-response", 200, "not json", "response body is not JSON"],
    [
      "empty-response",
      200,
      ollamaEnvelope("  \n\t "),
      "model returned an empty summary; previous summary kept",
    ],
  ])(
    "reports %s, keeps the previous summary, and does not spin",
    async (reason, status, body, detail) => {
      const transport = respondingTransport(status, body);
      const events: RollingSummarizerEvent[] = [];
      const summarizer = createRollingSummarizer({
        transport,
        roomCharter: CHARTER,
        config: { everyMessages: 1 },
        initialSummary: { schemaVersion: 1, text: "Kept.", generation: 2, coversThroughSeq: 9 },
        onEvent: (event) => events.push(event),
      });

      summarizer.observe(message(10, "a", "x"));
      await summarizer.idle();

      expect(transport.requests).toHaveLength(1);
      expect(summarizer.current().text).toBe("Kept.");
      expect(summarizer.current().generation).toBe(2);
      expect(summarizer.pendingMessages()).toBe(1);
      expect(events).toEqual([
        {
          kind: "regeneration-failed",
          reason,
          detail,
          latencyMs: expect.any(Number),
          pendingMessages: 1,
        },
      ]);
    },
  );

  it("truncates an over-long model summary to summaryMaxChars without splitting a surrogate pair", async () => {
    const overlong = `${"é".repeat(300)}😀${"x".repeat(5_000)}`;
    const events: RollingSummarizerEvent[] = [];
    const build = (summaryMaxChars: number) =>
      createRollingSummarizer({
        transport: respondingTransport(200, ollamaEnvelope(overlong)),
        roomCharter: CHARTER,
        config: { everyMessages: 1, summaryMaxChars },
        onEvent: (event) => events.push(event),
      });

    const cutsEmoji = build(302);
    cutsEmoji.observe(message(1, "a", "x"));
    await cutsEmoji.idle();
    expect(cutsEmoji.current().text).toBe(`${"é".repeat(300)}…`);
    expect(cutsEmoji.current().text.isWellFormed()).toBe(true);

    const keepsEmoji = build(303);
    keepsEmoji.observe(message(1, "a", "x"));
    await keepsEmoji.idle();
    expect(keepsEmoji.current().text).toBe(`${"é".repeat(300)}😀…`);
    expect(keepsEmoji.current().text).toHaveLength(303);
    expect(events.map((event) => event.kind)).toEqual(["regenerated", "regenerated"]);
    expect(events[0]).toMatchObject({ kind: "regenerated", truncated: true });
  });

  it("never yields a summary longer than the port's rolling-summary ceiling", async () => {
    const transport = respondingTransport(200, ollamaEnvelope("y".repeat(10_000)));
    const summarizer = createRollingSummarizer({
      transport,
      roomCharter: CHARTER,
      config: { everyMessages: 1 },
    });

    summarizer.observe(message(1, "a", "x"));
    await summarizer.idle();

    expect(summarizer.current().text.length).toBe(ROLLING_SUMMARY_MAX_CHARS);
  });

  it("trims the unsummarized backlog to maxPendingMessages, oldest first, and reports it", async () => {
    const transport = respondingTransport(500, "{}");
    const events: RollingSummarizerEvent[] = [];
    const summarizer = createRollingSummarizer({
      transport,
      roomCharter: CHARTER,
      config: { everyMessages: 2, maxPendingMessages: 3 },
      onEvent: (event) => events.push(event),
    });

    for (let seq = 1; seq <= 5; seq += 1) {
      summarizer.observe(message(seq, "a", `m${seq}`));
      await summarizer.idle();
    }

    expect(summarizer.pendingMessages()).toBe(3);
    const trims = events.filter((event) => event.kind === "backlog-trimmed");
    expect(trims).toEqual([
      { kind: "backlog-trimmed", dropped: 1, pendingMessages: 3 },
      { kind: "backlog-trimmed", dropped: 1, pendingMessages: 3 },
    ]);
    const lastPrompt = String(transport.requests.at(-1)?.body.prompt);
    expect(lastPrompt).toContain('[5] a: "m5"');
    expect(lastPrompt).toContain('[3] a: "m3"');
    expect(lastPrompt).not.toContain('[2] a: "m2"');
  });

  it("bounds one regeneration's batch by characters, dropping the oldest and reporting the count", async () => {
    const transport = respondingTransport(200, ollamaEnvelope("Bounded."));
    const events: RollingSummarizerEvent[] = [];
    const summarizer = createRollingSummarizer({
      transport,
      roomCharter: CHARTER,
      config: { everyMessages: 10, messageExcerptMaxChars: 40, batchMaxChars: 200 },
      onEvent: (event) => events.push(event),
    });

    for (let seq = 1; seq <= 10; seq += 1) {
      summarizer.observe(message(seq, "a", `long-message-${seq}-${"z".repeat(50)}`));
    }
    await summarizer.idle();

    expect(events[0]).toMatchObject({
      kind: "regenerated",
      messagesSummarized: expect.any(Number),
    });
    const regenerated = events[0];
    if (regenerated?.kind !== "regenerated") throw new Error("expected regenerated");
    expect(regenerated.messagesSummarized + regenerated.messagesDropped).toBe(10);
    expect(regenerated.messagesDropped).toBeGreaterThan(0);
    expect(String(transport.requests[0]?.body.prompt)).toContain("[10] a:");
    expect(String(transport.requests[0]?.body.prompt)).not.toContain("[1] a:");
    // Everything in the batch counts as covered, even the dropped oldest.
    expect(summarizer.current().coversThroughSeq).toBe(10);
    expect(summarizer.pendingMessages()).toBe(0);
  });

  it("refuses non-advancing seq values and invalid messages before touching state", () => {
    const transport = respondingTransport(200, ollamaEnvelope("S."));
    const summarizer = createRollingSummarizer({
      transport,
      roomCharter: CHARTER,
      config: { everyMessages: 100 },
      initialSummary: { schemaVersion: 1, text: "S.", generation: 1, coversThroughSeq: 5 },
    });

    expect(() => summarizer.observe(message(5, "a", "stale"))).toThrow(OllamaScorerError);
    summarizer.observe(message(6, "a", "ok"));
    expect(() => summarizer.observe(message(6, "a", "dup"))).toThrow(OllamaScorerError);
    expect(() => summarizer.observe(message(7, "", "no author"))).toThrow(OllamaScorerError);
    // @ts-expect-error unknown keys are rejected by the strict schema
    expect(() => summarizer.observe({ ...message(8, "a", "x"), extra: 1 })).toThrow(
      OllamaScorerError,
    );
    expect(summarizer.pendingMessages()).toBe(1);
    expect(transport.requests).toHaveLength(0);
  });

  it("regenerate() forces a run below the cadence threshold and awaits it; a no-op when nothing is pending", async () => {
    const transport = respondingTransport(200, ollamaEnvelope("Forced."));
    const summarizer = createRollingSummarizer({
      transport,
      roomCharter: CHARTER,
      config: { everyMessages: 50 },
    });

    await summarizer.regenerate();
    expect(transport.requests).toHaveLength(0);

    summarizer.observe(message(1, "a", "x"));
    await summarizer.regenerate();
    expect(transport.requests).toHaveLength(1);
    expect(summarizer.current()).toMatchObject({
      text: "Forced.",
      generation: 1,
      coversThroughSeq: 1,
    });

    // The forced flag does not leak into later observations.
    expect(summarizer.observe(message(2, "a", "y")).scheduled).toBe(false);
    await summarizer.idle();
    expect(transport.requests).toHaveLength(1);
  });

  it("survives a throwing event listener without changing cadence or state", async () => {
    const transport = respondingTransport(200, ollamaEnvelope("Fine."));
    const summarizer = createRollingSummarizer({
      transport,
      roomCharter: CHARTER,
      config: { everyMessages: 1 },
      onEvent: () => {
        throw new Error("listener bug");
      },
    });

    summarizer.observe(message(1, "a", "x"));
    await summarizer.idle();

    expect(summarizer.current()).toMatchObject({ text: "Fine.", generation: 1 });
  });

  it("validates its configuration and charter fail-closed", () => {
    const transport = respondingTransport(200, "{}");
    expect(() =>
      createRollingSummarizer({
        transport,
        roomCharter: CHARTER,
        config: { maxOutputTokens: 1_001 },
      }),
    ).toThrow();
    expect(() =>
      createRollingSummarizer({
        transport,
        roomCharter: CHARTER,
        config: { everyMessages: 10, maxPendingMessages: 5 },
      }),
    ).toThrow();
    expect(() =>
      createRollingSummarizer({
        transport,
        roomCharter: CHARTER,
        config: { summaryMaxChars: 4_001 },
      }),
    ).toThrow();
    expect(() => createRollingSummarizer({ transport, roomCharter: "   " })).toThrow();
    expect(() =>
      createRollingSummarizer({
        transport,
        roomCharter: CHARTER,
        // @ts-expect-error unknown config keys are rejected
        config: { baseUrl: "http://127.0.0.1:11434", sendFullTranscript: true },
      }),
    ).toThrow();
  });
});
