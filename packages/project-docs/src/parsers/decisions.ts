import type {
  DecisionEntryV1,
  DecisionsSummaryV1,
  ProjectDocsSourceRefV1,
} from "@app-factory/contracts";

import { parseFlexibleCalendarDate } from "../date.js";
import { available, unavailable, type ParsedDocsField } from "../field-result.js";
import { findHeadings } from "../markdown.js";
import { sourceRef, type RawDoc } from "../raw-doc.js";

const MAX_ENTRIES = 300;
const DEC_HEADING_PATTERN = /^(DEC-[\w.-]+)\s*[—-]\s*(.+)$/;
const STATUS_FIELD_PATTERN = /^\s*-\s*\*\*Status:?\*\*\s*(.+?)\s*$/im;
const DATE_RECORDED_FIELD_PATTERN = /^\s*-\s*\*\*Date Recorded:?\*\*\s*(.+?)\s*$/im;

/** Parses every `## DEC-NNN — Title` block in DECISIONS.md. `**Status:**`/`**Date Recorded:**`
 * bullet fields are read when present; both are optional per-entry (hindsight's DECISIONS.md never
 * carries `Date Recorded`, and fields are not 100% uniform even within one file), so their absence
 * on one decision does not make the whole doc unavailable. */
export function parseDecisions(doc: RawDoc): ParsedDocsField<DecisionsSummaryV1> {
  const headings = findHeadings(doc.lines).filter((heading) => heading.level >= 2);
  const entries: DecisionEntryV1[] = [];
  const sources: ProjectDocsSourceRefV1[] = [];

  for (const [index, heading] of headings.entries()) {
    const match = DEC_HEADING_PATTERN.exec(heading.text);
    if (match === null) continue;
    const id = (match[1] ?? "").trim();
    const title = (match[2] ?? "").trim();
    if (id.length === 0 || title.length === 0) continue;

    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    const endLineIndex = next === undefined ? doc.lines.length : next.lineIndex;
    const body = doc.lines.slice(heading.lineIndex + 1, endLineIndex).join("\n");

    const statusMatch = STATUS_FIELD_PATTERN.exec(body);
    const status = statusMatch?.[1]?.trim() ?? null;
    const dateMatch = DATE_RECORDED_FIELD_PATTERN.exec(body);
    const dateRecorded = dateMatch === null ? null : parseFlexibleCalendarDate(dateMatch[1] ?? "");

    entries.push({ id, title, status, dateRecorded });
    sources.push(
      sourceRef(doc, {
        start: heading.lineIndex + 1,
        end: Math.max(endLineIndex, heading.lineIndex + 1),
      }),
    );
    if (entries.length >= MAX_ENTRIES) break;
  }

  if (entries.length === 0) {
    return unavailable('DECISIONS.md has no "## DEC-<id> — <title>" entries');
  }
  return available({ entries, count: entries.length }, sources);
}
