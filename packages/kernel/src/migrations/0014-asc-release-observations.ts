import type { SqlMigration } from "../migration-types.js";

/**
 * Studio Phase 6 step B: durable App Store Connect release observations. One row per
 * `release.observe` command, holding the complete `AscReleaseObservationV1` (bounded, GET-only,
 * credential-free) as recorded JSON plus the projected columns `release.projection` and an operator
 * query need without unpacking it. Append-only and retained: an observation is a dated fact about
 * what Apple reported at `observed_at`; the newest one is the release rail's "live" reading and the
 * older ones are the honest history of that reading. `observation_id` is derived deterministically
 * from the command that took the observation, so a replayed `release.observe` is a no-op here.
 *
 * Nothing secret is stored: `key_id` is Apple's public JWT `kid`, `issuer_id` names the team, and
 * the two `keychain_*` columns are item names, never values.
 */
export const ascReleaseObservationsMigration: SqlMigration = {
  version: 14,
  name: "asc-release-observations",
  sql: String.raw`
CREATE TABLE asc_release_observations (
  observation_id TEXT PRIMARY KEY CHECK(length(observation_id) = 36 AND observation_id = lower(observation_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  observed_at TEXT NOT NULL CHECK(length(observed_at) = 24 AND substr(observed_at, 24, 1) = 'Z'),
  key_id TEXT NOT NULL CHECK(length(key_id) = 10),
  issuer_id TEXT NOT NULL CHECK(length(issuer_id) = 36 AND issuer_id = lower(issuer_id)),
  keychain_service TEXT NOT NULL CHECK(length(keychain_service) BETWEEN 1 AND 200),
  keychain_account TEXT NOT NULL CHECK(length(keychain_account) BETWEEN 1 AND 200),
  apps_outcome TEXT NOT NULL CHECK(apps_outcome IN ('observed', 'denied', 'ambiguous')),
  app_count INTEGER NOT NULL CHECK(app_count >= 0),
  request_count INTEGER NOT NULL CHECK(request_count >= 0),
  observation_digest TEXT NOT NULL UNIQUE CHECK(
    length(observation_digest) = 71
    AND substr(observation_digest, 1, 7) = 'sha256:'
    AND observation_digest = lower(observation_digest)
  ),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK((apps_outcome = 'observed') OR app_count = 0)
) STRICT;

CREATE INDEX asc_release_observations_observed_at_idx
  ON asc_release_observations(observed_at, observation_id);

CREATE TRIGGER asc_release_observations_reject_update
BEFORE UPDATE ON asc_release_observations BEGIN
  SELECT RAISE(ABORT, 'an App Store Connect release observation is a dated fact and is never rewritten');
END;
CREATE TRIGGER asc_release_observations_reject_delete
BEFORE DELETE ON asc_release_observations BEGIN
  SELECT RAISE(ABORT, 'App Store Connect release observations are retained');
END;
`,
};
