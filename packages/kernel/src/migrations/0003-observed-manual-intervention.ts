import type { SqlMigration } from "../migration-types.js";

/**
 * An independently attested resource can still require operator action during
 * confirmation. Preserve its resource evidence while allowing the effect
 * lifecycle to stop in the terminal manual-intervention state.
 */
export const observedManualInterventionMigration: SqlMigration = {
  version: 3,
  name: "observed-manual-intervention",
  sql: String.raw`
DROP TRIGGER external_effects_legal_state_transition;

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
`,
};
