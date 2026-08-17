import {
  AttemptStateChangedEventV1Schema,
  EventIdSchema,
  IsoInstantSchema,
  ProjectIdSchema,
  type AttemptId,
  type EventId,
  type EvidenceV1,
} from "@app-factory/contracts";
import type { EvidenceStore } from "@app-factory/evidence-store";
import { TaskSnapshotRepository } from "@app-factory/kernel";
import type {
  FactoryAttemptTransition,
  FactoryEventSourcePort,
  FactoryLedgerMark,
  FactoryLedgerScan,
} from "@app-factory/studio-rooms";
import type Database from "better-sqlite3";

type LedgerRow = Readonly<{
  position: number;
  event_id: string;
  type: string;
  attempt_id: string;
  occurred_at: string;
  payload_json: string;
  task_id: string;
  project_id: string;
}>;

type MarkRow = Readonly<{ position: number; event_id: string; occurred_at: string }>;

export type KernelFactoryEventSourceOptions = Readonly<{
  database: Database.Database;
  /**
   * When present, a succeeded attempt's broker commit sha is read from its
   * committed evidence manifest (`kind: "commit"` item, `claims.commit`).
   * Absent or unreadable evidence simply yields no commit in the room line;
   * the bridge never blocks on it and never guesses one.
   */
  evidenceStore?: EvidenceStore;
}>;

/**
 * The real `FactoryEventSourcePort`: a read-only cursor scan over the
 * kernel's own append-only `events` ledger (rowid order -- the table is
 * never deleted from and has a single writer, the daemon's one SQLite
 * connection), joined to `attempts` and `task_snapshots` for the routing
 * key (`project_id`) and the human-facing task title. Only
 * `attempt.state-changed` rows become transitions; every scanned row still
 * advances the bridge's cursor via `scannedThrough`.
 */
export function createKernelFactoryEventSource(
  options: KernelFactoryEventSourceOptions,
): FactoryEventSourcePort {
  const database = options.database;
  const taskSnapshots = new TaskSnapshotRepository(database);
  const headStatement = database.prepare(
    `SELECT rowid AS position, event_id, occurred_at FROM events
     ORDER BY rowid DESC LIMIT 1`,
  );
  const positionStatement = database.prepare(
    "SELECT rowid AS position FROM events WHERE event_id = ?",
  );
  const scanStatement = database.prepare(
    `SELECT e.rowid AS position, e.event_id, e.type, e.attempt_id, e.occurred_at, e.payload_json,
            a.task_id, t.project_id
     FROM events e
     JOIN attempts a ON a.attempt_id = e.attempt_id
     JOIN task_snapshots t ON t.task_id = a.task_id
     WHERE e.rowid > ?
     ORDER BY e.rowid ASC
     LIMIT ?`,
  );
  const titles = new Map<string, string>();
  const titleOf = (taskId: string): string => {
    const cached = titles.get(taskId);
    if (cached !== undefined) return cached;
    const spec = taskSnapshots.findById(taskId);
    if (spec === null) throw new Error(`Task snapshot ${taskId} is missing from the kernel`);
    titles.set(taskId, spec.title);
    return spec.title;
  };
  const brokerCommitOf = (attemptId: AttemptId): string | null => {
    const store = options.evidenceStore;
    if (store === undefined) return null;
    try {
      if (store.findManifestRecord(attemptId) === null) return null;
      const commit = store
        .verify(attemptId)
        .evidence.find(
          (item): item is Extract<EvidenceV1, { kind: "commit" }> => item.kind === "commit",
        );
      return commit?.claims.commit ?? null;
    } catch {
      // Evidence that cannot be read is not evidence; the room line simply omits the commit.
      return null;
    }
  };
  const mark = (row: MarkRow): FactoryLedgerMark => ({
    ledgerPosition: row.position,
    eventId: EventIdSchema.parse(row.event_id),
    occurredAt: IsoInstantSchema.parse(row.occurred_at),
  });
  return {
    head(): FactoryLedgerMark | null {
      const row = headStatement.get() as MarkRow | undefined;
      return row === undefined ? null : mark(row);
    },
    positionOf(eventId: EventId): number | null {
      const row = positionStatement.get(eventId) as Readonly<{ position: number }> | undefined;
      return row?.position ?? null;
    },
    scan(afterPosition: number, limit: number): FactoryLedgerScan {
      const rows = scanStatement.all(afterPosition, limit) as readonly LedgerRow[];
      const transitions: FactoryAttemptTransition[] = [];
      for (const row of rows) {
        if (row.type !== "attempt.state-changed") continue;
        const event = AttemptStateChangedEventV1Schema.parse(JSON.parse(row.payload_json));
        transitions.push({
          ledgerPosition: row.position,
          eventId: event.eventId,
          occurredAt: event.occurredAt,
          attemptId: event.attemptId,
          projectId: ProjectIdSchema.parse(row.project_id),
          taskTitle: titleOf(row.task_id),
          from: event.data.from,
          to: event.data.to,
          outcome: event.data.outcome,
          blocker: event.data.blocker,
          brokerCommit: event.data.to === "succeeded" ? brokerCommitOf(event.attemptId) : null,
        });
      }
      const tail = rows.at(-1);
      return {
        scannedThrough: tail === undefined ? null : mark(tail),
        transitions,
      };
    },
  };
}
