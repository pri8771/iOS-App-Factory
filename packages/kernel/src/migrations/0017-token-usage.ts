import type { SqlMigration } from "../migration-types.js";

/**
 * The honest token ledger (Architecture decision 6): one append-only row per contribution the
 * daemon actually dispatched to a provider, distinct from `room_budgets`' reservation accounting --
 * a budget debit happens whether or not a provider ever reports real usage, but this ledger only
 * ever records what a provider actually reported, leaving a field NULL (and the row counted toward
 * a summary's `unreportedCount`) rather than inventing a number. See
 * `packages/contracts/src/v1/token-usage.ts` (`TokenUsageRecordV1Schema`) for the wire shape this
 * projects.
 *
 * `room_id` / `phase_run_id` / `signal_id` mirror the wire contract's three-way source discriminant
 * exactly (exactly one set, matching `source`). `grant_id` is SQL-only -- it is not part of
 * `TokenUsageRecordV1` -- an optional denormalized pointer at a `room_grants` row for a `source =
 * 'room'` record, so a future query can join back to the turn that produced it without a
 * per-message token column on `room_messages` (Architecture decision 6 explicitly cuts that).
 */
export const tokenUsageMigration: SqlMigration = {
  version: 17,
  name: "token-usage",
  sql: String.raw`
CREATE TABLE token_usage (
  usage_id TEXT PRIMARY KEY CHECK(length(usage_id) = 36 AND usage_id = lower(usage_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at) = 24 AND substr(occurred_at, 24, 1) = 'Z'),
  provider_family TEXT NOT NULL CHECK(provider_family IN ('codex', 'claude', 'gemini', 'ollama', 'openrouter')),
  provider_key TEXT NOT NULL CHECK(length(provider_key) BETWEEN 1 AND 64 AND provider_key = lower(provider_key)),
  model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
  source TEXT NOT NULL CHECK(source IN ('room', 'phase', 'signal')),
  room_id TEXT CHECK(room_id IS NULL OR (length(room_id) = 36 AND room_id = lower(room_id))),
  grant_id TEXT CHECK(grant_id IS NULL OR (length(grant_id) = 36 AND grant_id = lower(grant_id))),
  phase_run_id TEXT CHECK(phase_run_id IS NULL OR (length(phase_run_id) = 36 AND phase_run_id = lower(phase_run_id))),
  signal_id TEXT CHECK(signal_id IS NULL OR (length(signal_id) = 36 AND signal_id = lower(signal_id))),
  input_tokens INTEGER CHECK(input_tokens IS NULL OR input_tokens >= 0),
  output_tokens INTEGER CHECK(output_tokens IS NULL OR output_tokens >= 0),
  cached_input_tokens INTEGER CHECK(cached_input_tokens IS NULL OR cached_input_tokens >= 0),
  cost_usd_micros INTEGER CHECK(cost_usd_micros IS NULL OR cost_usd_micros >= 0),
  FOREIGN KEY (room_id) REFERENCES rooms(room_id),
  FOREIGN KEY (grant_id) REFERENCES room_grants(grant_id),
  FOREIGN KEY (phase_run_id) REFERENCES phase_runs(phase_run_id),
  FOREIGN KEY (signal_id) REFERENCES signals(signal_id),
  CHECK(
    (source = 'room' AND room_id IS NOT NULL AND phase_run_id IS NULL AND signal_id IS NULL)
    OR (source = 'phase' AND phase_run_id IS NOT NULL AND room_id IS NULL AND signal_id IS NULL)
    OR (source = 'signal' AND signal_id IS NOT NULL AND room_id IS NULL AND phase_run_id IS NULL)
  ),
  CHECK(grant_id IS NULL OR room_id IS NOT NULL)
) STRICT;

CREATE INDEX token_usage_occurred_at_idx ON token_usage(occurred_at, usage_id);
CREATE INDEX token_usage_provider_key_idx ON token_usage(provider_key, occurred_at);

CREATE TRIGGER token_usage_reject_update
BEFORE UPDATE ON token_usage BEGIN
  SELECT RAISE(ABORT, 'a token usage record is a dated fact and is never rewritten');
END;
CREATE TRIGGER token_usage_reject_delete
BEFORE DELETE ON token_usage BEGIN
  SELECT RAISE(ABORT, 'token usage records are retained');
END;
`,
};
