import { RoomProviderSchema, type AgentUsageV1, type RoomProvider } from "@app-factory/contracts";
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
  type OllamaGenerateUsage,
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
  ParticipantUsage,
} from "./participant-adapter.js";
import { renderParticipantInstruction } from "./render-context.js";

/**
 * Historical guard: local generation on shared developer hardware regularly
 * ran to ~25 minutes when a model's output budget was left unbounded. Ollama
 * room participants are capped hard at this many output tokens regardless of
 * what the room's own `maxTokensPerReply` budget allows. This is the default
 * per-instance `maxOutputTokens`; a configured instance may raise or lower it.
 */
export const OLLAMA_PARTICIPANT_MAX_OUTPUT_TOKENS = 150;

const INSTANCE_ID_PATTERN = /^[a-z][a-z0-9-]{0,40}$/;

export type OllamaParticipantConfigV1 = Readonly<{
  /** Short slug identifying this configured instance, e.g. "fast" or "reasoning". When present,
   *  this adapter's `RoomProvider` key becomes `ollama-<id>` instead of the legacy bare `"ollama"`,
   *  so multiple local Ollama instances can be configured and referenced independently in a room's
   *  cast or as the Tier-1 scorer's backing model. */
  id?: string;
  transport?: OllamaTransportPort;
  clock?: MonotonicClockPort;
  baseUrl?: string;
  model?: string;
  keepAlive?: string;
  contextTokens?: number;
  /** Hard wall-clock budget for one contribution. */
  timeoutMs?: number;
  /** Per-instance output cap; defaults to {@link OLLAMA_PARTICIPANT_MAX_OUTPUT_TOKENS} when
   *  absent, preserving today's behavior for every untouched config. */
  maxOutputTokens?: number;
}>;

type ValidatedOllamaParticipantConfig = Readonly<{
  id: string | null;
  transport: OllamaTransportPort;
  clock: MonotonicClockPort;
  baseUrl: string;
  model: string;
  keepAlive: string;
  contextTokens: number;
  timeoutMs: number;
  maxOutputTokens: number;
}>;

function validateConfig(config: OllamaParticipantConfigV1): ValidatedOllamaParticipantConfig {
  if (config.id !== undefined && !INSTANCE_ID_PATTERN.test(config.id)) {
    throw new TypeError(
      "OllamaParticipant id must be lowercase letters, digits, and hyphens, starting with a letter",
    );
  }
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
  const maxOutputTokens = config.maxOutputTokens ?? OLLAMA_PARTICIPANT_MAX_OUTPUT_TOKENS;
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 100_000) {
    throw new TypeError("OllamaParticipant maxOutputTokens must be between 1 and 100000");
  }
  return {
    id: config.id ?? null,
    transport: config.transport ?? createFetchOllamaTransport(),
    clock: config.clock ?? performanceClock,
    baseUrl,
    model,
    keepAlive: config.keepAlive ?? "10m",
    contextTokens,
    timeoutMs,
    maxOutputTokens,
  };
}

/**
 * Honest token ledger (contracts Architecture decision 6): `null` only when Ollama reported
 * neither count, never a fabricated zero.
 */
function parseOllamaUsage(usage: OllamaGenerateUsage): AgentUsageV1 | null {
  if (usage.promptEvalCount === null && usage.evalCount === null) return null;
  return {
    inputTokens: usage.promptEvalCount,
    outputTokens: usage.evalCount,
    cachedInputTokens: null,
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
  const provider: RoomProvider = RoomProviderSchema.parse(
    validated.id === null ? "ollama" : `ollama-${validated.id}`,
  );

  return {
    id:
      validated.id === null
        ? "ollama.local-room-participant"
        : `ollama.${validated.id}-local-room-participant`,
    provider,
    async contribute(context: ParticipantContext): Promise<ParticipantContributionResult> {
      const numPredict = Math.max(1, Math.min(context.maxOutputTokens, validated.maxOutputTokens));
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
        // Ollama never reports a dollar cost; costUsdMicros stays null for this provider.
        const usage: ParticipantUsage = {
          tokensUsed,
          reported: parseOllamaUsage(outcome.usage),
          costUsdMicros: null,
        };
        return parsed.kind === "pass"
          ? { kind: "pass", usage }
          : { kind: "message", text: parsed.text, usage };
      } catch {
        return { kind: "error", code: "internal", retryAfterMs: null };
      }
    },
  };
}
