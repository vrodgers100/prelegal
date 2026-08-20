/**
 * The agreements Prelegal can draft, and the fields each one needs.
 *
 * The shapes here mirror the JSON in `schemas/` at the repository root, which
 * is the single source of truth: the backend reads the same files to build the
 * schema it hands the language model. Adding a field means editing one JSON
 * file, not two type declarations that have to be kept in step.
 *
 * Nothing in this module touches the filesystem, so it is safe to import from
 * a client component. The reading happens in `documents.server.ts`.
 */

export type FieldType = "text" | "date" | "years" | "choice" | "party" | "state";

/** One choice in a mutually exclusive set, as the cover page lists it. */
export interface FieldOption {
  value: string;
  /** May contain `{years}`, filled from the years field that depends on it. */
  label: string;
  /** Shorter wording for the review form, where the years input sits inline. */
  formLabel?: string;
}

/** Ties a years field to the option that makes it meaningful. */
export interface Dependency {
  field: string;
  value: string;
}

/** One fill-in slot on a cover page. */
export interface FieldSchema {
  key: string;
  type: FieldType;
  /** Heading on the cover page, and the name used when reporting it missing. */
  label: string;
  /** Overrides `label` in the review form, where the shorter name reads better. */
  formLabel?: string;
  /** Fields sharing a section are rendered under one heading. */
  section?: string;
  /** Renders as "Governing Law: <value>" within a shared section. */
  inlineLabel?: string;
  /** The template's explanatory caption, shown under the heading. */
  note?: string;
  /** Guidance shown under the input in the review form. */
  hint?: string;
  /** What the bracketed placeholder says while the field is empty. */
  placeholder?: string;
  /** Shown instead of a placeholder when an optional field is left blank. */
  emptyText?: string;
  /** How the assistant describes the field. Never shown to the user. */
  prompt: string;
  required: boolean;
  multiline?: boolean;
  default?: string | number;
  min?: number;
  max?: number;
  options?: FieldOption[];
  dependsOn?: Dependency;
}

/** The wording around the fields on a cover page. */
export interface CoverPageSchema {
  title: string;
  usingHeading?: string;
  intro?: string;
  attestation?: string;
  attribution?: string;
}

export interface DocumentSchema {
  documentType: string;
  name: string;
  shortName?: string;
  description: string;
  templateFile: string;
  coverPage: CoverPageSchema;
  /** Heading over the non-party fields in the review form. */
  formSectionTitle?: string;
  fields: FieldSchema[];
}

/** One side of an agreement, as it signs. */
export interface Party {
  company: string;
  signatoryName: string;
  signatoryTitle: string;
  noticeAddress: string;
}

export type FieldValue = string | number | Party;

/**
 * An agreement being drafted.
 *
 * Keyed by field name rather than declared as one interface per agreement:
 * there are eleven of them and the keys come from JSON, so the compiler could
 * not check them anyway. Validation happens in `applyUpdates` on the way in
 * and in the backend's own model on the way out.
 */
export type DocumentData = Record<string, FieldValue>;

export const emptyParty = (): Party => ({
  company: "",
  signatoryName: "",
  signatoryTitle: "",
  noticeAddress: "",
});

export function isParty(value: FieldValue | undefined): value is Party {
  return typeof value === "object" && value !== null && "company" in value;
}

/** The first option, used when a choice field declares no default. */
function firstOption(field: FieldSchema): string {
  return field.options?.[0]?.value ?? "";
}

/** A fresh agreement, filled in with whatever defaults the schema declares. */
export function createEmptyDocument(schema: DocumentSchema): DocumentData {
  const data: DocumentData = {};

  for (const field of schema.fields) {
    switch (field.type) {
      case "party":
        data[field.key] = emptyParty();
        break;
      case "years":
        data[field.key] = typeof field.default === "number" ? field.default : 1;
        break;
      case "choice":
        data[field.key] = String(field.default ?? firstOption(field));
        break;
      default:
        data[field.key] = String(field.default ?? "");
    }
  }

  return data;
}

/**
 * Dates the agreement from the viewer's own clock.
 *
 * An unset date means today, so a fresh document (and a cleared one) starts
 * out dated correctly without storing a date the user never chose.
 */
export function withToday(
  schema: DocumentSchema,
  data: DocumentData,
  today: string,
): DocumentData {
  const undated = schema.fields.filter(
    (field) => field.type === "date" && !String(data[field.key] ?? "").trim(),
  );
  if (undated.length === 0 || !today) return data;

  return { ...data, ...Object.fromEntries(undated.map((f) => [f.key, today])) };
}

/**
 * The four details every party needs, as the review form labels them.
 *
 * "Print Name" rather than "signatory name" because the form mirrors the
 * signature block on the cover page. The assistant says it differently — see
 * `PARTY_LABELS` in `backend/src/prelegal/chat.py`.
 */
export const PARTY_FIELD_LABELS: Record<keyof Party, string> = {
  company: "company",
  signatoryName: "print name",
  signatoryTitle: "title",
  noticeAddress: "notice address",
};

/**
 * Human-readable labels for every field still needed before the agreement is
 * ready to sign. Drives the readiness banner above the preview; the document
 * itself always renders, showing placeholders in place of missing values.
 */
export function missingFieldLabels(
  schema: DocumentSchema,
  data: DocumentData,
): string[] {
  const missing: string[] = [];

  for (const field of schema.fields) {
    if (!field.required) continue;
    const value = data[field.key];

    if (field.type === "party") {
      const party = isParty(value) ? value : emptyParty();
      for (const [key, label] of Object.entries(PARTY_FIELD_LABELS)) {
        if (!party[key as keyof Party].trim()) {
          missing.push(`${field.label} ${label}`);
        }
      }
    } else if (!String(value ?? "").trim()) {
      missing.push(field.label);
    }
  }

  return missing;
}

/** The years value a choice option should show, for a `{years}` placeholder. */
export function dependentYears(
  schema: DocumentSchema,
  data: DocumentData,
  field: FieldSchema,
  option: FieldOption,
): number | undefined {
  const years = schema.fields.find(
    (candidate) =>
      candidate.type === "years" &&
      candidate.dependsOn?.field === field.key &&
      candidate.dependsOn.value === option.value,
  );
  if (!years) return undefined;

  const value = data[years.key];
  return typeof value === "number" ? value : undefined;
}
