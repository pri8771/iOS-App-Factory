import {
  OllamaScorerConfigV1Schema,
  type OllamaScorerConfigInputV1,
  type OllamaScorerConfigV1,
} from "./config.js";
import {
  generateBounded,
  OllamaScorerError,
  performanceClock,
  type MonotonicClockPort,
  type OllamaGenerateRequestBody,
  type OllamaTransportPort,
} from "./ollama-client.js";
import {
  ScoreRequestV1Schema,
  ScoreResultV1Schema,
  UrgencySchema,
  type ScoreBidV1,
  type ScoreRequestInputV1,
  type ScoreRequestV1,
  type ScoreResultV1,
  type ScorerPort,
} from "./port.js";
import {
  buildScorerDelta,
  buildScorerPrefix,
  scorerResponseFormat,
  sha256Digest,
} from "./prompt.js";

export type CreateOllamaScorerOptions = Readonly<{
  transport: OllamaTransportPort;
  config?: OllamaScorerConfigInputV1;
  clock?: MonotonicClockPort;
}>;

export type OllamaScorer = ScorerPort &
  Readonly<{
    config: OllamaScorerConfigV1;
  }>;

type ParsedBids =
  Readonly<{ ok: true; bids: readonly ScoreBidV1[] }> | Readonly<{ ok: false; detail: string }>;

/**
 * Fail-closed interpretation of the model's text: it must be exactly one
 * JSON object whose keys are a subset of the requested persona ids and
 * whose values are integers 0–3. A persona the model left out bid 0
 * (explicit silence); any unknown key or malformed value voids the round.
 * The model text itself is never echoed into `detail`.
 */
export function parseUrgencyBids(text: string, request: ScoreRequestV1): ParsedBids {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, detail: "model output is not JSON" };
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, detail: "model output is not a JSON object" };
  }
  const record = json as Record<string, unknown>;
  const known = new Set<string>(request.personas.map((persona) => persona.id));
  const keys = Object.keys(record);
  const unknown = keys.filter((key) => !known.has(key));
  if (unknown.length > 0) {
    return { ok: false, detail: `model output names ${unknown.length} unknown persona id(s)` };
  }
  const bids: ScoreBidV1[] = [];
  for (const persona of request.personas) {
    if (!Object.hasOwn(record, persona.id)) {
      bids.push({ personaId: persona.id, urgency: 0 });
      continue;
    }
    const parsed = UrgencySchema.safeParse(record[persona.id]);
    if (!parsed.success) {
      return { ok: false, detail: "model output holds a non-integer or out-of-range urgency" };
    }
    bids.push({ personaId: persona.id, urgency: parsed.data });
  }
  return { ok: true, bids };
}

/**
 * The local-model `ScorerPort`. One bounded HTTP call per round; the stable
 * prefix (instructions, charter, personas, summary) travels as `system` and
 * the delta (last messages) as `prompt`, so Ollama's prompt cache can reuse
 * the prefix KV across rounds. Any failure, including the hard timeout, is
 * a zero-bid result tagged with the round id — never a throw, never a stall.
 */
export function createOllamaScorer(options: CreateOllamaScorerOptions): OllamaScorer {
  const config = OllamaScorerConfigV1Schema.parse(options.config ?? {});
  const clock = options.clock ?? performanceClock;
  const transport = options.transport;

  return {
    config,
    async score(input: ScoreRequestInputV1): Promise<ScoreResultV1> {
      const parsedRequest = ScoreRequestV1Schema.safeParse(input);
      if (!parsedRequest.success) {
        throw new OllamaScorerError(`invalid score request: ${parsedRequest.error.message}`);
      }
      const request = parsedRequest.data;

      const system = buildScorerPrefix({
        roomCharter: request.roomCharter,
        rollingSummary: request.rollingSummary,
        personas: request.personas,
      });
      const delta = buildScorerDelta({
        lastMessages: request.lastMessages,
        personas: request.personas,
        messageExcerptMaxChars: config.messageExcerptMaxChars,
        deltaMaxChars: config.deltaMaxChars,
      });
      const body: OllamaGenerateRequestBody = {
        model: config.model,
        system,
        prompt: delta.prompt,
        stream: false,
        format: scorerResponseFormat(request.personas.map((persona) => persona.id)),
        options: {
          temperature: 0,
          num_ctx: config.contextTokens,
          num_predict: config.maxOutputTokens,
        },
        keep_alive: config.keepAlive,
      };
      const prefixDigest = sha256Digest(system);
      const promptDigest = sha256Digest(`${system}\n${delta.prompt}`);

      const outcome = await generateBounded({
        transport,
        clock,
        baseUrl: config.baseUrl,
        body,
        timeoutMs: config.timeoutMs,
      });

      const base = {
        schemaVersion: 1 as const,
        roundId: request.roundId,
        model: config.model,
        latencyMs: outcome.latencyMs,
        prefixDigest,
        promptDigest,
      };
      if (outcome.kind !== "ok") {
        return ScoreResultV1Schema.parse({
          ...base,
          outcome: outcome.kind,
          bids: [],
          detail: outcome.detail,
          usage: null,
        });
      }
      const parsedBids = parseUrgencyBids(outcome.text, request);
      if (!parsedBids.ok) {
        return ScoreResultV1Schema.parse({
          ...base,
          outcome: "malformed-response",
          bids: [],
          detail: parsedBids.detail,
          usage: outcome.usage,
        });
      }
      return ScoreResultV1Schema.parse({
        ...base,
        outcome: "scored",
        bids: parsedBids.bids,
        detail: "",
        usage: outcome.usage,
      });
    },
  };
}
