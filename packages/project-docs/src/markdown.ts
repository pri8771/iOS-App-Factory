/** Generic, dependency-free helpers over the GFM-flavored markdown the six surveyed repositories'
 * mandated docs actually use: ATX headings (`#`...`######`), GFM checkbox list items, and GFM pipe
 * tables. No markdown library is pulled in -- the mandated docs use a narrow, consistent enough
 * subset that a few regexes cover every real fixture, and a missing/malformed construct honestly
 * yields "not found" rather than a parse exception. */

const HEADING_PATTERN = /^(#{1,6})\s+(.*\S)\s*$/;

export type MarkdownHeading = Readonly<{ level: number; text: string; lineIndex: number }>;

/** Every ATX heading in `lines`, 0-indexed by line. */
export function findHeadings(lines: readonly string[]): readonly MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  for (const [lineIndex, line] of lines.entries()) {
    const match = HEADING_PATTERN.exec(line);
    if (match !== null) {
      headings.push({ level: (match[1] ?? "").length, text: match[2] ?? "", lineIndex });
    }
  }
  return headings;
}

/**
 * The body lines strictly between a heading whose text matches `headingText` (case-insensitively)
 * and the next heading of the same or a shallower level (or end of file). Returns `null` when no
 * heading matches. 1-based `lineRange` covers the heading line itself through the last body line.
 */
export function findSection(
  lines: readonly string[],
  headingText: string,
): Readonly<{
  bodyLines: readonly string[];
  lineRange: Readonly<{ start: number; end: number }>;
}> | null {
  const headings = findHeadings(lines);
  const target = headings.findIndex(
    (heading) => heading.text.toLowerCase() === headingText.toLowerCase(),
  );
  if (target === -1) return null;
  const targetHeading = headings[target];
  if (targetHeading === undefined) return null;
  const next = headings.slice(target + 1).find((heading) => heading.level <= targetHeading.level);
  const endLineIndex = next === undefined ? lines.length : next.lineIndex;
  const bodyLines = lines.slice(targetHeading.lineIndex + 1, endLineIndex);
  return {
    bodyLines,
    lineRange: {
      start: targetHeading.lineIndex + 1,
      end: Math.max(endLineIndex, targetHeading.lineIndex + 1),
    },
  };
}

/** The first `` `...` `` inline-code span in `text`, trimmed, or `null`. */
export function firstInlineCode(text: string): string | null {
  const match = /`([^`]+)`/.exec(text);
  const captured = match?.[1]?.trim();
  return captured === undefined || captured.length === 0 ? null : captured;
}

const CHECKBOX_PATTERN = /^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/;

export type MarkdownChecklistItem = Readonly<{ text: string; checked: boolean; lineIndex: number }>;

/** Every GFM `- [ ]`/`- [x]` checklist item in `lines`. */
export function findChecklistItems(lines: readonly string[]): readonly MarkdownChecklistItem[] {
  const items: MarkdownChecklistItem[] = [];
  for (const [lineIndex, line] of lines.entries()) {
    const match = CHECKBOX_PATTERN.exec(line);
    if (match !== null) {
      const mark = match[1] ?? " ";
      const text = match[2] ?? "";
      items.push({ text, checked: mark.toLowerCase() === "x", lineIndex });
    }
  }
  return items;
}

function isTableRuleRow(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

function splitRow(line: string): readonly string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

export type MarkdownTable = Readonly<{
  header: readonly string[];
  rows: readonly (readonly string[])[];
  lineRange: Readonly<{ start: number; end: number }>;
}>;

/** The first GFM pipe table in `lines` (a header row, a `---` rule row, then data rows until a
 * non-table line), or `null` if none is found. Only the first table is returned: every surveyed
 * BUGS.md/RISKS.md has exactly one. */
export function findFirstTable(lines: readonly string[]): MarkdownTable | null {
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index] ?? "";
    const ruleLine = lines[index + 1] ?? "";
    if (!headerLine.trim().startsWith("|") || !isTableRuleRow(ruleLine)) continue;
    const header = splitRow(headerLine);
    const rows: string[][] = [];
    let cursor = index + 2;
    while (cursor < lines.length) {
      const line = lines[cursor] ?? "";
      if (!line.trim().startsWith("|")) break;
      rows.push([...splitRow(line)]);
      cursor += 1;
    }
    return { header, rows, lineRange: { start: index + 1, end: cursor } };
  }
  return null;
}
