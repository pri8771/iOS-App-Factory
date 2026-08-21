import { RoomPersonaSchema } from "@app-factory/contracts";
import type {
  BoundedProviderHttpTransport,
  ProviderHttpRequestV1,
  ProviderHttpResponseV1,
} from "@app-factory/provider-http-adapters";
import { describe, expect, it } from "vitest";

import {
  createOpenRouterParticipant,
  deriveOpenRouterBearerAuthorization,
  OPENROUTER_PARTICIPANT_MAX_OUTPUT_TOKENS,
} from "../src/index.js";
import type { ParticipantContext } from "../src/index.js";
import { neverAbortedSignal } from "./helpers.js";

const CREDENTIAL = {
  schemaVersion: 1 as const,
  kind: "macos-keychain" as const,
  service: "app-factory-openrouter-test",
  account: "fast",
};

function fakeTransport(
  handler: (request: ProviderHttpRequestV1) => Promise<{ status: number; body: unknown }>,
): BoundedProviderHttpTransport & {
  requests: ProviderHttpRequestV1[];
  /** Request bodies decoded eagerly at dispatch time: `performProviderHttpRequest` zeroes
   *  `request.body` in its `finally` clause once `contribute()` returns, so reading it back off
   *  the stored request afterward would only ever see zero bytes. */
  requestBodies: unknown[];
} {
  const requests: ProviderHttpRequestV1[] = [];
  const requestBodies: unknown[] = [];
  return {
    requests,
    requestBodies,
    async request(request) {
      requests.push(request);
      requestBodies.push(
        request.body === null
          ? null
          : (JSON.parse(Buffer.from(request.body).toString("utf8")) as unknown),
      );
      const { status, body } = await handler(request);
      const bytes =
        typeof body === "string"
          ? Buffer.from(body, "utf8")
          : Buffer.from(JSON.stringify(body), "utf8");
      const response: ProviderHttpResponseV1 = {
        schemaVersion: 1,
        status,
        headers: [{ name: "content-type", value: "application/json" }],
        body: bytes,
      };
      return response;
    },
  };
}

function chatEnvelope(content: unknown, completionTokens = 12): unknown {
  return {
    choices: [
      { message: { content: typeof content === "string" ? content : JSON.stringify(content) } },
    ],
    usage: { completion_tokens: completionTokens },
  };
}

function context(overrides: Partial<ParticipantContext> = {}): ParticipantContext {
  return {
    persona: RoomPersonaSchema.parse("cloud-scout"),
    roomCharter: "Design review room.",
    rollingSummary: "",
    personaCharter: "Cloud Scout, a fast cloud sanity-checker.",
    transcript: [{ author: "priyansh", body: "What's the riskiest assumption here?" }],
    networkEnabled: false,
    maxOutputTokens: 1_000,
    signal: neverAbortedSignal(),
    reportWorkerPid: () => undefined,
    ...overrides,
  };
}

function participant(
  transport: BoundedProviderHttpTransport,
  overrides: Partial<Parameters<typeof createOpenRouterParticipant>[0]> = {},
) {
  return createOpenRouterParticipant({
    id: "fast",
    model: "anthropic/claude-3.5-sonnet",
    credentialReference: CREDENTIAL,
    transport,
    ...overrides,
  });
}

describe("createOpenRouterParticipant", () => {
  it("derives the RoomProvider key from the configured id and requires no scheme in the stored credential", () => {
    const adapter = participant(fakeTransport(async () => ({ status: 200, body: {} })));
    expect(String(adapter.provider)).toBe("openrouter-fast");
    expect(deriveOpenRouterBearerAuthorization(Buffer.from("sk-or-v1-abc", "utf8"))).toBe(
      "Bearer sk-or-v1-abc",
    );
  });

  it("sends the room context as a system message, model id, and caps max_tokens at the historical guard", async () => {
    const transport = fakeTransport(async () => ({
      status: 200,
      body: chatEnvelope({ schemaVersion: 1, kind: "message", text: "Ship it." }),
    }));
    const result = await participant(transport).contribute(context());

    expect(result).toEqual({
      kind: "message",
      text: "Ship it.",
      usage: {
        tokensUsed: 12,
        reported: { inputTokens: null, outputTokens: 12, cachedInputTokens: null },
        costUsdMicros: null,
      },
    });
    expect(transport.requests).toHaveLength(1);
    const request = transport.requests[0];
    expect(request?.method).toBe("POST");
    expect(request?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request?.credentialReference).toEqual(CREDENTIAL);
    expect(request?.credentialOrigin).toBe("https://openrouter.ai");
    const body = transport.requestBodies[0] as {
      model: string;
      max_tokens: number;
      response_format?: unknown;
      messages: readonly { content: string }[];
    };
    expect(body.model).toBe("anthropic/claude-3.5-sonnet");
    expect(body.max_tokens).toBe(OPENROUTER_PARTICIPANT_MAX_OUTPUT_TOKENS);
    expect(body.response_format).toBeUndefined();
    expect(String(body.messages[0]?.content)).toContain("cloud-scout");
    expect(String(body.messages[0]?.content)).toContain("What's the riskiest assumption here?");
  });

  it("caps max_tokens below the historical guard when the room's own budget is smaller", async () => {
    const transport = fakeTransport(async () => ({
      status: 200,
      body: chatEnvelope({ schemaVersion: 1, kind: "pass", text: null }),
    }));
    await participant(transport).contribute(context({ maxOutputTokens: 40 }));
    expect((transport.requestBodies[0] as { max_tokens: number }).max_tokens).toBe(40);
  });

  it("maps a pass response", async () => {
    const transport = fakeTransport(async () => ({
      status: 200,
      body: chatEnvelope({ schemaVersion: 1, kind: "pass", text: null }),
    }));
    const result = await participant(transport).contribute(context());
    expect(result).toEqual({
      kind: "pass",
      usage: {
        tokensUsed: 12,
        reported: { inputTokens: null, outputTokens: 12, cachedInputTokens: null },
        costUsdMicros: null,
      },
    });
  });

  it("reports prompt + completion + cached tokens when the response carries all three", async () => {
    const transport = fakeTransport(async () => ({
      status: 200,
      body: {
        choices: [
          {
            message: {
              content: JSON.stringify({ schemaVersion: 1, kind: "message", text: "Ship it." }),
            },
          },
        ],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 12,
          total_tokens: 42,
          prompt_tokens_details: { cached_tokens: 8 },
        },
      },
    }));
    const result = await participant(transport).contribute(context());
    expect(result).toEqual({
      kind: "message",
      text: "Ship it.",
      usage: {
        tokensUsed: 12,
        reported: { inputTokens: 30, outputTokens: 12, cachedInputTokens: 8 },
        costUsdMicros: null,
      },
    });
  });

  it("reports usage null (never a fabricated zero) when the response carries no usage object", async () => {
    const transport = fakeTransport(async () => ({
      status: 200,
      body: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                schemaVersion: 1,
                kind: "message",
                text: "No usage here.",
              }),
            },
          },
        ],
      },
    }));
    const result = await participant(transport).contribute(context());
    expect(result).toEqual({
      kind: "message",
      text: "No usage here.",
      usage: { tokensUsed: 0, reported: null, costUsdMicros: null },
    });
  });

  it("honors a per-instance maxOutputTokens config, raising the historical guard", async () => {
    const transport = fakeTransport(async () => ({
      status: 200,
      body: chatEnvelope({ schemaVersion: 1, kind: "pass", text: null }),
    }));
    await participant(transport, { maxOutputTokens: 1_000 }).contribute(
      context({ maxOutputTokens: 2_000 }),
    );
    expect((transport.requestBodies[0] as { max_tokens: number }).max_tokens).toBe(1_000);
  });

  it("maps HTTP 429 to error(limit) using the retry-after header", async () => {
    const transport: BoundedProviderHttpTransport = {
      async request() {
        const response: ProviderHttpResponseV1 = {
          schemaVersion: 1,
          status: 429,
          headers: [{ name: "retry-after", value: "30" }],
          body: Buffer.from(JSON.stringify({ error: { message: "rate limited" } }), "utf8"),
        };
        return response;
      },
    };
    const result = await participant(transport).contribute(context());
    expect(result).toEqual({ kind: "error", code: "limit", retryAfterMs: 30_000 });
  });

  it("maps HTTP 402 (insufficient credits) to error(limit) with no retry hint", async () => {
    const transport = fakeTransport(async () => ({
      status: 402,
      body: { error: { message: "credits" } },
    }));
    const result = await participant(transport).contribute(context());
    expect(result).toEqual({ kind: "error", code: "limit", retryAfterMs: null });
  });

  it("maps HTTP 503 to error(capacity)", async () => {
    const transport = fakeTransport(async () => ({
      status: 503,
      body: { error: { message: "down" } },
    }));
    const result = await participant(transport).contribute(context());
    expect(result).toEqual({ kind: "error", code: "capacity", retryAfterMs: null });
  });

  it("maps HTTP 400 to error(internal)", async () => {
    const transport = fakeTransport(async () => ({
      status: 400,
      body: { error: { message: "bad" } },
    }));
    const result = await participant(transport).contribute(context());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("maps a transport-level failure to error(capacity)", async () => {
    const transport: BoundedProviderHttpTransport = {
      request: () => Promise.reject(new Error("fetch failed: ECONNREFUSED")),
    };
    const result = await participant(transport).contribute(context());
    expect(result).toEqual({ kind: "error", code: "capacity", retryAfterMs: null });
  });

  it("maps a deadline-elapsed failure to error(timeout)", async () => {
    const transport: BoundedProviderHttpTransport = {
      request: () => Promise.reject(new Error("request deadline elapsed")),
    };
    const result = await participant(transport, { timeoutMs: 1_000 }).contribute(context());
    expect(result).toEqual({ kind: "error", code: "timeout", retryAfterMs: null });
  });

  it("fails closed with error(internal) when choices/message/content is missing", async () => {
    const transport = fakeTransport(async () => ({ status: 200, body: { choices: [] } }));
    const result = await participant(transport).contribute(context());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("fails closed with error(internal) on malformed model output", async () => {
    const transport = fakeTransport(async () => ({
      status: 200,
      body: chatEnvelope("not json at all"),
    }));
    const result = await participant(transport).contribute(context());
    expect(result).toEqual({ kind: "error", code: "internal", retryAfterMs: null });
  });

  it("rejects an id that is not a lowercase slug", () => {
    expect(() =>
      createOpenRouterParticipant({
        id: "Not_Valid",
        model: "anthropic/claude-3.5-sonnet",
        credentialReference: CREDENTIAL,
        transport: fakeTransport(async () => ({ status: 200, body: {} })),
      }),
    ).toThrow(TypeError);
  });
});
