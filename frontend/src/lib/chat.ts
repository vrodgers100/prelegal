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
  emptyParty,
  isParty,
  type DocumentData,
  type DocumentSchema,
  type FieldSchema,
  type FieldValue,
  type Party,
} from "./documents";

/** One line of the conversation. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * The opening line, shown without calling the API so the panel is never blank.
 *
 * It asks what to draft rather than assuming: Prelegal drafts eleven
 * agreements, and which one it is comes out of the conversation.
 *
 * It used to name three of them as the ones people ask for most, which was
 * true and unhelpful — the catalogue now sits directly underneath, so naming
 * three of eleven only suggests the other eight are not on offer.
 */
export const GREETING =
  "Hi — I can help you put together a legal agreement. Tell me what you need " +
  "in your own words, or pick one from the list below.";

/** A field the assistant did not learn comes back null. */
type Learned<T> = T | null | undefined;

/** What one turn learned: any subset of the document, keyed as the schema is. */
export type DocumentUpdates = Record<string, unknown>;

/** What the assistant answers with. */
export interface ChatTurn {
  reply: string;
  updates: DocumentUpdates;
  /** Set by a turn that settles which agreement to draft, null otherwise. */
  documentType: string | null;
}

/** Trimmed text, or undefined when there is nothing worth writing down. */
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** A yyyy-mm-dd date, which is what the date input and the formatter expect. */
function date(value: unknown): string | undefined {
  const trimmed = text(value);
  return trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

/** A whole number of years, held to the range the field allows. */
function years(value: unknown, min = 1, max = 99): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

/** One of a fixed set of options, ignoring anything else. */
function oneOf(value: unknown, allowed: readonly string[]): string | undefined {
  const trimmed = text(value);
  return trimmed && allowed.includes(trimmed) ? trimmed : undefined;
}

function applyParty(party: Party, updates: Learned<Partial<Party>>): Party {
  if (!updates || typeof updates !== "object") return party;
  return {
    company: text(updates.company) ?? party.company,
    signatoryName: text(updates.signatoryName) ?? party.signatoryName,
    signatoryTitle: text(updates.signatoryTitle) ?? party.signatoryTitle,
    noticeAddress: text(updates.noticeAddress) ?? party.noticeAddress,
  };
}

/**
 * Validates one learned value against the kind of field it claims to be.
 *
 * A value that does not survive this is dropped rather than written into the
 * document. The governing law is the field that made this necessary: the
 * assistant does occasionally answer with something that is not a state — an
 * observed example is "Delphi" for Delaware. Leaving the field visibly
 * unfilled is something the user can correct; a plausible-looking mistake in
 * a legal document is not.
 */
function validate(
  field: FieldSchema,
  learned: unknown,
  current: FieldValue | undefined,
  usStates: readonly string[],
): FieldValue | undefined {
  switch (field.type) {
    case "text":
      return text(learned);
    case "date":
      return date(learned);
    case "years":
      return years(learned, field.min, field.max);
    case "choice":
      return oneOf(learned, (field.options ?? []).map((option) => option.value));
    case "state":
      return oneOf(learned, usStates);
    case "party":
      return applyParty(
        isParty(current) ? current : emptyParty(),
        learned as Partial<Party>,
      );
  }
}

/** Folds one turn's findings into the agreement, leaving the rest alone. */
export function applyUpdates(
  schema: DocumentSchema,
  data: DocumentData,
  updates: DocumentUpdates,
  usStates: readonly string[],
): DocumentData {
  const next = { ...data };

  for (const field of schema.fields) {
    const learned = updates[field.key];
    if (learned === null || learned === undefined) continue;

    const validated = validate(field, learned, data[field.key], usStates);
    if (validated !== undefined) next[field.key] = validated;
  }

  return next;
}
