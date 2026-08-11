import type { SqlMigration } from "../migration-types.js";

/**
 * Supports bounded, descending keyset reads for the local command center. The
 * partial index keeps the common active-work query independent of history size.
 */
export const attemptListIndexesMigration: SqlMigration = {
  version: 5,
  name: "attempt-list-indexes",
  sql: String.raw`
CREATE INDEX attempts_updated_at_attempt_id_idx
  ON attempts(updated_at DESC, attempt_id DESC);

CREATE INDEX attempts_active_updated_at_attempt_id_idx
  ON attempts(updated_at DESC, attempt_id DESC)
  WHERE state NOT IN ('succeeded', 'failed', 'cancelled');

CREATE INDEX task_snapshots_project_task_idx
  ON task_snapshots(project_id, task_id);
`,
};
