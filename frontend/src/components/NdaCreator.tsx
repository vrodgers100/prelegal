"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import NdaCoverPage from "./NdaCoverPage";
import SignOutButton from "./SignOutButton";
import NdaForm from "./NdaForm";
import { createEmptyNda, todayInputValue, type NdaData } from "@/lib/nda";
import { missingFieldLabels } from "@/lib/format";

/**
 * Reads today's date from the viewer's own clock.
 *
 * The page is prerendered, so the build machine's date would be stale by the
 * time anyone loads it, and its time zone need not match the viewer's. Reading
 * the clock through useSyncExternalStore gives an empty server snapshot and the
 * real date on the client, which is exactly the mismatch it exists to handle.
 * The clock is never watched for changes, hence the no-op subscribe.
 */
const subscribeToNothing = () => () => {};
const noDateOnServer = () => "";

function useToday(): string {
  return useSyncExternalStore(subscribeToNothing, todayInputValue, noDateOnServer);
}

/**
 * The Mutual NDA creator: a form on the left, a live preview of the agreement
 * on the right, and a download that goes through the browser's print dialog
 * (choose "Save as PDF").
 *
 * `standardTerms` is rendered on the server and passed in as an element so the
 * markdown renderer never reaches the client bundle.
 */
export default function NdaCreator({ standardTerms }: { standardTerms: ReactNode }) {
  const [data, setData] = useState<NdaData>(createEmptyNda);
  const today = useToday();

  // An unset effective date means today, so a fresh form (and a cleared one)
  // starts out dated correctly without storing a date the user never chose.
  const nda = useMemo(
    () => (data.effectiveDate ? data : { ...data, effectiveDate: today }),
    [data, today],
  );

  const missing = useMemo(() => missingFieldLabels(nda), [nda]);

  const update = (patch: Partial<NdaData>) =>
    setData((current) => ({ ...current, ...patch }));

  return (
    <div className="app-shell min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              Mutual NDA creator
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Common Paper Mutual NDA, Version 1.0
            </p>
          </div>
          <div className="flex items-center gap-4">
            <SignOutButton />
            <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">
              Downloads via your browser&rsquo;s print dialog — choose{" "}
              <span className="font-medium">Save as PDF</span>.
            </p>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-900/30 focus-visible:outline-none dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Download NDA
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-6 py-8 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <section
          aria-label="Agreement details"
          className="no-print lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
        >
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <NdaForm data={nda} onChange={update} onReset={() => setData(createEmptyNda())} />
          </div>
        </section>

        <section aria-label="Agreement preview" className="min-w-0">
          <ReadinessNotice missing={missing} />
          <div id="document" className="space-y-8">
            <div className="doc-page">
              <NdaCoverPage data={nda} />
            </div>
            <div className="doc-page doc-page-break">{standardTerms}</div>
          </div>
        </section>
      </main>
    </div>
  );
}

/** Tells the user what still needs filling in before the NDA can be signed. */
function ReadinessNotice({ missing }: { missing: string[] }) {
  if (missing.length === 0) {
    return (
      <p className="no-print mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        Every field is filled in — this NDA is ready to download and sign.
      </p>
    );
  }

  return (
    <p className="no-print mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <span className="font-medium">
        {missing.length} {missing.length === 1 ? "field" : "fields"} still to fill in:
      </span>{" "}
      {missing.join(", ")}. They show as placeholders in the document below.
    </p>
  );
}
