import type {
  CalendarDate,
  ProjectDocsSourceRefV1,
  StatusDatedEntryV1,
} from "@app-factory/contracts";

import { findFirstIsoDate, parseFlexibleCalendarDate } from "../date.js";
import { available, unavailable, type ParsedDocsField } from "../field-result.js";
import { findHeadings, findSection } from "../markdown.js";
import { sourceRef, type RawDoc } from "../raw-doc.js";

const LIFECYCLE_HEADING_CANDIDATES = ["Lifecycle status"];
const LAST_VERIFIED_PATTERN = /Last verified:\s*(.+?)\.?\s*$/im;
const DATED_ENTRY_MAX = 100;
const BOLD_CODE_SPAN_PATTERN = /\*\*`([^`]+)`\*\*/g;
const CODE_SPAN_PATTERN = /`([^`]+)`/g;
/** A lifecycle-stage-shaped token: lowercase snake_case, nothing that looks like a path or filename
 * (so a cross-reference like `` `iOS_app_factory_rules/governance/PROJECT_LIFECYCLE.md` `` -- Japa's
 * section body opens with exactly that -- never wins). */
const WORD_TOKEN_PATTERN = /^[a-z][a-z0-9_]*$/i;

function firstLifecycleToken(sectionText: string): string | null {
  // Prefer a bold-wrapped code span (Japa: `` **`beta`** `` embedded mid-sentence) over a plain one,
  // since a section can contain other, non-lifecycle code spans (a doc cross-reference) before it.
  for (const match of sectionText.matchAll(BOLD_CODE_SPAN_PATTERN)) {
    const candidate = match[1]?.trim();
    if (candidate !== undefined && WORD_TOKEN_PATTERN.test(candidate)) return candidate;
  }
  for (const match of sectionText.matchAll(CODE_SPAN_PATTERN)) {
    const candidate = match[1]?.trim();
    if (candidate !== undefined && WORD_TOKEN_PATTERN.test(candidate)) return candidate;
  }
  return null;
}

/**
 * The raw lifecycle-status token from STATUS.md's `## Lifecycle status` section (e.g.
 * `verification_pending`, `beta`, `mvp_development`). This is the raw corpus/free-text token;
 * mapping it onto the canonical six-stage `ProjectLifecycleStageV1` vocabulary is
 * `lifecycle-mapping.ts`'s job, not this parser's.
 */
export function parseLifecycleStatus(doc: RawDoc): ParsedDocsField<string> {
  for (const headingText of LIFECYCLE_HEADING_CANDIDATES) {
    const section = findSection(doc.lines, headingText);
    if (section === null) continue;
    const token = firstLifecycleToken(section.bodyLines.join("\n"));
    if (token !== null) return available(token, [sourceRef(doc, section.lineRange)]);
    return unavailable(
      `STATUS.md has a "## ${headingText}" section but no lifecycle-shaped inline-code token in it`,
    );
  }
  return unavailable('STATUS.md has no "## Lifecycle status" section');
}

const LAST_VERIFIED_SCAN_LINES = 10;

/** The `Last verified: <date>` line near the top of STATUS.md, if present (absent in
 * hindsight/Svara/aurafit, which go straight to "## Lifecycle status"). Scans only the first few
 * lines of the file -- not "everything before the first heading", since the line sits between the
 * `# Project Status` H1 and the `## Lifecycle status` H2 in the repositories that have it. */
export function parseLastVerifiedAt(doc: RawDoc): ParsedDocsField<CalendarDate> {
  const preambleLines = doc.lines.slice(0, LAST_VERIFIED_SCAN_LINES);
  for (const [offset, line] of preambleLines.entries()) {
    const match = LAST_VERIFIED_PATTERN.exec(line);
    if (match !== null) {
      const date = parseFlexibleCalendarDate(match[1] ?? "");
      if (date !== null) {
        return available(date, [sourceRef(doc, { start: offset + 1, end: offset + 1 })]);
      }
      return unavailable(`STATUS.md has a "Last verified:" line but it is not a recognizable date`);
    }
  }
  return unavailable('STATUS.md has no "Last verified:" line before its first heading');
}

/** Every `##`+ heading in STATUS.md whose text literally contains an ISO `YYYY-MM-DD` date --
 * covers aurafit's `## Verified on 2026-08-13` and Japa's
 * `## Documentation reconciliation (2026-07-17)` conventions without hard-coding either phrase. */
export function parseStatusDatedEntries(doc: RawDoc): ParsedDocsField<StatusDatedEntryV1[]> {
  const headings = findHeadings(doc.lines).filter((heading) => heading.level >= 2);
  const entries: StatusDatedEntryV1[] = [];
  const sources: ProjectDocsSourceRefV1[] = [];
  for (const heading of headings) {
    const date = findFirstIsoDate(heading.text);
    if (date === null) continue;
    entries.push({ heading: heading.text, date });
    sources.push(sourceRef(doc, { start: heading.lineIndex + 1, end: heading.lineIndex + 1 }));
    if (entries.length >= DATED_ENTRY_MAX) break;
  }
  if (entries.length === 0) {
    return unavailable("STATUS.md has no section heading carrying a literal ISO date");
  }
  return available(entries, sources);
}
