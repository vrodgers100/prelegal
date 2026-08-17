/**
 * The filled-in MNDA Cover Page.
 *
 * This mirrors `templates/mutual-nda-coverpage.md` section for section. It is a
 * structured render rather than a text substitution so that the checkbox
 * options, the two-party signature block, and each fill-in slot can be driven
 * from typed data — and so unanswered fields can show as visible placeholders.
 */

import type { ReactNode } from "react";
import type { NdaData, Party } from "@/lib/nda";
import { formatLongDate, pluralYears } from "@/lib/format";

/** A fill-in slot: the user's value, or the template's bracketed prompt. */
function Slot({ value, placeholder }: { value: string; placeholder: string }) {
  const filled = value.trim();
  if (filled) return <span className="doc-value">{filled}</span>;
  return <span className="doc-placeholder">[{placeholder}]</span>;
}

/** One of the mutually exclusive term options, rendered as a checkbox line. */
function Option({
  checked,
  children,
}: {
  checked: boolean;
  children: ReactNode;
}) {
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

interface SignatureRow {
  label: string;
  partyOneValue: string;
  partyTwoValue: string;
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

function signatureRows(partyOne: Party, partyTwo: Party): SignatureRow[] {
  return [
    { label: "Signature", partyOneValue: "", partyTwoValue: "" },
    {
      label: "Print Name",
      partyOneValue: partyOne.signatoryName,
      partyTwoValue: partyTwo.signatoryName,
      placeholder: "Print name",
    },
    {
      label: "Title",
      partyOneValue: partyOne.signatoryTitle,
      partyTwoValue: partyTwo.signatoryTitle,
      placeholder: "Title",
    },
    {
      label: "Company",
      partyOneValue: partyOne.company,
      partyTwoValue: partyTwo.company,
      placeholder: "Company",
    },
    {
      label: "Notice Address",
      partyOneValue: partyOne.noticeAddress,
      partyTwoValue: partyTwo.noticeAddress,
      placeholder: "Email or postal address",
      note: "Use either email or postal address",
    },
    { label: "Date", partyOneValue: "", partyTwoValue: "" },
  ];
}

export default function NdaCoverPage({ data }: { data: NdaData }) {
  const effectiveDate = formatLongDate(data.effectiveDate);

  return (
    <article className="doc">
      <h1>Mutual Non-Disclosure Agreement</h1>

      <h2>Using this Mutual Non-Disclosure Agreement</h2>
      <p>
        This Mutual Non-Disclosure Agreement (the &ldquo;MNDA&rdquo;) consists of: (1) this
        Cover Page (&ldquo;<strong>Cover Page</strong>&rdquo;) and (2) the Common Paper Mutual
        NDA Standard Terms Version 1.0 (&ldquo;<strong>Standard Terms</strong>&rdquo;)
        identical to those posted at{" "}
        <a href="https://commonpaper.com/standards/mutual-nda/1.0">
          commonpaper.com/standards/mutual-nda/1.0
        </a>
        . Any modifications of the Standard Terms should be made on the Cover Page, which
        will control over conflicts with the Standard Terms.
      </p>

      <section>
        <h3>Purpose</h3>
        <p className="doc-field-note">How Confidential Information may be used</p>
        <p>
          <Slot value={data.purpose} placeholder="Fill in the purpose" />
        </p>
      </section>

      <section>
        <h3>Effective Date</h3>
        <p>
          <Slot value={effectiveDate} placeholder="Fill in the effective date" />
        </p>
      </section>

      <section>
        <h3>MNDA Term</h3>
        <p className="doc-field-note">The length of this MNDA</p>
        <ul className="doc-options">
          <Option checked={data.mndaTermKind === "expires"}>
            Expires {pluralYears(data.mndaTermYears)} from Effective Date.
          </Option>
          <Option checked={data.mndaTermKind === "untilTerminated"}>
            Continues until terminated in accordance with the terms of the MNDA.
          </Option>
        </ul>
      </section>

      <section>
        <h3>Term of Confidentiality</h3>
        <p className="doc-field-note">How long Confidential Information is protected</p>
        <ul className="doc-options">
          <Option checked={data.confidentialityTermKind === "years"}>
            {pluralYears(data.confidentialityTermYears)} from Effective Date, but in the
            case of trade secrets until Confidential Information is no longer considered a
            trade secret under applicable laws.
          </Option>
          <Option checked={data.confidentialityTermKind === "perpetual"}>
            In perpetuity.
          </Option>
        </ul>
      </section>

      <section>
        <h3>Governing Law &amp; Jurisdiction</h3>
        <p>
          Governing Law:{" "}
          <Slot value={data.governingLaw} placeholder="Fill in state" />
        </p>
        <p>
          Jurisdiction:{" "}
          <Slot
            value={data.jurisdiction}
            placeholder="Fill in city or county and state"
          />
        </p>
      </section>

      <section>
        <h3>MNDA Modifications</h3>
        <p className="doc-field-note">List any modifications to the MNDA</p>
        {/* Modifications are optional, so "none" is a finished answer rather
            than a gap to flag. */}
        <p>
          <span className="doc-value">{data.modifications.trim() || "None."}</span>
        </p>
      </section>

      <p className="doc-attestation">
        By signing this Cover Page, each party agrees to enter into this MNDA as of the
        Effective Date.
      </p>

      <table className="doc-signatures">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Field</span>
            </th>
            <th scope="col">Party 1</th>
            <th scope="col">Party 2</th>
          </tr>
        </thead>
        <tbody>
          {signatureRows(data.partyOne, data.partyTwo).map((row) => (
            <tr key={row.label}>
              <th scope="row">
                {row.label}
                {row.note ? (
                  <span className="doc-field-note">{row.note}</span>
                ) : null}
              </th>
              <SignatureCell value={row.partyOneValue} placeholder={row.placeholder} />
              <SignatureCell value={row.partyTwoValue} placeholder={row.placeholder} />
            </tr>
          ))}
        </tbody>
      </table>

      <p className="doc-attribution">
        Common Paper Mutual Non-Disclosure Agreement (Version 1.0) free to use under{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
      </p>
    </article>
  );
}
