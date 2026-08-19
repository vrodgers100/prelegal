/**
 * The drafting conversation, and how what the assistant hears reaches the
 * document.
 *
 * The browser owns the agreement: every turn sends the transcript and the
 * current fields, and gets back a reply plus whichever fields the assistant
 * picked up. Merging here rather than on the server means a reply can only
 * touch the fields it actually learned, so an edit made in the form while a
 * message was in flight survives.
 */

import {
  CONFIDENTIALITY_TERM_KINDS,
  MNDA_TERM_KINDS,
  US_STATES,
  type ConfidentialityTermKind,
  type MndaTermKind,
  type NdaData,
  type Party,
} from "./nda";

/** One line of the conversation. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** The opening line, shown without calling the API so the panel is never blank. */
export const GREETING =
  "Hi — I'll help you put together a Mutual NDA. To start, what are the two " +
  "companies, and what are you sharing information for?";

/** A field the assistant did not learn comes back null. */
type Learned<T> = T | null | undefined;

export type PartyUpdates = { [Field in keyof Party]?: Learned<string> };

/** What one turn learned: any subset of the document. */
export interface NdaUpdates {
  purpose?: Learned<string>;
  effectiveDate?: Learned<string>;
  mndaTermKind?: Learned<MndaTermKind>;
  mndaTermYears?: Learned<number>;
  confidentialityTermKind?: Learned<ConfidentialityTermKind>;
  confidentialityTermYears?: Learned<number>;
  governingLaw?: Learned<string>;
  jurisdiction?: Learned<string>;
  modifications?: Learned<string>;
  partyOne?: Learned<PartyUpdates>;
  partyTwo?: Learned<PartyUpdates>;
}

/** What the assistant answers with. */
export interface ChatTurn {
  reply: string;
  updates: NdaUpdates;
}

/** Trimmed text, or undefined when there is nothing worth writing down. */
function text(value: Learned<string>): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** A yyyy-mm-dd date, which is what the date input and the formatter expect. */
function date(value: Learned<string>): string | undefined {
  const trimmed = text(value);
  return trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

/** A whole number of years, held to the range the form allows. */
function years(value: Learned<number>): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return Math.min(99, Math.max(1, value));
}

/** One of a fixed set of options, ignoring anything else. */
function oneOf<T extends string>(
  value: Learned<string>,
  allowed: readonly T[],
): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/**
 * The governing law has to be a state the form can actually show.
 *
 * The assistant does occasionally answer with something that is not one — a
 * observed example is "Delphi" for Delaware. Dropping it leaves the field
 * visibly unfilled, which the user can correct, rather than writing a
 * plausible-looking mistake into a legal document.
 */
function state(value: Learned<string>): string | undefined {
  return oneOf(text(value), US_STATES);
}

function applyParty(party: Party, updates: Learned<PartyUpdates>): Party {
  if (!updates) return party;
  return {
    company: text(updates.company) ?? party.company,
    signatoryName: text(updates.signatoryName) ?? party.signatoryName,
    signatoryTitle: text(updates.signatoryTitle) ?? party.signatoryTitle,
    noticeAddress: text(updates.noticeAddress) ?? party.noticeAddress,
  };
}

/** Folds one turn's findings into the agreement, leaving the rest alone. */
export function applyUpdates(data: NdaData, updates: NdaUpdates): NdaData {
  return {
    purpose: text(updates.purpose) ?? data.purpose,
    effectiveDate: date(updates.effectiveDate) ?? data.effectiveDate,
    mndaTermKind: oneOf(updates.mndaTermKind, MNDA_TERM_KINDS) ?? data.mndaTermKind,
    mndaTermYears: years(updates.mndaTermYears) ?? data.mndaTermYears,
    confidentialityTermKind:
      oneOf(updates.confidentialityTermKind, CONFIDENTIALITY_TERM_KINDS) ??
      data.confidentialityTermKind,
    confidentialityTermYears:
      years(updates.confidentialityTermYears) ?? data.confidentialityTermYears,
    governingLaw: state(updates.governingLaw) ?? data.governingLaw,
    jurisdiction: text(updates.jurisdiction) ?? data.jurisdiction,
    modifications: text(updates.modifications) ?? data.modifications,
    partyOne: applyParty(data.partyOne, updates.partyOne),
    partyTwo: applyParty(data.partyTwo, updates.partyTwo),
  };
}
