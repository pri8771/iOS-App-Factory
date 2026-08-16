import { z } from "zod";

import {
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  ProjectIdSchema,
  SchemaVersionV1Schema,
} from "./primitives.js";

/**
 * Studio rooms: a moderated, single-writer transcript shared by one human and
 * a small cast of agent personas. The moderator itself is deterministic daemon
 * code (see `@app-factory/studio-rooms`); these are the durable shapes that
 * cross the daemon's command boundary and the rows the moderator resumes from.
 */

const LOWERCASE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROOM_PERSONA_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const ROOM_PROVIDER_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const ROOM_HUMAN_HANDLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const MAX_ROOM_PARTICIPANTS_V1 = 16 as const;
export const MAX_ROOM_MESSAGE_BODY_LENGTH_V1 = 20_000 as const;
export const MAX_ROOM_SYSTEM_BODY_LENGTH_V1 = 2_000 as const;
export const MAX_ROOM_LIST_ITEMS_V1 = 200 as const;
export const MAX_ROOM_EVENTS_LIMIT_V1 = 1_000 as const;
export const MAX_ROOM_TYPING_TTL_MS_V1 = 30_000 as const;
export const MAX_ROOM_COOLDOWN_EVENTS_V1 = 1_000 as const;
/** Hard livelock cap: consecutive agent messages allowed before a human must speak. */
export const ROOM_MAX_CONSECUTIVE_AGENT_MESSAGES_V1 = 3 as const;

export const RoomIdSchema = z
  .string()
  .regex(LOWERCASE_UUID_PATTERN, "Expected a canonical lowercase UUID")
  .brand<"RoomId">();
export type RoomId = z.infer<typeof RoomIdSchema>;

export const RoomMessageIdSchema = z
  .string()
  .regex(LOWERCASE_UUID_PATTERN, "Expected a canonical lowercase UUID")
  .brand<"RoomMessageId">();
export type RoomMessageId = z.infer<typeof RoomMessageIdSchema>;

export const RoomGrantIdSchema = z
  .string()
  .regex(LOWERCASE_UUID_PATTERN, "Expected a canonical lowercase UUID")
  .brand<"RoomGrantId">();
export type RoomGrantId = z.infer<typeof RoomGrantIdSchema>;

export const RoomPersonaSchema = z
  .string()
  .regex(ROOM_PERSONA_PATTERN, "Expected a lowercase persona key")
  .brand<"RoomPersona">();
export type RoomPersona = z.infer<typeof RoomPersonaSchema>;

export const RoomProviderSchema = z
  .string()
  .regex(ROOM_PROVIDER_PATTERN, "Expected a lowercase provider key")
  .brand<"RoomProvider">();
export type RoomProvider = z.infer<typeof RoomProviderSchema>;

export const RoomHumanHandleSchema = z
  .string()
  .regex(ROOM_HUMAN_HANDLE_PATTERN, "Expected a human handle")
  .brand<"RoomHumanHandle">();
export type RoomHumanHandle = z.infer<typeof RoomHumanHandleSchema>;

export const RoomDayKeySchema = z
  .string()
  .regex(DAY_KEY_PATTERN, "Expected a UTC calendar day (YYYY-MM-DD)")
  .brand<"RoomDayKey">();
export type RoomDayKey = z.infer<typeof RoomDayKeySchema>;

/**
 * Typed agent-side failure classes. A failure is never a transcript "hold":
 * it is posted as a legible system line, benches the persona (or the whole
 * provider for rate limits), and releases the room lock and budget
 * reservation. `internal` covers an adapter that threw something untyped;
 * the moderator still fails closed on it rather than guessing a class.
 */
export const RoomAgentErrorCodeV1Schema = z.enum(["limit", "timeout", "capacity", "internal"]);
export type RoomAgentErrorCodeV1 = z.infer<typeof RoomAgentErrorCodeV1Schema>;

export const RoomAttendanceV1Schema = z.enum(["attended", "dormant"]);
export type RoomAttendanceV1 = z.infer<typeof RoomAttendanceV1Schema>;

export const RoomTriggerKindV1Schema = z.enum([
  "human-message",
  "agent-message",
  "factory-event",
  "wake",
]);
export type RoomTriggerKindV1 = z.infer<typeof RoomTriggerKindV1Schema>;

/**
 * A durable request for the moderator to run a poll round. Only one trigger
 * is pending per room; when several arrive while a generation is in flight
 * they merge by priority (human-message > factory-event > agent-message >
 * wake) so a human never waits behind an agent chain.
 */
export const RoomTriggerV1Schema = z.strictObject({
  kind: RoomTriggerKindV1Schema,
  requestedAt: IsoInstantSchema,
  /** Transcript sequence that produced this trigger; 0 for a plain wake. */
  sourceSequence: NonNegativeSafeIntegerSchema,
});
export type RoomTriggerV1 = z.infer<typeof RoomTriggerV1Schema>;

export const RoomParticipantV1Schema = z.strictObject({
  persona: RoomPersonaSchema,
  provider: RoomProviderSchema,
  displayName: z.string().min(1).max(100),
  position: NonNegativeSafeIntegerSchema,
  benchedUntil: IsoInstantSchema.nullable(),
  benchReason: RoomAgentErrorCodeV1Schema.nullable(),
});
export type RoomParticipantV1 = z.infer<typeof RoomParticipantV1Schema>;

export const RoomParticipantSpecV1Schema = z.strictObject({
  persona: RoomPersonaSchema,
  provider: RoomProviderSchema,
  displayName: z.string().min(1).max(100),
});
export type RoomParticipantSpecV1 = z.infer<typeof RoomParticipantSpecV1Schema>;

export const RoomBudgetPolicyV1Schema = z
  .strictObject({
    dailyCeilingTokens: PositiveSafeIntegerSchema,
    /** Ceiling that applies while the room is dormant (unattended mode). */
    unattendedDailyCeilingTokens: NonNegativeSafeIntegerSchema,
    /** Reservation debited per grant and the contribution's hard token cap. */
    maxTokensPerReply: PositiveSafeIntegerSchema,
  })
  .superRefine((policy, context) => {
    if (policy.unattendedDailyCeilingTokens > policy.dailyCeilingTokens) {
      context.addIssue({
        code: "custom",
        path: ["unattendedDailyCeilingTokens"],
        message: "unattended ceiling cannot exceed the daily ceiling",
      });
    }
    if (policy.maxTokensPerReply > policy.dailyCeilingTokens) {
      context.addIssue({
        code: "custom",
        path: ["maxTokensPerReply"],
        message: "maxTokensPerReply cannot exceed the daily ceiling",
      });
    }
  });
export type RoomBudgetPolicyV1 = z.infer<typeof RoomBudgetPolicyV1Schema>;

/**
 * Budgets are reservations, not counters: a grant debits `reservedTokens` by
 * `maxTokensPerReply` before any generation starts, and completion credits
 * that reservation back while recording actual spend. The gate is always
 * `spent + reserved + maxTokensPerReply <= ceiling`.
 */
export const RoomBudgetV1Schema = z.strictObject({
  dayKey: RoomDayKeySchema,
  dailyCeilingTokens: PositiveSafeIntegerSchema,
  unattendedDailyCeilingTokens: NonNegativeSafeIntegerSchema,
  maxTokensPerReply: PositiveSafeIntegerSchema,
  spentTokens: NonNegativeSafeIntegerSchema,
  reservedTokens: NonNegativeSafeIntegerSchema,
  unattendedSpentTokens: NonNegativeSafeIntegerSchema,
});
export type RoomBudgetV1 = z.infer<typeof RoomBudgetV1Schema>;

export const RoomV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  roomId: RoomIdSchema,
  title: z.string().min(1).max(200),
  projectId: ProjectIdSchema.nullable(),
  createdAt: IsoInstantSchema,
  updatedAt: IsoInstantSchema,
  unattendedEnabled: z.boolean(),
  headSequence: NonNegativeSafeIntegerSchema,
  headMessageId: RoomMessageIdSchema.nullable(),
  lastHumanAt: IsoInstantSchema.nullable(),
  humanTypingUntil: IsoInstantSchema.nullable(),
  roundCounter: NonNegativeSafeIntegerSchema,
  /** The room lock: the single grant whose generation is in flight, if any. */
  activeGrantId: RoomGrantIdSchema.nullable(),
  pendingTrigger: RoomTriggerV1Schema.nullable(),
  /** Per-agent cooldown: a persona that spoke within the last M events is not eligible unless addressed. */
  agentCooldownEvents: z.number().int().min(1).max(MAX_ROOM_COOLDOWN_EVENTS_V1),
  participants: z.array(RoomParticipantV1Schema).min(1).max(MAX_ROOM_PARTICIPANTS_V1),
  budget: RoomBudgetV1Schema,
});
export type RoomV1 = z.infer<typeof RoomV1Schema>;

export const RoomChatAuthorV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("human"), handle: RoomHumanHandleSchema }),
  z.strictObject({ kind: z.literal("agent"), persona: RoomPersonaSchema }),
]);
export type RoomChatAuthorV1 = z.infer<typeof RoomChatAuthorV1Schema>;

export const RoomSystemCodeV1Schema = z.enum([
  "all-passed",
  "agent-passed",
  "agent-error",
  "factory-event",
  "room-dormant",
  "throttled",
  "budget-exhausted",
  "chain-cap",
  "grant-orphaned",
  "contribution-dropped",
  "contribution-revised",
  "scorer-unavailable",
]);
export type RoomSystemCodeV1 = z.infer<typeof RoomSystemCodeV1Schema>;

const RoomMessageBaseV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  roomId: RoomIdSchema,
  messageId: RoomMessageIdSchema,
  sequence: PositiveSafeIntegerSchema,
  occurredAt: IsoInstantSchema,
  roundNumber: NonNegativeSafeIntegerSchema.nullable(),
  grantId: RoomGrantIdSchema.nullable(),
};

export const RoomChatMessageV1Schema = z.strictObject({
  ...RoomMessageBaseV1Shape,
  kind: z.literal("message"),
  author: RoomChatAuthorV1Schema,
  body: z.string().min(1).max(MAX_ROOM_MESSAGE_BODY_LENGTH_V1),
  /** Personas addressed with `@persona`; a mention is a forced invite. */
  mentions: z.array(RoomPersonaSchema).max(MAX_ROOM_PARTICIPANTS_V1),
});
export type RoomChatMessageV1 = z.infer<typeof RoomChatMessageV1Schema>;

/**
 * Legible moderator outcomes. Every reason the room stayed silent, refused a
 * grant, or failed an agent is a system line the human can read, never a
 * silent hold.
 */
export const RoomSystemMessageV1Schema = z.strictObject({
  ...RoomMessageBaseV1Shape,
  kind: z.literal("system"),
  code: RoomSystemCodeV1Schema,
  body: z.string().min(1).max(MAX_ROOM_SYSTEM_BODY_LENGTH_V1),
  persona: RoomPersonaSchema.nullable(),
  errorCode: RoomAgentErrorCodeV1Schema.nullable(),
  benchedUntil: IsoInstantSchema.nullable(),
  retryAt: IsoInstantSchema.nullable(),
});
export type RoomSystemMessageV1 = z.infer<typeof RoomSystemMessageV1Schema>;

export const RoomMessageV1Schema = z.discriminatedUnion("kind", [
  RoomChatMessageV1Schema,
  RoomSystemMessageV1Schema,
]);
export type RoomMessageV1 = z.infer<typeof RoomMessageV1Schema>;

export const RoomGrantStateV1Schema = z.enum([
  "active",
  "held",
  "committed",
  "passed",
  "failed",
  "dropped",
  "orphaned",
]);
export type RoomGrantStateV1 = z.infer<typeof RoomGrantStateV1Schema>;

export const RoomGrantOutcomeV1Schema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("committed"),
    messageSequence: PositiveSafeIntegerSchema,
    tokensUsed: NonNegativeSafeIntegerSchema,
    revalidated: z.boolean(),
  }),
  z.strictObject({ kind: z.literal("passed"), tokensUsed: NonNegativeSafeIntegerSchema }),
  z.strictObject({
    kind: z.literal("failed"),
    code: RoomAgentErrorCodeV1Schema,
    benchedUntil: IsoInstantSchema,
  }),
  z.strictObject({
    kind: z.literal("dropped"),
    reason: z.enum(["revalidation-dropped", "revalidation-exhausted"]),
  }),
  z.strictObject({ kind: z.literal("orphaned"), workerKilled: z.boolean() }),
]);
export type RoomGrantOutcomeV1 = z.infer<typeof RoomGrantOutcomeV1Schema>;

/**
 * A grant is a wall-clock lease stamped with the transcript head it was
 * issued against and the pid that owns it. Commit is compare-and-swap on
 * `headSequence`; a stale head is never overwritten.
 */
export const RoomGrantV1Schema = z.strictObject({
  schemaVersion: SchemaVersionV1Schema,
  grantId: RoomGrantIdSchema,
  roomId: RoomIdSchema,
  roundNumber: PositiveSafeIntegerSchema,
  persona: RoomPersonaSchema,
  headSequence: NonNegativeSafeIntegerSchema,
  state: RoomGrantStateV1Schema,
  ownerPid: PositiveSafeIntegerSchema,
  workerPid: PositiveSafeIntegerSchema.nullable(),
  reservedTokens: PositiveSafeIntegerSchema,
  leaseExpiresAt: IsoInstantSchema,
  createdAt: IsoInstantSchema,
  updatedAt: IsoInstantSchema,
  outcome: RoomGrantOutcomeV1Schema.nullable(),
});
export type RoomGrantV1 = z.infer<typeof RoomGrantV1Schema>;

export const RoomModeratorStatusV1Schema = z.strictObject({
  enabled: z.boolean(),
  attendance: RoomAttendanceV1Schema,
});
export type RoomModeratorStatusV1 = z.infer<typeof RoomModeratorStatusV1Schema>;

export const RoomCreateSpecV1Schema = z.strictObject({
  roomId: RoomIdSchema,
  title: z.string().min(1).max(200),
  projectId: ProjectIdSchema.nullable(),
  unattendedEnabled: z.boolean(),
  agentCooldownEvents: z.number().int().min(1).max(MAX_ROOM_COOLDOWN_EVENTS_V1),
  participants: z
    .array(RoomParticipantSpecV1Schema)
    .min(1)
    .max(MAX_ROOM_PARTICIPANTS_V1)
    .refine(
      (participants) =>
        new Set(participants.map(({ persona }) => persona)).size === participants.length,
      "participant personas must be unique",
    ),
  budget: RoomBudgetPolicyV1Schema,
});
export type RoomCreateSpecV1 = z.infer<typeof RoomCreateSpecV1Schema>;
