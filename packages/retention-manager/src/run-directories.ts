import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";

import { AttemptIdSchema } from "@app-factory/contracts";
import {
  OciRunnerBusyError,
  openPreparedOciRun,
  parseOciRunReceipt,
  readOciLifecycleDisposition,
  type PreparedOciRun,
} from "@app-factory/oci-runner";
import { inspectSupervisedRun, openPreparedSupervisedRun } from "@app-factory/process-supervisor";

import type { TerminalAttemptIndex } from "./terminal-index.js";
import {
  RetentionManagerError,
  type GcRunDirectoryRootV1,
  type GcSelectedItemV1,
} from "./types.js";

/**
 * OS-generated metadata entries (from Finder, Spotlight, or volume
 * bookkeeping) that a fail-closed directory scan must tolerate rather than
 * reject. Kept narrow and exact, matching the same denylist used
 * everywhere else in this repository's stores.
 */
const IGNORABLE_OS_METADATA_ENTRIES = new Set([
  ".DS_Store",
  ".Spotlight-V100",
  ".Trashes",
  ".fseventsd",
]);

function isIgnorableOsMetadataEntry(name: string): boolean {
  return IGNORABLE_OS_METADATA_ENTRIES.has(name) || name.startsWith("._");
}

const OCI_RUN_KEY_PATTERN =
  /^oci-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function readOciReceiptRemovedAt(prepared: PreparedOciRun): string {
  if (!existsSync(prepared.paths.receiptPath)) {
    throw new RetentionManagerError(
      `OCI run ${prepared.intent.runKey} was reported removed but has no receipt`,
    );
  }
  try {
    const receipt = parseOciRunReceipt(
      JSON.parse(readFileSync(prepared.paths.receiptPath, "utf8")),
    );
    return receipt.removedAt;
  } catch (error) {
    throw new RetentionManagerError(`OCI run ${prepared.intent.runKey} has an unreadable receipt`, {
      cause: error,
    });
  }
}

/**
 * A run directory's own on-disk lifecycle is only ever "safe to delete" for
 * two of the four disposition phases the daemon itself recognizes:
 * `removed` (ran and was fully torn down) and `cancelled-before-start`
 * (never started; removal evidence is complete). `quarantined` and
 * `quarantine-removed` are the daemon's own "deny readiness, keep for
 * operator review" bucket (see `oci-local-agent.ts`'s startup-recovery
 * predicate) and `incomplete` covers a container that may still be live —
 * neither is ever selected here, independent of attempt terminality.
 */
async function selectOciRunDirectory(
  root: string,
  runKey: string,
  terminalIndex: TerminalAttemptIndex,
  retentionWindowMs: number,
  now: Date,
): Promise<GcSelectedItemV1 | null> {
  const prepared = openPreparedOciRun(root, runKey);
  if (prepared === null) {
    throw new RetentionManagerError(`OCI run directory ${runKey} has no durable intent`);
  }
  let disposition;
  try {
    disposition = await readOciLifecycleDisposition(prepared);
  } catch (error) {
    if (error instanceof OciRunnerBusyError) return null;
    throw error;
  }
  // Positive equality checks (rather than a compound `!==` guard) so
  // TypeScript narrows `disposition` to exactly one variant per branch;
  // `disposition.phase` is a 3-way literal union inside the
  // removed/quarantined/quarantine-removed member, which a `!==` guard
  // does not fully collapse.
  let completedAt: string;
  if (disposition.phase === "removed") {
    completedAt = readOciReceiptRemovedAt(prepared);
  } else if (disposition.phase === "cancelled-before-start") {
    completedAt = disposition.cancellation.cancelledAt;
  } else {
    return null;
  }
  const attemptId = AttemptIdSchema.parse(prepared.intent.attemptId);
  if (!terminalIndex.isTerminal(attemptId)) return null;
  if (now.getTime() - Date.parse(completedAt) < retentionWindowMs) return null;
  return {
    category: "run-directory",
    id: `oci:${runKey}`,
    path: prepared.paths.runDirectory,
    attemptId,
    reason: `terminal attempt; OCI run ${disposition.phase}, completed ${completedAt}`,
  };
}

/**
 * A supervised-run spool is only "terminal" once `receipt.json` exists
 * (see `inspectSupervisedRun`); `live`, `prepared`,
 * `launch-pending-or-ambiguous`, and `blocked` all mean either a process
 * may still be running or the spool's identity could not be fully proven,
 * and are never selected regardless of attempt terminality.
 */
function selectSupervisedRunDirectory(
  root: string,
  runKey: string,
  terminalIndex: TerminalAttemptIndex,
  retentionWindowMs: number,
  now: Date,
): GcSelectedItemV1 | null {
  const prepared = openPreparedSupervisedRun(root, runKey);
  if (prepared === null) {
    throw new RetentionManagerError(`Supervised run directory ${runKey} has no durable intent`);
  }
  const inspection = inspectSupervisedRun(prepared);
  if (inspection.state !== "terminal") return null;
  const attemptId = AttemptIdSchema.parse(prepared.intent.attemptId);
  if (!terminalIndex.isTerminal(attemptId)) return null;
  const completedAt = inspection.receipt.finishedAt;
  if (now.getTime() - Date.parse(completedAt) < retentionWindowMs) return null;
  return {
    category: "run-directory",
    id: `supervised:${runKey}`,
    path: prepared.paths.runDirectory,
    attemptId,
    reason: `terminal attempt; supervised run terminal, completed ${completedAt}`,
  };
}

function listRunKeyCandidates(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => !isIgnorableOsMetadataEntry(entry.name))
    .map((entry) => {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new RetentionManagerError(`Unexpected entry under run directory root: ${entry.name}`);
      }
      return entry.name;
    })
    .sort();
}

export async function selectStaleRunDirectories(
  configuredRoot: GcRunDirectoryRootV1,
  terminalIndex: TerminalAttemptIndex,
  retentionWindowMs: number,
  now: Date,
): Promise<readonly GcSelectedItemV1[]> {
  const items: GcSelectedItemV1[] = [];
  for (const runKey of listRunKeyCandidates(configuredRoot.path)) {
    if (configuredRoot.kind === "oci") {
      if (!OCI_RUN_KEY_PATTERN.test(runKey)) {
        throw new RetentionManagerError(`Unexpected OCI run directory name: ${runKey}`);
      }
      const item = await selectOciRunDirectory(
        configuredRoot.path,
        runKey,
        terminalIndex,
        retentionWindowMs,
        now,
      );
      if (item !== null) items.push(item);
    } else {
      const item = selectSupervisedRunDirectory(
        configuredRoot.path,
        runKey,
        terminalIndex,
        retentionWindowMs,
        now,
      );
      if (item !== null) items.push(item);
    }
  }
  return items;
}

/**
 * Re-derives the selected item's safety condition fresh instead of
 * trusting the earlier selection, then removes the run directory. A run
 * directory's disposition/inspection state cannot revert once it reaches
 * `removed`/`cancelled-before-start`/`terminal` — those are immutable,
 * once-written evidence closures, not live status — so this re-check
 * exists mainly to make `OciRunnerBusyError` (concurrent daemon activity)
 * a "skip this item" outcome instead of racing a live operation, and to
 * keep this function idempotent if the directory is already gone.
 */
export async function reclaimRunDirectory(
  configuredRoot: GcRunDirectoryRootV1,
  terminalIndex: TerminalAttemptIndex,
  retentionWindowMs: number,
  now: Date,
  item: GcSelectedItemV1,
): Promise<boolean> {
  if (!existsSync(item.path)) return false;
  const runKey = item.id.slice(item.id.indexOf(":") + 1);
  const fresh =
    configuredRoot.kind === "oci"
      ? await selectOciRunDirectory(
          configuredRoot.path,
          runKey,
          terminalIndex,
          retentionWindowMs,
          now,
        )
      : selectSupervisedRunDirectory(
          configuredRoot.path,
          runKey,
          terminalIndex,
          retentionWindowMs,
          now,
        );
  if (fresh === null) return false;
  rmSync(item.path, { recursive: true, force: true });
  return true;
}
