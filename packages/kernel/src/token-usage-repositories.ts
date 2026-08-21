import {
  MAX_USAGE_SUMMARY_ROWS_V1,
  PositiveSafeIntegerSchema,
  RoomGrantIdSchema,
  TokenUsageRecordV1Schema,
  UsageSummaryRowV1Schema,
  UsageSummaryV1Schema,
  type RoomGrantId,
  type TokenUsageRecordV1,
  type UsageSummaryV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

/**
 * The honest token ledger (migration 0017, `token_usage`, Architecture decision 6): append-only,
 * one row per contribution the daemon actually dispatched. See
 * `packages/contracts/src/v1/token-usage.ts` (`TokenUsageRecordV1Schema`) for the wire shape this
 * projects. `append` never updates or deletes (SQL triggers enforce it); `summarize` answers
 * `usage.summary`'s null-honest, per-(providerKey, model, day) rollup.
 */

const MIN_SINCE_DAYS = 1;
const MAX_SINCE_DAYS = 90;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function parseSinceDays(value: unknown): number {
  const sinceDays = PositiveSafeIntegerSchema.parse(value);
  if (sinceDays < MIN_SINCE_DAYS || sinceDays > MAX_SINCE_DAYS) {
    throw new RangeError(`sinceDays must be between ${MIN_SINCE_DAYS} and ${MAX_SINCE_DAYS}`);
  }
  return sinceDays;
}

function parseAsOf(value: unknown): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError("asOf must be a valid ISO instant");
  }
  return value;
}

export type TokenUsageSummaryQuery = Readonly<{
  sinceDays: unknown;
  /** The reference "now" the lookback window is measured from -- passed explicitly rather than
   *  read from the wall clock, so a summary is reproducible in tests and replay tooling alike. */
  asOf: unknown;
}>;

type SummaryRow = Readonly<{
  providerKey: string;
  model: string;
  dayKey: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  costUsdMicros: number | null;
  unreportedCount: number;
}>;

export class TokenUsageRepository {
  public constructor(private readonly database: Database.Database) {}

  /**
   * Inserts exactly one row. `grantId` is SQL-only (not part of `TokenUsageRecordV1`'s wire
   * shape): an optional pointer at the `room_grants` row this record came from, valid only when
   * `record.source === "room"`. A duplicate `usageId` fails on the table's PRIMARY KEY, matching
   * "append-only" -- there is no upsert-on-conflict path here.
   */
  public append(recordInput: unknown, grantIdInput: unknown = null): TokenUsageRecordV1 {
    const record = TokenUsageRecordV1Schema.parse(recordInput);
    const grantId: RoomGrantId | null =
      grantIdInput === null ? null : RoomGrantIdSchema.parse(grantIdInput);
    if (grantId !== null && record.source !== "room") {
      throw new Error("token_usage grantId is only valid when source is 'room'");
    }
    this.database
      .prepare(
        `INSERT INTO token_usage (
           usage_id, schema_version, occurred_at, provider_family, provider_key, model, source,
           room_id, grant_id, phase_run_id, signal_id,
           input_tokens, output_tokens, cached_input_tokens, cost_usd_micros
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.usageId,
        record.schemaVersion,
        record.occurredAt,
        record.providerFamily,
        record.providerKey,
        record.model,
        record.source,
        record.roomId,
        grantId,
        record.phaseRunId,
        record.signalId,
        record.inputTokens,
        record.outputTokens,
        record.cachedInputTokens,
        record.costUsdMicros,
      );
    return record;
  }

  /**
   * `usage.summary`'s read side: rows grouped by (providerKey, model, UTC calendar day) since
   * `asOf` minus `sinceDays`, newest day first. Every SUM is null-honest -- SQLite's `SUM` already
   * skips NULLs, so a bucket where no contribution reported, say, `cachedInputTokens` sums to
   * `NULL` rather than a fabricated 0. `unreportedCount` is `COUNT(*) - COUNT(output_tokens)`: the
   * rows in the bucket that recorded no usable usage at all.
   */
  public summarize(query: TokenUsageSummaryQuery): UsageSummaryV1 {
    const sinceDays = parseSinceDays(query.sinceDays);
    const asOf = parseAsOf(query.asOf);
    const cutoff = new Date(Date.parse(asOf) - sinceDays * MILLISECONDS_PER_DAY).toISOString();

    const rows = this.database
      .prepare(
        `SELECT
           provider_key AS providerKey,
           model AS model,
           substr(occurred_at, 1, 10) AS dayKey,
           SUM(input_tokens) AS inputTokens,
           SUM(output_tokens) AS outputTokens,
           SUM(cached_input_tokens) AS cachedInputTokens,
           SUM(cost_usd_micros) AS costUsdMicros,
           COUNT(*) - COUNT(output_tokens) AS unreportedCount
         FROM token_usage
         WHERE occurred_at >= ?
         GROUP BY provider_key, model, substr(occurred_at, 1, 10)
         ORDER BY dayKey DESC, providerKey, model
         LIMIT ?`,
      )
      .all(cutoff, MAX_USAGE_SUMMARY_ROWS_V1) as SummaryRow[];

    return UsageSummaryV1Schema.parse({
      sinceDays,
      rows: rows.map((row) => UsageSummaryRowV1Schema.parse(row)),
    });
  }
}
