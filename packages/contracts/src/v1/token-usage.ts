import { z } from "zod";

import {
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  PhaseRunIdSchema,
  SchemaVersionV1Schema,
} from "./primitives.js";
import { ProviderFamilyV1Schema } from "./provider.js";
import { RoomDayKeySchema, RoomIdSchema, RoomProviderSchema } from "./room.js";
import { SignalIdSchema } from "./signal.js";

/**
 * The honest token ledger (Architecture decision 6, migration `0017-token-usage`): one
 * append-only row per contribution the daemon actually dispatched, distinct from
 * `RoomBudgetV1`'s reservation accounting -- a budget debit happens whether or not a provider
 * ever reports real usage, but this ledger only ever records what a provider actually reported,
 * leaving a field `null` (and the row counted toward `unreportedCount` in a summary) rather than
 * inventing a number. No per-token pricing is ever invented: `costUsdMicros` is populated only
 * where a provider self-reports cost (Claude's `total_cost_usd` today), `null` everywhere else.
 */

const LOWERCASE_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const TokenUsageIdSchema = z
  .string()
  .regex(LOWERCASE_UUID_PATTERN, "Expected a canonical lowercase UUID")
  .brand<"TokenUsageId">();
export type TokenUsageId = z.infer<typeof TokenUsageIdSchema>;

export const TokenUsageSourceV1Schema = z.enum(["room", "phase", "signal"]);
export type TokenUsageSourceV1 = z.infer<typeof TokenUsageSourceV1Schema>;

/**
 * Exactly one of `roomId`/`phaseRunId`/`signalId` is non-null, matching `source` -- the row's only
 * foreign key. `inputTokens`/`outputTokens`/`cachedInputTokens`/`costUsdMicros` are each
 * independently nullable: a provider that reports some fields but not others (OpenRouter reports
 * completion but not prompt tokens today, for instance) leaves exactly the unreported ones null
 * rather than zero.
 */
export const TokenUsageRecordV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    usageId: TokenUsageIdSchema,
    occurredAt: IsoInstantSchema,
    providerFamily: ProviderFamilyV1Schema,
    providerKey: RoomProviderSchema,
    model: z.string().min(1).max(200),
    source: TokenUsageSourceV1Schema,
    roomId: RoomIdSchema.nullable(),
    phaseRunId: PhaseRunIdSchema.nullable(),
    signalId: SignalIdSchema.nullable(),
    inputTokens: NonNegativeSafeIntegerSchema.nullable(),
    outputTokens: NonNegativeSafeIntegerSchema.nullable(),
    cachedInputTokens: NonNegativeSafeIntegerSchema.nullable(),
    costUsdMicros: NonNegativeSafeIntegerSchema.nullable(),
  })
  .superRefine((record, context) => {
    const roomSet = record.roomId !== null;
    const phaseSet = record.phaseRunId !== null;
    const signalSet = record.signalId !== null;
    const setCount = Number(roomSet) + Number(phaseSet) + Number(signalSet);
    if (setCount !== 1) {
      context.addIssue({
        code: "custom",
        path: ["source"],
        message: "exactly one of roomId, phaseRunId, or signalId must be set",
      });
      return;
    }
    const matchesSource =
      (record.source === "room" && roomSet) ||
      (record.source === "phase" && phaseSet) ||
      (record.source === "signal" && signalSet);
    if (!matchesSource) {
      context.addIssue({
        code: "custom",
        path: ["source"],
        message: "the set foreign key must match source",
      });
    }
  });
export type TokenUsageRecordV1 = z.infer<typeof TokenUsageRecordV1Schema>;

/** One (providerKey, model, dayKey) bucket of `usage.summary`. */
export const UsageSummaryRowV1Schema = z.strictObject({
  providerKey: RoomProviderSchema,
  model: z.string().min(1).max(200),
  dayKey: RoomDayKeySchema,
  inputTokens: NonNegativeSafeIntegerSchema.nullable(),
  outputTokens: NonNegativeSafeIntegerSchema.nullable(),
  cachedInputTokens: NonNegativeSafeIntegerSchema.nullable(),
  costUsdMicros: NonNegativeSafeIntegerSchema.nullable(),
  /** Rows the ledger recorded for this bucket with no usable usage at all -- every token/cost
   *  field null. Rendered as "N unreported," never folded into a fabricated 0. */
  unreportedCount: NonNegativeSafeIntegerSchema,
});
export type UsageSummaryRowV1 = z.infer<typeof UsageSummaryRowV1Schema>;

export const MAX_USAGE_SUMMARY_ROWS_V1 = 2_000 as const;

export const UsageSummaryV1Schema = z.strictObject({
  sinceDays: z.number().int().min(1).max(90),
  rows: z.array(UsageSummaryRowV1Schema).max(MAX_USAGE_SUMMARY_ROWS_V1),
});
export type UsageSummaryV1 = z.infer<typeof UsageSummaryV1Schema>;
