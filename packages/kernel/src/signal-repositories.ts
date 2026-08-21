import {
  SignalInsightV1Schema,
  SignalV1Schema,
  type SignalId,
  type SignalInsightV1,
  type SignalStatusV1,
  type SignalV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

/**
 * `signals` (mutable) and `signal_insights` (append-only, migration 0015). See
 * `packages/contracts/src/v1/signal.ts` for the model this projects.
 */

type SignalRow = Readonly<{
  signal_id: string;
  schema_version: number;
  name: string;
  watch_description: string;
  scout_provider: string;
  status: string;
  created_at: string;
  last_checked_at: string | null;
  check_count: number;
  insight_count: number;
  check_interval_minutes: number | null;
}>;

const SIGNAL_SELECT = `SELECT signal_id, schema_version, name, watch_description, scout_provider,
   status, created_at, last_checked_at, check_count, insight_count, check_interval_minutes
   FROM signals`;

function decodeSignal(row: SignalRow): SignalV1 {
  return SignalV1Schema.parse({
    schemaVersion: row.schema_version,
    signalId: row.signal_id,
    name: row.name,
    watchDescription: row.watch_description,
    scoutProvider: row.scout_provider,
    status: row.status,
    createdAt: row.created_at,
    lastCheckedAt: row.last_checked_at,
    checkCount: row.check_count,
    insightCount: row.insight_count,
    checkIntervalMinutes: row.check_interval_minutes,
  });
}

export class SignalNotFoundError extends Error {
  public constructor(signalId: string) {
    super(`Signal ${signalId} does not exist`);
    this.name = "SignalNotFoundError";
  }
}

export class SignalRepository {
  public constructor(private readonly database: Database.Database) {}

  public findById(signalId: SignalId): SignalV1 | null {
    const row = this.database.prepare(`${SIGNAL_SELECT} WHERE signal_id = ?`).get(signalId) as
      SignalRow | undefined;
    return row === undefined ? null : decodeSignal(row);
  }

  /** Newest first. Bounded (`MAX_SIGNAL_LIST_V1`, contracts caps the wire array at 1000 too) --
   *  signals are operator-defined and few, exactly like registered projects. */
  public list(): readonly SignalV1[] {
    const rows = this.database
      .prepare(`${SIGNAL_SELECT} ORDER BY created_at DESC, signal_id DESC LIMIT 1000`)
      .all() as SignalRow[];
    return rows.map(decodeSignal);
  }

  public create(input: {
    signalId: SignalId;
    name: string;
    watchDescription: string;
    scoutProvider: string;
    createdAt: string;
    /** `null` (manual-only, the default before Architecture decision 11's scheduler) or how often
     *  `signal-scheduler.ts`'s loop is willing to run this signal's Scout, in minutes. */
    checkIntervalMinutes?: number | null;
  }): SignalV1 {
    this.database
      .prepare(
        `INSERT INTO signals (
           signal_id, schema_version, name, watch_description, scout_provider, status,
           created_at, last_checked_at, check_count, insight_count, check_interval_minutes
         ) VALUES (?, 1, ?, ?, ?, 'active', ?, NULL, 0, 0, ?)`,
      )
      .run(
        input.signalId,
        input.name,
        input.watchDescription,
        input.scoutProvider,
        input.createdAt,
        input.checkIntervalMinutes ?? null,
      );
    const created = this.findById(input.signalId);
    if (created === null) throw new Error("Signal insert did not persist");
    return created;
  }

  private requireExisting(signalId: SignalId): void {
    if (this.findById(signalId) === null) throw new SignalNotFoundError(signalId);
  }

  public setStatus(signalId: SignalId, status: SignalStatusV1): SignalV1 {
    this.requireExisting(signalId);
    this.database
      .prepare(`UPDATE signals SET status = ? WHERE signal_id = ?`)
      .run(status, signalId);
    const updated = this.findById(signalId);
    if (updated === null) throw new Error("Signal disappeared during update");
    return updated;
  }

  /** Sets or clears (`null`) `checkIntervalMinutes` (Architecture decision 11's `signal.reschedule`).
   *  A plain repository write; the scheduler loop only ever reads this column. */
  public reschedule(signalId: SignalId, checkIntervalMinutes: number | null): SignalV1 {
    this.requireExisting(signalId);
    this.database
      .prepare(`UPDATE signals SET check_interval_minutes = ? WHERE signal_id = ?`)
      .run(checkIntervalMinutes, signalId);
    const updated = this.findById(signalId);
    if (updated === null) throw new Error("Signal disappeared during update");
    return updated;
  }

  /** Bumps `checkCount` and `lastCheckedAt`, and `insightCount` when `foundInsight` is true. Called
   *  once per `signal.run-now`, whether or not the Scout found anything new. */
  public recordCheck(signalId: SignalId, checkedAt: string, foundInsight: boolean): SignalV1 {
    this.requireExisting(signalId);
    this.database
      .prepare(
        `UPDATE signals
           SET last_checked_at = ?, check_count = check_count + 1,
               insight_count = insight_count + ?
         WHERE signal_id = ?`,
      )
      .run(checkedAt, foundInsight ? 1 : 0, signalId);
    const updated = this.findById(signalId);
    if (updated === null) throw new Error("Signal disappeared during update");
    return updated;
  }
}

type InsightRow = Readonly<{
  insight_id: string;
  insight_digest: string;
  payload_json: string;
}>;

const INSIGHT_SELECT = `SELECT insight_id, insight_digest, payload_json FROM signal_insights`;

function decodeInsight(row: InsightRow): SignalInsightV1 {
  let value: unknown;
  try {
    value = JSON.parse(row.payload_json) as unknown;
  } catch (error) {
    throw new Error(`signal_insights ${row.insight_id} contains invalid JSON`, { cause: error });
  }
  const insight = SignalInsightV1Schema.parse(value);
  if (insight.insightId !== row.insight_id || insight.insightDigest !== row.insight_digest) {
    throw new Error(`signal_insights ${row.insight_id} projection mismatch`);
  }
  return insight;
}

export type RecordedSignalInsight = Readonly<{
  insight: SignalInsightV1;
  /** True when this call inserted the row; false when the identical insight already existed
   *  (a replayed `signal.run-now` for the same check). */
  inserted: boolean;
}>;

export class SignalInsightConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SignalInsightConflictError";
  }
}

export class SignalInsightRepository {
  public constructor(private readonly database: Database.Database) {}

  public get(insightId: string): SignalInsightV1 | null {
    const row = this.database.prepare(`${INSIGHT_SELECT} WHERE insight_id = ?`).get(insightId) as
      InsightRow | undefined;
    return row === undefined ? null : decodeInsight(row);
  }

  /** Newest first for one signal. */
  public listBySignal(signalId: SignalId): readonly SignalInsightV1[] {
    const rows = this.database
      .prepare(
        `SELECT si.insight_id, si.insight_digest, si.payload_json
           FROM signal_insights si
          WHERE si.signal_id = ?
          ORDER BY si.discovered_at DESC, si.insight_id DESC
          LIMIT 1000`,
      )
      .all(signalId) as InsightRow[];
    return rows.map(decodeInsight);
  }

  /** Inserts exactly once. A second call with the same `insightId` returns the stored row and
   *  `inserted: false` when the digest matches, and throws `SignalInsightConflictError` when it
   *  does not -- mirrors `AscReleaseObservationRepository.record`. */
  public record(input: SignalInsightV1): RecordedSignalInsight {
    const insight = SignalInsightV1Schema.parse(input);
    return this.database.transaction((): RecordedSignalInsight => {
      const existing = this.get(insight.insightId);
      if (existing !== null) {
        if (existing.insightDigest !== insight.insightDigest) {
          throw new SignalInsightConflictError(
            `signal_insights ${insight.insightId} already holds a different insight`,
          );
        }
        return { insight: existing, inserted: false };
      }
      this.database
        .prepare(
          `INSERT INTO signal_insights (
             insight_id, signal_id, schema_version, discovered_at, headline, confidence,
             insight_digest, payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          insight.insightId,
          insight.signalId,
          insight.schemaVersion,
          insight.discoveredAt,
          insight.headline,
          insight.confidence,
          insight.insightDigest,
          JSON.stringify(insight),
        );
      return { insight, inserted: true };
    })();
  }
}
