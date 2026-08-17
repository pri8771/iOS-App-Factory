import type { ReleaseChecklistSummaryV1 } from "@app-factory/contracts";

import { available, unavailable, type ParsedDocsField } from "../field-result.js";
import { findChecklistItems } from "../markdown.js";
import { sourceRef, type RawDoc } from "../raw-doc.js";

const MAX_ITEMS = 300;

/** Parses every GFM `- [ ]`/`- [x]` line in RELEASE_CHECKLIST.md. All six surveyed repositories use
 * this exact checkbox syntax consistently, though item counts, H1 titles, and section-header
 * vocabulary vary widely -- this parser deliberately ignores section structure and just reads the
 * flat list of checkbox lines. */
export function parseReleaseChecklist(doc: RawDoc): ParsedDocsField<ReleaseChecklistSummaryV1> {
  const found = findChecklistItems(doc.lines).slice(0, MAX_ITEMS);
  if (found.length === 0) {
    return unavailable("RELEASE_CHECKLIST.md has no GFM checkbox items ('- [ ]' / '- [x]')");
  }
  const items = found.map((item) => ({ text: item.text, checked: item.checked }));
  const checkedItems = items.filter((item) => item.checked).length;
  return available({ items, totalItems: items.length, checkedItems }, [sourceRef(doc)]);
}
