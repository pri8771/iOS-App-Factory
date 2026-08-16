import type {
  MonotonicClockPort,
  OllamaTransportPort,
  OllamaTransportRequest,
  OllamaTransportResponse,
  RoomMessageV1,
  ScoreRequestInputV1,
} from "../src/index.js";

export type RecordedRequest = Readonly<{
  url: string;
  body: Record<string, unknown>;
  rawBody: string;
  signal: AbortSignal;
}>;

export type FakeTransport = OllamaTransportPort &
  Readonly<{
    requests: RecordedRequest[];
  }>;

export function ollamaEnvelope(response: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    model: "qwen2.5:3b",
    created_at: "2026-08-16T00:00:00Z",
    response: typeof response === "string" ? response : JSON.stringify(response),
    done: true,
    prompt_eval_count: 321,
    eval_count: 12,
    ...extra,
  });
}

/**
 * A transport whose behavior is decided per call by `respond`; it records
 * every request (with the parsed body) for assertions.
 */
export function fakeTransport(
  respond: (request: RecordedRequest, index: number) => Promise<OllamaTransportResponse>,
): FakeTransport {
  const requests: RecordedRequest[] = [];
  return {
    requests,
    async post(request: OllamaTransportRequest): Promise<OllamaTransportResponse> {
      const recorded: RecordedRequest = {
        url: request.url,
        body: JSON.parse(request.body) as Record<string, unknown>,
        rawBody: request.body,
        signal: request.signal,
      };
      requests.push(recorded);
      return respond(recorded, requests.length - 1);
    },
  };
}

export function respondingTransport(status: number, body: string): FakeTransport {
  return fakeTransport(async () => ({ status, body }));
}

export function manualClock(): MonotonicClockPort & { advance(ms: number): void } {
  let now = 1_000;
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
  };
}

export function message(seq: number, authorId: string, text: string): RoomMessageV1 {
  return { seq, authorId, text };
}

export function baseRequest(overrides: Partial<ScoreRequestInputV1> = {}): ScoreRequestInputV1 {
  return {
    schemaVersion: 1,
    roundId: "round-1",
    roomCharter: "Design review room for the Hindsight iOS app.",
    rollingSummary: "The team agreed to ship build 4 as-is; open question: onboarding copy.",
    lastMessages: [
      message(10, "owner", "Can someone check the onboarding copy before Friday?"),
      message(11, "pm", "I can take a first pass tonight."),
    ],
    personas: [
      { id: "pm", oneLineCharter: "Product manager; owns scope and copy." },
      { id: "eng-lead", oneLineCharter: "Engineering lead; owns build health." },
      { id: "designer", oneLineCharter: "Designer; owns visual and interaction quality." },
    ],
    ...overrides,
  };
}
