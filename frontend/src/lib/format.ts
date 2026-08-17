import type { NdaData } from "./nda";

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

/**
 * Human-readable labels for every field still needed before the agreement is
 * ready to sign. Drives the readiness banner above the preview; the document
 * itself always renders, showing placeholders in place of missing values.
 */
export function missingFieldLabels(data: NdaData): string[] {
  const missing: string[] = [];
  const require = (label: string, value: string) => {
    if (!value.trim()) missing.push(label);
  };

  require("Purpose", data.purpose);
  require("Effective Date", data.effectiveDate);
  require("Governing Law", data.governingLaw);
  require("Jurisdiction", data.jurisdiction);

  for (const [name, party] of [
    ["Party 1", data.partyOne],
    ["Party 2", data.partyTwo],
  ] as const) {
    require(`${name} company`, party.company);
    require(`${name} print name`, party.signatoryName);
    require(`${name} title`, party.signatoryTitle);
    require(`${name} notice address`, party.noticeAddress);
  }

  return missing;
}
