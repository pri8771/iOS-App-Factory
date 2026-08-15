import { join } from "node:path";

import { AttemptIdSchema } from "@app-factory/contracts";
import type { FileExecutionCheckpointStore } from "@app-factory/execution-engine";

import type { TerminalAttemptIndex } from "./terminal-index.js";
import type { GcSelectedItemV1 } from "./types.js";

/**
 * One selected item represents one terminal attempt with more than
 * `keepLatestN` checkpoint revisions on disk — not one item per stale
 * revision file — because the underlying primitive
 * (`FileExecutionCheckpointStore.deleteRevisionsBelow`) always prunes a
 * whole attempt's excess history in one call. Non-terminal attempts are
 * never inspected past `terminalIndex.isTerminal`, regardless of how many
 * revisions they have.
 */
export function selectStaleCheckpointRevisions(
  rootPath: string,
  store: FileExecutionCheckpointStore,
  terminalIndex: TerminalAttemptIndex,
  keepLatestN: number,
): readonly GcSelectedItemV1[] {
  const items: GcSelectedItemV1[] = [];
  for (const attemptId of store.listAttemptIds()) {
    if (!terminalIndex.isTerminal(attemptId)) continue;
    const revisions = store.listRevisions(attemptId);
    if (revisions.length <= keepLatestN) continue;
    const keepFromRevisionInclusive = revisions[revisions.length - keepLatestN] as number;
    const staleCount = revisions.filter((revision) => revision < keepFromRevisionInclusive).length;
    if (staleCount === 0) continue;
    items.push({
      category: "checkpoint-revision",
      id: attemptId,
      path: join(rootPath, attemptId),
      attemptId,
      reason:
        `terminal attempt; ${String(staleCount)} checkpoint revision(s) older than the ` +
        `latest ${String(keepLatestN)} (keeping from revision ${String(keepFromRevisionInclusive)})`,
    });
  }
  return items;
}

/**
 * Prunes one attempt's stale checkpoint revisions, re-deriving the keep
 * floor fresh rather than trusting anything computed at selection time.
 * Since attempt terminality only ever moves in one direction, the only way
 * this can find "nothing to do" is if a previous apply (in this run or an
 * earlier one) already pruned it — in which case it returns `false`
 * rather than treating that as an error.
 */
export function reclaimCheckpointRevisions(
  store: FileExecutionCheckpointStore,
  terminalIndex: TerminalAttemptIndex,
  keepLatestN: number,
  item: GcSelectedItemV1,
): boolean {
  const attemptId = AttemptIdSchema.parse(item.attemptId);
  if (!terminalIndex.isTerminal(attemptId)) return false;
  const revisions = store.listRevisions(attemptId);
  if (revisions.length <= keepLatestN) return false;
  const keepFromRevisionInclusive = revisions[revisions.length - keepLatestN] as number;
  return store.deleteRevisionsBelow(attemptId, keepFromRevisionInclusive) > 0;
}
