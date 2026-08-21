import { RoomPersonaSchema } from "@app-factory/contracts";
import { describe, expect, it } from "vitest";

import {
  createOllamaParticipant,
  OLLAMA_PARTICIPANT_MAX_OUTPUT_TOKENS,
  ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1,
} from "../src/index.js";
import type { ParticipantContext } from "../src/index.js";
import { fakeOllamaTransport, neverAbortedSignal, ollamaGenerateEnvelope } from "./helpers.js";

function context(overrides: Partial<ParticipantContext> = {}): ParticipantContext {
  return {
    persona: RoomPersonaSchema.parse("local-scout"),
    roomCharter: "Design review room.",
    rollingSummary: "",
    personaCharter: "Local Scout, a fast local sanity-checker.",
    transcript: [{ author: "priyansh", body: "What's the riskiest assumption here?" }],
    networkEnabled: false,
    maxOutputTokens: 1_000,
    signal: neverAbortedSignal(),
    reportWorkerPid: () => undefined,
    ...overrides,
  };
}

describe("createOllamaParticipant", () => {
  it("sends the room context as system/prompt, caps num_predict at the historical guard, and parses a message", async () => {
    const transport = fakeOllamaTransport(async () => ({
      status: 200,
      body: ollamaGenerateEnvelope({ schemaVersion: 1, kind: "message", text: "Ship it." }),
    }));
    const participant = createOllamaParticipant({ transport, model: "qwen2.5-coder:14b" });
    const result = await participant.contribute(context());

    expect(result).toEqual({
      kind: "message",
      text: "Ship it.",
      usage: {
        tokensUsed: 14,
        reported: { inputTokens: 200, outputTokens: 14, cachedInputTokens: null },
        costUsdMicros: null,
      },
    });
    expect(transport.requests).toHaveLength(1);
    const body = transport.requests[0]?.body;
    expect(body?.model).toBe("qwen2.5-coder:14b");
    expect(String(body?.system)).toContain("local-scout");
    expect(String(body?.system)).toContain("What's the riskiest assumption here?");
    expect((body?.options as { num_predict: number }).num_predict).toBe(
      OLLAMA_PARTICIPANT_MAX_OUTPUT_TOKENS,
    );
  });

  it("sends the Ollama-loosened wire schema (no maxLength) as `format`, never the shared strict one", async () => {
    // Regression guard for the live finding: Ollama 0.21.0 rejects a `format`
    // whose `text` carries `maxLength` (HTTP 500 "failed to load model
    // vocabulary required for format" above ~2,000). See
    // `ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1`'s doc comment for the bisection.
    const transport = fakeOllamaTransport(async () => ({
      status: 200,
      body: ollamaGenerateEnvelope({ schemaVersion: 1, kind: "pass", text: null }),
    }));
    const participant = createOllamaParticipant({ transport });
    await participant.contribute(context());
    const body = transport.requests[0]?.body;
    expect(body?.format).toEqual(ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1);
    expect(JSON.stringify(body?.format)).not.toContain("maxLength");
  });

  it("caps num_predict below the historical guard when the room's own budget is smaller", async () => {
    const transport = fakeOllamaTransport(async () => ({
      status: 200,
      body: ollamaGenerateEnvelope({ schemaVersion: 1, kind: "pass", text: null }),
    }));
    const participant = createOllamaParticipant({ transport });
    await participant.contribute(context({ maxOutputTokens: 40 }));
    const body = transport.requests[0]?.body;
    expect((body?.options as { num_predict: number }).num_predict).toBe(40);
  });

  it("maps a pass response", async () => {
    const transport = fakeOllamaTransport(async () => ({
      status: 200,
      body: ollamaGenerateEnvelope({ schemaVersion: 1, kind: "pass", text: null }),
    }));
    const participant = createOllamaParticipant({ transport });
    const result = await participant.contribute(context());
    expect(result).toEqual({
      kind: "pass",
      usage: {
        tokensUsed: 14,
        reported: { inputTokens: 200, outputTokens: 14, cachedInputTokens: null },
        costUsdMicros: null,
      },
    });
  });

  it("reports usage null (never a fabricated zero) when Ollama's envelope carries neither count", async () => {
    const transport = fakeOllamaTransport(async () => ({
      status: 200,
      body: ollamaGenerateEnvelope(
        { schemaVersion: 1, kind: "message", text: "No usage reported." },
        { prompt_eval_count: undefined, eval_count: undefined },
      ),
    }));
    const participant = createOllamaParticipant({ transport });
    const result = await participant.contribute(context());
    expect(result).toEqual({
      kind: "message",
      text: "No usage reported.",
      usage: { tokensUsed: 0, reported: null, costUsdMicros: null },
    });
  });

  it("honors a per-instance maxOutputTokens config, raising the historical guard", async () => {
    const transport = fakeOllamaTransport(async () => ({
      status: 200,
      body: ollamaGenerateEnvelope({ schemaVersion: 1, kind: "pass", text: null }),
    }));
    const participant = createOllamaParticipant({ transport, maxOutputTokens: 1_000 });
    await participant.contribute(context({ maxOutputTokens: 2_000 }));
    const body = transport.requests[0]?.body;
    expect((body?.options as { num_predict: number }).num_predict).toBe(1_000);
  });

  it("registers under an `ollama-<id>` provider key when an instance id is configured", () => {
    const transport = fakeOllamaTransport(async () => ({ status: 200, body: "{}" }));
    const participant = createOllamaParticipant({ transport, id: "fast" });
    expect(String(participant.provider)).toBe("ollama-fast");
    expect(participant.id).toBe("ollama.fast-local-room-participant");
  });

  it("rejects an id that is not a lowercase slug", () => {
    expect(() =>
      createOllamaParticipant({
        transport: fakeOllamaTransport(async () => ({ status: 200, body: "{}" })),
        id: "Not_Valid",
      }),
    ).toThrow(TypeError);
  });

  it("maps a hard timeout to error(timeout)", async () => {
    const transport = fakeOllamaTransport(
      () => new Promise(() => undefined), // never resolves
    );
    const participant = createOllamaParticipant({ transport, timeoutMs: 1_000 });
    const result = await participant.contribute(context());
    expect(result).toEqual({ kind: "error", code: "timeout", retryAfterMs: null });
  });

  it("maps HTTP 429 to error(limit) with a parsed retry hint", async () => {
    const transport = fakeOllamaTransport(async () => ({
      status: 429,
      body: JSON.stringify({ error: "rate limit exceeded, try again in 2 minutes" }),
    }));
    const participant = createOllamaParticipant({ transport });
    const result = await participant.contribute(context());
    expect(result).toEqual({ kind: "error", code: "limit", retryAfterMs: 120_000 });
  });

  it("maps HTTP 503 to error(capacity)", async () => {
    const transport = fakeOllamaTransport(async () => ({
      status: 503,
      body: JSON.stringify({ error: "model is loading" }),
    }));
    const participant = createOllamaParticipant({ transport });
    const result = await participant.contribute(context());
    expect(result).toEqual({ kind: "error", code: "capacity", retryAfterMs: null });
  });

  it("maps a connection failure to error(capacity)", async () => {
    const transport = fakeOllamaTransport(() => Promise.reject(new Error("ECONNREFUSED")));
    const participant = createOllamaParticipant({ transport });
    const result = await participant.contribute(context());
    expect(result).toEqual({ kind: "error", code: "capacity", retryAfterMs: null });
  });

  it("fails closed with error(internal) on malformed model output", async () => {
    const transport = fakeOllamaTransport(async () => ({
      status: 200,
      body: ollamaGenerateEnvelope("not json at all"),
    }));
    const participant = createOllamaParticipant({ transport });
    const result = await participant.contribute(context());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("rejects a non-loopback baseUrl", () => {
    expect(() =>
      createOllamaParticipant({
        transport: fakeOllamaTransport(async () => ({ status: 200, body: "{}" })),
        baseUrl: "http://example.com",
      }),
    ).toThrow(TypeError);
  });
});
