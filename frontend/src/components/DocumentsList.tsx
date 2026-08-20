"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listDocuments, type DocumentSummary } from "@/lib/api";
import type { DocumentSchema } from "@/lib/documents";
import { formatTimestamp } from "@/lib/format";
import { card, hint, primaryButton } from "@/lib/ui";

/**
 * Everything the signed-in user has drafted, most recent first.
 *
 * The list carries a name and a date and nothing else — the summaries the API
 * returns leave the fields out, so opening thirty documents' worth of contents
 * is not the price of looking at a list of thirty names.
 *
 * `schemas` comes from the build, which is what lets a row say "Mutual
 * Non-Disclosure Agreement" rather than "mutual-nda" without another request.
 */
export default function DocumentsList({ schemas }: { schemas: DocumentSchema[] }) {
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listDocuments()
      .then((found) => !cancelled && setDocuments(found))
      // A 401 has already cleared the session and RequireSession is about to
      // redirect, so this only has to cover the ordinary failures.
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
    };
  }, []);

  const nameOf = (documentType: string) =>
    schemas.find((schema) => schema.documentType === documentType)?.name ?? documentType;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Your documents</h1>
        <p className={`mt-1 ${hint}`}>
          Everything you have drafted, saved as you go. They are cleared when the
          server restarts.
        </p>
      </header>

      {failed ? (
        <p role="alert" className={`${card} px-5 py-4 text-sm`}>
          Your documents could not be loaded. Try again in a moment.
        </p>
      ) : documents === null ? (
        <p role="status" className={hint}>
          Loading your documents…
        </p>
      ) : documents.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-3">
          {documents.map((document) => (
            <li key={document.id}>
              <Link
                href={`/app?open=${document.id}`}
                className={`${card} flex items-center justify-between gap-4 px-5 py-4 transition hover:border-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue/30 focus-visible:outline-none`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {nameOf(document.documentType)}
                  </span>
                  <span className={`mt-0.5 block ${hint}`}>
                    Last edited {formatTimestamp(document.updatedAt)}
                  </span>
                </span>
                <span aria-hidden="true" className="text-brand-blue">
                  →
                </span>
                <span className="sr-only">Open this draft</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Empty() {
  return (
    <div className={`${card} px-6 py-10 text-center`}>
      <p className="text-sm font-medium">You have not drafted anything yet.</p>
      <p className={`mt-1 ${hint}`}>
        Start a conversation and your draft will be saved here as you go.
      </p>
      <Link href="/app" className={`mt-5 ${primaryButton}`}>
        Draft an agreement
      </Link>
    </div>
  );
}
