import { z } from "zod";

import { AgentUsageV1Schema } from "./agent-run.js";
import {
  EventIdSchema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  ProjectIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
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

/**
 * `direct` = a conversation: exactly one agent participant, a moderator fast path that skips the
 * scorer/auction/cooldown machinery and grants the sole participant on every human message,
 * `unattendedEnabled` forced false. `.default("room")` so every room created before this field
 * existed -- and every client that has not learned about `direct` yet -- keeps parsing as a
 * plain multi-participant room. See "Architecture decisions" item 1 in the Studio chat-first
 * shell plan; the moderator behavior itself is a later wave's work, not this schema's.
 */
export const RoomFlavorV1Schema = z.enum(["room", "direct"]);
export type RoomFlavorV1 = z.infer<typeof RoomFlavorV1Schema>;

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
  flavor: RoomFlavorV1Schema.default("room"),
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
  /** Non-null exactly for an archived room (Architecture decision 7). Archive is soft: the room,
   *  its transcript, and its history stay intact and readable; only `room.list` hides it by
   *  default (`includeArchived`). */
  archivedAt: IsoInstantSchema.nullable().default(null),
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
    /** The honest token ledger's own record of this grant's usage, when the adapter reported one
     *  (Architecture decision 6) -- `tokensUsed` above keeps its existing budget-debit meaning
     *  unchanged; this is the separate, never-fabricated ledger figure. */
    usage: AgentUsageV1Schema.nullable().default(null),
    costUsdMicros: NonNegativeSafeIntegerSchema.nullable().default(null),
  }),
  z.strictObject({
    kind: z.literal("passed"),
    tokensUsed: NonNegativeSafeIntegerSchema,
    usage: AgentUsageV1Schema.nullable().default(null),
    costUsdMicros: NonNegativeSafeIntegerSchema.nullable().default(null),
  }),
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

/**
 * Durable high-water mark of the daemon-composed factory-event bridge (the
 * only producer of `factory-event` system lines, and therefore of the
 * unattended path's triggers). `ledgerPosition` is the kernel `events`
 * ledger position the bridge has scanned through; `eventId` is the kernel
 * event at that position (null only when the bridge first anchored on an
 * empty ledger). `lastDelivered*` describe the most recent kernel event that
 * actually produced at least one room line; `deliveredCount` is the lifetime
 * number of `factory-event` lines the bridge appended.
 */
export const RoomFactoryBridgeCursorV1Schema = z.strictObject({
  ledgerPosition: NonNegativeSafeIntegerSchema,
  eventId: EventIdSchema.nullable(),
  eventOccurredAt: IsoInstantSchema.nullable(),
  lastDeliveredEventId: EventIdSchema.nullable(),
  lastDeliveredAt: IsoInstantSchema.nullable(),
  deliveredCount: NonNegativeSafeIntegerSchema,
  updatedAt: IsoInstantSchema,
});
export type RoomFactoryBridgeCursorV1 = z.infer<typeof RoomFactoryBridgeCursorV1Schema>;

/** `enabled` is false whenever no moderator (and so no bridge) is composed; `cursor` is null until the bridge first anchors. */
export const RoomFactoryBridgeStatusV1Schema = z.strictObject({
  enabled: z.boolean(),
  cursor: RoomFactoryBridgeCursorV1Schema.nullable(),
});
export type RoomFactoryBridgeStatusV1 = z.infer<typeof RoomFactoryBridgeStatusV1Schema>;

export const RoomModeratorStatusV1Schema = z.strictObject({
  enabled: z.boolean(),
  attendance: RoomAttendanceV1Schema,
  factoryBridge: RoomFactoryBridgeStatusV1Schema,
});
export type RoomModeratorStatusV1 = z.infer<typeof RoomModeratorStatusV1Schema>;

export const RoomCreateSpecV1Schema = z.strictObject({
  roomId: RoomIdSchema,
  title: z.string().min(1).max(200),
  projectId: ProjectIdSchema.nullable(),
  flavor: RoomFlavorV1Schema.default("room"),
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

/**
 * `room.update` (Architecture decision 7): a CAS patch over exactly the fields the moderator
 * allows to change post-creation. `roomId`, `projectId`, `flavor`, `createdAt`, and the transcript
 * itself are immutable -- absent from the patch by construction, not merely unenforced. Every
 * field is optional; at least one must be set (a no-op update is never a valid command). Removing
 * a participant is soft everywhere it happens (the moderator enforces "at least one active
 * participant remains" and, for a `direct` room, "removal is only ever an atomic swap for the
 * replacement" -- both daemon-side invariants, not shape constraints this schema can express).
 */
export const RoomUpdatePatchV1Schema = z
  .strictObject({
    title: z.string().min(1).max(200).optional(),
    unattendedEnabled: z.boolean().optional(),
    agentCooldownEvents: z.number().int().min(1).max(MAX_ROOM_COOLDOWN_EVENTS_V1).optional(),
    archived: z.boolean().optional(),
    /** Replaces the room's budget policy; the moderator re-derives `RoomBudgetV1` from it. */
    budget: RoomBudgetPolicyV1Schema.optional(),
    addParticipants: z.array(RoomParticipantSpecV1Schema).max(MAX_ROOM_PARTICIPANTS_V1).optional(),
    removeParticipants: z.array(RoomPersonaSchema).max(MAX_ROOM_PARTICIPANTS_V1).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, "patch must set at least one field");
export type RoomUpdatePatchV1 = z.infer<typeof RoomUpdatePatchV1Schema>;

export const RoomUpdateSpecV1Schema = z.strictObject({
  roomId: RoomIdSchema,
  /** CAS guard against `RoomV1.updatedAt`; a stale value is refused rather than silently merged. */
  expectedUpdatedAt: IsoInstantSchema,
  patch: RoomUpdatePatchV1Schema,
});
export type RoomUpdateSpecV1 = z.infer<typeof RoomUpdateSpecV1Schema>;

// `room.participants.list`: the wire-safe catalog of the daemon's configured room participants.
//
// `apps/daemon/src/room-participants-config.ts` (`RoomParticipantsConfigV1`) is daemon-local
// configuration: it names executables, absolute paths, executable digests, a Codex home, runner and
// scratch roots, and an Ollama base URL. NONE of that crosses the wire. This catalog carries exactly
// what a client needs to propose a roster before `room.create` — which providers exist and which
// model each speaks, plus the operator's roster (`@app-factory/studio-room-adapters`
// `RoomRosterConfigV1`, mirrored field for field: `roomId`/`kind`/`charter`/`participants[]`
// {`persona`, `oneLineCharter`}). When the rooms subsystem is disabled (`APP_FACTORY_ROOMS_ENABLED`
// unset) the operation still answers, with `enabled: false` and an `unavailableReason` — never an
// error, so a client can tell "the daemon has no participants" from "the daemon could not answer".

export const MAX_ROOM_ROSTER_ENTRIES_V1 = 1_000 as const;
export const MAX_ROOM_ROSTER_PARTICIPANTS_V1 = 64 as const;
/** codex + claude + gemini + ollama (array, multiple named instances) + up to 5 named `openrouter`
 *  instances, with headroom for growth (was 8, one per provider family, before named Ollama and
 *  Gemini instances existed). */
export const MAX_ROOM_CATALOG_PROVIDER_ENTRIES_V1 = 16 as const;
/** Mirrors `@app-factory/ollama-scorer`'s `ROOM_CHARTER_MAX_CHARS` (contracts cannot import it). */
export const MAX_ROOM_ROSTER_CHARTER_LENGTH_V1 = 2_000 as const;

/** The providers `RoomParticipantsConfigV1` can configure an adapter for. */
export const RoomCatalogProviderV1Schema = z.enum([
  "codex",
  "claude",
  "gemini",
  "ollama",
  "openrouter",
]);
export type RoomCatalogProviderV1 = z.infer<typeof RoomCatalogProviderV1Schema>;

export const RoomCatalogProviderEntryV1Schema = z.strictObject({
  provider: RoomCatalogProviderV1Schema,
  /**
   * The unique room-provider key this entry answers to at `@mention` / `room.create` time (e.g.
   * `openrouter-fast`), matching `RoomParticipantSpecV1.provider` / `RoomProviderSchema`. `null`
   * only for a catalog recorded before this field existed; a live catalog always sets it (the
   * daemon derives it from the participants config: the bare `provider` value for
   * codex/claude/gemini/ollama, `openrouter-<id>` for each named OpenRouter instance). Fixes a
   * live bug: before this field existed, two or more OpenRouter instances made
   * `room.participants.list` throw on its own uniqueness refine, because that refine ran over the
   * shared `provider` value ("openrouter") instead of each instance's own key -- see the
   * uniqueness check below.
   */
  roomProviderKey: RoomProviderSchema.nullable().default(null),
  /** The effective model the adapter speaks (the daemon resolves Ollama's default when unset). */
  model: z.string().min(1).max(200),
  /** Codex `expectedCliVersion` when the operator pinned one; `null` for every other case. */
  cliVersion: z.string().min(1).max(100).nullable(),
});
export type RoomCatalogProviderEntryV1 = z.infer<typeof RoomCatalogProviderEntryV1Schema>;

/** "Research" rooms may enable web access for their Codex participants; "project" rooms never do. */
export const RoomRosterKindV1Schema = z.enum(["research", "project"]);
export type RoomRosterKindV1 = z.infer<typeof RoomRosterKindV1Schema>;

export const RoomRosterParticipantV1Schema = z.strictObject({
  persona: z.string().min(1).max(64),
  /** One-line description of this persona's role, fed to every provider as its "personaCharter". */
  oneLineCharter: z.string().min(1).max(200),
});
export type RoomRosterParticipantV1 = z.infer<typeof RoomRosterParticipantV1Schema>;

export const RoomRosterEntryCatalogV1Schema = z.strictObject({
  /** The roster keys rooms by their `roomId` string; it is not required to name an existing room. */
  roomId: z.string().min(1).max(200),
  kind: RoomRosterKindV1Schema,
  /** Overrides the auto-derived charter (from the room's own title) when present. */
  charter: z.string().min(1).max(MAX_ROOM_ROSTER_CHARTER_LENGTH_V1).nullable(),
  participants: z.array(RoomRosterParticipantV1Schema).max(MAX_ROOM_ROSTER_PARTICIPANTS_V1),
});
export type RoomRosterEntryCatalogV1 = z.infer<typeof RoomRosterEntryCatalogV1Schema>;

const RoomParticipantsCatalogDigestInputV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  enabled: z.boolean(),
  /** Present exactly when `enabled` is false: why the daemon has no participants to list. */
  unavailableReason: z.string().min(1).max(500).nullable(),
  providers: z.array(RoomCatalogProviderEntryV1Schema).max(MAX_ROOM_CATALOG_PROVIDER_ENTRIES_V1),
  roster: z.array(RoomRosterEntryCatalogV1Schema).max(MAX_ROOM_ROSTER_ENTRIES_V1),
};

export const RoomParticipantsCatalogDigestInputV1Schema = z.strictObject(
  RoomParticipantsCatalogDigestInputV1Shape,
);
export type RoomParticipantsCatalogDigestInputV1 = z.infer<
  typeof RoomParticipantsCatalogDigestInputV1Schema
>;

export const RoomParticipantsCatalogV1Schema = z
  .strictObject({
    ...RoomParticipantsCatalogDigestInputV1Shape,
    sourcedAt: IsoInstantSchema,
    /** SHA-256 of the canonical JSON of every field above except `sourcedAt` and this digest. */
    sourceDigest: Sha256DigestSchema,
  })
  .superRefine((catalog, context) => {
    if (catalog.enabled === (catalog.unavailableReason !== null)) {
      context.addIssue({
        code: "custom",
        path: ["unavailableReason"],
        message: "unavailableReason must be present exactly when enabled is false",
      });
    }
    if (!catalog.enabled && (catalog.providers.length > 0 || catalog.roster.length > 0)) {
      context.addIssue({
        code: "custom",
        path: ["enabled"],
        message: "a disabled catalog lists no providers and no roster",
      });
    }
    // Uniqueness runs over `roomProviderKey`, falling back to `provider` for a legacy entry
    // recorded before `roomProviderKey` existed. That fallback preserves the exact old behavior
    // for legacy data (one entry per provider family, each with a distinct `provider`) while
    // correctly allowing two or more OpenRouter instances -- which now carry distinct
    // `roomProviderKey`s despite sharing `provider: "openrouter"` -- to coexist.
    const providerKeys = catalog.providers.map((entry) => entry.roomProviderKey ?? entry.provider);
    if (new Set(providerKeys).size !== providerKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["providers"],
        message: "roomProviderKey (or provider, for legacy entries) must be unique",
      });
    }
  });
export type RoomParticipantsCatalogV1 = z.infer<typeof RoomParticipantsCatalogV1Schema>;

/**
 * The returned object is the complete canonical SHA-256 input. Callers encode it as recursively
 * key-sorted JSON UTF-8 and exclude `sourcedAt` and `sourceDigest`. Mirrors
 * `studioSnapshotDigestInputV1`/`canonicalStudioSnapshotDigestInputV1` exactly.
 */
export function roomParticipantsCatalogDigestInputV1(
  catalog: RoomParticipantsCatalogDigestInputV1 | RoomParticipantsCatalogV1,
): RoomParticipantsCatalogDigestInputV1 {
  return RoomParticipantsCatalogDigestInputV1Schema.parse({
    schemaVersion: catalog.schemaVersion,
    enabled: catalog.enabled,
    unavailableReason: catalog.unavailableReason,
    providers: catalog.providers,
    roster: catalog.roster,
  });
}

/** Canonical UTF-8 text to hash for `sourceDigest`. */
export function canonicalRoomParticipantsCatalogDigestInputV1(
  catalog: RoomParticipantsCatalogDigestInputV1 | RoomParticipantsCatalogV1,
): string {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      );
    }
    return value;
  };
  return JSON.stringify(normalize(roomParticipantsCatalogDigestInputV1(catalog)));
}
