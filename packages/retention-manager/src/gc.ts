import { existsSync } from "node:fs";

import { EvidenceStore } from "@app-factory/evidence-store";
import { FileExecutionCheckpointStore } from "@app-factory/execution-engine";

import { reclaimCheckpointRevisions, selectStaleCheckpointRevisions } from "./checkpoints.js";
import { reclaimEvidenceBlob, selectUnreferencedEvidenceBlobs } from "./evidence-blobs.js";
import { reclaimRunDirectory, selectStaleRunDirectories } from "./run-directories.js";
import { loadTerminalAttemptIndex } from "./terminal-index.js";
import {
  RetentionManagerError,
  parseGcConfiguration,
  type GcApplyOutcomeV1,
  type GcConfigurationV1,
  type GcRunResultV1,
  type GcSelectedItemV1,
} from "./types.js";
import {
  reclaimVerificationDirectory,
  selectStaleVerificationDirectories,
} from "./verification-checkouts.js";

export type RunGarbageCollectionOptions = Readonly<{
  /** Defaults to `false`: list what would be reclaimed without deleting
   *  anything. Only an explicit `true` performs any deletion. */
  apply?: boolean;
  now?: () => Date;
}>;

type SelectedWithReclaimer = Readonly<{
  item: GcSelectedItemV1;
  reclaim: () => Promise<boolean> | boolean;
}>;

function assertRootExists(root: string, label: string): void {
  if (!existsSync(root)) {
    throw new RetentionManagerError(`${label} does not exist: ${root}`);
  }
}

/**
 * Computes (and, only with `{ apply: true }`, reclaims) the reclaimable set
 * across all four retention categories: evidence blobs unreferenced by any
 * manifest, checkpoint revisions beyond the configured keep count for
 * terminal attempts, run directories/spools for terminal attempts past the
 * retention window, and verification checkouts/scratch directories with no
 * live owner. Every category is selected the same way regardless of
 * `apply`, so a dry run and the listing an `--apply` run acts on are
 * computed by the exact same code path — there is no separate, possibly
 * divergent "preview" logic.
 *
 * Every reclaim step re-derives its own safety condition immediately
 * before deleting (see each category module); nothing here trusts a
 * possibly-stale selection alone. A reclaim step that throws (as opposed
 * to returning `false` for "no longer eligible") is treated as a genuine,
 * unexpected failure and propagates out of this function uncaught,
 * aborting the whole run rather than silently completing a partial
 * cleanup. Every deletion primitive this calls is idempotent, so re-running
 * `--apply` after fixing the underlying problem picks up cleanly.
 */
export async function runGarbageCollection(
  configurationInput: unknown,
  options: RunGarbageCollectionOptions = {},
): Promise<GcRunResultV1> {
  const configuration: GcConfigurationV1 = parseGcConfiguration(configurationInput);
  const apply = options.apply ?? false;
  const now = (options.now ?? (() => new Date()))();

  assertRootExists(configuration.databasePath, "Control-plane database");
  const terminalIndex = loadTerminalAttemptIndex(configuration.databasePath);

  const entries: SelectedWithReclaimer[] = [];

  for (const root of configuration.evidenceRoots) {
    assertRootExists(root, "Evidence root");
    const store = new EvidenceStore(root);
    for (const item of selectUnreferencedEvidenceBlobs(store)) {
      entries.push({ item, reclaim: () => reclaimEvidenceBlob(store, item) });
    }
  }

  for (const root of configuration.checkpointRoots) {
    assertRootExists(root, "Checkpoint root");
    const store = new FileExecutionCheckpointStore(root);
    for (const item of selectStaleCheckpointRevisions(
      root,
      store,
      terminalIndex,
      configuration.keepLatestCheckpointRevisions,
    )) {
      entries.push({
        item,
        reclaim: () =>
          reclaimCheckpointRevisions(
            store,
            terminalIndex,
            configuration.keepLatestCheckpointRevisions,
            item,
          ),
      });
    }
  }

  for (const runRoot of configuration.runDirectoryRoots) {
    const found = await selectStaleRunDirectories(
      runRoot,
      terminalIndex,
      configuration.retentionWindowMs,
      now,
    );
    for (const item of found) {
      entries.push({
        item,
        reclaim: () =>
          reclaimRunDirectory(runRoot, terminalIndex, configuration.retentionWindowMs, now, item),
      });
    }
  }

  for (const verificationRoot of configuration.verificationRoots) {
    const found = selectStaleVerificationDirectories(
      verificationRoot.gitRuntimeRoot,
      terminalIndex,
      configuration.retentionWindowMs,
      now,
    );
    for (const item of found) {
      entries.push({
        item,
        reclaim: () =>
          reclaimVerificationDirectory(terminalIndex, configuration.retentionWindowMs, now, item),
      });
    }
  }

  const generatedAt = now.toISOString();
  const selection = {
    schemaVersion: 1 as const,
    generatedAt,
    items: entries.map((entry) => entry.item),
  };

  if (!apply) {
    return { schemaVersion: 1, mode: "dry-run", generatedAt, selection, applied: null };
  }

  const applied: GcApplyOutcomeV1[] = [];
  for (const entry of entries) {
    const reclaimed = await entry.reclaim();
    applied.push({
      item: entry.item,
      reclaimed,
      skippedReason: reclaimed
        ? null
        : "no longer eligible at apply time (already reclaimed, or its safety condition changed)",
    });
  }
  return { schemaVersion: 1, mode: "apply", generatedAt, selection, applied };
}
