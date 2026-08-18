import {
  AscReleaseObservationV1Schema,
  type AscReleaseObservationId,
  type AscReleaseObservationV1,
} from "@app-factory/contracts";
import type Database from "better-sqlite3";

/**
 * Durable App Store Connect release observations (migration 0014, `asc_release_observations`).
 * Append-only: `record` inserts exactly once per `observationId` and returns whether this call was
 * the one that inserted it, so a replayed `release.observe` (same command, same derived ID) is a
 * no-op instead of a second row. Rows are never updated or deleted (SQL triggers enforce it).
 */

type ObservationRow = Readonly<{
  observation_id: string;
  observed_at: string;
  observation_digest: string;
  payload_json: string;
}>;

const OBSERVATION_SELECT = `SELECT observation_id, observed_at, observation_digest, payload_json
   FROM asc_release_observations`;

function failInvariant(message: string): never {
  throw new Error(message);
}

function decodeObservation(row: ObservationRow): AscReleaseObservationV1 {
  let value: unknown;
  try {
    value = JSON.parse(row.payload_json) as unknown;
  } catch (error) {
    throw new Error(`asc_release_observations ${row.observation_id} contains invalid JSON`, {
      cause: error,
    });
  }
  let observation: AscReleaseObservationV1;
  try {
    observation = AscReleaseObservationV1Schema.parse(value);
  } catch (error) {
    throw new Error(
      `asc_release_observations ${row.observation_id} violates the current runtime contract`,
      { cause: error },
    );
  }
  if (observation.observationId !== row.observation_id) {
    failInvariant("asc_release_observations observation_id projection mismatch");
  }
  if (observation.observedAt !== row.observed_at) {
    failInvariant("asc_release_observations observed_at projection mismatch");
  }
  if (observation.observationDigest !== row.observation_digest) {
    failInvariant("asc_release_observations observation_digest projection mismatch");
  }
  return observation;
}

export type RecordedAscReleaseObservation = Readonly<{
  observation: AscReleaseObservationV1;
  /** True when this call inserted the row; false when the identical observation already existed. */
  inserted: boolean;
}>;

export class AscReleaseObservationConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AscReleaseObservationConflictError";
  }
}

export class AscReleaseObservationRepository {
  public constructor(private readonly database: Database.Database) {}

  public get(observationId: AscReleaseObservationId): AscReleaseObservationV1 | null {
    const row = this.database
      .prepare(`${OBSERVATION_SELECT} WHERE observation_id = ?`)
      .get(observationId) as ObservationRow | undefined;
    return row === undefined ? null : decodeObservation(row);
  }

  /** The newest observation by `observed_at` (ties broken by `observation_id`), or `null`. */
  public latest(): AscReleaseObservationV1 | null {
    const row = this.database
      .prepare(`${OBSERVATION_SELECT} ORDER BY observed_at DESC, observation_id DESC LIMIT 1`)
      .get() as ObservationRow | undefined;
    return row === undefined ? null : decodeObservation(row);
  }

  public count(): number {
    const row = this.database
      .prepare(`SELECT count(*) AS total FROM asc_release_observations`)
      .get() as Readonly<{ total: number }>;
    return row.total;
  }

  /**
   * Inserts the observation exactly once. A second call with the same `observationId` returns the
   * stored row and `inserted: false` when the stored digest matches, and throws
   * `AscReleaseObservationConflictError` when it does not — the same command can never name two
   * different observations.
   */
  public record(input: AscReleaseObservationV1): RecordedAscReleaseObservation {
    const observation = AscReleaseObservationV1Schema.parse(input);
    return this.database.transaction((): RecordedAscReleaseObservation => {
      const existing = this.get(observation.observationId);
      if (existing !== null) {
        if (existing.observationDigest !== observation.observationDigest) {
          throw new AscReleaseObservationConflictError(
            `asc_release_observations ${observation.observationId} already holds a different observation`,
          );
        }
        return { observation: existing, inserted: false };
      }
      this.database
        .prepare(
          `INSERT INTO asc_release_observations (
             observation_id, schema_version, observed_at, key_id, issuer_id, keychain_service,
             keychain_account, apps_outcome, app_count, request_count, observation_digest,
             payload_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          observation.observationId,
          observation.schemaVersion,
          observation.observedAt,
          observation.source.keyId,
          observation.source.issuerId,
          observation.source.keychainService,
          observation.source.keychainAccount,
          observation.apps.kind,
          observation.appObservations.length,
          observation.requestCount,
          observation.observationDigest,
          JSON.stringify(observation),
        );
      return { observation, inserted: true };
    })();
  }
}
