/**
 * Domain model for the Common Paper Mutual NDA (Version 1.0).
 *
 * Every field here maps to a fill-in slot on the MNDA Cover Page — see
 * `templates/mutual-nda-coverpage.md` at the repo root.
 */

/** One of the two parties signing the agreement. */
export interface Party {
  /** Legal entity name, e.g. "Acme, Inc." */
  company: string;
  /** Name of the individual signing on the company's behalf. */
  signatoryName: string;
  /** Signatory's job title. */
  signatoryTitle: string;
  /** Email or postal address for notices under the agreement. */
  noticeAddress: string;
}

/** How long the MNDA itself stays in force. */
export type MndaTermKind = "expires" | "untilTerminated";

/** How long confidentiality obligations survive. */
export type ConfidentialityTermKind = "years" | "perpetual";

export interface NdaData {
  purpose: string;
  /** ISO date string (yyyy-mm-dd), as produced by <input type="date">. */
  effectiveDate: string;
  mndaTermKind: MndaTermKind;
  /** Years until the MNDA expires. Only meaningful when kind is "expires". */
  mndaTermYears: number;
  confidentialityTermKind: ConfidentialityTermKind;
  /** Years of confidentiality. Only meaningful when kind is "years". */
  confidentialityTermYears: number;
  /** US state whose law governs the agreement. */
  governingLaw: string;
  /** Courts with jurisdiction, e.g. "New Castle, DE". */
  jurisdiction: string;
  /** Free-text modifications to the standard terms. Optional. */
  modifications: string;
  partyOne: Party;
  partyTwo: Party;
}

const emptyParty = (): Party => ({
  company: "",
  signatoryName: "",
  signatoryTitle: "",
  noticeAddress: "",
});

/** The purpose the template suggests, used as the pre-filled default. */
export const DEFAULT_PURPOSE =
  "Evaluating whether to enter into a business relationship with the other party.";

/**
 * A fresh, mostly-empty agreement. The defaults mirror the checked boxes and
 * bracketed suggestions on the template cover page: a 1 year MNDA term and
 * 1 year of confidentiality.
 *
 * `effectiveDate` is a parameter rather than "today" so that server and client
 * renders agree — the caller fills in today's date on the client, where the
 * user's own time zone is known. See NdaCreator.
 */
export function createEmptyNda(effectiveDate = ""): NdaData {
  return {
    purpose: DEFAULT_PURPOSE,
    effectiveDate,
    mndaTermKind: "expires",
    mndaTermYears: 1,
    confidentialityTermKind: "years",
    confidentialityTermYears: 1,
    governingLaw: "",
    jurisdiction: "",
    modifications: "",
    partyOne: emptyParty(),
    partyTwo: emptyParty(),
  };
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

/** US states plus DC — the cover page asks for a state as the governing law. */
export const US_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "District of Columbia",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
] as const;
