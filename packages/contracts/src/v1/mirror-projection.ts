import { z } from "zod";

import { ProjectMilestoneStatusV1Schema } from "./milestone.js";
import {
  CalendarDateSchema,
  IsoInstantSchema,
  MilestoneIdSchema,
  NonNegativeSafeIntegerSchema,
  ProjectIdSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "./primitives.js";

/**
 * `MirrorProjectionV1`: the subset of a project's `ProjectDocsSnapshotV1` (plus milestones) that an
 * external Jira/Notion mirror is allowed to receive. Owner doctrine (`RULES_CORPUS_RECONCILIATION.md`
 * §1): the project repository's own docs are the source of truth; Jira and Notion are read-only,
 * one-way projections FROM the repo. This type therefore only ever flows repo -> mirror.
 * `@app-factory/project-docs` builds it (`buildMirrorProjectionV1`) and diffs it
 * (`diffMirrorProjectionV1`) against a caller-supplied previous projection; nothing in this
 * repository accepts a `MirrorProjectionV1` as input to a repo-docs write --
 * `applyMirrorDataToRepoDocs` in `@app-factory/project-docs` proves that fails closed. No live
 * provider calls and no credentials are involved anywhere in this module or its producer: this is
 * the contract the future Jira/Notion push adapters will target, not a working push itself.
 */

export const MirrorProjectionOpenItemV1Schema = z.strictObject({
  id: z.string().min(1).max(80).nullable(),
  summary: z.string().min(1).max(2_000),
  status: z.string().min(1).max(200).nullable(),
});
export type MirrorProjectionOpenItemV1 = z.infer<typeof MirrorProjectionOpenItemV1Schema>;

export const MirrorProjectionMilestoneV1Schema = z.strictObject({
  milestoneId: MilestoneIdSchema,
  label: z.string().min(1).max(200),
  targetDate: CalendarDateSchema.nullable(),
  status: ProjectMilestoneStatusV1Schema,
});
export type MirrorProjectionMilestoneV1 = z.infer<typeof MirrorProjectionMilestoneV1Schema>;

export const MirrorProjectionReleaseChecklistProgressV1Schema = z.strictObject({
  totalItems: NonNegativeSafeIntegerSchema,
  checkedItems: NonNegativeSafeIntegerSchema,
});
export type MirrorProjectionReleaseChecklistProgressV1 = z.infer<
  typeof MirrorProjectionReleaseChecklistProgressV1Schema
>;

const MAX_MIRROR_OPEN_ITEMS_V1 = 50;
const MAX_MIRROR_MILESTONES_V1 = 200;

export const MirrorProjectionDigestInputV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  projectId: ProjectIdSchema,
  generatedAt: IsoInstantSchema,
  sourceSnapshotDigest: Sha256DigestSchema,
  lifecycleStatus: z.string().min(1).max(200).nullable(),
  lastVerifiedAt: CalendarDateSchema.nullable(),
  releaseChecklistProgress: MirrorProjectionReleaseChecklistProgressV1Schema.nullable(),
  openBugs: z.array(MirrorProjectionOpenItemV1Schema).max(MAX_MIRROR_OPEN_ITEMS_V1),
  openRisks: z.array(MirrorProjectionOpenItemV1Schema).max(MAX_MIRROR_OPEN_ITEMS_V1),
  milestones: z.array(MirrorProjectionMilestoneV1Schema).max(MAX_MIRROR_MILESTONES_V1),
};

export const MirrorProjectionDigestInputV1Schema = z.strictObject(
  MirrorProjectionDigestInputV1Shape,
);
export type MirrorProjectionDigestInputV1 = z.infer<typeof MirrorProjectionDigestInputV1Schema>;

export const MirrorProjectionV1Schema = z.strictObject({
  ...MirrorProjectionDigestInputV1Shape,
  projectionDigest: Sha256DigestSchema,
});
export type MirrorProjectionV1 = z.infer<typeof MirrorProjectionV1Schema>;

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJsonValue(child)]),
    );
  }
  return value;
}

export function mirrorProjectionDigestInputV1(
  projection: MirrorProjectionDigestInputV1 | MirrorProjectionV1,
): MirrorProjectionDigestInputV1 {
  return MirrorProjectionDigestInputV1Schema.parse({
    schemaVersion: projection.schemaVersion,
    projectId: projection.projectId,
    generatedAt: projection.generatedAt,
    sourceSnapshotDigest: projection.sourceSnapshotDigest,
    lifecycleStatus: projection.lifecycleStatus,
    lastVerifiedAt: projection.lastVerifiedAt,
    releaseChecklistProgress: projection.releaseChecklistProgress,
    openBugs: projection.openBugs,
    openRisks: projection.openRisks,
    milestones: projection.milestones,
  });
}

/** Canonical UTF-8 text to hash for `projectionDigest`: recursively key-sorted JSON, no digest field. */
export function canonicalMirrorProjectionDigestInputV1(
  projection: MirrorProjectionDigestInputV1 | MirrorProjectionV1,
): string {
  return JSON.stringify(sortJsonValue(mirrorProjectionDigestInputV1(projection)));
}

export const MirrorProjectionFieldChangeKindV1Schema = z.enum(["added", "removed", "changed"]);
export type MirrorProjectionFieldChangeKindV1 = z.infer<
  typeof MirrorProjectionFieldChangeKindV1Schema
>;

/** One field-level difference between two projections. `field` is a stable dotted/keyed path (e.g. `lifecycleStatus`, `openBugs[HIND-B01]`) so a future adapter can turn each change into exactly one provider write. */
export const MirrorProjectionFieldChangeV1Schema = z.strictObject({
  field: z.string().min(1).max(200),
  changeKind: MirrorProjectionFieldChangeKindV1Schema,
  previousValue: z.string().max(2_000).nullable(),
  nextValue: z.string().max(2_000).nullable(),
});
export type MirrorProjectionFieldChangeV1 = z.infer<typeof MirrorProjectionFieldChangeV1Schema>;

/** The result of diffing a fresh `MirrorProjectionV1` against a caller-supplied previous one (or `null` for "no previous projection exists yet"). Pure computation; produces no provider I/O and requires no credentials. */
export const MirrorProjectionDiffV1Schema = z
  .strictObject({
    schemaVersion: SchemaVersionV1Schema,
    projectId: ProjectIdSchema,
    previousProjectionDigest: Sha256DigestSchema.nullable(),
    nextProjectionDigest: Sha256DigestSchema,
    changed: z.boolean(),
    changes: z.array(MirrorProjectionFieldChangeV1Schema).max(500),
  })
  .superRefine((diff, context) => {
    if (diff.changed !== diff.changes.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["changed"],
        message: "changed must be true exactly when changes is non-empty",
      });
    }
  });
export type MirrorProjectionDiffV1 = z.infer<typeof MirrorProjectionDiffV1Schema>;
