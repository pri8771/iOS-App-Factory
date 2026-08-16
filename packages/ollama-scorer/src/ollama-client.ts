import { z } from "zod";

export class OllamaScorerError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OllamaScorerError";
  }
}

export type OllamaTransportRequest = Readonly<{
  /** Absolute URL of the Ollama endpoint being called. */
  url: string;
  /** JSON-encoded request body. */
  body: string;
  /** Aborted at the hard deadline; transports should honor it promptly. */
  signal: AbortSignal;
}>;

export type OllamaTransportResponse = Readonly<{
  status: number;
  body: string;
}>;

/**
 * The only I/O port of this package. Tests inject a fake; production uses
 * `createFetchOllamaTransport`. The caller enforces the deadline itself
 * (see `generateBounded`), so a transport that ignores the signal can
 * delay nothing.
 */
export type OllamaTransportPort = Readonly<{
  post(request: OllamaTransportRequest): Promise<OllamaTransportResponse>;
}>;

/** Milliseconds on a monotonic clock; injectable for deterministic tests. */
export type MonotonicClockPort = Readonly<{ now(): number }>;

export const performanceClock: MonotonicClockPort = { now: () => performance.now() };

export const OLLAMA_GENERATE_PATH = "/api/generate";
export const OLLAMA_MAX_RESPONSE_BYTES_DEFAULT = 262_144;

/** Body of `POST /api/generate` as this package emits it (non-streaming). */
export type OllamaGenerateRequestBody = Readonly<{
  model: string;
  /** Stable prompt prefix: goes first in the model's chat template. */
  system: string;
  /** Per-round delta: goes last, so the prefix KV cache is reusable. */
  prompt: string;
  stream: false;
  /** JSON-schema constraint on the output; omitted for free-text generations. */
  format?: Readonly<Record<string, unknown>>;
  options: Readonly<{ temperature: 0; num_ctx: number; num_predict: number }>;
  keep_alive: string;
}>;

export type OllamaGenerateUsage = Readonly<{
  promptEvalCount: number | null;
  evalCount: number | null;
}>;

export type OllamaGenerateOutcome =
  | Readonly<{ kind: "ok"; text: string; latencyMs: number; usage: OllamaGenerateUsage }>
  | Readonly<{ kind: "timeout"; latencyMs: number; detail: string }>
  | Readonly<{ kind: "transport-error"; latencyMs: number; detail: string }>
  | Readonly<{ kind: "http-error"; latencyMs: number; status: number; detail: string }>
  | Readonly<{ kind: "malformed-response"; latencyMs: number; detail: string }>;

const OllamaGenerateResponseSchema = z.looseObject({
  response: z.string(),
  prompt_eval_count: z.int().min(0).optional(),
  eval_count: z.int().min(0).optional(),
});

const OllamaErrorBodySchema = z.looseObject({ error: z.string() });

const DETAIL_MAX_CHARS = 200;

/**
 * Bounded, control-character-free excerpt of server-provided text, safe to
 * surface in a result or a log line. Never used for model output.
 */
export function boundedDetail(text: string): string {
  const cleaned = text
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > DETAIL_MAX_CHARS ? `${cleaned.slice(0, DETAIL_MAX_CHARS - 1)}…` : cleaned;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return boundedDetail(`${error.name}: ${error.message}`);
  return "non-Error rejection";
}

function classifyResponse(
  response: OllamaTransportResponse,
  latencyMs: number,
): OllamaGenerateOutcome {
  if (response.status !== 200) {
    let detail = `HTTP ${response.status}`;
    try {
      const parsed = OllamaErrorBodySchema.safeParse(JSON.parse(response.body));
      if (parsed.success) detail = `HTTP ${response.status}: ${boundedDetail(parsed.data.error)}`;
    } catch {
      // Non-JSON error body: the status alone is the legible detail.
    }
    return { kind: "http-error", latencyMs, status: response.status, detail };
  }
  let json: unknown;
  try {
    json = JSON.parse(response.body);
  } catch {
    return { kind: "malformed-response", latencyMs, detail: "response body is not JSON" };
  }
  const parsed = OllamaGenerateResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      kind: "malformed-response",
      latencyMs,
      detail: "response body is not an Ollama generate envelope",
    };
  }
  return {
    kind: "ok",
    text: parsed.data.response,
    latencyMs,
    usage: {
      promptEvalCount: parsed.data.prompt_eval_count ?? null,
      evalCount: parsed.data.eval_count ?? null,
    },
  };
}

export type GenerateBoundedInput = Readonly<{
  transport: OllamaTransportPort;
  clock: MonotonicClockPort;
  baseUrl: string;
  body: OllamaGenerateRequestBody;
  timeoutMs: number;
}>;

/**
 * One `POST /api/generate`, resolved no later than `timeoutMs` after it
 * starts, whatever the transport does. On the deadline the request is
 * aborted and the outcome is `timeout`; a transport that later settles is
 * ignored (its rejection is absorbed so nothing leaks as unhandled).
 */
export async function generateBounded(input: GenerateBoundedInput): Promise<OllamaGenerateOutcome> {
  const started = input.clock.now();
  const elapsed = (): number => Math.max(0, input.clock.now() - started);
  const controller = new AbortController();
  const url = new URL(OLLAMA_GENERATE_PATH, input.baseUrl).toString();
  const body = JSON.stringify(input.body);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<OllamaGenerateOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new OllamaScorerError("hard timeout elapsed"));
      resolve({
        kind: "timeout",
        latencyMs: elapsed(),
        detail: `no response within ${input.timeoutMs}ms`,
      });
    }, input.timeoutMs);
  });

  const call: Promise<OllamaGenerateOutcome> = Promise.resolve()
    .then(() => input.transport.post({ url, body, signal: controller.signal }))
    .then(
      (response) => classifyResponse(response, elapsed()),
      (error: unknown) => ({
        kind: "transport-error" as const,
        latencyMs: elapsed(),
        detail: describeError(error),
      }),
    );

  try {
    return await Promise.race([call, deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export type CreateFetchOllamaTransportOptions = Readonly<{
  /** Injectable for tests; defaults to the platform `fetch`. */
  fetch?: typeof fetch;
  maximumResponseBytes?: number;
}>;

async function readBoundedText(response: Response, maximumResponseBytes: number): Promise<string> {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined || value.byteLength === 0) continue;
      total += value.byteLength;
      if (total > maximumResponseBytes) {
        const overLimit = new OllamaScorerError(
          `response exceeded ${maximumResponseBytes} bytes; refusing to read further`,
        );
        try {
          await reader.cancel(overLimit);
        } catch {
          // Best-effort teardown; the error below is what the caller sees.
        }
        throw overLimit;
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Already released by cancel() on the over-limit path.
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

/**
 * Production transport: JSON POST over the platform `fetch`, redirects
 * refused (so a loopback origin can never be silently forwarded elsewhere),
 * response body read under a hard byte cap.
 */
export function createFetchOllamaTransport(
  options: CreateFetchOllamaTransportOptions = {},
): OllamaTransportPort {
  const doFetch = options.fetch ?? fetch;
  const maximumResponseBytes = options.maximumResponseBytes ?? OLLAMA_MAX_RESPONSE_BYTES_DEFAULT;
  if (!Number.isInteger(maximumResponseBytes) || maximumResponseBytes < 1_024) {
    throw new OllamaScorerError("maximumResponseBytes must be an integer of at least 1024");
  }
  return {
    async post(request: OllamaTransportRequest): Promise<OllamaTransportResponse> {
      const response = await doFetch(request.url, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: request.body,
        redirect: "error",
        signal: request.signal,
      });
      const body = await readBoundedText(response, maximumResponseBytes);
      return { status: response.status, body };
    },
  };
}
