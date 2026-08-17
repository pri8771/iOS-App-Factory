import { createHash } from "node:crypto";

import {
  AbsolutePathSchema,
  IsoInstantSchema,
  MANDATED_PROJECT_DOC_KEYS_V1,
  ProjectDocsSnapshotV1Schema,
  Sha256DigestSchema,
  canonicalProjectDocsSnapshotDigestInputV1,
  type MandatedProjectDocKeyV1,
  type ProjectDocsFilePresenceV1,
  type ProjectDocsSnapshotV1,
  type ProjectDocsSourceRefV1,
} from "@app-factory/contracts";

import type { ParsedDocsField } from "./field-result.js";
import { looksSupersededV1, resolveDocsDirectoryName, resolveMandatedDoc } from "./layout.js";
import { parseDecisions } from "./parsers/decisions.js";
import { parseIssueTable } from "./parsers/issue-table.js";
import { parseCompletionReports, parseQualityManifest } from "./parsers/quality.js";
import { parseReleaseChecklist } from "./parsers/release-checklist.js";
import {
  parseLastVerifiedAt,
  parseLifecycleStatus,
  parseStatusDatedEntries,
} from "./parsers/status.js";
import { sourceRef } from "./raw-doc.js";

function toWireField<Value>(field: ParsedDocsField<Value>): {
  value: Value | null;
  unavailableReason: string | null;
  sources: ProjectDocsSourceRefV1[];
} {
  return field.available
    ? { value: field.value, unavailableReason: null, sources: [...field.sources] }
    : { value: null, unavailableReason: field.unavailableReason, sources: [] };
}

/**
 * Reads one repository's mandated documentation set into a `ProjectDocsSnapshotV1`. Read-only and
 * fail-closed: a missing repository (no `docs`/`Docs` directory, no mandated files at all) is not an
 * error -- it is a snapshot in which every field is honestly `unavailable`. Nothing here ever
 * infers, defaults, or fabricates a value; the only I/O is reading files that already exist under
 * `repositoryRoot`.
 */
export function readProjectDocsSnapshot(
  repositoryRoot: string,
  generatedAtInput?: string,
): ProjectDocsSnapshotV1 {
  const layout = resolveDocsDirectoryName(repositoryRoot);
  const generatedAt = IsoInstantSchema.parse(generatedAtInput ?? new Date().toISOString());

  const docs: ProjectDocsFilePresenceV1[] = [];
  const resolvedByKey = new Map<MandatedProjectDocKeyV1, ReturnType<typeof resolveMandatedDoc>>();
  for (const key of MANDATED_PROJECT_DOC_KEYS_V1) {
    const resolved = resolveMandatedDoc(repositoryRoot, layout, key);
    resolvedByKey.set(key, resolved);
    docs.push({
      key,
      present: resolved !== null,
      source: resolved === null ? null : sourceRef(resolved.doc),
      legacySourced: resolved?.legacySourced ?? false,
      looksSuperseded: resolved === null ? false : looksSupersededV1(resolved.doc),
    });
  }

  const statusDoc = resolvedByKey.get("status")?.doc ?? null;
  const releaseChecklistDoc = resolvedByKey.get("releaseChecklist")?.doc ?? null;
  const bugsDoc = resolvedByKey.get("bugs")?.doc ?? null;
  const risksDoc = resolvedByKey.get("risks")?.doc ?? null;
  const decisionsDoc = resolvedByKey.get("decisions")?.doc ?? null;

  const lifecycleStatus = toWireField(
    statusDoc === null
      ? { available: false, unavailableReason: "STATUS.md is absent or unreadable" }
      : parseLifecycleStatus(statusDoc),
  );
  const lastVerifiedAt = toWireField(
    statusDoc === null
      ? { available: false, unavailableReason: "STATUS.md is absent or unreadable" }
      : parseLastVerifiedAt(statusDoc),
  );
  const statusDatedEntries = toWireField(
    statusDoc === null
      ? { available: false, unavailableReason: "STATUS.md is absent or unreadable" }
      : parseStatusDatedEntries(statusDoc),
  );
  const releaseChecklist = toWireField(
    releaseChecklistDoc === null
      ? { available: false, unavailableReason: "RELEASE_CHECKLIST.md is absent or unreadable" }
      : parseReleaseChecklist(releaseChecklistDoc),
  );
  const openBugs = toWireField(
    bugsDoc === null
      ? { available: false, unavailableReason: "BUGS.md is absent or unreadable" }
      : parseIssueTable(bugsDoc, "BUGS.md"),
  );
  const openRisks = toWireField(
    risksDoc === null
      ? { available: false, unavailableReason: "RISKS.md is absent or unreadable" }
      : parseIssueTable(risksDoc, "RISKS.md"),
  );
  const decisions = toWireField(
    decisionsDoc === null
      ? { available: false, unavailableReason: "DECISIONS.md is absent or unreadable" }
      : parseDecisions(decisionsDoc),
  );
  const qualityManifest = toWireField(parseQualityManifest(repositoryRoot));
  const completionReports = toWireField(parseCompletionReports(repositoryRoot));

  const digestInput = {
    schemaVersion: 1 as const,
    repositoryRoot: AbsolutePathSchema.parse(repositoryRoot),
    generatedAt,
    layout,
    docs,
    lifecycleStatus,
    lastVerifiedAt,
    statusDatedEntries,
    releaseChecklist,
    openBugs,
    openRisks,
    decisions,
    qualityManifest,
    completionReports,
  };
  const snapshotDigest = Sha256DigestSchema.parse(
    `sha256:${createHash("sha256").update(canonicalProjectDocsSnapshotDigestInputV1(digestInput)).digest("hex")}`,
  );
  return ProjectDocsSnapshotV1Schema.parse({ ...digestInput, snapshotDigest });
}
