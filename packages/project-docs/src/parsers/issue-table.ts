import type { DocIssueTableSummaryV1 } from "@app-factory/contracts";

import { available, unavailable, type ParsedDocsField } from "../field-result.js";
import { findFirstTable } from "../markdown.js";
import { sourceRef, type RawDoc } from "../raw-doc.js";

const MAX_ROWS = 300;

/** Status tokens treated as unambiguously closed. Deliberately a small exact-match set (not a
 * substring match) so a compound status like roam-ios's `partially_resolved` or hindsight's
 * `fixed_unmerged` is NOT mistaken for closed just because it contains "resolved"/"fixed" -- when a
 * status is anything other than one of these exact tokens, this heuristic conservatively reports the
 * row as still open. `status` itself is always reported verbatim alongside `looksOpen` so a consumer
 * can override the heuristic. */
const CLOSED_STATUS_TOKENS = new Set(["resolved", "fixed", "closed", "done"]);

function looksOpen(status: string | null): boolean {
  if (status === null) return true;
  return !CLOSED_STATUS_TOKENS.has(status.trim().toLowerCase());
}

function columnIndex(header: readonly string[], names: readonly string[]): number {
  return header.findIndex((cell) => names.includes(cell.trim().toLowerCase()));
}

/**
 * Parses the first GFM pipe table in BUGS.md/RISKS.md. Column names vary per repository (Svara adds
 * an "Owning task" column to BUGS.md and renames "Mitigation" to "Mitigation / task" in RISKS.md), so
 * columns are matched case-insensitively by a small synonym set rather than a fixed position; a
 * table with neither a "Summary" nor a "Risk" column is reported unavailable rather than guessed at.
 */
export function parseIssueTable(
  doc: RawDoc,
  docLabel: string,
): ParsedDocsField<DocIssueTableSummaryV1> {
  const table = findFirstTable(doc.lines);
  if (table === null) return unavailable(`${docLabel} has no GFM pipe table`);

  const idIndex = columnIndex(table.header, ["id"]);
  const summaryIndex = columnIndex(table.header, ["summary", "risk"]);
  const statusIndex = columnIndex(table.header, ["status"]);
  if (summaryIndex === -1) {
    return unavailable(`${docLabel}'s table has neither a "Summary" nor a "Risk" column`);
  }

  const rows = table.rows
    .filter((row) => row.some((cell) => cell.length > 0))
    .slice(0, MAX_ROWS)
    .map((row) => {
      const id = idIndex === -1 ? null : (row[idIndex]?.trim() ?? "") || null;
      const summary = row[summaryIndex]?.trim() ?? "";
      const status = statusIndex === -1 ? null : (row[statusIndex]?.trim() ?? "") || null;
      return { id, summary, status, looksOpen: looksOpen(status) };
    })
    .filter((row) => row.summary.length > 0);

  if (rows.length === 0) {
    return unavailable(`${docLabel}'s table has a header but no data rows`);
  }
  const openCount = rows.filter((row) => row.looksOpen).length;
  return available({ rows, totalCount: rows.length, openCount }, [sourceRef(doc, table.lineRange)]);
}
