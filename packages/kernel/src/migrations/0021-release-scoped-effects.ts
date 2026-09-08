import type { SqlMigration } from "../migration-types.js";

/**
 * Session 2 / OR-28: widen `external_effects` to accept release-scoped Apple upload effects
 * (null attempt/task subject columns matching migration 0020's approvals relaxation) and add
 * `release_upload_intents` for durable upload intent bound to release_run + effect + approval.
 *
 * Attempt-scoped effects and their origin-checkpoint path remain unchanged. Release-scoped rows
 * never use `effect_origin_checkpoints` (those remain attempt/step bound).
 */
export const releaseScopedEffectsMigration: SqlMigration = {
  version: 21,
  name: "release-scoped-effects",
  disableForeignKeysDuringApply: true,
  sql: String.raw`
DROP TRIGGER IF EXISTS external_effects_identity_immutable;
DROP TRIGGER IF EXISTS external_effects_subject_matches_attempt;
DROP TRIGGER IF EXISTS external_effects_legal_state_transition;
DROP TRIGGER IF EXISTS external_effects_observation_required;
DROP TRIGGER IF EXISTS external_effects_rejection_required;
DROP TRIGGER IF EXISTS external_effects_reject_delete;
DROP TRIGGER IF EXISTS effect_origin_checkpoint_matches_workflow;
DROP TRIGGER IF EXISTS effect_outbox_matches_intent;

CREATE TABLE external_effects_new (
  effect_id TEXT PRIMARY KEY CHECK(length(effect_id) = 36 AND effect_id = lower(effect_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  attempt_id TEXT REFERENCES attempts(attempt_id),
  action TEXT NOT NULL CHECK(length(action) BETWEEN 3 AND 128),
  operation_marker TEXT NOT NULL UNIQUE CHECK(length(operation_marker) BETWEEN 16 AND 500),
  provider TEXT NOT NULL CHECK(provider IN ('jira', 'github', 'apple', 'website', 'email', 'social', 'analytics', 'crm')),
  resource_type TEXT NOT NULL CHECK(length(resource_type) BETWEEN 3 AND 128),
  resource_key TEXT NOT NULL CHECK(length(resource_key) BETWEEN 1 AND 1000),
  subject_project_id TEXT NOT NULL,
  subject_task_id TEXT REFERENCES task_snapshots(task_id),
  subject_attempt_id TEXT REFERENCES attempts(attempt_id),
  subject_release_id TEXT,
  payload_digest TEXT NOT NULL CHECK(
    length(payload_digest) = 71 AND substr(payload_digest, 1, 7) = 'sha256:' AND payload_digest = lower(payload_digest)
  ),
  policy_digest TEXT NOT NULL CHECK(
    length(policy_digest) = 71 AND substr(policy_digest, 1, 7) = 'sha256:' AND policy_digest = lower(policy_digest)
  ),
  plan_digest TEXT CHECK(
    plan_digest IS NULL OR (length(plan_digest) = 71 AND substr(plan_digest, 1, 7) = 'sha256:' AND plan_digest = lower(plan_digest))
  ),
  diff_digest TEXT CHECK(
    diff_digest IS NULL OR (length(diff_digest) = 71 AND substr(diff_digest, 1, 7) = 'sha256:' AND diff_digest = lower(diff_digest))
  ),
  commit_id TEXT CHECK(commit_id IS NULL OR (length(commit_id) IN (40, 64) AND commit_id = lower(commit_id))),
  build_identity_digest TEXT CHECK(
    build_identity_digest IS NULL OR (
      length(build_identity_digest) = 71
      AND substr(build_identity_digest, 1, 7) = 'sha256:'
      AND build_identity_digest = lower(build_identity_digest)
    )
  ),
  standing_scope TEXT CHECK(standing_scope IS NULL OR length(standing_scope) BETWEEN 3 AND 128),
  intent_digest TEXT NOT NULL UNIQUE CHECK(
    length(intent_digest) = 71 AND substr(intent_digest, 1, 7) = 'sha256:' AND intent_digest = lower(intent_digest)
  ),
  available_at TEXT NOT NULL CHECK(length(available_at) = 24 AND substr(available_at, 24, 1) = 'Z'),
  approval_id TEXT NOT NULL REFERENCES approvals(approval_id),
  state TEXT NOT NULL CHECK(state IN ('planned', 'sent', 'observed', 'confirmed', 'unknown', 'manual-intervention', 'rejected')),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  send_count INTEGER NOT NULL CHECK(send_count >= 0),
  provider_correlation_key TEXT CHECK(provider_correlation_key IS NULL OR length(provider_correlation_key) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  last_observed_at TEXT CHECK(last_observed_at IS NULL OR (length(last_observed_at) = 24 AND substr(last_observed_at, 24, 1) = 'Z')),
  next_reconcile_at TEXT CHECK(next_reconcile_at IS NULL OR (length(next_reconcile_at) = 24 AND substr(next_reconcile_at, 24, 1) = 'Z')),
  detail_digest TEXT CHECK(
    detail_digest IS NULL OR (length(detail_digest) = 71 AND substr(detail_digest, 1, 7) = 'sha256:' AND detail_digest = lower(detail_digest))
  ),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK(
    (
      attempt_id IS NOT NULL
      AND subject_task_id IS NOT NULL
      AND subject_attempt_id IS NOT NULL
      AND attempt_id = subject_attempt_id
    )
    OR (
      attempt_id IS NULL
      AND subject_task_id IS NULL
      AND subject_attempt_id IS NULL
      AND subject_release_id IS NOT NULL
    )
  ),
  CHECK(updated_at >= created_at),
  CHECK((state = 'planned' AND send_count = 0) OR (state <> 'planned' AND send_count > 0)),
  CHECK(state <> 'unknown' OR next_reconcile_at IS NOT NULL),
  CHECK(state NOT IN ('observed', 'confirmed') OR (provider_correlation_key IS NOT NULL AND last_observed_at IS NOT NULL))
) STRICT;

INSERT INTO external_effects_new SELECT * FROM external_effects;
DROP TABLE external_effects;
ALTER TABLE external_effects_new RENAME TO external_effects;

CREATE INDEX external_effects_attempt_created_idx ON external_effects(attempt_id, created_at, effect_id)
  WHERE attempt_id IS NOT NULL;
CREATE INDEX external_effects_reconcile_idx ON external_effects(state, next_reconcile_at, updated_at, effect_id);
CREATE INDEX external_effects_release_idx ON external_effects(subject_release_id, created_at, effect_id)
  WHERE subject_release_id IS NOT NULL;

CREATE TRIGGER external_effects_identity_immutable
BEFORE UPDATE OF effect_id, schema_version, attempt_id, action, operation_marker, provider,
  resource_type, resource_key, subject_project_id, subject_task_id, subject_attempt_id,
  subject_release_id, payload_digest, policy_digest, plan_digest, diff_digest, commit_id,
  build_identity_digest, standing_scope, intent_digest, available_at, approval_id, created_at
ON external_effects BEGIN
  SELECT RAISE(ABORT, 'external effect identity and bindings are immutable');
END;

CREATE TRIGGER external_effects_subject_matches_attempt
BEFORE INSERT ON external_effects WHEN NOT (
  (
    NEW.attempt_id IS NULL
    AND NEW.subject_task_id IS NULL
    AND NEW.subject_attempt_id IS NULL
    AND NEW.subject_project_id IS NOT NULL
    AND NEW.subject_release_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM attempts a
    JOIN task_snapshots t ON t.task_id = a.task_id
    WHERE a.attempt_id = NEW.attempt_id
      AND NEW.subject_attempt_id = a.attempt_id
      AND NEW.subject_task_id = a.task_id
      AND NEW.subject_project_id = t.project_id
  )
) BEGIN
  SELECT RAISE(ABORT, 'effect subject does not match attempt task/project, or is not release-scoped');
END;

CREATE TRIGGER external_effects_legal_state_transition
BEFORE UPDATE OF state ON external_effects WHEN NOT (
  NEW.revision = OLD.revision + 1
  AND NEW.updated_at > OLD.updated_at
  AND (
    (OLD.state = 'planned' AND NEW.state = 'sent' AND NEW.send_count = OLD.send_count + 1)
    OR (OLD.state = 'sent' AND NEW.state IN ('observed', 'unknown', 'rejected') AND NEW.send_count = OLD.send_count)
    OR (OLD.state = 'unknown' AND NEW.state IN ('unknown', 'observed', 'manual-intervention') AND NEW.send_count = OLD.send_count)
    OR (OLD.state = 'observed' AND NEW.state IN ('confirmed', 'manual-intervention') AND NEW.send_count = OLD.send_count)
  )
) BEGIN
  SELECT RAISE(ABORT, 'illegal external effect state transition');
END;

CREATE TRIGGER external_effects_observation_required
BEFORE UPDATE OF state ON external_effects
WHEN NEW.state IN ('observed', 'confirmed')
  AND NOT EXISTS (
    SELECT 1 FROM external_resources
    WHERE effect_id = NEW.effect_id AND observed_at = NEW.last_observed_at
  )
BEGIN
  SELECT RAISE(ABORT, 'observed external resource is required');
END;

CREATE TRIGGER external_effects_rejection_required
BEFORE UPDATE OF state ON external_effects
WHEN NEW.state = 'rejected'
  AND NOT EXISTS (
    SELECT 1 FROM effect_rejections r
    WHERE r.effect_id = NEW.effect_id
      AND r.evidence_digest = NEW.detail_digest
      AND r.rejected_at = NEW.updated_at
  )
BEGIN
  SELECT RAISE(ABORT, 'durable provider rejection evidence is required');
END;

CREATE TRIGGER external_effects_reject_delete
BEFORE DELETE ON external_effects BEGIN
  SELECT RAISE(ABORT, 'external effects are append-only');
END;

CREATE TRIGGER effect_outbox_matches_intent
BEFORE INSERT ON effect_outbox WHEN NOT EXISTS (
  SELECT 1 FROM external_effects e
  WHERE e.effect_id = NEW.effect_id AND e.available_at = NEW.available_at
) BEGIN
  SELECT RAISE(ABORT, 'outbox availability does not match immutable effect intent');
END;

CREATE TRIGGER effect_origin_checkpoint_matches_workflow
BEFORE INSERT ON effect_origin_checkpoints WHEN NOT EXISTS (
  SELECT 1
  FROM external_effects e
  JOIN steps s ON s.step_id = NEW.step_id
  JOIN attempts a ON a.attempt_id = NEW.attempt_id
  WHERE e.effect_id = NEW.effect_id
    AND e.attempt_id = NEW.attempt_id
    AND e.intent_digest = NEW.intent_digest
    AND NEW.approval_id IN (SELECT approval_id FROM approvals)
    AND s.attempt_id = NEW.attempt_id
    AND s.revision = NEW.step_revision
    AND s.last_fence = NEW.fence
    AND s.effect_checkpoint_revision = NEW.checkpoint_revision
    AND a.revision = NEW.attempt_revision
    AND a.fence = NEW.fence
) BEGIN
  SELECT RAISE(ABORT, 'effect origin checkpoint does not match workflow');
END;

CREATE TABLE release_upload_intents (
  intent_id TEXT PRIMARY KEY CHECK(length(intent_id) = 36 AND intent_id = lower(intent_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  release_run_id TEXT NOT NULL REFERENCES release_runs(release_run_id),
  effect_id TEXT NOT NULL UNIQUE REFERENCES external_effects(effect_id),
  approval_id TEXT NOT NULL REFERENCES approvals(approval_id),
  identity_digest TEXT NOT NULL CHECK(
    length(identity_digest) = 71 AND substr(identity_digest, 1, 7) = 'sha256:' AND identity_digest = lower(identity_digest)
  ),
  intent_digest TEXT NOT NULL UNIQUE CHECK(
    length(intent_digest) = 71 AND substr(intent_digest, 1, 7) = 'sha256:' AND intent_digest = lower(intent_digest)
  ),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object')
) STRICT;

CREATE INDEX release_upload_intents_run_idx ON release_upload_intents(release_run_id, created_at, intent_id);

CREATE TRIGGER release_upload_intents_reject_update
BEFORE UPDATE ON release_upload_intents BEGIN
  SELECT RAISE(ABORT, 'release upload intents are immutable');
END;
CREATE TRIGGER release_upload_intents_reject_delete
BEFORE DELETE ON release_upload_intents BEGIN
  SELECT RAISE(ABORT, 'release upload intents are append-only');
END;
`,
};
