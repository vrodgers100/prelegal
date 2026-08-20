"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import DocumentChat from "./DocumentChat";
import DocumentCoverPage from "./DocumentCoverPage";
import DocumentForm from "./DocumentForm";
import {
  createEmptyDocument,
  missingFieldLabels,
  withToday,
  type DocumentData,
  type DocumentSchema,
} from "@/lib/documents";
import { getDocument } from "@/lib/api";
import { applyUpdates, type DocumentUpdates } from "@/lib/chat";
import { todayInputValue } from "@/lib/format";
import { card, primaryButton } from "@/lib/ui";
import { useAutosave, type SaveStatus } from "@/lib/useAutosave";

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
 * Which saved document the URL asks for, if any.
 *
 * Read from `window.location` through the same no-op-subscribe idiom as the
 * clock above, rather than with `useSearchParams`. That hook would force this
 * page under a Suspense boundary — a statically prerendered page that calls it
 * without one builds fine in development and fails the production build, which
 * is a poor way to find out.
 */
function readOpenId(): string {
  return new URLSearchParams(window.location.search).get("open") ?? "";
}

const noQueryOnServer = () => "";

function useRequestedDocument(): number | null {
  const raw = useSyncExternalStore(subscribeToNothing, readOpenId, noQueryOnServer);
  const id = Number(raw);
  return raw && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The agreement creator: a conversation with the drafting assistant on the
 * left, a live preview of the agreement on the right, and a download that goes
 * through the browser's print dialog (choose "Save as PDF").
 *
 * The page opens on the conversation and the catalogue, because which
 * agreement is being drafted is itself something to talk about — but not
 * something to guess at.
 *
 * The agreement lives here rather than in the chat, so what the assistant
 * learns and what the user types into the review panel land in one place. The
 * assistant sends only the fields it picked up, which is what keeps a reply
 * from overwriting an edit made while the message was in flight.
 *
 * Since PL-7 it is also saved as it goes. `useAutosave` owns that entirely:
 * this component still just holds `documentType` and `data`, and never learns
 * that a network exists.
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
  const requested = useRequestedDocument();

  const [documentType, setDocumentType] = useState<string | null>(null);
  const [data, setData] = useState<DocumentData>({});
  const [resuming, setResuming] = useState<number | null>(null);
  const [reopenFailed, setReopenFailed] = useState(false);
  const today = useToday();

  // Reopen whatever /documents sent us to. The fields go in exactly as they
  // were stored: `withToday` is applied for display below, never saved, so a
  // date the user never chose does not become one they did.
  useEffect(() => {
    if (requested === null) return;

    let cancelled = false;
    getDocument(requested)
      .then((saved) => {
        if (cancelled) return;
        setDocumentType(saved.documentType);
        setData(saved.fields);
        setResuming(saved.id);
      })
      .catch(() => {
        if (!cancelled) setReopenFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [requested]);

  const { status } = useAutosave(documentType, data, resuming);

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
    // A different agreement is a different document, not an edit to this one.
    setResuming(null);
  };

  const update = (patch: DocumentData) =>
    setData((current) => ({ ...current, ...patch }));

  const learn = (updates: DocumentUpdates) =>
    setData((current) => (schema ? applyUpdates(schema, current, updates, usStates) : current));

  // Waiting on a document we were asked to reopen: showing the catalogue first
  // would flash the wrong screen and invite the user to start something else.
  if (requested !== null && !schema && !reopenFailed) {
    return <Reopening />;
  }

  return (
    <main
      className={`mx-auto grid max-w-7xl gap-8 px-6 py-8 ${
        schema ? "lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]" : "max-w-3xl"
      }`}
    >
      <section aria-label="Agreement details" className="no-print space-y-4 lg:sticky lg:top-32">
        {schema ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-semibold tracking-tight">
                {schema.shortName || schema.name}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Common Paper {schema.name}
              </p>
            </div>
            <SaveState status={status} />
          </div>
        ) : null}

        {reopenFailed ? (
          <p
            role="alert"
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            That document could not be opened. It may have been cleared when the
            server last restarted.
          </p>
        ) : null}

        <div className={`${card} p-4`}>
          <DocumentChat
            documentType={documentType}
            schemas={schemas}
            data={document}
            onUpdates={learn}
            onDocumentType={choose}
          />
        </div>

        {/* The assistant does the filling in, but it can mishear. This is
            how a value gets corrected without arguing with it. */}
        {schema ? (
          <details className={card}>
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
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
            <ReadinessNotice missing={missing} name={schema.shortName || schema.name} />
            <button
              type="button"
              onClick={() => window.print()}
              className={primaryButton}
            >
              Download
            </button>
          </div>
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
  );
}

/** Whether the draft is safely on the server, said quietly. */
function SaveState({ status }: { status: SaveStatus }) {
  if (status === "idle") return null;

  const said = {
    saving: "Saving…",
    saved: "Saved",
    error: "Not saved",
  }[status];

  return (
    <p
      aria-live="polite"
      className={`text-xs ${
        status === "error"
          ? "text-amber-700 dark:text-amber-300"
          : "text-slate-500 dark:text-slate-400"
      }`}
    >
      {said}
    </p>
  );
}

function Reopening() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-center">
      <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
        Opening your document…
      </p>
    </main>
  );
}

/** Tells the user what still needs filling in before the agreement can be signed. */
function ReadinessNotice({ missing, name }: { missing: string[]; name: string }) {
  if (missing.length === 0) {
    return (
      <p className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
        Every field is filled in — this {name} is ready to download and sign.
      </p>
    );
  }

  return (
    <p className="min-w-0 flex-1 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <span className="font-medium">
        {missing.length} {missing.length === 1 ? "field" : "fields"} still to fill in:
      </span>{" "}
      {missing.join(", ")}. They show as placeholders in the document below.
    </p>
  );
}
