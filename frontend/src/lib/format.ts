/**
 * Turning stored values into the words a legal document uses.
 *
 * The readiness banner's list of what is still missing lives in
 * `documents.ts`, with the schema it is derived from.
 */

/**
 * Renders an ISO date (yyyy-mm-dd) the way a US legal document spells one out,
 * e.g. "August 17, 2026". Returns an empty string for missing or unparseable
 * input so callers can fall back to a placeholder.
 *
 * The date is treated as UTC on purpose: a plain yyyy-mm-dd has no time zone,
 * and parsing it as local time can shift it by a day.
 */
export function formatLongDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return "";

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "1 year" / "2 years", for the term clauses on the cover page. */
export function pluralYears(years: number): string {
  return `${years} ${years === 1 ? "year" : "years"}`;
}

/** Formats a Date as the yyyy-mm-dd value an <input type="date"> expects. */
export function toDateInputValue(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Today in the viewer's own time zone, as a date-input value. */
export function todayInputValue(): string {
  return toDateInputValue(new Date());
}
