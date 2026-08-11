import type { SqlMigration } from "../migration-types.js";

export const approvalsOutboxMigration: SqlMigration = {
  version: 2,
  name: "approvals-outbox",
  sql: `
ALTER TABLE steps ADD COLUMN effect_checkpoint_revision INTEGER NOT NULL DEFAULT 0
  CHECK(effect_checkpoint_revision >= 0);

CREATE TABLE approvals (
  approval_id TEXT PRIMARY KEY CHECK(length(approval_id) = 36 AND approval_id = lower(approval_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  action TEXT NOT NULL CHECK(length(action) BETWEEN 3 AND 128),
  resource_type TEXT NOT NULL CHECK(length(resource_type) BETWEEN 3 AND 128),
  resource_key TEXT NOT NULL CHECK(length(resource_key) BETWEEN 1 AND 1000),
  subject_project_id TEXT NOT NULL,
  subject_task_id TEXT NOT NULL REFERENCES task_snapshots(task_id),
  subject_attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id),
  subject_release_id TEXT,
  payload_digest TEXT NOT NULL CHECK(
    length(payload_digest) = 71 AND substr(payload_digest, 1, 7) = 'sha256:' AND payload_digest = lower(payload_digest)
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
  policy_digest TEXT NOT NULL CHECK(
    length(policy_digest) = 71 AND substr(policy_digest, 1, 7) = 'sha256:' AND policy_digest = lower(policy_digest)
  ),
  actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 320),
  issuer_id TEXT NOT NULL CHECK(length(issuer_id) BETWEEN 1 AND 320),
  authenticated_at TEXT NOT NULL CHECK(length(authenticated_at) = 24 AND substr(authenticated_at, 24, 1) = 'Z'),
  issuance_envelope_digest TEXT NOT NULL CHECK(
    length(issuance_envelope_digest) = 71
    AND substr(issuance_envelope_digest, 1, 7) = 'sha256:'
    AND issuance_envelope_digest = lower(issuance_envelope_digest)
  ),
  issuance_attestation_digest TEXT NOT NULL CHECK(
    length(issuance_attestation_digest) = 71
    AND substr(issuance_attestation_digest, 1, 7) = 'sha256:'
    AND issuance_attestation_digest = lower(issuance_attestation_digest)
  ),
  issuance_json TEXT NOT NULL CHECK(json_valid(issuance_json) AND json_type(issuance_json) = 'object'),
  mode TEXT NOT NULL CHECK(mode IN ('single-use', 'standing')),
  standing_scope_json TEXT CHECK(
    standing_scope_json IS NULL OR (json_valid(standing_scope_json) AND json_type(standing_scope_json) = 'array')
  ),
  issued_at TEXT NOT NULL CHECK(length(issued_at) = 24 AND substr(issued_at, 24, 1) = 'Z'),
  expires_at TEXT NOT NULL CHECK(length(expires_at) = 24 AND substr(expires_at, 24, 1) = 'Z'),
  status TEXT NOT NULL CHECK(status IN ('active', 'consumed', 'revoked', 'expired')),
  revoked_at TEXT CHECK(revoked_at IS NULL OR (length(revoked_at) = 24 AND substr(revoked_at, 24, 1) = 'Z')),
  consumed_at TEXT CHECK(consumed_at IS NULL OR (length(consumed_at) = 24 AND substr(consumed_at, 24, 1) = 'Z')),
  consumed_by_effect_id TEXT REFERENCES external_effects(effect_id) DEFERRABLE INITIALLY DEFERRED CHECK(
    consumed_by_effect_id IS NULL OR (length(consumed_by_effect_id) = 36 AND consumed_by_effect_id = lower(consumed_by_effect_id))
  ),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK(expires_at > issued_at),
  CHECK(authenticated_at = issued_at),
  CHECK(revoked_at IS NULL OR (revoked_at >= issued_at AND revoked_at < expires_at)),
  CHECK(consumed_at IS NULL OR (consumed_at >= issued_at AND consumed_at < expires_at)),
  CHECK(
    subject_project_id IS NOT NULL AND subject_task_id IS NOT NULL AND subject_attempt_id IS NOT NULL
  ),
  CHECK(
    (mode = 'single-use' AND standing_scope_json IS NULL)
    OR (mode = 'standing' AND standing_scope_json IS NOT NULL AND json_array_length(standing_scope_json) > 0)
  ),
  CHECK(
    (status = 'active' AND revoked_at IS NULL AND consumed_at IS NULL AND consumed_by_effect_id IS NULL)
    OR (status = 'consumed' AND mode = 'single-use' AND revoked_at IS NULL AND consumed_at IS NOT NULL AND consumed_by_effect_id IS NOT NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL AND consumed_at IS NULL AND consumed_by_effect_id IS NULL)
    OR (status = 'expired' AND revoked_at IS NULL AND consumed_at IS NULL AND consumed_by_effect_id IS NULL)
  )
) STRICT;

CREATE INDEX approvals_status_expires_at_idx ON approvals(status, expires_at, approval_id);
CREATE INDEX approvals_subject_attempt_idx ON approvals(subject_attempt_id) WHERE subject_attempt_id IS NOT NULL;

CREATE TABLE external_effects (
  effect_id TEXT PRIMARY KEY CHECK(length(effect_id) = 36 AND effect_id = lower(effect_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id),
  action TEXT NOT NULL CHECK(length(action) BETWEEN 3 AND 128),
  operation_marker TEXT NOT NULL UNIQUE CHECK(length(operation_marker) BETWEEN 16 AND 500),
  provider TEXT NOT NULL CHECK(provider IN ('jira', 'github', 'apple', 'website', 'email', 'social', 'analytics', 'crm')),
  resource_type TEXT NOT NULL CHECK(length(resource_type) BETWEEN 3 AND 128),
  resource_key TEXT NOT NULL CHECK(length(resource_key) BETWEEN 1 AND 1000),
  subject_project_id TEXT NOT NULL,
  subject_task_id TEXT NOT NULL REFERENCES task_snapshots(task_id),
  subject_attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id),
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
  CHECK(attempt_id = subject_attempt_id),
  CHECK(updated_at >= created_at),
  CHECK((state = 'planned' AND send_count = 0) OR (state <> 'planned' AND send_count > 0)),
  CHECK(state <> 'unknown' OR next_reconcile_at IS NOT NULL),
  CHECK(state NOT IN ('observed', 'confirmed') OR (provider_correlation_key IS NOT NULL AND last_observed_at IS NOT NULL))
) STRICT;

CREATE INDEX external_effects_attempt_created_idx ON external_effects(attempt_id, created_at, effect_id);
CREATE INDEX external_effects_reconcile_idx ON external_effects(state, next_reconcile_at, updated_at, effect_id);

CREATE TABLE effect_outbox (
  effect_id TEXT PRIMARY KEY REFERENCES external_effects(effect_id),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  available_at TEXT NOT NULL CHECK(length(available_at) = 24 AND substr(available_at, 24, 1) = 'Z'),
  locked_by TEXT CHECK(locked_by IS NULL OR length(locked_by) BETWEEN 1 AND 200),
  locked_until TEXT CHECK(locked_until IS NULL OR (length(locked_until) = 24 AND substr(locked_until, 24, 1) = 'Z')),
  fence INTEGER NOT NULL CHECK(fence >= 0),
  revision INTEGER NOT NULL CHECK(revision >= 0),
  CHECK((locked_by IS NULL AND locked_until IS NULL) OR (locked_by IS NOT NULL AND locked_until IS NOT NULL))
) STRICT;

CREATE INDEX effect_outbox_available_idx ON effect_outbox(available_at, effect_id);
CREATE INDEX effect_outbox_lock_idx ON effect_outbox(locked_until, effect_id) WHERE locked_until IS NOT NULL;

CREATE TRIGGER effect_outbox_matches_intent
BEFORE INSERT ON effect_outbox WHEN NOT EXISTS (
  SELECT 1 FROM external_effects e
  WHERE e.effect_id = NEW.effect_id AND e.available_at = NEW.available_at
) BEGIN
  SELECT RAISE(ABORT, 'outbox availability does not match immutable effect intent');
END;

CREATE TABLE effect_send_attempts (
  effect_id TEXT NOT NULL REFERENCES external_effects(effect_id),
  send_number INTEGER NOT NULL CHECK(send_number > 0),
  owner_id TEXT NOT NULL CHECK(length(owner_id) BETWEEN 1 AND 200),
  fence INTEGER NOT NULL CHECK(fence > 0),
  started_at TEXT NOT NULL CHECK(length(started_at) = 24 AND substr(started_at, 24, 1) = 'Z'),
  finished_at TEXT CHECK(finished_at IS NULL OR (length(finished_at) = 24 AND substr(finished_at, 24, 1) = 'Z')),
  outcome TEXT CHECK(outcome IS NULL OR outcome IN ('observed', 'timeout', 'ambiguous', 'rejected')),
  provider_correlation_key TEXT CHECK(provider_correlation_key IS NULL OR length(provider_correlation_key) BETWEEN 1 AND 1000),
  detail_digest TEXT CHECK(
    detail_digest IS NULL OR (length(detail_digest) = 71 AND substr(detail_digest, 1, 7) = 'sha256:' AND detail_digest = lower(detail_digest))
  ),
  PRIMARY KEY(effect_id, send_number),
  CHECK((finished_at IS NULL AND outcome IS NULL) OR (finished_at IS NOT NULL AND outcome IS NOT NULL))
) STRICT;

CREATE TABLE external_resources (
  effect_id TEXT NOT NULL REFERENCES external_effects(effect_id),
  observation_sequence INTEGER NOT NULL CHECK(observation_sequence > 0),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  provider TEXT NOT NULL CHECK(provider IN ('jira', 'github', 'apple', 'website', 'email', 'social', 'analytics', 'crm')),
  resource_type TEXT NOT NULL CHECK(length(resource_type) BETWEEN 3 AND 128),
  resource_key TEXT NOT NULL CHECK(length(resource_key) BETWEEN 1 AND 1000),
  provider_resource_id TEXT NOT NULL CHECK(length(provider_resource_id) BETWEEN 1 AND 1000),
  provider_url TEXT CHECK(provider_url IS NULL OR length(provider_url) <= 4000),
  provider_version TEXT CHECK(provider_version IS NULL OR length(provider_version) BETWEEN 1 AND 500),
  observed_digest TEXT NOT NULL CHECK(
    length(observed_digest) = 71 AND substr(observed_digest, 1, 7) = 'sha256:' AND observed_digest = lower(observed_digest)
  ),
  observed_at TEXT NOT NULL CHECK(length(observed_at) = 24 AND substr(observed_at, 24, 1) = 'Z'),
  observation_invocation_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  PRIMARY KEY(effect_id, observation_sequence),
  UNIQUE(effect_id, observed_at, observed_digest)
) STRICT;

CREATE INDEX external_resources_latest_idx
  ON external_resources(effect_id, observation_sequence DESC);

CREATE TABLE effect_observations (
  invocation_id TEXT PRIMARY KEY CHECK(length(invocation_id) = 36 AND invocation_id = lower(invocation_id)),
  effect_id TEXT NOT NULL REFERENCES external_effects(effect_id),
  observation_sequence INTEGER NOT NULL CHECK(observation_sequence > 0),
  source TEXT NOT NULL CHECK(source IN ('provider-send', 'provider-reconciliation')),
  adapter_id TEXT NOT NULL CHECK(length(adapter_id) BETWEEN 3 AND 128),
  adapter_version TEXT NOT NULL CHECK(length(adapter_version) BETWEEN 1 AND 200),
  evidence_digest TEXT NOT NULL REFERENCES artifacts(digest),
  attestation_digest TEXT NOT NULL CHECK(
    length(attestation_digest) = 71
    AND substr(attestation_digest, 1, 7) = 'sha256:'
    AND attestation_digest = lower(attestation_digest)
  ),
  envelope_digest TEXT NOT NULL CHECK(
    length(envelope_digest) = 71
    AND substr(envelope_digest, 1, 7) = 'sha256:'
    AND envelope_digest = lower(envelope_digest)
  ),
  resource_observed_digest TEXT NOT NULL CHECK(
    length(resource_observed_digest) = 71
    AND substr(resource_observed_digest, 1, 7) = 'sha256:'
    AND resource_observed_digest = lower(resource_observed_digest)
  ),
  observed_at TEXT NOT NULL CHECK(length(observed_at) = 24 AND substr(observed_at, 24, 1) = 'Z'),
  owner_id TEXT NOT NULL CHECK(length(owner_id) BETWEEN 1 AND 200),
  fence INTEGER NOT NULL CHECK(fence > 0),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  UNIQUE(effect_id, observation_sequence),
  UNIQUE(effect_id, observed_at),
  FOREIGN KEY(invocation_id) REFERENCES external_resources(observation_invocation_id)
    DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE INDEX effect_observations_effect_sequence_idx
  ON effect_observations(effect_id, observation_sequence DESC);

CREATE TRIGGER external_resources_match_observation
BEFORE INSERT ON external_resources WHEN NOT EXISTS (
  SELECT 1 FROM effect_observations o
  WHERE o.invocation_id = NEW.observation_invocation_id
    AND o.effect_id = NEW.effect_id
    AND o.observation_sequence = NEW.observation_sequence
    AND o.resource_observed_digest = NEW.observed_digest
    AND o.observed_at = NEW.observed_at
) BEGIN
  SELECT RAISE(ABORT, 'external resource does not match attested observation');
END;

CREATE TABLE effect_rejections (
  effect_id TEXT PRIMARY KEY REFERENCES external_effects(effect_id),
  code TEXT NOT NULL CHECK(length(code) BETWEEN 3 AND 128),
  retryable INTEGER NOT NULL CHECK(retryable IN (0, 1)),
  evidence_digest TEXT NOT NULL REFERENCES artifacts(digest),
  rejected_at TEXT NOT NULL CHECK(length(rejected_at) = 24 AND substr(rejected_at, 24, 1) = 'Z'),
  owner_id TEXT NOT NULL CHECK(length(owner_id) BETWEEN 1 AND 200),
  fence INTEGER NOT NULL CHECK(fence > 0)
) STRICT;

CREATE TABLE effect_transitions (
  effect_id TEXT NOT NULL REFERENCES external_effects(effect_id),
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  from_state TEXT CHECK(from_state IS NULL OR from_state IN ('planned', 'sent', 'observed', 'confirmed', 'unknown', 'manual-intervention', 'rejected')),
  to_state TEXT NOT NULL CHECK(to_state IN ('planned', 'sent', 'observed', 'confirmed', 'unknown', 'manual-intervention', 'rejected')),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at) = 24 AND substr(occurred_at, 24, 1) = 'Z'),
  owner_id TEXT CHECK(owner_id IS NULL OR length(owner_id) BETWEEN 1 AND 200),
  fence INTEGER NOT NULL CHECK(fence >= 0),
  detail_digest TEXT CHECK(
    detail_digest IS NULL OR (length(detail_digest) = 71 AND substr(detail_digest, 1, 7) = 'sha256:' AND detail_digest = lower(detail_digest))
  ),
  PRIMARY KEY(effect_id, sequence),
  CHECK((sequence = 1 AND from_state IS NULL AND to_state = 'planned') OR (sequence > 1 AND from_state IS NOT NULL))
) STRICT;

CREATE TABLE effect_origin_checkpoints (
  checkpoint_id TEXT PRIMARY KEY CHECK(length(checkpoint_id) = 36 AND checkpoint_id = lower(checkpoint_id)),
  event_type TEXT NOT NULL CHECK(event_type = 'external-effect.planned'),
  effect_id TEXT NOT NULL REFERENCES external_effects(effect_id),
  approval_id TEXT NOT NULL REFERENCES approvals(approval_id),
  standing_scope TEXT CHECK(standing_scope IS NULL OR length(standing_scope) BETWEEN 3 AND 128),
  attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id),
  step_id TEXT NOT NULL REFERENCES steps(step_id),
  attempt_revision INTEGER NOT NULL CHECK(attempt_revision >= 0),
  step_revision INTEGER NOT NULL CHECK(step_revision >= 0),
  checkpoint_revision INTEGER NOT NULL CHECK(checkpoint_revision > 0),
  owner_id TEXT NOT NULL CHECK(length(owner_id) BETWEEN 1 AND 200),
  fence INTEGER NOT NULL CHECK(fence > 0),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at) = 24 AND substr(occurred_at, 24, 1) = 'Z'),
  intent_digest TEXT NOT NULL CHECK(
    length(intent_digest) = 71 AND substr(intent_digest, 1, 7) = 'sha256:' AND intent_digest = lower(intent_digest)
  ),
  UNIQUE(step_id, checkpoint_revision)
) STRICT;

CREATE TABLE effect_reconciliation_attempts (
  effect_id TEXT NOT NULL REFERENCES external_effects(effect_id),
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  outcome TEXT NOT NULL CHECK(outcome IN ('not-found', 'ambiguous')),
  owner_id TEXT NOT NULL CHECK(length(owner_id) BETWEEN 1 AND 200),
  fence INTEGER NOT NULL CHECK(fence > 0),
  observed_at TEXT NOT NULL CHECK(length(observed_at) = 24 AND substr(observed_at, 24, 1) = 'Z'),
  next_reconcile_at TEXT NOT NULL CHECK(length(next_reconcile_at) = 24 AND substr(next_reconcile_at, 24, 1) = 'Z'),
  provider_correlation_key TEXT CHECK(provider_correlation_key IS NULL OR length(provider_correlation_key) BETWEEN 1 AND 1000),
  detail_digest TEXT NOT NULL CHECK(
    length(detail_digest) = 71 AND substr(detail_digest, 1, 7) = 'sha256:' AND detail_digest = lower(detail_digest)
  ),
  PRIMARY KEY(effect_id, sequence),
  CHECK(next_reconcile_at > observed_at)
) STRICT;

CREATE TRIGGER approvals_identity_immutable
BEFORE UPDATE OF approval_id, schema_version, action, resource_type, resource_key,
  subject_project_id, subject_task_id, subject_attempt_id, subject_release_id,
  payload_digest, plan_digest, diff_digest, commit_id, build_identity_digest,
  policy_digest, actor_id, issuer_id, authenticated_at, issuance_envelope_digest,
  issuance_attestation_digest, issuance_json, mode, standing_scope_json, issued_at, expires_at
ON approvals BEGIN
  SELECT RAISE(ABORT, 'approval identity and bindings are immutable');
END;
CREATE TRIGGER approvals_terminal_immutable
BEFORE UPDATE ON approvals WHEN OLD.status <> 'active' BEGIN
  SELECT RAISE(ABORT, 'terminal approval state is immutable');
END;
CREATE TRIGGER approvals_legal_terminal_transition
BEFORE UPDATE OF status ON approvals WHEN OLD.status <> 'active' OR NEW.status NOT IN ('consumed', 'revoked', 'expired') BEGIN
  SELECT RAISE(ABORT, 'illegal approval status transition');
END;
CREATE TRIGGER approvals_reject_delete
BEFORE DELETE ON approvals BEGIN
  SELECT RAISE(ABORT, 'approvals are append-only');
END;
CREATE TRIGGER approvals_subject_matches_attempt
BEFORE INSERT ON approvals WHEN NOT EXISTS (
  SELECT 1
  FROM attempts a
  JOIN task_snapshots t ON t.task_id = a.task_id
  WHERE a.attempt_id = NEW.subject_attempt_id
    AND a.task_id = NEW.subject_task_id
    AND t.project_id = NEW.subject_project_id
) BEGIN
  SELECT RAISE(ABORT, 'approval subject does not match attempt task/project');
END;

CREATE TRIGGER external_effects_identity_immutable
BEFORE UPDATE OF effect_id, schema_version, attempt_id, action, operation_marker, provider,
  resource_type, resource_key, subject_project_id, subject_task_id, subject_attempt_id,
  subject_release_id, payload_digest, policy_digest, plan_digest, diff_digest, commit_id,
  build_identity_digest, standing_scope, intent_digest, available_at, approval_id, created_at
ON external_effects BEGIN
  SELECT RAISE(ABORT, 'external effect identity and bindings are immutable');
END;
CREATE TRIGGER external_effects_subject_matches_attempt
BEFORE INSERT ON external_effects WHEN NOT EXISTS (
  SELECT 1
  FROM attempts a
  JOIN task_snapshots t ON t.task_id = a.task_id
  WHERE a.attempt_id = NEW.attempt_id
    AND NEW.subject_attempt_id = a.attempt_id
    AND NEW.subject_task_id = a.task_id
    AND NEW.subject_project_id = t.project_id
) BEGIN
  SELECT RAISE(ABORT, 'effect subject does not match attempt task/project');
END;
CREATE TRIGGER external_effects_legal_state_transition
BEFORE UPDATE OF state ON external_effects WHEN NOT (
  NEW.revision = OLD.revision + 1
  AND NEW.updated_at > OLD.updated_at
  AND (
    (OLD.state = 'planned' AND NEW.state = 'sent' AND NEW.send_count = OLD.send_count + 1)
    OR (OLD.state = 'sent' AND NEW.state IN ('observed', 'unknown', 'rejected') AND NEW.send_count = OLD.send_count)
    OR (OLD.state = 'unknown' AND NEW.state IN ('unknown', 'observed', 'manual-intervention') AND NEW.send_count = OLD.send_count)
    OR (OLD.state = 'observed' AND NEW.state = 'confirmed' AND NEW.send_count = OLD.send_count)
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

CREATE TRIGGER effect_outbox_identity_immutable
BEFORE UPDATE OF effect_id, schema_version, available_at ON effect_outbox BEGIN
  SELECT RAISE(ABORT, 'outbox identity is immutable');
END;
CREATE TRIGGER effect_outbox_monotonic_claim
BEFORE UPDATE ON effect_outbox WHEN NOT (
  NEW.revision = OLD.revision + 1
  AND (
    (NEW.locked_by IS NULL AND NEW.locked_until IS NULL AND NEW.fence = OLD.fence)
    OR (NEW.locked_by IS NOT NULL AND NEW.locked_until IS NOT NULL AND NEW.fence = OLD.fence + 1)
  )
) BEGIN
  SELECT RAISE(ABORT, 'outbox revision or fence is not monotonic');
END;
CREATE TRIGGER effect_outbox_reject_delete
BEFORE DELETE ON effect_outbox BEGIN
  SELECT RAISE(ABORT, 'outbox records are retained');
END;

CREATE TRIGGER effect_send_attempts_identity_immutable
BEFORE UPDATE OF effect_id, send_number, owner_id, fence, started_at ON effect_send_attempts BEGIN
  SELECT RAISE(ABORT, 'send attempt identity is immutable');
END;
CREATE TRIGGER effect_send_attempts_finished_immutable
BEFORE UPDATE ON effect_send_attempts WHEN OLD.finished_at IS NOT NULL BEGIN
  SELECT RAISE(ABORT, 'finished send attempt is immutable');
END;
CREATE TRIGGER effect_send_attempts_reject_delete
BEFORE DELETE ON effect_send_attempts BEGIN
  SELECT RAISE(ABORT, 'send attempts are append-only');
END;

CREATE TRIGGER external_resources_reject_update
BEFORE UPDATE ON external_resources BEGIN
  SELECT RAISE(ABORT, 'external resources are immutable observations');
END;
CREATE TRIGGER external_resources_reject_delete
BEFORE DELETE ON external_resources BEGIN
  SELECT RAISE(ABORT, 'external resources are immutable observations');
END;
CREATE TRIGGER effect_observations_reject_update
BEFORE UPDATE ON effect_observations BEGIN
  SELECT RAISE(ABORT, 'effect observations are immutable');
END;
CREATE TRIGGER effect_observations_reject_delete
BEFORE DELETE ON effect_observations BEGIN
  SELECT RAISE(ABORT, 'effect observations are immutable');
END;
CREATE TRIGGER effect_rejections_reject_update
BEFORE UPDATE ON effect_rejections BEGIN
  SELECT RAISE(ABORT, 'effect rejections are immutable');
END;
CREATE TRIGGER effect_rejections_reject_delete
BEFORE DELETE ON effect_rejections BEGIN
  SELECT RAISE(ABORT, 'effect rejections are immutable');
END;
CREATE TRIGGER effect_origin_checkpoints_reject_update
BEFORE UPDATE ON effect_origin_checkpoints BEGIN
  SELECT RAISE(ABORT, 'effect origin checkpoints are append-only');
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
CREATE TRIGGER effect_origin_checkpoints_reject_delete
BEFORE DELETE ON effect_origin_checkpoints BEGIN
  SELECT RAISE(ABORT, 'effect origin checkpoints are append-only');
END;
CREATE TRIGGER steps_effect_checkpoint_monotonic
BEFORE UPDATE OF effect_checkpoint_revision ON steps
WHEN NEW.effect_checkpoint_revision <> OLD.effect_checkpoint_revision + 1
BEGIN
  SELECT RAISE(ABORT, 'step effect checkpoint revision is not monotonic');
END;
CREATE TRIGGER effect_reconciliation_attempts_reject_update
BEFORE UPDATE ON effect_reconciliation_attempts BEGIN
  SELECT RAISE(ABORT, 'effect reconciliation attempts are append-only');
END;
CREATE TRIGGER effect_reconciliation_attempts_reject_delete
BEFORE DELETE ON effect_reconciliation_attempts BEGIN
  SELECT RAISE(ABORT, 'effect reconciliation attempts are append-only');
END;
CREATE TRIGGER effect_transitions_reject_update
BEFORE UPDATE ON effect_transitions BEGIN
  SELECT RAISE(ABORT, 'effect transitions are append-only');
END;
CREATE TRIGGER effect_transitions_reject_delete
BEFORE DELETE ON effect_transitions BEGIN
  SELECT RAISE(ABORT, 'effect transitions are append-only');
END;
`,
};
