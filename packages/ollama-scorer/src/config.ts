import { z } from "zod";

import { ROLLING_SUMMARY_MAX_CHARS } from "./port.js";

const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
/** Ollama `keep_alive` durations: `-1` (forever), `0` (unload now), or `<n><unit>`. */
const KEEP_ALIVE_PATTERN = /^(?:-1|0|[1-9][0-9]{0,4}(?:ms|s|m|h))$/;
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";

/**
 * This adapter exists to keep room content on the machine, so the endpoint
 * is restricted to a loopback http(s) origin: no credentials, no path, no
 * query, no fragment. A reverse-proxied or remote Ollama is rejected.
 */
export function isLoopbackOllamaBaseUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (!LOOPBACK_HOSTNAMES.has(url.hostname)) return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.pathname !== "/" && url.pathname !== "") return false;
  if (url.search !== "" || url.hash !== "") return false;
  return true;
}

export const OllamaBaseUrlSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    isLoopbackOllamaBaseUrl,
    "Expected a loopback http(s) origin such as http://127.0.0.1:11434 (no path, query, or credentials)",
  );

export const OllamaModelNameSchema = z
  .string()
  .regex(MODEL_NAME_PATTERN, "Expected an Ollama model name such as qwen2.5:3b");

const connectionShape = {
  baseUrl: OllamaBaseUrlSchema.default(DEFAULT_OLLAMA_BASE_URL),
  model: OllamaModelNameSchema.default(DEFAULT_OLLAMA_MODEL),
  keepAlive: z.string().regex(KEEP_ALIVE_PATTERN).default("10m"),
  /** `num_ctx`: must comfortably hold prefix + delta + output. */
  contextTokens: z.int().min(512).max(131_072).default(8_192),
} as const;

/**
 * Bounds on how much of the room reaches the model per round. The delta is
 * already capped at 30 messages by the port; these caps additionally bound
 * characters so a burst of long messages cannot blow the context window.
 */
export const OllamaScorerConfigV1Schema = z
  .strictObject({
    ...connectionShape,
    /** Hard wall-clock budget for one round; the recommended range is 2–5 s. */
    timeoutMs: z.int().min(100).max(30_000).default(3_000),
    /** `num_predict` for the JSON urgency map (≈8 tokens per persona). */
    maxOutputTokens: z.int().min(16).max(4_096).default(256),
    /** Each message's text is excerpted to at most this many characters. */
    messageExcerptMaxChars: z.int().min(40).max(4_000).default(600),
    /** Total character budget for the delta block; oldest messages drop first. */
    deltaMaxChars: z.int().min(200).max(24_000).default(6_000),
  })
  .superRefine((config, context) => {
    if (config.deltaMaxChars < config.messageExcerptMaxChars + 128) {
      context.addIssue({
        code: "custom",
        path: ["deltaMaxChars"],
        message: "deltaMaxChars must exceed messageExcerptMaxChars by at least 128",
      });
    }
  });
export type OllamaScorerConfigInputV1 = z.input<typeof OllamaScorerConfigV1Schema>;
export type OllamaScorerConfigV1 = z.output<typeof OllamaScorerConfigV1Schema>;

export const RollingSummarizerConfigV1Schema = z
  .strictObject({
    ...connectionShape,
    /** Off the critical path, so this budget may be generous. */
    timeoutMs: z.int().min(100).max(120_000).default(20_000),
    /** Regenerate after this many observed messages. */
    everyMessages: z.int().min(1).max(500).default(20),
    /**
     * Upper bound on the unsummarized backlog retained across failed
     * regenerations; the oldest messages are dropped (and reported) beyond it.
     */
    maxPendingMessages: z.int().min(1).max(2_000).default(200),
    /** Output cap; the port's rolling summary limit is the ceiling (≈1k tokens). */
    summaryMaxChars: z
      .int()
      .min(200)
      .max(ROLLING_SUMMARY_MAX_CHARS)
      .default(ROLLING_SUMMARY_MAX_CHARS),
    /** `num_predict` for the summary; ≤1k tokens by construction. */
    maxOutputTokens: z.int().min(64).max(1_000).default(900),
    messageExcerptMaxChars: z.int().min(40).max(4_000).default(1_000),
    /** Total character budget for one regeneration's new-messages block. */
    batchMaxChars: z.int().min(200).max(48_000).default(12_000),
  })
  .superRefine((config, context) => {
    if (config.batchMaxChars < config.messageExcerptMaxChars + 128) {
      context.addIssue({
        code: "custom",
        path: ["batchMaxChars"],
        message: "batchMaxChars must exceed messageExcerptMaxChars by at least 128",
      });
    }
    if (config.maxPendingMessages < config.everyMessages) {
      context.addIssue({
        code: "custom",
        path: ["maxPendingMessages"],
        message: "maxPendingMessages must be at least everyMessages",
      });
    }
  });
export type RollingSummarizerConfigInputV1 = z.input<typeof RollingSummarizerConfigV1Schema>;
export type RollingSummarizerConfigV1 = z.output<typeof RollingSummarizerConfigV1Schema>;
