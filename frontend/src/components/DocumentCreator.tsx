"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import DocumentChat from "./DocumentChat";
import DocumentCoverPage from "./DocumentCoverPage";
import DocumentForm from "./DocumentForm";
import SignOutButton from "./SignOutButton";
import {
  createEmptyDocument,
  missingFieldLabels,
  withToday,
  type DocumentData,
  type DocumentSchema,
} from "@/lib/documents";
import { applyUpdates, type DocumentUpdates } from "@/lib/chat";
import { todayInputValue } from "@/lib/format";

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
 * The agreement creator: a conversation with the drafting assistant on the
 * left, a live preview of the agreement on the right, and a download that goes
 * through the browser's print dialog (choose "Save as PDF").
 *
 * The page opens on the conversation alone, because which agreement is being
 * drafted is itself something to talk about. Once that is settled the document
 * appears beside it.
 *
 * The agreement lives here rather than in the chat, so what the assistant
 * learns and what the user types into the review panel land in one place. The
 * assistant sends only the fields it picked up, which is what keeps a reply
 * from overwriting an edit made while the message was in flight.
 *
 * `standardTerms` holds every agreement's terms, rendered on the server and
 * passed in as elements so the markdown renderer never reaches the client
 * bundle. They are all prerendered because the page is statically exported:
 * there is no server left at the point the user picks one.
 */
export default function DocumentCreator({
  schemas,
  usStates,
  standardTerms,
}: {
  schemas: DocumentSchema[];
  usStates: string[];
  standardTerms: Record<string, ReactNode>;
}) {
  const [documentType, setDocumentType] = useState<string | null>(null);
  const [data, setData] = useState<DocumentData>({});
  const today = useToday();

  const schema = useMemo(
    () => schemas.find((candidate) => candidate.documentType === documentType) ?? null,
    [schemas, documentType],
  );

  const document = useMemo(
    () => (schema ? withToday(schema, data, today) : data),
    [schema, data, today],
  );

  const missing = useMemo(
    () => (schema ? missingFieldLabels(schema, document) : []),
    [schema, document],
  );

  const choose = (chosen: string) => {
    const picked = schemas.find((candidate) => candidate.documentType === chosen);
    if (!picked) return;
    setDocumentType(chosen);
    setData(createEmptyDocument(picked));
  };

  const update = (patch: DocumentData) =>
    setData((current) => ({ ...current, ...patch }));

  const learn = (updates: DocumentUpdates) =>
    setData((current) => (schema ? applyUpdates(schema, current, updates, usStates) : current));

  return (
    <div className="app-shell min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              {schema ? `${schema.shortName ?? schema.name} creator` : "Prelegal"}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {schema
                ? `Common Paper ${schema.name}`
                : "Draft a legal agreement by talking it through"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <SignOutButton />
            {schema ? (
              <>
                <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">
                  Downloads via your browser&rsquo;s print dialog — choose{" "}
                  <span className="font-medium">Save as PDF</span>.
                </p>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-900/30 focus-visible:outline-none dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  Download
                </button>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main
        className={`mx-auto grid max-w-7xl gap-8 px-6 py-8 ${
          schema ? "lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]" : "max-w-3xl"
        }`}
      >
        <section
          aria-label="Agreement details"
          className="no-print space-y-4 lg:sticky lg:top-24"
        >
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <DocumentChat
              documentType={documentType}
              data={document}
              onUpdates={learn}
              onDocumentType={choose}
            />
          </div>

          {/* The assistant does the filling in, but it can mishear. This is
              how a value gets corrected without arguing with it. */}
          {schema ? (
            <details className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <summary className="cursor-pointer px-6 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
                Review fields
                {missing.length > 0 ? (
                  <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
                    ({missing.length} still to fill in)
                  </span>
                ) : null}
              </summary>
              <div className="max-h-[60vh] overflow-y-auto border-t border-slate-200 px-6 py-5 dark:border-slate-800">
                <DocumentForm
                  schema={schema}
                  data={document}
                  usStates={usStates}
                  onChange={update}
                  onReset={() => setData(createEmptyDocument(schema))}
                />
              </div>
            </details>
          ) : null}
        </section>

        {schema ? (
          <section aria-label="Agreement preview" className="min-w-0">
            <ReadinessNotice missing={missing} name={schema.shortName ?? schema.name} />
            <div id="document" className="space-y-8">
              <div className="doc-page">
                <DocumentCoverPage schema={schema} data={document} />
              </div>
              <div className="doc-page doc-page-break">
                {standardTerms[schema.documentType]}
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

/** Tells the user what still needs filling in before the agreement can be signed. */
function ReadinessNotice({ missing, name }: { missing: string[]; name: string }) {
  if (missing.length === 0) {
    return (
      <p className="no-print mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        Every field is filled in — this {name} is ready to download and sign.
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
