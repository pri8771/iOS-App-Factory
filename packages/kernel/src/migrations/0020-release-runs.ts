import type { SqlMigration } from "../migration-types.js";

/**
 * Release Rail Wave 2 (see `docs/plans`, "Release Rail" -- architecture decisions 3, 6, 7). Three
 * pieces:
 *
 * - `release_runs` / `release_run_revisions` -- the durable process record a later wave's daemon
 *   command mutates stage by stage (`release.start` / `promote` / `archive` / `upload` / `submit`),
 *   projecting `ReleaseRunV1` (`packages/contracts/src/v1/release-run.ts`). Mirrors migration 0010's
 *   (`project_plans`) compare-and-set-head-plus-append-only-revision-history pattern exactly, with
 *   one difference: `ReleaseRunV1.revision` is `PositiveSafeIntegerSchema` and starts at 1 (not 0,
 *   like a plan's `revision`), so the "starts at" trigger and the CHECK pairing revision with
 *   `updated_at`/`created_at` are shifted by one accordingly. Unlike `project_plan_revisions`, this
 *   revision table has no `command_json`/`expected_revision` columns: Wave 1 did not define a
 *   `ReleaseRunCommandV1` envelope type (that is later-wave, daemon-side scope -- the release-rail
 *   command runtime), so the repository journals `commandId`/`origin`/`issuedAt` as directly-
 *   validated primitives (already-exported contract schemas) rather than a full parsed command
 *   object. `command_id` stays `UNIQUE` for idempotency exactly as every other revision table here
 *   uses it.
 *
 * - `release_build_numbers` -- the append-only build-number allocation ledger (architecture decision
 *   3: "the build number is allocated by the rail, recorded durably, and never inferred"; risk note
 *   "upload is not naturally idempotent"). One row per allocation, `UNIQUE(bundle_id, build_number)`
 *   so the same number can never be handed out twice for a bundle, plus reject-update/reject-delete
 *   triggers -- an allocation, once made, is a dated fact. `build_number` is stored as `TEXT` (it is
 *   a decimal-string domain value, `ReleaseBuildNumberAllocationV1.buildNumber`, potentially up to 18
 *   digits) rather than `INTEGER`: 18-digit values exceed `Number.MAX_SAFE_INTEGER`, and comparing
 *   them correctly needs `BigInt`, exactly what `packages/contracts`'
 *   `assertBuildNumberAllocationV1` already does. `ReleaseBuildNumberRepository.allocateNext`
 *   (release-run-repositories.ts) reuses that pure function rather than re-deriving numeric-vs-
 *   lexicographic ordering in SQL.
 *
 * - A relaxed `approvals` subject shape (architecture decision 7): `registerApproval`'s only live
 *   writer (`assertSubjectMatchesAttempt`, effect-repositories.ts) currently hard-requires a subject
 *   to carry a non-null `attemptId` + `taskId` + `projectId`, so a release-scoped approval
 *   (`{projectId, releaseId}`, both `taskId`/`attemptId` null -- the shape
 *   `isReleaseScopedApprovalSubjectV1` in `release-run.ts` names) is unrepresentable end to end even
 *   though `ApprovalSubjectV1Schema` already permits it structurally. Two SQL-level gates enforce the
 *   same hard requirement `assertSubjectMatchesAttempt` enforces in TypeScript, and both must relax
 *   together or the second still rejects every release-scoped insert regardless of what the
 *   TypeScript layer decides:
 *     1. `subject_task_id`/`subject_attempt_id` were `NOT NULL`, plus a redundant tri-column `CHECK`
 *        repeating that constraint.
 *     2. `approvals_subject_matches_attempt` (`BEFORE INSERT`) required an `attempts` JOIN
 *        `task_snapshots` row matching `subject_attempt_id`/`subject_task_id`/`subject_project_id`
 *        exactly -- an `EXISTS` that can never be satisfied when those columns are `NULL` (SQL `NULL
 *        = NULL` is never true), so simply dropping the `NOT NULL` constraint alone would still leave
 *        every release-scoped insert rejected here.
 *   Both are relaxed to accept exactly two subject shapes -- (a) the existing attempt-scoped shape,
 *   completely unchanged, requiring `subject_task_id`/`subject_attempt_id` to both be set and to
 *   match a real attempt/task/project, or (b) a release-scoped shape requiring
 *   `subject_task_id`/`subject_attempt_id` to both be `NULL` and `subject_project_id`/
 *   `subject_release_id` to both be set -- never a partial mix of the two. Which *actions* may use
 *   shape (b) is a TypeScript-only decision (`EXTERNAL_ACTION_POLICIES[action].subjectScope`,
 *   effect-repositories.ts): the SQL layer only enforces that whichever shape a row claims, it is
 *   internally coherent.
 *   `external_effects` (and its own `external_effects_subject_matches_attempt` trigger) is
 *   deliberately NOT touched by this migration: effects remain exclusively attempt-scoped in this
 *   wave (every `ExternalEffectV1.subject.attemptId` stays required), only *approvals* gain the
 *   release-scoped shape. SQLite has no `ALTER TABLE` for widening a `CHECK` constraint or dropping
 *   `NOT NULL`, so `approvals` is rebuilt in place (the exact procedure migration 0006's module doc
 *   comment documents for `commands`/`events`): every column, every other constraint, every other
 *   trigger, and both indexes are carried over byte-for-byte; only the two subject-shape gates above
 *   change. `approvals` is a foreign-key parent of `external_effects.approval_id` and
 *   `effect_origin_checkpoints.approval_id`, so this migration -- like 0006 -- disables foreign key
 *   enforcement for its own transaction only (`disableForeignKeysDuringApply`), which the runner
 *   verifies with `PRAGMA foreign_key_check` before commit and restores immediately after.
 *   One more wrinkle 0006's `commands`/`events` rebuild never hit: `effect_origin_checkpoints`
 *   (a *different* table) carries its own trigger, `effect_origin_checkpoint_matches_workflow`,
 *   whose body subqueries `SELECT approval_id FROM approvals`. SQLite's `ALTER TABLE ... RENAME TO`
 *   re-resolves every trigger and view in the whole schema (not just ones on the table being
 *   renamed) as part of the rename, so renaming the rebuilt table back to `approvals` while that
 *   foreign trigger still references the momentarily-dropped `approvals` fails with "no such table:
 *   main.approvals" -- not because that trigger's own table is being touched, but because the rename
 *   step cannot re-resolve a name it cites. It is dropped immediately before the rebuild and
 *   recreated verbatim (byte-identical body -- it does not care whether an approval row is attempt-
 *   or release-scoped) immediately after `approvals` exists again.
 */
export const releaseRunsMigration: SqlMigration = {
  version: 20,
  name: "release-runs",
  disableForeignKeysDuringApply: true,
  sql: String.raw`
DROP TRIGGER effect_origin_checkpoint_matches_workflow;

CREATE TABLE approvals_new (
  approval_id TEXT PRIMARY KEY CHECK(length(approval_id) = 36 AND approval_id = lower(approval_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  action TEXT NOT NULL CHECK(length(action) BETWEEN 3 AND 128),
  resource_type TEXT NOT NULL CHECK(length(resource_type) BETWEEN 3 AND 128),
  resource_key TEXT NOT NULL CHECK(length(resource_key) BETWEEN 1 AND 1000),
  subject_project_id TEXT NOT NULL,
  subject_task_id TEXT REFERENCES task_snapshots(task_id),
  subject_attempt_id TEXT REFERENCES attempts(attempt_id),
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
    subject_project_id IS NOT NULL
    AND (
      (subject_task_id IS NOT NULL AND subject_attempt_id IS NOT NULL)
      OR (subject_task_id IS NULL AND subject_attempt_id IS NULL AND subject_release_id IS NOT NULL)
    )
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

INSERT INTO approvals_new SELECT * FROM approvals;
DROP TABLE approvals;
ALTER TABLE approvals_new RENAME TO approvals;

CREATE INDEX approvals_status_expires_at_idx ON approvals(status, expires_at, approval_id);
CREATE INDEX approvals_subject_attempt_idx ON approvals(subject_attempt_id) WHERE subject_attempt_id IS NOT NULL;

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
BEFORE INSERT ON approvals WHEN NOT (
  (
    NEW.subject_task_id IS NULL AND NEW.subject_attempt_id IS NULL
    AND NEW.subject_project_id IS NOT NULL AND NEW.subject_release_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM attempts a
    JOIN task_snapshots t ON t.task_id = a.task_id
    WHERE a.attempt_id = NEW.subject_attempt_id
      AND a.task_id = NEW.subject_task_id
      AND t.project_id = NEW.subject_project_id
  )
) BEGIN
  SELECT RAISE(ABORT, 'approval subject does not match attempt task/project, or is not release-scoped');
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

CREATE TABLE release_runs (
  release_run_id TEXT PRIMARY KEY CHECK(length(release_run_id) = 36 AND release_run_id = lower(release_run_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  project_id TEXT NOT NULL CHECK(length(project_id) = 36 AND project_id = lower(project_id)),
  repository_id TEXT NOT NULL CHECK(length(repository_id) = 36 AND repository_id = lower(repository_id)),
  release_id TEXT NOT NULL CHECK(length(release_id) = 36 AND release_id = lower(release_id)),
  source_commit TEXT NOT NULL CHECK(length(source_commit) IN (40, 64) AND source_commit = lower(source_commit)),
  branch TEXT NOT NULL CHECK(length(branch) BETWEEN 1 AND 255),
  stage TEXT NOT NULL CHECK(stage IN (
    'candidate', 'certified', 'archived', 'upload-approved', 'uploaded',
    'processing', 'internal-testflight-available', 'device-smoke-passed'
  )),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  created_at TEXT NOT NULL CHECK(length(created_at) = 24 AND substr(created_at, 24, 1) = 'Z'),
  updated_at TEXT NOT NULL CHECK(length(updated_at) = 24 AND substr(updated_at, 24, 1) = 'Z'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  CHECK(updated_at >= created_at),
  CHECK((revision = 1 AND updated_at = created_at) OR (revision > 1 AND updated_at > created_at))
) STRICT;

CREATE INDEX release_runs_updated_at_idx ON release_runs(updated_at, release_run_id);
CREATE INDEX release_runs_project_id_idx ON release_runs(project_id, updated_at);

CREATE TABLE release_run_revisions (
  release_run_id TEXT NOT NULL REFERENCES release_runs(release_run_id),
  revision INTEGER NOT NULL CHECK(revision >= 1),
  command_id TEXT NOT NULL UNIQUE CHECK(length(command_id) = 36 AND command_id = lower(command_id)),
  origin TEXT NOT NULL CHECK(origin IN ('cli', 'mcp', 'dashboard', 'system')),
  issued_at TEXT NOT NULL CHECK(length(issued_at) = 24 AND substr(issued_at, 24, 1) = 'Z'),
  recorded_at TEXT NOT NULL CHECK(length(recorded_at) = 24 AND substr(recorded_at, 24, 1) = 'Z'),
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_type(payload_json) = 'object'),
  PRIMARY KEY(release_run_id, revision)
) STRICT;

CREATE INDEX release_run_revisions_recorded_at_idx ON release_run_revisions(recorded_at, release_run_id);

CREATE TRIGGER release_runs_start_at_revision_one
BEFORE INSERT ON release_runs WHEN NEW.revision <> 1 BEGIN
  SELECT RAISE(ABORT, 'a new release run starts at revision 1');
END;
CREATE TRIGGER release_runs_identity_immutable
BEFORE UPDATE OF release_run_id, schema_version, project_id, repository_id, release_id, source_commit, branch, created_at
ON release_runs BEGIN
  SELECT RAISE(ABORT, 'release run identity is immutable');
END;
CREATE TRIGGER release_runs_revision_monotonic
BEFORE UPDATE ON release_runs WHEN NOT (
  NEW.revision = OLD.revision + 1 AND NEW.updated_at > OLD.updated_at
) BEGIN
  SELECT RAISE(ABORT, 'release run revision or updated_at is not monotonic');
END;
CREATE TRIGGER release_runs_reject_delete
BEFORE DELETE ON release_runs BEGIN
  SELECT RAISE(ABORT, 'release runs are retained');
END;

CREATE TRIGGER release_run_revisions_match_head
BEFORE INSERT ON release_run_revisions WHEN NOT EXISTS (
  SELECT 1 FROM release_runs r
  WHERE r.release_run_id = NEW.release_run_id
    AND r.revision = NEW.revision
    AND r.updated_at = NEW.recorded_at
    AND r.payload_json = NEW.payload_json
) BEGIN
  SELECT RAISE(ABORT, 'release run revision does not match the release run head');
END;
CREATE TRIGGER release_run_revisions_reject_update
BEFORE UPDATE ON release_run_revisions BEGIN
  SELECT RAISE(ABORT, 'release run revisions are append-only');
END;
CREATE TRIGGER release_run_revisions_reject_delete
BEFORE DELETE ON release_run_revisions BEGIN
  SELECT RAISE(ABORT, 'release run revisions are append-only');
END;

CREATE TABLE release_build_numbers (
  allocation_id TEXT PRIMARY KEY CHECK(length(allocation_id) = 36 AND allocation_id = lower(allocation_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  bundle_id TEXT NOT NULL CHECK(length(bundle_id) BETWEEN 3 AND 255),
  build_number TEXT NOT NULL CHECK(
    length(build_number) BETWEEN 1 AND 18
    AND build_number NOT GLOB '*[^0-9]*'
    AND substr(build_number, 1, 1) <> '0'
  ),
  release_run_id TEXT NOT NULL REFERENCES release_runs(release_run_id) CHECK(
    length(release_run_id) = 36 AND release_run_id = lower(release_run_id)
  ),
  allocated_at TEXT NOT NULL CHECK(length(allocated_at) = 24 AND substr(allocated_at, 24, 1) = 'Z'),
  UNIQUE(bundle_id, build_number)
) STRICT;

CREATE INDEX release_build_numbers_bundle_id_idx ON release_build_numbers(bundle_id, allocated_at);

CREATE TRIGGER release_build_numbers_reject_update
BEFORE UPDATE ON release_build_numbers BEGIN
  SELECT RAISE(ABORT, 'release build number allocations are append-only');
END;
CREATE TRIGGER release_build_numbers_reject_delete
BEFORE DELETE ON release_build_numbers BEGIN
  SELECT RAISE(ABORT, 'release build number allocations are append-only');
END;
`,
};
