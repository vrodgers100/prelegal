"use client";

import { useId, type ReactNode } from "react";
import type { NdaData, Party } from "@/lib/nda";
import { US_STATES } from "@/lib/nda";

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition outline-none placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-400";

const labelClass =
  "mb-1.5 block text-xs font-semibold tracking-wide text-slate-700 uppercase dark:text-slate-300";

const hintClass = "mt-1.5 block text-xs text-slate-500 dark:text-slate-400";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <span className={hintClass}>{hint}</span> : null}
    </label>
  );
}

/** A titled group of related inputs. */
function Fieldset({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-slate-200 pt-5 dark:border-slate-800">
      <legend className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

/**
 * One choice in a mutually exclusive pair of term options, mirroring the
 * checkbox options on the cover page. Options measured in years get an inline
 * number input; editing it also selects the option.
 */
function TermOption({
  name,
  checked,
  onSelect,
  years,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  years?: { value: number; onChange: (years: number) => void };
  children: ReactNode;
}) {
  const id = useId();

  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-1 size-4 shrink-0 accent-slate-900 dark:accent-slate-100"
      />
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        {years ? (
          <input
            type="number"
            min={1}
            max={99}
            value={years.value}
            aria-label="Number of years"
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              if (Number.isNaN(parsed)) return;
              years.onChange(Math.min(99, Math.max(1, parsed)));
              onSelect();
            }}
            className="w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        ) : null}
        <label htmlFor={id}>{children}</label>
      </div>
    </div>
  );
}

function PartyFields({
  title,
  party,
  onChange,
}: {
  title: string;
  party: Party;
  onChange: (patch: Partial<Party>) => void;
}) {
  return (
    <Fieldset title={title}>
      <Field label="Company">
        <input
          className={inputClass}
          value={party.company}
          placeholder="Acme, Inc."
          onChange={(event) => onChange({ company: event.target.value })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Print name">
          <input
            className={inputClass}
            value={party.signatoryName}
            placeholder="Jane Doe"
            onChange={(event) => onChange({ signatoryName: event.target.value })}
          />
        </Field>
        <Field label="Title">
          <input
            className={inputClass}
            value={party.signatoryTitle}
            placeholder="Chief Executive Officer"
            onChange={(event) => onChange({ signatoryTitle: event.target.value })}
          />
        </Field>
      </div>
      <Field label="Notice address" hint="Either an email or a postal address.">
        <textarea
          className={inputClass}
          rows={2}
          value={party.noticeAddress}
          placeholder="legal@acme.com"
          onChange={(event) => onChange({ noticeAddress: event.target.value })}
        />
      </Field>
    </Fieldset>
  );
}

export interface NdaFormProps {
  data: NdaData;
  onChange: (patch: Partial<NdaData>) => void;
  onReset: () => void;
}

export default function NdaForm({ data, onChange, onReset }: NdaFormProps) {
  return (
    <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
      <Fieldset title="Agreement details">
        <Field label="Purpose" hint="How Confidential Information may be used.">
          <textarea
            className={inputClass}
            rows={3}
            value={data.purpose}
            onChange={(event) => onChange({ purpose: event.target.value })}
          />
        </Field>

        <Field label="Effective date">
          <input
            type="date"
            className={inputClass}
            value={data.effectiveDate}
            onChange={(event) => onChange({ effectiveDate: event.target.value })}
          />
        </Field>

        <div>
          <span className={labelClass}>MNDA term</span>
          <div className="space-y-2.5">
            <TermOption
              name="mndaTerm"
              checked={data.mndaTermKind === "expires"}
              onSelect={() => onChange({ mndaTermKind: "expires" })}
              years={{
                value: data.mndaTermYears,
                onChange: (mndaTermYears) => onChange({ mndaTermYears }),
              }}
            >
              year(s) from the effective date, then expires
            </TermOption>
            <TermOption
              name="mndaTerm"
              checked={data.mndaTermKind === "untilTerminated"}
              onSelect={() => onChange({ mndaTermKind: "untilTerminated" })}
            >
              Continues until terminated by either party
            </TermOption>
          </div>
        </div>

        <div>
          <span className={labelClass}>Term of confidentiality</span>
          <div className="space-y-2.5">
            <TermOption
              name="confidentialityTerm"
              checked={data.confidentialityTermKind === "years"}
              onSelect={() => onChange({ confidentialityTermKind: "years" })}
              years={{
                value: data.confidentialityTermYears,
                onChange: (confidentialityTermYears) =>
                  onChange({ confidentialityTermYears }),
              }}
            >
              year(s) from the effective date (trade secrets protected longer)
            </TermOption>
            <TermOption
              name="confidentialityTerm"
              checked={data.confidentialityTermKind === "perpetual"}
              onSelect={() => onChange({ confidentialityTermKind: "perpetual" })}
            >
              In perpetuity
            </TermOption>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Governing law">
            <select
              className={inputClass}
              value={data.governingLaw}
              onChange={(event) => onChange({ governingLaw: event.target.value })}
            >
              <option value="">Select a state…</option>
              {US_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jurisdiction" hint="City or county, and state.">
            <input
              className={inputClass}
              value={data.jurisdiction}
              placeholder="New Castle, DE"
              onChange={(event) => onChange({ jurisdiction: event.target.value })}
            />
          </Field>
        </div>

        <Field
          label="Modifications"
          hint="Optional. Anything here controls over the standard terms."
        >
          <textarea
            className={inputClass}
            rows={2}
            value={data.modifications}
            onChange={(event) => onChange({ modifications: event.target.value })}
          />
        </Field>
      </Fieldset>

      <PartyFields
        title="Party 1"
        party={data.partyOne}
        onChange={(patch) => onChange({ partyOne: { ...data.partyOne, ...patch } })}
      />
      <PartyFields
        title="Party 2"
        party={data.partyTwo}
        onChange={(patch) => onChange({ partyTwo: { ...data.partyTwo, ...patch } })}
      />

      <div className="border-t border-slate-200 pt-5 dark:border-slate-800">
        <button
          type="button"
          onClick={onReset}
          className="text-sm font-medium text-slate-500 underline-offset-4 transition hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
        >
          Clear the form
        </button>
      </div>
    </form>
  );
}
