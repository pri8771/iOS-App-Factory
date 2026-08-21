import {
  IsoInstantSchema,
  RoomProviderSchema,
  type AgentUsageV1,
  type IsoInstant,
  type RoomProvider,
} from "@app-factory/contracts";
import {
  jsonBytes,
  parseJsonBytes,
  performProviderHttpRequest,
  type BoundedProviderHttpTransport,
  type ProviderHttpHeaderV1,
} from "@app-factory/provider-http-adapters";
import type { CredentialReferenceV1 } from "@app-factory/adapter-sdk";

import { parseRoomContribution } from "./contribution-schema.js";
import type {
  ParticipantAdapter,
  ParticipantContext,
  ParticipantContributionResult,
  ParticipantUsage,
} from "./participant-adapter.js";
import { renderParticipantInstruction } from "./render-context.js";

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const CHAT_COMPLETIONS_PATH = "/chat/completions";

/**
 * The Keychain-stored OpenRouter API key is provisioned bare (no "Bearer "
 * prefix -- the same BYOK ergonomics as pasting a key into Settings), and
 * this is the sole point that adds the scheme, run inside the broker's
 * credential window (`provider-transport`'s `ProviderAuthorizationDerivation`
 * shape, matched structurally without importing the transport package).
 * Mirrors `deriveGitHubBearerAuthorization` -- see that function's history
 * (`github-owner-binding.ts`) for why a bare stored secret plus an explicit
 * derivation beats requiring the operator to type the scheme themselves.
 */
export function deriveOpenRouterBearerAuthorization(secret: Uint8Array): string {
  return `Bearer ${Buffer.from(secret).toString("utf8")}`;
}

/**
 * Historical guard reused verbatim from `OLLAMA_PARTICIPANT_MAX_OUTPUT_TOKENS`: a room
 * contribution is a chat turn, not a task, and has no business running long regardless of what a
 * cloud model would otherwise allow.
 */
export const OPENROUTER_PARTICIPANT_MAX_OUTPUT_TOKENS = 150;

export type OpenRouterParticipantConfigV1 = Readonly<{
  /** Short slug identifying this configured instance, e.g. "fast" or "thinking". Combined into
   *  this adapter's `RoomProvider` key as `openrouter-<id>`, so multiple OpenRouter instances (one
   *  per model) can be configured and referenced independently in a room's cast. */
  id: string;
  /** OpenRouter model slug, e.g. "anthropic/claude-3.5-sonnet" or "google/gemini-2.5-pro". */
  model: string;
  credentialReference: CredentialReferenceV1;
  transport: BoundedProviderHttpTransport;
  baseUrl?: string;
  clock?: Readonly<{ now(): Date }>;
  /** Hard wall-clock budget for one contribution. Kept well under the moderator's own
   *  contribution lease (120s by default) so this adapter's own timeout is the one that fires. */
  timeoutMs?: number;
  /** Per-instance output cap; defaults to {@link OPENROUTER_PARTICIPANT_MAX_OUTPUT_TOKENS} when
   *  absent, preserving today's behavior for every untouched config. */
  maxOutputTokens?: number;
}>;

type ValidatedOpenRouterParticipantConfig = Readonly<{
  id: string;
  model: string;
  credentialReference: CredentialReferenceV1;
  transport: BoundedProviderHttpTransport;
  baseUrl: string;
  clock: Readonly<{ now(): Date }>;
  timeoutMs: number;
  maxOutputTokens: number;
}>;

const ID_PATTERN = /^[a-z][a-z0-9-]{0,40}$/;

function validateConfig(
  config: OpenRouterParticipantConfigV1,
): ValidatedOpenRouterParticipantConfig {
  if (!ID_PATTERN.test(config.id)) {
    throw new TypeError(
      "OpenRouterParticipant id must be lowercase letters, digits, and hyphens, starting with a letter",
    );
  }
  if (config.model.length < 1 || config.model.length > 200) {
    throw new TypeError("OpenRouterParticipant model must be 1-200 characters");
  }
  const timeoutMs = config.timeoutMs ?? 45_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 100_000) {
    throw new TypeError(
      "OpenRouterParticipant timeoutMs must be between 1000 and 100000 (well under the moderator's own contribution lease)",
    );
  }
  const maxOutputTokens = config.maxOutputTokens ?? OPENROUTER_PARTICIPANT_MAX_OUTPUT_TOKENS;
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 100_000) {
    throw new TypeError("OpenRouterParticipant maxOutputTokens must be between 1 and 100000");
  }
  return {
    id: config.id,
    model: config.model,
    credentialReference: config.credentialReference,
    transport: config.transport,
    baseUrl: config.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL,
    clock: config.clock ?? { now: () => new Date() },
    timeoutMs,
    maxOutputTokens,
  };
}

type ChatMessage = Readonly<{ role: "system" | "user"; content: string }>;

function requestHeaders(): readonly ProviderHttpHeaderV1[] {
  return [{ name: "content-type", value: "application/json" }];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Honest token ledger (contracts Architecture decision 6): reads OpenRouter's OpenAI-compatible
 * `usage` object (`prompt_tokens`/`completion_tokens`, plus `prompt_tokens_details.cached_tokens`
 * when the underlying model reports it). `null` when neither prompt nor completion tokens are
 * present, never a fabricated zero.
 */
function parseOpenRouterUsage(usage: Readonly<Record<string, unknown>>): AgentUsageV1 | null {
  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;
  const hasPrompt = typeof promptTokens === "number" && Number.isFinite(promptTokens);
  const hasCompletion = typeof completionTokens === "number" && Number.isFinite(completionTokens);
  if (!hasPrompt && !hasCompletion) return null;
  const details = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : null;
  const cachedTokens = details?.cached_tokens;
  const hasCached = typeof cachedTokens === "number" && Number.isFinite(cachedTokens);
  return {
    inputTokens: hasPrompt ? (promptTokens as number) : null,
    outputTokens: hasCompletion ? (completionTokens as number) : null,
    cachedInputTokens: hasCached ? (cachedTokens as number) : null,
  };
}

/**
 * Local-model room participant over OpenRouter's OpenAI-compatible
 * `/chat/completions`, dispatched through `provider-transport`'s bounded
 * fetch transport + credential broker -- the first room participant that
 * calls a cloud provider rather than a local process or loopback endpoint.
 * Output is hard-capped at {@link OPENROUTER_PARTICIPANT_MAX_OUTPUT_TOKENS}
 * regardless of the room's own per-reply budget, exactly like the Ollama
 * participant. No `response_format` is requested: OpenRouter fans out to
 * wildly different underlying models, not all of which support structured
 * outputs, and an unsupported request parameter risks a hard 400 on some of
 * them. Instead the exact JSON contract is stated in the instruction text
 * (`renderParticipantInstruction`) and `parseRoomContribution` is the sole,
 * strict enforcement -- the same fallback path this package already relies
 * on for Claude's CLI, which does not always route its answer through
 * `--json-schema` either (see `contribution-schema.ts`'s doc comment).
 */
export function createOpenRouterParticipant(
  config: OpenRouterParticipantConfigV1,
): ParticipantAdapter {
  const validated = validateConfig(config);
  const provider: RoomProvider = RoomProviderSchema.parse(`openrouter-${validated.id}`);

  return {
    id: `openrouter.${validated.id}-room-participant`,
    provider,
    async contribute(context: ParticipantContext): Promise<ParticipantContributionResult> {
      const maxTokens = Math.max(1, Math.min(context.maxOutputTokens, validated.maxOutputTokens));
      const messages: readonly ChatMessage[] = [
        { role: "system", content: renderParticipantInstruction(context) },
        { role: "user", content: "Respond now with the JSON object described above." },
      ];
      const body = jsonBytes({
        model: validated.model,
        messages,
        temperature: 0,
        max_tokens: maxTokens,
      });
      const deadline: IsoInstant = IsoInstantSchema.parse(
        new Date(validated.clock.now().getTime() + validated.timeoutMs).toISOString(),
      );

      let response;
      try {
        response = await performProviderHttpRequest(validated.transport, {
          schemaVersion: 1,
          method: "POST",
          url: `${validated.baseUrl}${CHAT_COMPLETIONS_PATH}`,
          headers: requestHeaders(),
          body,
          credentialReference: validated.credentialReference,
          credentialOrigin: new URL(validated.baseUrl).origin,
          maximumResponseBytes: 1_048_576,
          deadline,
          signal: context.signal,
        });
      } catch (error) {
        if (context.signal.aborted) return { kind: "error", code: "timeout", retryAfterMs: null };
        const message = error instanceof Error ? error.message : String(error);
        if (/deadline|aborted/i.test(message)) {
          return { kind: "error", code: "timeout", retryAfterMs: null };
        }
        // A transport-layer failure that is neither the caller's own abort nor this adapter's
        // deadline (a DNS/connection failure, a byte-cap violation, ...) is treated as transient
        // capacity rather than a permanent internal error -- the same choice Ollama's adapter
        // makes for its own `transport-error` outcome.
        return { kind: "error", code: "capacity", retryAfterMs: null };
      }

      if (response.status !== 200) {
        if (response.status === 429 || response.status === 402) {
          const retryAfterHeader = response.headers.get("retry-after");
          const retryAfterSeconds =
            retryAfterHeader === undefined ? Number.NaN : Number.parseFloat(retryAfterHeader);
          return {
            kind: "error",
            code: "limit",
            retryAfterMs: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1_000 : null,
          };
        }
        if (response.status >= 500) {
          return { kind: "error", code: "capacity", retryAfterMs: null };
        }
        return { kind: "error", code: "internal", retryAfterMs: null };
      }

      let decoded: unknown;
      try {
        decoded = parseJsonBytes(response.body, "OpenRouter chat completion response");
      } catch {
        return { kind: "error", code: "internal", retryAfterMs: null };
      }
      if (!isRecord(decoded) || !Array.isArray(decoded.choices) || decoded.choices.length < 1) {
        return { kind: "error", code: "internal", retryAfterMs: null };
      }
      const firstChoice = decoded.choices[0];
      const messageContent =
        isRecord(firstChoice) && isRecord(firstChoice.message)
          ? firstChoice.message.content
          : undefined;
      if (typeof messageContent !== "string") {
        return { kind: "error", code: "internal", retryAfterMs: null };
      }
      const usageRecord = isRecord(decoded.usage) ? decoded.usage : {};
      const tokensUsed =
        typeof usageRecord.completion_tokens === "number" &&
        Number.isFinite(usageRecord.completion_tokens)
          ? usageRecord.completion_tokens
          : 0;
      // OpenRouter's chat-completions envelope carries no dollar cost; costUsdMicros stays null.
      const usage: ParticipantUsage = {
        tokensUsed,
        reported: parseOpenRouterUsage(usageRecord),
        costUsdMicros: null,
      };

      try {
        const parsed = parseRoomContribution(messageContent);
        return parsed.kind === "pass"
          ? { kind: "pass", usage }
          : { kind: "message", text: parsed.text, usage };
      } catch {
        return { kind: "error", code: "internal", retryAfterMs: null };
      }
    },
  };
}
