import { createHash } from "node:crypto";

import {
  IsoInstantSchema,
  MirrorProjectionV1Schema,
  ProjectIdSchema,
  Sha256DigestSchema,
  canonicalMirrorProjectionDigestInputV1,
  type MirrorProjectionDiffV1,
  type MirrorProjectionFieldChangeV1,
  type MirrorProjectionMilestoneV1,
  type MirrorProjectionV1,
  type ProjectDocsSnapshotV1,
  type ProjectId,
} from "@app-factory/contracts";

/**
 * Mirror direction (contract only): builds and diffs the one-way projection a future Jira/Notion
 * push adapter would send. Owner doctrine -- repo docs are the source of truth, Jira/Notion are
 * read-only mirrors synced FROM the repo -- is enforced here in code, not just prose:
 * `applyMirrorDataToRepoDocs` below is the only function in this module that accepts a
 * `MirrorProjectionV1` as an argument shaped like a write, and it always refuses. Nothing in this
 * module makes a network call, reads a credential, or writes anything; it is pure computation over
 * already-in-memory data.
 */

const MAX_MIRROR_OPEN_ITEMS_V1 = 50;

function toMirrorOpenItems(
  table: ProjectDocsSnapshotV1["openBugs"]["value"],
): Array<{ id: string | null; summary: string; status: string | null }> {
  if (table === null) return [];
  return table.rows
    .filter((row) => row.looksOpen)
    .slice(0, MAX_MIRROR_OPEN_ITEMS_V1)
    .map((row) => ({ id: row.id, summary: row.summary, status: row.status }));
}

/**
 * Projects a `ProjectDocsSnapshotV1` (plus, once `studio/milestones-and-phase`-derived milestones
 * are available to a caller, an optional milestone list) onto the bounded `MirrorProjectionV1` shape
 * an external mirror is allowed to see. Pure and synchronous: it touches no filesystem, network, or
 * credential of its own -- `docsSnapshot` must already be in memory (typically the result of
 * `readProjectDocsSnapshot`).
 */
export function buildMirrorProjectionV1(
  projectId: ProjectId,
  docsSnapshot: ProjectDocsSnapshotV1,
  milestones: readonly MirrorProjectionMilestoneV1[] = [],
  generatedAtInput?: string,
): MirrorProjectionV1 {
  const generatedAt = IsoInstantSchema.parse(generatedAtInput ?? docsSnapshot.generatedAt);
  const releaseChecklistProgress =
    docsSnapshot.releaseChecklist.value === null
      ? null
      : {
          totalItems: docsSnapshot.releaseChecklist.value.totalItems,
          checkedItems: docsSnapshot.releaseChecklist.value.checkedItems,
        };
  const digestInput = {
    schemaVersion: 1 as const,
    projectId: ProjectIdSchema.parse(projectId),
    generatedAt,
    sourceSnapshotDigest: docsSnapshot.snapshotDigest,
    lifecycleStatus: docsSnapshot.lifecycleStatus.value,
    lastVerifiedAt: docsSnapshot.lastVerifiedAt.value,
    releaseChecklistProgress,
    openBugs: toMirrorOpenItems(docsSnapshot.openBugs.value),
    openRisks: toMirrorOpenItems(docsSnapshot.openRisks.value),
    milestones: [...milestones],
  };
  const projectionDigest = Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonicalMirrorProjectionDigestInputV1(digestInput)).digest("hex")}`,
  );
  return MirrorProjectionV1Schema.parse({ ...digestInput, projectionDigest });
}

function stringify(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function diffScalar(
  field: string,
  previous: unknown,
  next: unknown,
  changes: MirrorProjectionFieldChangeV1[],
): void {
  const previousText = stringify(previous);
  const nextText = stringify(next);
  if (previousText === nextText) return;
  changes.push({
    field,
    changeKind: previousText === null ? "added" : nextText === null ? "removed" : "changed",
    previousValue: previousText,
    nextValue: nextText,
  });
}

function keyOf(item: Readonly<{ id: string | null; summary: string }>): string {
  return item.id ?? item.summary;
}

function diffOpenItemList(
  field: string,
  previous: readonly Readonly<{ id: string | null; summary: string; status: string | null }>[],
  next: readonly Readonly<{ id: string | null; summary: string; status: string | null }>[],
  changes: MirrorProjectionFieldChangeV1[],
): void {
  const previousByKey = new Map(previous.map((item) => [keyOf(item), item]));
  const nextByKey = new Map(next.map((item) => [keyOf(item), item]));
  for (const [key, item] of nextByKey) {
    if (!previousByKey.has(key)) {
      changes.push({
        field: `${field}[${key}]`,
        changeKind: "added",
        previousValue: null,
        nextValue: stringify(item),
      });
    }
  }
  for (const [key, item] of previousByKey) {
    if (!nextByKey.has(key)) {
      changes.push({
        field: `${field}[${key}]`,
        changeKind: "removed",
        previousValue: stringify(item),
        nextValue: null,
      });
    }
  }
  for (const [key, nextItem] of nextByKey) {
    const previousItem = previousByKey.get(key);
    if (previousItem === undefined) continue;
    if (previousItem.status !== nextItem.status || previousItem.summary !== nextItem.summary) {
      changes.push({
        field: `${field}[${key}]`,
        changeKind: "changed",
        previousValue: stringify(previousItem),
        nextValue: stringify(nextItem),
      });
    }
  }
}

function diffMilestoneList(
  previous: readonly MirrorProjectionMilestoneV1[],
  next: readonly MirrorProjectionMilestoneV1[],
  changes: MirrorProjectionFieldChangeV1[],
): void {
  const previousById = new Map(previous.map((milestone) => [milestone.milestoneId, milestone]));
  const nextById = new Map(next.map((milestone) => [milestone.milestoneId, milestone]));
  for (const [id, milestone] of nextById) {
    const previousMilestone = previousById.get(id);
    if (previousMilestone === undefined) {
      changes.push({
        field: `milestones[${id}]`,
        changeKind: "added",
        previousValue: null,
        nextValue: stringify(milestone),
      });
    } else if (
      previousMilestone.status !== milestone.status ||
      previousMilestone.targetDate !== milestone.targetDate ||
      previousMilestone.label !== milestone.label
    ) {
      changes.push({
        field: `milestones[${id}]`,
        changeKind: "changed",
        previousValue: stringify(previousMilestone),
        nextValue: stringify(milestone),
      });
    }
  }
  for (const [id, milestone] of previousById) {
    if (!nextById.has(id)) {
      changes.push({
        field: `milestones[${id}]`,
        changeKind: "removed",
        previousValue: stringify(milestone),
        nextValue: null,
      });
    }
  }
}

/**
 * Diffs a freshly built `MirrorProjectionV1` against a caller-supplied previous one (or `null` for
 * "no previous projection has ever been pushed"), so the future Jira/Notion adapter can push only
 * the deltas. This daemon does not persist "the last projection" anywhere itself -- the caller (the
 * adapter, or whatever calls `mirror.plan`) owns that state, consistent with "mirror direction,
 * contract only, no live calls, no credentials": this function never reaches outside its two
 * arguments.
 */
export function diffMirrorProjectionV1(
  previous: MirrorProjectionV1 | null,
  next: MirrorProjectionV1,
): MirrorProjectionDiffV1 {
  if (previous !== null && previous.projectId !== next.projectId) {
    throw new RangeError("Cannot diff mirror projections for two different projects");
  }
  const changes: MirrorProjectionFieldChangeV1[] = [];
  if (previous === null) {
    diffScalar("lifecycleStatus", null, next.lifecycleStatus, changes);
    diffScalar("lastVerifiedAt", null, next.lastVerifiedAt, changes);
    diffScalar("releaseChecklistProgress", null, next.releaseChecklistProgress, changes);
    diffOpenItemList("openBugs", [], next.openBugs, changes);
    diffOpenItemList("openRisks", [], next.openRisks, changes);
    diffMilestoneList([], next.milestones, changes);
  } else {
    diffScalar("lifecycleStatus", previous.lifecycleStatus, next.lifecycleStatus, changes);
    diffScalar("lastVerifiedAt", previous.lastVerifiedAt, next.lastVerifiedAt, changes);
    diffScalar(
      "releaseChecklistProgress",
      previous.releaseChecklistProgress,
      next.releaseChecklistProgress,
      changes,
    );
    diffOpenItemList("openBugs", previous.openBugs, next.openBugs, changes);
    diffOpenItemList("openRisks", previous.openRisks, next.openRisks, changes);
    diffMilestoneList(previous.milestones, next.milestones, changes);
  }
  return {
    schemaVersion: 1,
    projectId: next.projectId,
    previousProjectionDigest: previous?.projectionDigest ?? null,
    nextProjectionDigest: next.projectionDigest,
    changed: changes.length > 0,
    changes,
  };
}

export const MIRROR_REVERSE_SYNC_REFUSED_CODE_V1 = "mirror.reverse-sync-refused" as const;

export class MirrorReverseSyncRefusedError extends Error {
  public readonly code = MIRROR_REVERSE_SYNC_REFUSED_CODE_V1;

  public constructor(message: string) {
    super(message);
    this.name = "MirrorReverseSyncRefusedError";
  }
}

/**
 * The typed, fail-closed proof of the owner doctrine's other half: repo docs are never written FROM
 * mirror data. Any caller that tries to feed a `MirrorProjectionV1` (or anything shaped like one)
 * back into a repo-docs write gets refused here, unconditionally, before any argument is even
 * inspected. There is no configuration, flag, or override that makes this function succeed --
 * exactly one thing must change for a repository's docs to be written from Jira/Notion data: this
 * repository's doctrine, in a task explicitly scoped to change it.
 */
export function applyMirrorDataToRepoDocs(input: unknown): never {
  // `input` is deliberately not otherwise inspected -- the refusal does not depend on its shape --
  // but its runtime type is echoed into the error for anyone debugging a caller that reached here.
  throw new MirrorReverseSyncRefusedError(
    `Repository docs are the source of truth; Jira and Notion are read-only mirrors synced FROM ` +
      `the repo, never the reverse (owner doctrine; docs/policy/RULES_CORPUS_RECONCILIATION.md §1, ` +
      `'GitHub is the source of truth; Notion/Jira are read-only mirrors'). This operation is not ` +
      `supported and never will be by a configuration change alone (rejected input type: ${
        input === null ? "null" : typeof input
      }).`,
  );
}
