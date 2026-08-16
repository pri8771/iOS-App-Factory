import { z } from "zod";

// TODO(studio-rooms): this file is a deliberately small, local copy of the
// rooms `ScorerPort` so that this adapter builds and tests independently of
// `packages/studio-rooms` (built concurrently on another branch). Unify at
// merge: the rooms package owns the canonical port and request/result
// schemas; this package should then import them and delete these duplicates.

const PERSONA_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ROUND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROMPT_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** ≈500 tokens at the conventional 4 characters per token. */
export const ROOM_CHARTER_MAX_CHARS = 2_000;
/** ≈1k tokens at the conventional 4 characters per token. */
export const ROLLING_SUMMARY_MAX_CHARS = 4_000;
export const LAST_MESSAGES_MAX = 30;
export const PERSONAS_MAX = 32;
export const PERSONA_ONE_LINE_CHARTER_MAX_CHARS = 200;
export const MESSAGE_AUTHOR_MAX_CHARS = 64;
export const MESSAGE_TEXT_MAX_CHARS = 8_000;

export const PersonaIdSchema = z
  .string()
  .regex(PERSONA_ID_PATTERN, "Expected a persona id (letters, digits, '.', '_', '-'; ≤64 chars)")
  .brand<"PersonaId">();
export type PersonaId = z.infer<typeof PersonaIdSchema>;

export const RoundIdSchema = z
  .string()
  .regex(ROUND_ID_PATTERN, "Expected a round id (letters, digits, '.', '_', ':', '-'; ≤128 chars)")
  .brand<"RoundId">();
export type RoundId = z.infer<typeof RoundIdSchema>;

export const PromptDigestSchema = z
  .string()
  .regex(PROMPT_DIGEST_PATTERN, "Expected a lowercase sha256 digest")
  .brand<"PromptDigest">();
export type PromptDigest = z.infer<typeof PromptDigestSchema>;

/** 0 = stay silent … 3 = must speak now. */
export const UrgencySchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type Urgency = z.infer<typeof UrgencySchema>;

export const RoomMessageV1Schema = z.strictObject({
  /** Monotonic position of the message in the room transcript. */
  seq: z.int().min(0),
  authorId: z.string().trim().min(1).max(MESSAGE_AUTHOR_MAX_CHARS),
  text: z.string().max(MESSAGE_TEXT_MAX_CHARS),
});
export type RoomMessageV1 = z.infer<typeof RoomMessageV1Schema>;

export const ScorerPersonaV1Schema = z.strictObject({
  id: PersonaIdSchema,
  oneLineCharter: z
    .string()
    .trim()
    .min(1)
    .max(PERSONA_ONE_LINE_CHARTER_MAX_CHARS)
    .refine((value) => !/[\r\n]/.test(value), "one-line charter must not contain line breaks"),
});
export type ScorerPersonaV1 = z.infer<typeof ScorerPersonaV1Schema>;

export const ScoreRequestV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    roundId: RoundIdSchema,
    roomCharter: z.string().trim().min(1).max(ROOM_CHARTER_MAX_CHARS),
    /** May be empty early in a room's life, before the first regeneration. */
    rollingSummary: z.string().trim().max(ROLLING_SUMMARY_MAX_CHARS),
    /** The delta since the rolling summary; never the full transcript. */
    lastMessages: z.array(RoomMessageV1Schema).max(LAST_MESSAGES_MAX),
    personas: z.array(ScorerPersonaV1Schema).min(1).max(PERSONAS_MAX),
  })
  .superRefine((request, context) => {
    const ids = request.personas.map((persona) => persona.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["personas"],
        message: "persona ids must be unique",
      });
    }
    for (let index = 1; index < request.lastMessages.length; index += 1) {
      const previous = request.lastMessages[index - 1];
      const current = request.lastMessages[index];
      if (previous !== undefined && current !== undefined && current.seq <= previous.seq) {
        context.addIssue({
          code: "custom",
          path: ["lastMessages", index, "seq"],
          message: "message seq values must be strictly increasing",
        });
      }
    }
  });
export type ScoreRequestV1 = z.infer<typeof ScoreRequestV1Schema>;
export type ScoreRequestInputV1 = z.input<typeof ScoreRequestV1Schema>;

export const ScoreBidV1Schema = z.strictObject({
  personaId: PersonaIdSchema,
  urgency: UrgencySchema,
});
export type ScoreBidV1 = z.infer<typeof ScoreBidV1Schema>;

/**
 * Why a round produced the bids it did. Every value other than `scored`
 * is a legible silence: the round yields zero bids and the room proceeds
 * without a stall.
 */
export const ScoreOutcomeSchema = z.enum([
  "scored",
  "timeout",
  "transport-error",
  "http-error",
  "malformed-response",
]);
export type ScoreOutcome = z.infer<typeof ScoreOutcomeSchema>;

export const ScoreUsageV1Schema = z.strictObject({
  /** Prompt tokens the model actually evaluated (drops on a KV-cache hit). */
  promptEvalCount: z.int().min(0).nullable(),
  evalCount: z.int().min(0).nullable(),
});
export type ScoreUsageV1 = z.infer<typeof ScoreUsageV1Schema>;

export const ScoreResultV1Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    roundId: RoundIdSchema,
    outcome: ScoreOutcomeSchema,
    /** One bid per requested persona, in request order; empty unless `scored`. */
    bids: z.array(ScoreBidV1Schema).max(PERSONAS_MAX),
    model: z.string().min(1).max(128),
    latencyMs: z.number().min(0),
    /** Digest of the stable prompt prefix (charter, personas, summary). */
    prefixDigest: PromptDigestSchema,
    /** Digest of the full prompt (prefix + delta). */
    promptDigest: PromptDigestSchema,
    /** Bounded, human-legible reason; empty when `scored`. */
    detail: z.string().max(500),
    usage: ScoreUsageV1Schema.nullable(),
  })
  .superRefine((result, context) => {
    if (result.outcome !== "scored" && result.bids.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["bids"],
        message: "bids must be empty unless the outcome is 'scored'",
      });
    }
    const ids = result.bids.map((bid) => bid.personaId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["bids"],
        message: "bid persona ids must be unique",
      });
    }
  });
export type ScoreResultV1 = z.infer<typeof ScoreResultV1Schema>;

/**
 * The rooms-facing port: one bounded call per round, tagged with the round
 * id, resolving within the configured hard timeout under all circumstances.
 */
export type ScorerPort = Readonly<{
  score(request: ScoreRequestInputV1): Promise<ScoreResultV1>;
}>;
