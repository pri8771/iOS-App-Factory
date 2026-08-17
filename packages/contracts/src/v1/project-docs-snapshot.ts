import { z } from "zod";

import {
  AbsolutePathSchema,
  CalendarDateSchema,
  IsoInstantSchema,
  NonNegativeSafeIntegerSchema,
  PositiveSafeIntegerSchema,
  RelativePathSchema,
  SchemaVersionV1Schema,
  Sha256DigestSchema,
} from "./primitives.js";

/**
 * `ProjectDocsSnapshotV1`: the owner-doctrine read model for one enrolled project repository's own
 * documentation. Owner doctrine (`docs/policy/RULES_CORPUS_RECONCILIATION.md` §1, the 2026-07-21
 * studio decision it records): each project repository's own docs are the SOURCE OF TRUTH; Jira and
 * Notion are convenience mirrors synced FROM the repo, never the reverse. This schema is therefore a
 * strictly read-only projection of what a repository's mandated doc set actually says, with
 * per-field provenance and an honest `unavailable` for every doc that is absent or unparseable --
 * never inferred, never defaulted. `@app-factory/project-docs` is the only package that constructs
 * values of this type; it never accepts one as input to a write.
 */

export const MANDATED_PROJECT_DOC_KEYS_V1 = [
  "status",
  "architecture",
  "features",
  "bugs",
  "decisions",
  "risks",
  "assumptions",
  "testPlan",
  "releaseChecklist",
  "handoff",
] as const;
export const MandatedProjectDocKeyV1Schema = z.enum(MANDATED_PROJECT_DOC_KEYS_V1);
export type MandatedProjectDocKeyV1 = z.infer<typeof MandatedProjectDocKeyV1Schema>;

/** Points at the exact bytes a claim was derived from: a repo-relative path, its content digest, and (when the claim came from a specific span) the 1-based inclusive line range. */
export const ProjectDocsSourceRefV1Schema = z
  .strictObject({
    path: RelativePathSchema,
    sha256: Sha256DigestSchema,
    lineRange: z
      .strictObject({ start: PositiveSafeIntegerSchema, end: PositiveSafeIntegerSchema })
      .nullable(),
  })
  .superRefine((ref, context) => {
    if (ref.lineRange !== null && ref.lineRange.end < ref.lineRange.start) {
      context.addIssue({
        code: "custom",
        path: ["lineRange", "end"],
        message: "lineRange.end must not precede lineRange.start",
      });
    }
  });
export type ProjectDocsSourceRefV1 = z.infer<typeof ProjectDocsSourceRefV1Schema>;

/** Which docs-directory name resolved on disk, or `absent` when neither `docs/` nor `Docs/` exists. */
export const ProjectDocsLayoutV1Schema = z.enum(["docs", "Docs", "absent"]);
export type ProjectDocsLayoutV1 = z.infer<typeof ProjectDocsLayoutV1Schema>;

/**
 * Whether one mandated doc exists and, if so, how it was found. `legacySourced` is true when the
 * file resolved through a case-insensitive or root-level fallback rather than the canonical
 * `<docsDir>/<KEY>.md` path (e.g. hindsight's lowercase `docs/PROJECT_DOCUMENTATION.md` inside an
 * otherwise-capital `Docs/` tree). `looksSuperseded` is true when the file's own content declares
 * itself a stub/redirect (a `Status:` line reading `superseded` or `historical_pointer` near the
 * top) -- a real, recurring convention across the six surveyed repositories.
 */
export const ProjectDocsFilePresenceV1Schema = z
  .strictObject({
    key: MandatedProjectDocKeyV1Schema,
    present: z.boolean(),
    source: ProjectDocsSourceRefV1Schema.nullable(),
    legacySourced: z.boolean(),
    looksSuperseded: z.boolean(),
  })
  .superRefine((entry, context) => {
    if (entry.present !== (entry.source !== null)) {
      context.addIssue({
        code: "custom",
        path: ["source"],
        message: "source must be present exactly when present is true",
      });
    }
    if (!entry.present && (entry.legacySourced || entry.looksSuperseded)) {
      context.addIssue({
        code: "custom",
        message: "legacySourced and looksSuperseded require the doc to be present",
      });
    }
  });
export type ProjectDocsFilePresenceV1 = z.infer<typeof ProjectDocsFilePresenceV1Schema>;

/** Shared "honest field" idiom: a value is either a real parsed fact with its provenance, or an explained absence -- mirrors `StudioCountMetricV1Schema` in `studio-snapshot.ts`. */
function docsField<Value extends z.ZodType>(valueSchema: Value) {
  const value: z.ZodType<z.infer<Value> | null> = valueSchema.nullable();
  return z
    .strictObject({
      value,
      unavailableReason: z.string().min(1).max(500).nullable(),
      sources: z.array(ProjectDocsSourceRefV1Schema).max(20),
    })
    .superRefine((field, context) => {
      if ((field.value === null) === (field.unavailableReason === null)) {
        context.addIssue({
          code: "custom",
          message:
            "exactly one of value or unavailableReason must be present: a docs field is either a real parsed value or an honestly-explained absence, never both and never neither",
        });
      }
      if ((field.value !== null) !== field.sources.length > 0) {
        context.addIssue({
          code: "custom",
          path: ["sources"],
          message: "sources must be non-empty exactly when value is present",
        });
      }
    });
}

export const StatusDatedEntryV1Schema = z.strictObject({
  heading: z.string().min(1).max(300),
  date: CalendarDateSchema,
});
export type StatusDatedEntryV1 = z.infer<typeof StatusDatedEntryV1Schema>;

export const ReleaseChecklistItemV1Schema = z.strictObject({
  text: z.string().min(1).max(2_000),
  checked: z.boolean(),
});
export type ReleaseChecklistItemV1 = z.infer<typeof ReleaseChecklistItemV1Schema>;

export const ReleaseChecklistSummaryV1Schema = z
  .strictObject({
    items: z.array(ReleaseChecklistItemV1Schema).max(300),
    totalItems: NonNegativeSafeIntegerSchema,
    checkedItems: NonNegativeSafeIntegerSchema,
  })
  .superRefine((summary, context) => {
    if (summary.totalItems !== summary.items.length) {
      context.addIssue({
        code: "custom",
        path: ["totalItems"],
        message: "totalItems must equal items.length",
      });
    }
    const checked = summary.items.filter((item) => item.checked).length;
    if (summary.checkedItems !== checked) {
      context.addIssue({
        code: "custom",
        path: ["checkedItems"],
        message: "checkedItems must equal the number of checked items",
      });
    }
  });
export type ReleaseChecklistSummaryV1 = z.infer<typeof ReleaseChecklistSummaryV1Schema>;

/** One row of a BUGS.md/RISKS.md table. `looksOpen` is a heuristic over free-text `status` (see `@app-factory/project-docs`'s parser); it is reported, not hidden, so a consumer can re-derive its own judgement from `status` if it disagrees. */
export const DocIssueRowV1Schema = z.strictObject({
  id: z.string().min(1).max(80).nullable(),
  summary: z.string().min(1).max(2_000),
  status: z.string().min(1).max(200).nullable(),
  looksOpen: z.boolean(),
});
export type DocIssueRowV1 = z.infer<typeof DocIssueRowV1Schema>;

export const DocIssueTableSummaryV1Schema = z
  .strictObject({
    rows: z.array(DocIssueRowV1Schema).max(300),
    totalCount: NonNegativeSafeIntegerSchema,
    openCount: NonNegativeSafeIntegerSchema,
  })
  .superRefine((summary, context) => {
    if (summary.totalCount !== summary.rows.length) {
      context.addIssue({
        code: "custom",
        path: ["totalCount"],
        message: "totalCount must equal rows.length",
      });
    }
    const open = summary.rows.filter((row) => row.looksOpen).length;
    if (summary.openCount !== open) {
      context.addIssue({
        code: "custom",
        path: ["openCount"],
        message: "openCount must equal the number of open-looking rows",
      });
    }
  });
export type DocIssueTableSummaryV1 = z.infer<typeof DocIssueTableSummaryV1Schema>;

export const DecisionEntryV1Schema = z.strictObject({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  status: z.string().min(1).max(200).nullable(),
  dateRecorded: CalendarDateSchema.nullable(),
});
export type DecisionEntryV1 = z.infer<typeof DecisionEntryV1Schema>;

export const DecisionsSummaryV1Schema = z
  .strictObject({
    entries: z.array(DecisionEntryV1Schema).max(300),
    count: NonNegativeSafeIntegerSchema,
  })
  .superRefine((summary, context) => {
    if (summary.count !== summary.entries.length) {
      context.addIssue({
        code: "custom",
        path: ["count"],
        message: "count must equal entries.length",
      });
    }
  });
export type DecisionsSummaryV1 = z.infer<typeof DecisionsSummaryV1Schema>;

export const QualityManifestSummaryV1Schema = z.strictObject({
  qualityStandardVersion: z.string().min(1).max(40).nullable(),
  applicationName: z.string().min(1).max(200).nullable(),
  requiredTestSuiteCount: NonNegativeSafeIntegerSchema.nullable(),
});
export type QualityManifestSummaryV1 = z.infer<typeof QualityManifestSummaryV1Schema>;

/** Only the guaranteed-present subset of a completion report is typed here: real reports extend well beyond this (Japa's `REGISTER-JAPA-001.json` has 25 keys against the 12-key example), so this is a floor, not the full schema. */
export const CompletionReportSummaryV1Schema = z.strictObject({
  fileName: z.string().min(1).max(300),
  taskId: z.string().min(1).max(200).nullable(),
  status: z.string().min(1).max(200).nullable(),
  fakeDataUsedInProduction: z.boolean().nullable(),
  humanReviewRequiredCount: NonNegativeSafeIntegerSchema.nullable(),
  placeholdersRemainingCount: NonNegativeSafeIntegerSchema.nullable(),
});
export type CompletionReportSummaryV1 = z.infer<typeof CompletionReportSummaryV1Schema>;

export const CompletionReportsSummaryV1Schema = z
  .strictObject({
    reports: z.array(CompletionReportSummaryV1Schema).max(200),
    count: NonNegativeSafeIntegerSchema,
  })
  .superRefine((summary, context) => {
    if (summary.count !== summary.reports.length) {
      context.addIssue({
        code: "custom",
        path: ["count"],
        message: "count must equal reports.length",
      });
    }
  });
export type CompletionReportsSummaryV1 = z.infer<typeof CompletionReportsSummaryV1Schema>;

function assertOneEntryPerMandatedKey(
  docs: readonly Readonly<{ key: string }>[],
  context: z.RefinementCtx,
): void {
  const keys = docs.map((doc) => doc.key);
  const isExactSet =
    keys.length === MANDATED_PROJECT_DOC_KEYS_V1.length &&
    new Set(keys).size === keys.length &&
    MANDATED_PROJECT_DOC_KEYS_V1.every((key) => keys.includes(key));
  if (!isExactSet) {
    context.addIssue({
      code: "custom",
      path: ["docs"],
      message: "docs must contain exactly one entry per mandated doc key, no more and no fewer",
    });
  }
}

export const ProjectDocsSnapshotDigestInputV1Shape = {
  schemaVersion: SchemaVersionV1Schema,
  repositoryRoot: AbsolutePathSchema,
  generatedAt: IsoInstantSchema,
  layout: ProjectDocsLayoutV1Schema,
  docs: z.array(ProjectDocsFilePresenceV1Schema).max(MANDATED_PROJECT_DOC_KEYS_V1.length),
  lifecycleStatus: docsField(z.string().min(1).max(200)),
  lastVerifiedAt: docsField(CalendarDateSchema),
  statusDatedEntries: docsField(z.array(StatusDatedEntryV1Schema).max(100)),
  releaseChecklist: docsField(ReleaseChecklistSummaryV1Schema),
  openBugs: docsField(DocIssueTableSummaryV1Schema),
  openRisks: docsField(DocIssueTableSummaryV1Schema),
  decisions: docsField(DecisionsSummaryV1Schema),
  qualityManifest: docsField(QualityManifestSummaryV1Schema),
  completionReports: docsField(CompletionReportsSummaryV1Schema),
};

export const ProjectDocsSnapshotDigestInputV1Schema = z
  .strictObject(ProjectDocsSnapshotDigestInputV1Shape)
  .superRefine((snapshot, context) => assertOneEntryPerMandatedKey(snapshot.docs, context));
export type ProjectDocsSnapshotDigestInputV1 = z.infer<
  typeof ProjectDocsSnapshotDigestInputV1Schema
>;

export const ProjectDocsSnapshotV1Schema = z
  .strictObject({
    ...ProjectDocsSnapshotDigestInputV1Shape,
    snapshotDigest: Sha256DigestSchema,
  })
  .superRefine((snapshot, context) => assertOneEntryPerMandatedKey(snapshot.docs, context));
export type ProjectDocsSnapshotV1 = z.infer<typeof ProjectDocsSnapshotV1Schema>;

/** The complete canonical SHA-256 input for `snapshotDigest`: everything except the digest field itself. Mirrors `studioSnapshotDigestInputV1`. */
export function projectDocsSnapshotDigestInputV1(
  snapshot: ProjectDocsSnapshotDigestInputV1 | ProjectDocsSnapshotV1,
): ProjectDocsSnapshotDigestInputV1 {
  return ProjectDocsSnapshotDigestInputV1Schema.parse({
    schemaVersion: snapshot.schemaVersion,
    repositoryRoot: snapshot.repositoryRoot,
    generatedAt: snapshot.generatedAt,
    layout: snapshot.layout,
    docs: snapshot.docs,
    lifecycleStatus: snapshot.lifecycleStatus,
    lastVerifiedAt: snapshot.lastVerifiedAt,
    statusDatedEntries: snapshot.statusDatedEntries,
    releaseChecklist: snapshot.releaseChecklist,
    openBugs: snapshot.openBugs,
    openRisks: snapshot.openRisks,
    decisions: snapshot.decisions,
    qualityManifest: snapshot.qualityManifest,
    completionReports: snapshot.completionReports,
  });
}

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

/** Canonical UTF-8 text to hash for `snapshotDigest`: recursively key-sorted JSON, no digest field. */
export function canonicalProjectDocsSnapshotDigestInputV1(
  snapshot: ProjectDocsSnapshotDigestInputV1 | ProjectDocsSnapshotV1,
): string {
  return JSON.stringify(sortJsonValue(projectDocsSnapshotDigestInputV1(snapshot)));
}
