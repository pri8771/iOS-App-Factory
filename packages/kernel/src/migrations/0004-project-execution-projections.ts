import type { SqlMigration } from "../migration-types.js";

/**
 * Keep the dashboard's local project summary transactionally current instead
 * of rebuilding it by scanning the complete attempt history on every poll.
 */
export const projectExecutionProjectionsMigration: SqlMigration = {
  version: 4,
  name: "project-execution-projections",
  sql: String.raw`
CREATE TABLE project_execution_projections (
  project_id TEXT PRIMARY KEY CHECK(length(project_id) = 36 AND project_id = lower(project_id)),
  schema_version INTEGER NOT NULL CHECK(schema_version = 1),
  attempt_count INTEGER NOT NULL CHECK(attempt_count > 0),
  active_attempt_count INTEGER NOT NULL CHECK(
    active_attempt_count >= 0 AND active_attempt_count <= attempt_count
  ),
  blocker_count INTEGER NOT NULL CHECK(blocker_count >= 0 AND blocker_count <= attempt_count),
  last_activity_at TEXT NOT NULL CHECK(
    length(last_activity_at) = 24 AND substr(last_activity_at, 24, 1) = 'Z'
  ),
  last_successful_attempt_at TEXT CHECK(
    last_successful_attempt_at IS NULL
    OR (
      length(last_successful_attempt_at) = 24
      AND substr(last_successful_attempt_at, 24, 1) = 'Z'
      AND last_successful_attempt_at <= last_activity_at
    )
  )
) STRICT;

INSERT INTO project_execution_projections(
  project_id, schema_version, attempt_count, active_attempt_count,
  blocker_count, last_activity_at, last_successful_attempt_at
)
SELECT
  task.project_id,
  1,
  COUNT(attempt.attempt_id),
  SUM(CASE
    WHEN attempt.state NOT IN ('succeeded', 'failed', 'cancelled') THEN 1
    ELSE 0
  END),
  SUM(CASE WHEN attempt.state = 'blocked' THEN 1 ELSE 0 END),
  MAX(attempt.updated_at),
  MAX(CASE WHEN attempt.state = 'succeeded' THEN attempt.terminal_at ELSE NULL END)
FROM task_snapshots AS task
JOIN attempts AS attempt ON attempt.task_id = task.task_id
GROUP BY task.project_id;

CREATE TRIGGER project_execution_projection_after_attempt_insert
AFTER INSERT ON attempts BEGIN
  INSERT INTO project_execution_projections(
    project_id, schema_version, attempt_count, active_attempt_count,
    blocker_count, last_activity_at, last_successful_attempt_at
  )
  SELECT
    task.project_id,
    1,
    1,
    CASE WHEN NEW.state NOT IN ('succeeded', 'failed', 'cancelled') THEN 1 ELSE 0 END,
    CASE WHEN NEW.state = 'blocked' THEN 1 ELSE 0 END,
    NEW.updated_at,
    CASE WHEN NEW.state = 'succeeded' THEN NEW.terminal_at ELSE NULL END
  FROM task_snapshots AS task
  WHERE task.task_id = NEW.task_id
  ON CONFLICT(project_id) DO UPDATE SET
    attempt_count = project_execution_projections.attempt_count + 1,
    active_attempt_count = project_execution_projections.active_attempt_count
      + excluded.active_attempt_count,
    blocker_count = project_execution_projections.blocker_count + excluded.blocker_count,
    last_activity_at = MAX(
      project_execution_projections.last_activity_at,
      excluded.last_activity_at
    ),
    last_successful_attempt_at = CASE
      WHEN excluded.last_successful_attempt_at IS NULL
        THEN project_execution_projections.last_successful_attempt_at
      WHEN project_execution_projections.last_successful_attempt_at IS NULL
        THEN excluded.last_successful_attempt_at
      ELSE MAX(
        project_execution_projections.last_successful_attempt_at,
        excluded.last_successful_attempt_at
      )
    END;

  SELECT CASE WHEN changes() <> 1
    THEN RAISE(ABORT, 'attempt project projection insert failed')
  END;
END;

CREATE TRIGGER project_execution_projection_after_attempt_update
AFTER UPDATE OF state, updated_at, terminal_at ON attempts BEGIN
  UPDATE project_execution_projections
  SET
    active_attempt_count = active_attempt_count
      + CASE WHEN NEW.state NOT IN ('succeeded', 'failed', 'cancelled') THEN 1 ELSE 0 END
      - CASE WHEN OLD.state NOT IN ('succeeded', 'failed', 'cancelled') THEN 1 ELSE 0 END,
    blocker_count = blocker_count
      + CASE WHEN NEW.state = 'blocked' THEN 1 ELSE 0 END
      - CASE WHEN OLD.state = 'blocked' THEN 1 ELSE 0 END,
    last_activity_at = MAX(last_activity_at, NEW.updated_at),
    last_successful_attempt_at = CASE
      WHEN NEW.state <> 'succeeded' THEN last_successful_attempt_at
      WHEN last_successful_attempt_at IS NULL THEN NEW.terminal_at
      ELSE MAX(last_successful_attempt_at, NEW.terminal_at)
    END
  WHERE project_id = (
    SELECT task.project_id
    FROM task_snapshots AS task
    WHERE task.task_id = NEW.task_id
  );

  SELECT CASE WHEN changes() <> 1
    THEN RAISE(ABORT, 'attempt project projection update failed')
  END;
END;
`,
};
