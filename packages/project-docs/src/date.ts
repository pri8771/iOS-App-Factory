import { CalendarDateSchema, type CalendarDate } from "@app-factory/contracts";

const MONTH_NAMES: Readonly<Record<string, string>> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

const ISO_DATE_PATTERN = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const PROSE_DATE_PATTERN = /\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/;

/**
 * Parses a calendar date out of free text, tolerating the two formats observed across the six
 * repositories' `STATUS.md`/`DECISIONS.md` files: ISO (`2026-08-16`, roam-ios) and long-form prose
 * (`14 August 2026`, Anjali). Returns `null` -- never a guess -- when neither pattern matches or the
 * result is not a real calendar date.
 */
export function parseFlexibleCalendarDate(text: string): CalendarDate | null {
  const iso = ISO_DATE_PATTERN.exec(text);
  if (iso !== null) {
    const parsed = CalendarDateSchema.safeParse(`${iso[1]}-${iso[2]}-${iso[3]}`);
    if (parsed.success) return parsed.data;
  }
  const prose = PROSE_DATE_PATTERN.exec(text);
  if (prose !== null) {
    const month = MONTH_NAMES[(prose[2] ?? "").toLowerCase()];
    if (month !== undefined) {
      const day = (prose[1] ?? "").padStart(2, "0");
      const parsed = CalendarDateSchema.safeParse(`${prose[3]}-${month}-${day}`);
      if (parsed.success) return parsed.data;
    }
  }
  return null;
}

/** The first ISO `YYYY-MM-DD` date literally present in `text`, or `null`. Used for dated section
 * headings (`## Verified on 2026-08-13`, `## Documentation reconciliation (2026-07-17)`), which in
 * every surveyed repository embed a real ISO date rather than prose. */
export function findFirstIsoDate(text: string): CalendarDate | null {
  const match = ISO_DATE_PATTERN.exec(text);
  if (match === null) return null;
  const parsed = CalendarDateSchema.safeParse(`${match[1]}-${match[2]}-${match[3]}`);
  return parsed.success ? parsed.data : null;
}
