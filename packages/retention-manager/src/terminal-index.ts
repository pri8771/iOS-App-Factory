import {
  AttemptIdSchema,
  IsoInstantSchema,
  type AttemptId,
  type IsoInstant,
} from "@app-factory/contracts";
import { openFactoryDatabaseReadOnly } from "@app-factory/kernel";

import { RetentionManagerError } from "./types.js";

/**
 * A point-in-time, read-only snapshot of which attempts are kernel-terminal
 * (`succeeded`, `failed`, or `cancelled`) and when each one became
 * terminal. Attempt terminality is a one-way transition — the state
 * machine's legal-transition table gives terminal states no outgoing
 * edges, and the `attempts` table enforces the same invariant with a SQL
 * CHECK constraint — so a snapshot can only ever be stale in the safe
 * direction: an attempt this snapshot calls non-terminal might have since
 * become terminal, but an attempt it calls terminal can never have gone
 * back to non-terminal. That makes one upfront snapshot sufficient for an
 * entire GC run instead of re-querying per item.
 *
 * An attemptId absent from this index is treated as "not proven terminal"
 * — never as "assumed terminal" and never as "assumed non-terminal". Both
 * an active attempt and an attemptId the database has simply never heard
 * of look the same here, which is the conservative, correct answer for
 * retention: skip it.
 */
export type TerminalAttemptIndex = Readonly<{
  isTerminal(attemptId: AttemptId): boolean;
  terminalAt(attemptId: AttemptId): IsoInstant | null;
}>;

type TerminalAttemptRow = Readonly<{ attempt_id: unknown; terminal_at: unknown }>;

/**
 * Loads the terminal-attempt snapshot from the control-plane database,
 * opened strictly read-only so this can safely run alongside a live
 * daemon. Refuses (throws) rather than guessing if the database cannot be
 * opened, is not the expected schema, or contains a row that does not
 * parse as a canonical attempt id / instant — a malformed control-plane
 * database is exactly the kind of corrupted/unreadable input retention
 * tooling must abort on, not silently work around.
 */
export function loadTerminalAttemptIndex(databasePath: string): TerminalAttemptIndex {
  let database;
  try {
    database = openFactoryDatabaseReadOnly(databasePath);
  } catch (error) {
    throw new RetentionManagerError(
      `Could not open the control-plane database read-only: ${databasePath}`,
      { cause: error },
    );
  }
  try {
    const rows = database
      .prepare("SELECT attempt_id, terminal_at FROM attempts WHERE terminal_at IS NOT NULL")
      .all() as readonly TerminalAttemptRow[];
    const terminalAtByAttemptId = new Map<AttemptId, IsoInstant>();
    for (const row of rows) {
      const attemptId = AttemptIdSchema.safeParse(row.attempt_id);
      const terminalAt = IsoInstantSchema.safeParse(row.terminal_at);
      if (!attemptId.success || !terminalAt.success) {
        throw new RetentionManagerError(
          "The attempts table contains a row that is not a canonical terminal attempt",
        );
      }
      terminalAtByAttemptId.set(attemptId.data, terminalAt.data);
    }
    return {
      isTerminal: (attemptId) => terminalAtByAttemptId.has(attemptId),
      terminalAt: (attemptId) => terminalAtByAttemptId.get(attemptId) ?? null,
    };
  } finally {
    database.close();
  }
}
