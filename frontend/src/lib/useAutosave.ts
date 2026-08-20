"use client";

import { useEffect, useState } from "react";
import { saveDocumentFields, startDocument } from "./api";
import type { DocumentData } from "./documents";

/** How long to wait after the last change before saving. */
const QUIET_MS = 800;

/** What the header shows about the saving, if anything. */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Keeps the document on the server without anyone pressing Save.
 *
 * There is no Save button by design: a draft the user filled in, downloaded
 * and closed should be in their list afterwards, and a button is exactly the
 * thing people do not press. So the record is created the moment an agreement
 * is settled, and rewritten whenever the fields have been quiet for a moment.
 *
 * Saving is debounced rather than throttled because a chat turn arrives as one
 * change and typing in the form arrives as twenty; waiting for the quiet is
 * what makes both cost one request.
 *
 * `resuming` suppresses the create: reopening a saved document already has a
 * row, and creating another would fork it in two every time it was opened.
 */
export function useAutosave(
  documentType: string | null,
  data: DocumentData,
  resuming: number | null = null,
): { documentId: number | null; status: SaveStatus } {
  const [created, setCreated] = useState<number | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");

  // What the server last stored, so a change that is not a change costs
  // nothing. The create seeds it, which is why choosing an agreement does not
  // immediately save back the empty document it just made.
  const [baseline, setBaseline] = useState<string | null>(null);

  // Which draft this is: the one being resumed, or the agreement just chosen.
  // Switching either starts again. The adjustment happens during render, which
  // is React's own answer to "a prop changed and some state is now stale" — in
  // an effect it would first render once against the previous draft's id, and
  // that is long enough to save one document's fields over another's.
  const draft = resuming ?? documentType;
  const [previous, setPrevious] = useState(draft);
  if (previous !== draft) {
    setPrevious(draft);
    setCreated(null);
    setStatus("idle");
    // A resumed document already matches what is stored, so it is its own
    // baseline; a freshly chosen one has nothing saved yet.
    setBaseline(resuming === null ? null : JSON.stringify(data));
  }

  const documentId = resuming ?? created;

  // Start saving as soon as there is something to save.
  useEffect(() => {
    if (!documentType || documentId !== null) return;

    let cancelled = false;
    startDocument(documentType)
      .then((document) => {
        if (cancelled) return;
        setCreated(document.id);
        setBaseline(JSON.stringify(document.fields));
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [documentType, documentId]);

  // Rewrite the fields once they have stopped changing.
  useEffect(() => {
    if (documentId === null) return;

    const next = JSON.stringify(data);
    if (next === baseline) return;

    const timer = setTimeout(() => {
      setStatus("saving");
      saveDocumentFields(documentId, data)
        .then(() => {
          setBaseline(next);
          setStatus("saved");
        })
        .catch(() => setStatus("error"));
    }, QUIET_MS);

    return () => clearTimeout(timer);
  }, [documentId, data, baseline]);

  return { documentId, status };
}
