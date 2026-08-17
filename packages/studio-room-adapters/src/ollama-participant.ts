import { RoomProviderSchema, type RoomProvider } from "@app-factory/contracts";
import {
  createFetchOllamaTransport,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  generateBounded,
  isLoopbackOllamaBaseUrl,
  OllamaModelNameSchema,
  performanceClock,
  type MonotonicClockPort,
  type OllamaGenerateRequestBody,
  type OllamaTransportPort,
} from "@app-factory/ollama-scorer";

import { classifyFailureText } from "./failure-text.js";
import {
  ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1,
  parseRoomContribution,
} from "./contribution-schema.js";
import type {
  ParticipantAdapter,
  ParticipantContext,
  ParticipantContributionResult,
} from "./participant-adapter.js";
import { renderParticipantInstruction } from "./render-context.js";

/**
 * Historical guard: local generation on shared developer hardware regularly
 * ran to ~25 minutes when a model's output budget was left unbounded. Ollama
 * room participants are capped hard at this many output tokens regardless of
 * what the room's own `maxTokensPerReply` budget allows.
 */
export const OLLAMA_PARTICIPANT_MAX_OUTPUT_TOKENS = 150;

export type OllamaParticipantConfigV1 = Readonly<{
  transport?: OllamaTransportPort;
  clock?: MonotonicClockPort;
  baseUrl?: string;
  model?: string;
  keepAlive?: string;
  contextTokens?: number;
  /** Hard wall-clock budget for one contribution. */
  timeoutMs?: number;
}>;

type ValidatedOllamaParticipantConfig = Readonly<{
  transport: OllamaTransportPort;
  clock: MonotonicClockPort;
  baseUrl: string;
  model: string;
  keepAlive: string;
  contextTokens: number;
  timeoutMs: number;
}>;

function validateConfig(config: OllamaParticipantConfigV1): ValidatedOllamaParticipantConfig {
  const baseUrl = config.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
  if (!isLoopbackOllamaBaseUrl(baseUrl)) {
    throw new TypeError(
      "OllamaParticipant baseUrl must be a loopback http(s) origin (no path, query, or credentials)",
    );
  }
  const model = OllamaModelNameSchema.parse(config.model ?? DEFAULT_OLLAMA_MODEL);
  const timeoutMs = config.timeoutMs ?? 60_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 10 * 60_000) {
    throw new TypeError("OllamaParticipant timeoutMs must be between 1000 and 600000");
  }
  const contextTokens = config.contextTokens ?? 8_192;
  if (!Number.isSafeInteger(contextTokens) || contextTokens < 512 || contextTokens > 131_072) {
    throw new TypeError("OllamaParticipant contextTokens must be between 512 and 131072");
  }
  return {
    transport: config.transport ?? createFetchOllamaTransport(),
    clock: config.clock ?? performanceClock,
    baseUrl,
    model,
    keepAlive: config.keepAlive ?? "10m",
    contextTokens,
    timeoutMs,
  };
}

/**
 * Local-model room participant over Ollama's `/api/generate`, reusing the
 * same bounded HTTP transport and hard-timeout discipline as
 * `@app-factory/ollama-scorer`'s Tier-1 scorer. Output is hard-capped at
 * {@link OLLAMA_PARTICIPANT_MAX_OUTPUT_TOKENS} regardless of the room's own
 * per-reply token budget. Network access is never requested (Ollama is
 * always loopback-only by construction), so `context.networkEnabled` only
 * changes the instruction text, never the request itself.
 */
export function createOllamaParticipant(
  config: OllamaParticipantConfigV1 = {},
): ParticipantAdapter {
  const validated = validateConfig(config);
  const provider: RoomProvider = RoomProviderSchema.parse("ollama");

  return {
    id: "ollama.local-room-participant",
    provider,
    async contribute(context: ParticipantContext): Promise<ParticipantContributionResult> {
      const numPredict = Math.max(
        1,
        Math.min(context.maxOutputTokens, OLLAMA_PARTICIPANT_MAX_OUTPUT_TOKENS),
      );
      const body: OllamaGenerateRequestBody = {
        model: validated.model,
        system: renderParticipantInstruction(context),
        prompt: "Respond now with the JSON object described above.",
        stream: false,
        format: ROOM_CONTRIBUTION_OLLAMA_FORMAT_V1,
        options: { temperature: 0, num_ctx: validated.contextTokens, num_predict: numPredict },
        keep_alive: validated.keepAlive,
      };
      const outcome = await generateBounded({
        transport: validated.transport,
        clock: validated.clock,
        baseUrl: validated.baseUrl,
        body,
        timeoutMs: validated.timeoutMs,
      });

      if (context.signal.aborted) {
        return { kind: "error", code: "timeout", retryAfterMs: null };
      }

      switch (outcome.kind) {
        case "timeout":
          return { kind: "error", code: "timeout", retryAfterMs: null };
        case "transport-error":
          return { kind: "error", code: "capacity", retryAfterMs: null };
        case "http-error": {
          if (outcome.status === 429) {
            const classification = classifyFailureText(outcome.detail);
            return { kind: "error", code: "limit", retryAfterMs: classification.retryAfterMs };
          }
          if (outcome.status === 503 || outcome.status === 529) {
            return { kind: "error", code: "capacity", retryAfterMs: null };
          }
          return { kind: "error", code: "internal", retryAfterMs: null };
        }
        case "malformed-response":
          return { kind: "error", code: "internal", retryAfterMs: null };
        case "ok":
          break;
      }

      try {
        const parsed = parseRoomContribution(outcome.text);
        const tokensUsed = outcome.usage.evalCount ?? 0;
        return parsed.kind === "pass"
          ? { kind: "pass", usage: { tokensUsed } }
          : { kind: "message", text: parsed.text, usage: { tokensUsed } };
      } catch {
        return { kind: "error", code: "internal", retryAfterMs: null };
      }
    },
  };
}
