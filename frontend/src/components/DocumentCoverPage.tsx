/**
 * The filled-in Cover Page for whichever agreement is being drafted.
 *
 * A structured render rather than a text substitution, so the checkbox
 * options, the signature block, and each fill-in slot can be driven from the
 * schema — and so unanswered fields show as visible placeholders.
 *
 * Only the Mutual NDA ships a cover page in `templates/`; the rest of the
 * Common Paper set is Standard Terms that refer to a Cover Page held
 * separately. This builds that page from the fields the Standard Terms
 * reference, which is why the layout is derived rather than transcribed.
 */

import type { ReactNode } from "react";
import RichText from "./RichText";
import {
  dependentYears,
  emptyParty,
  isParty,
  type DocumentData,
  type DocumentSchema,
  type FieldSchema,
  type Party,
} from "@/lib/documents";
import { formatLongDate, pluralYears } from "@/lib/format";

/** A fill-in slot: the user's value, or the template's bracketed prompt. */
function Slot({ value, placeholder }: { value: string; placeholder: string }) {
  const filled = value.trim();
  if (filled) return <span className="doc-value">{filled}</span>;
  return <span className="doc-placeholder">[{placeholder}]</span>;
}

/** One of the mutually exclusive options, rendered as a checkbox line. */
function Option({ checked, children }: { checked: boolean; children: ReactNode }) {
  return (
    <li className="doc-option">
      <span aria-hidden="true" className="doc-checkbox">
        {checked ? "☒" : "☐"}
      </span>
      <span className="sr-only">{checked ? "Selected: " : "Not selected: "}</span>
      <span>{children}</span>
    </li>
  );
}

/** The value of one field, formatted the way its kind is written down. */
function displayValue(field: FieldSchema, data: DocumentData): string {
  const value = data[field.key];
  if (field.type === "date") return formatLongDate(String(value ?? ""));
  return String(value ?? "");
}

function placeholderFor(field: FieldSchema): string {
  return field.placeholder ?? `Fill in the ${field.label.toLowerCase()}`;
}

/** A field rendered as a value, a choice list, or fixed text when left blank. */
function FieldBody({
  field,
  schema,
  data,
}: {
  field: FieldSchema;
  schema: DocumentSchema;
  data: DocumentData;
}) {
  if (field.type === "choice") {
    return (
      <ul className="doc-options">
        {(field.options ?? []).map((option) => {
          const years = dependentYears(schema, data, field, option);
          return (
            <Option key={option.value} checked={data[field.key] === option.value}>
              {years === undefined
                ? option.label
                : option.label.replace("{years}", pluralYears(years))}
            </Option>
          );
        })}
      </ul>
    );
  }

  const value = displayValue(field, data);

  // An optional field with fixed wording for "nothing here" is answered by
  // being left blank, so it is not a gap to flag.
  if (field.emptyText && !value.trim()) {
    return (
      <p>
        <span className="doc-value">{field.emptyText}</span>
      </p>
    );
  }

  return (
    <p>
      {field.inlineLabel ? `${field.inlineLabel}: ` : null}
      <Slot value={value} placeholder={placeholderFor(field)} />
    </p>
  );
}

/** Fields in the order they appear, grouped where they share a section. */
function sections(schema: DocumentSchema): { heading: string; fields: FieldSchema[] }[] {
  const grouped: { heading: string; fields: FieldSchema[] }[] = [];

  for (const field of schema.fields) {
    // Parties become the signature block, and a years field is shown inside
    // the option it belongs to rather than on its own.
    if (field.type === "party" || field.dependsOn) continue;

    const heading = field.section ?? field.label;
    const last = grouped.at(-1);
    if (last?.heading === heading) last.fields.push(field);
    else grouped.push({ heading, fields: [field] });
  }

  return grouped;
}

interface SignatureRow {
  label: string;
  values: string[];
  /** Omitted for rows the parties complete by hand when signing. */
  placeholder?: string;
  /** Small explanatory note under the row label, as on the template. */
  note?: string;
}

/**
 * A signature-block cell. Rows without a placeholder (Signature, Date) are
 * deliberately left as blank ruled space for wet or e-signature.
 */
function SignatureCell({ value, placeholder }: { value: string; placeholder?: string }) {
  if (!placeholder) return <td className="doc-signature-blank" />;
  return (
    <td>
      <Slot value={value} placeholder={placeholder} />
    </td>
  );
}

function signatureRows(parties: Party[]): SignatureRow[] {
  const column = (key: keyof Party) => parties.map((party) => party[key]);

  return [
    { label: "Signature", values: parties.map(() => "") },
    { label: "Print Name", values: column("signatoryName"), placeholder: "Print name" },
    { label: "Title", values: column("signatoryTitle"), placeholder: "Title" },
    { label: "Company", values: column("company"), placeholder: "Company" },
    {
      label: "Notice Address",
      values: column("noticeAddress"),
      placeholder: "Email or postal address",
      note: "Use either email or postal address",
    },
    { label: "Date", values: parties.map(() => "") },
  ];
}

export default function DocumentCoverPage({
  schema,
  data,
}: {
  schema: DocumentSchema;
  data: DocumentData;
}) {
  const partyFields = schema.fields.filter((field) => field.type === "party");
  const parties = partyFields.map((field) => {
    const value = data[field.key];
    return isParty(value) ? value : emptyParty();
  });
  const { coverPage } = schema;

  return (
    <article className="doc">
      <h1>{coverPage.title}</h1>

      {coverPage.intro ? (
        <>
          {coverPage.usingHeading ? <h2>{coverPage.usingHeading}</h2> : null}
          <p>
            <RichText text={coverPage.intro} />
          </p>
        </>
      ) : null}

      {sections(schema).map((section) => (
        <section key={section.heading}>
          <h3>{section.heading}</h3>
          {section.fields[0].note ? (
            <p className="doc-field-note">{section.fields[0].note}</p>
          ) : null}
          {section.fields.map((field) => (
            <FieldBody key={field.key} field={field} schema={schema} data={data} />
          ))}
        </section>
      ))}

      {coverPage.attestation ? (
        <p className="doc-attestation">{coverPage.attestation}</p>
      ) : null}

      {parties.length > 0 ? (
        <table className="doc-signatures">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Field</span>
              </th>
              {partyFields.map((field) => (
                <th key={field.key} scope="col">
                  {field.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {signatureRows(parties).map((row) => (
              <tr key={row.label}>
                <th scope="row">
                  {row.label}
                  {row.note ? <span className="doc-field-note">{row.note}</span> : null}
                </th>
                {row.values.map((value, index) => (
                  <SignatureCell
                    key={partyFields[index].key}
                    value={value}
                    placeholder={row.placeholder}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {coverPage.attribution ? (
        <p className="doc-attribution">
          <RichText text={coverPage.attribution} />
        </p>
      ) : null}
    </article>
  );
}
