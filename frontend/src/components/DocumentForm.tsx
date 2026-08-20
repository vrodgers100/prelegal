"use client";

import { useId, type ReactNode } from "react";
import {
  emptyParty,
  isParty,
  type DocumentData,
  type DocumentSchema,
  type FieldSchema,
  type FieldValue,
  type Party,
} from "@/lib/documents";

/**
 * The review panel: every field of the agreement, editable by hand.
 *
 * The assistant does the filling in, but it can mishear. This is how a value
 * gets corrected without arguing with it, and it is what keeps the page usable
 * when there is no API key. Both write to the same document.
 *
 * Built from the schema rather than written out per agreement — there are
 * eleven of them, and the fields come from JSON either way.
 */

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
 * One choice in a mutually exclusive set, mirroring the checkbox options on
 * the cover page. Options measured in years get an inline number input;
 * editing it also selects the option.
 */
function ChoiceOption({
  name,
  checked,
  onSelect,
  years,
  children,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  years?: { value: number; min: number; max: number; onChange: (years: number) => void };
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
            min={years.min}
            max={years.max}
            value={years.value}
            aria-label="Years"
            onChange={(event) => {
              years.onChange(Number(event.target.value));
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
  label,
  party,
  onChange,
}: {
  label: string;
  party: Party;
  onChange: (patch: Partial<Party>) => void;
}) {
  return (
    <Fieldset title={label}>
      <Field label="Company">
        <input
          className={inputClass}
          value={party.company}
          placeholder="Acme, Inc."
          onChange={(event) => onChange({ company: event.target.value })}
        />
      </Field>
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
      <Field label="Notice address" hint="Use either an email or a postal address.">
        <textarea
          rows={2}
          className={inputClass}
          value={party.noticeAddress}
          placeholder="legal@acme.com"
          onChange={(event) => onChange({ noticeAddress: event.target.value })}
        />
      </Field>
    </Fieldset>
  );
}

export default function DocumentForm({
  schema,
  data,
  usStates,
  onChange,
  onReset,
}: {
  schema: DocumentSchema;
  data: DocumentData;
  usStates: readonly string[];
  onChange: (patch: DocumentData) => void;
  onReset: () => void;
}) {
  const set = (key: string, value: FieldValue) => onChange({ [key]: value });
  const text = (field: FieldSchema) => String(data[field.key] ?? "");

  /** The years field that belongs to one option of a choice field, if any. */
  const yearsFor = (field: FieldSchema, optionValue: string) =>
    schema.fields.find(
      (candidate) =>
        candidate.type === "years" &&
        candidate.dependsOn?.field === field.key &&
        candidate.dependsOn.value === optionValue,
    );

  /** Every field except the parties, which become their own blocks. */
  const details = schema.fields.filter(
    (field) => field.type !== "party" && !field.dependsOn,
  );
  const parties = schema.fields.filter((field) => field.type === "party");

  function control(field: FieldSchema): ReactNode {
    const label = field.formLabel ?? field.label;

    switch (field.type) {
      case "choice":
        return (
          <div key={field.key}>
            <span className={labelClass}>{label}</span>
            <div className="space-y-2.5">
              {(field.options ?? []).map((option) => {
                const years = yearsFor(field, option.value);
                return (
                  <ChoiceOption
                    key={option.value}
                    name={field.key}
                    checked={data[field.key] === option.value}
                    onSelect={() => set(field.key, option.value)}
                    years={
                      years
                        ? {
                            value: Number(data[years.key] ?? 1),
                            min: years.min ?? 1,
                            max: years.max ?? 99,
                            onChange: (next) => set(years.key, next),
                          }
                        : undefined
                    }
                  >
                    {option.formLabel ?? option.label}
                  </ChoiceOption>
                );
              })}
            </div>
          </div>
        );

      case "state":
        return (
          <Field key={field.key} label={label} hint={field.hint}>
            <select
              className={inputClass}
              value={text(field)}
              onChange={(event) => set(field.key, event.target.value)}
            >
              <option value="">Select a state…</option>
              {usStates.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </Field>
        );

      case "date":
        return (
          <Field key={field.key} label={label} hint={field.hint}>
            <input
              type="date"
              className={inputClass}
              value={text(field)}
              onChange={(event) => set(field.key, event.target.value)}
            />
          </Field>
        );

      default:
        return (
          <Field key={field.key} label={label} hint={field.hint}>
            {field.multiline ? (
              <textarea
                rows={3}
                className={inputClass}
                value={text(field)}
                placeholder={field.placeholder}
                onChange={(event) => set(field.key, event.target.value)}
              />
            ) : (
              <input
                className={inputClass}
                value={text(field)}
                placeholder={field.placeholder}
                onChange={(event) => set(field.key, event.target.value)}
              />
            )}
          </Field>
        );
    }
  }

  return (
    <form className="space-y-6" onSubmit={(event) => event.preventDefault()}>
      <Fieldset title={schema.formSectionTitle ?? "Agreement details"}>
        {details.map(control)}
      </Fieldset>

      {parties.map((field) => {
        const value = data[field.key];
        const party = isParty(value) ? value : emptyParty();
        return (
          <PartyFields
            key={field.key}
            label={field.label}
            party={party}
            onChange={(patch) => set(field.key, { ...party, ...patch })}
          />
        );
      })}

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
