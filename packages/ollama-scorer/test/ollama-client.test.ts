import { describe, expect, it, vi } from "vitest";

import {
  boundedDetail,
  createFetchOllamaTransport,
  generateBounded,
  OllamaScorerError,
} from "../src/index.js";

import { manualClock, ollamaEnvelope } from "./helpers.js";

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
}

describe("createFetchOllamaTransport", () => {
  it("POSTs JSON to the given URL, refuses redirects, forwards the signal, and returns status + body", async () => {
    const doFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      expect(init?.headers).toEqual({
        accept: "application/json",
        "content-type": "application/json",
      });
      expect(init?.body).toBe('{"model":"m"}');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(streamOf('{"resp', 'onse":"ok"}'), { status: 200 });
    });
    const transport = createFetchOllamaTransport({ fetch: doFetch as unknown as typeof fetch });

    const response = await transport.post({
      url: "http://127.0.0.1:11434/api/generate",
      body: '{"model":"m"}',
      signal: new AbortController().signal,
    });

    expect(response).toEqual({ status: 200, body: '{"response":"ok"}' });
    expect(doFetch).toHaveBeenCalledWith("http://127.0.0.1:11434/api/generate", expect.anything());
  });

  it("caps the response body at maximumResponseBytes and fails closed beyond it", async () => {
    const doFetch = vi.fn(
      async () => new Response(streamOf("x".repeat(600), "y".repeat(600)), { status: 200 }),
    );
    const transport = createFetchOllamaTransport({
      fetch: doFetch as unknown as typeof fetch,
      maximumResponseBytes: 1_024,
    });

    await expect(
      transport.post({
        url: "http://127.0.0.1:11434/api/generate",
        body: "{}",
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(OllamaScorerError);
  });

  it("returns an empty body for a null-body response and rejects an absurd byte cap", async () => {
    const doFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const transport = createFetchOllamaTransport({ fetch: doFetch as unknown as typeof fetch });
    const response = await transport.post({
      url: "http://127.0.0.1:11434/api/generate",
      body: "{}",
      signal: new AbortController().signal,
    });
    expect(response).toEqual({ status: 204, body: "" });
    expect(() => createFetchOllamaTransport({ maximumResponseBytes: 10 })).toThrow(
      OllamaScorerError,
    );
  });
});

describe("generateBounded", () => {
  const body = {
    model: "m",
    system: "s",
    prompt: "p",
    stream: false as const,
    options: { temperature: 0 as const, num_ctx: 2_048, num_predict: 16 },
    keep_alive: "1m",
  };

  it("classifies a 200 envelope as ok with usage, measured on the injected clock", async () => {
    const clock = manualClock();
    const outcome = await generateBounded({
      transport: {
        async post(request) {
          expect(request.url).toBe("http://localhost:11434/api/generate");
          expect(JSON.parse(request.body)).toEqual(body);
          clock.advance(42);
          return { status: 200, body: ollamaEnvelope("hello", { prompt_eval_count: 5 }) };
        },
      },
      clock,
      baseUrl: "http://localhost:11434",
      body,
      timeoutMs: 1_000,
    });
    expect(outcome).toEqual({
      kind: "ok",
      text: "hello",
      latencyMs: 42,
      usage: { promptEvalCount: 5, evalCount: 12 },
    });
  });

  it("maps missing usage counters to null and rejects a non-string response field", async () => {
    const ok = await generateBounded({
      transport: { post: async () => ({ status: 200, body: JSON.stringify({ response: "x" }) }) },
      clock: manualClock(),
      baseUrl: "http://127.0.0.1:11434",
      body,
      timeoutMs: 1_000,
    });
    expect(ok).toMatchObject({ kind: "ok", usage: { promptEvalCount: null, evalCount: null } });
    const bad = await generateBounded({
      transport: { post: async () => ({ status: 200, body: JSON.stringify({ response: 3 }) }) },
      clock: manualClock(),
      baseUrl: "http://127.0.0.1:11434",
      body,
      timeoutMs: 1_000,
    });
    expect(bad).toMatchObject({ kind: "malformed-response" });
  });

  it("surfaces non-200 status with a bounded, control-free server error", async () => {
    const outcome = await generateBounded({
      transport: {
        post: async () => ({
          status: 500,
          body: JSON.stringify({ error: `bad\u0007 ${"z".repeat(400)}` }),
        }),
      },
      clock: manualClock(),
      baseUrl: "http://127.0.0.1:11434",
      body,
      timeoutMs: 1_000,
    });
    expect(outcome.kind).toBe("http-error");
    if (outcome.kind !== "http-error") throw new Error("unreachable");
    expect(outcome.status).toBe(500);
    expect(outcome.detail.startsWith("HTTP 500: bad zzz")).toBe(true);
    expect(outcome.detail.length).toBeLessThanOrEqual("HTTP 500: ".length + 200);
    expect(outcome.detail).not.toContain("\u0007");
  });

  it("boundedDetail collapses whitespace, strips controls, and caps at 200 characters", () => {
    expect(boundedDetail("  a\u0000b\n\n  c  ")).toBe("a b c");
    expect(boundedDetail("q".repeat(500))).toHaveLength(200);
    expect(boundedDetail("q".repeat(500)).endsWith("…")).toBe(true);
  });
});
