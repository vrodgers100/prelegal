"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ApiError, sendChat } from "@/lib/api";
import { GREETING, type ChatMessage, type DocumentUpdates } from "@/lib/chat";
import type { DocumentData, DocumentSchema } from "@/lib/documents";
import { input, primaryButton } from "@/lib/ui";

/**
 * The drafting conversation.
 *
 * Owns the transcript; the agreement itself belongs to DocumentCreator, which
 * is handed each turn's findings through `onUpdates`. A failed turn puts the
 * message back in the composer rather than stranding it in the transcript, so
 * "send" is always the way to retry.
 *
 * While `documentType` is null the conversation is working out which agreement
 * to draft; `onDocumentType` fires once it has. Until then the catalogue sits
 * at the end of the transcript, because asking is otherwise the only way to
 * find out what Prelegal drafts — and with no API key configured, the only way
 * to open a document at all.
 */
export default function DocumentChat({
  documentType,
  schemas,
  data,
  onUpdates,
  onDocumentType,
}: {
  documentType: string | null;
  schemas: DocumentSchema[];
  data: DocumentData;
  onUpdates: (updates: DocumentUpdates) => void;
  onDocumentType: (documentType: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  // Keep the newest message in view as the conversation grows. Not on the
  // opening screen, though: there the catalogue fills the panel, and scrolling
  // to its end would put the greeting out of sight before it has been read.
  useEffect(() => {
    if (messages.length > 1) {
      transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
    }
  }, [messages, pending]);

  // Leave the caret in the composer, so answering the next question is just
  // typing. The textarea is disabled while a turn is in flight and a disabled
  // element cannot take focus, so this has to happen after the render that
  // re-enables it — which is what an effect guarantees. A setTimeout does not:
  // measured in Chrome, it fired 5ms before React cleared the disabled
  // attribute, and the focus() call was silently dropped every time.
  useEffect(() => {
    if (!pending) composer.current?.focus();
  }, [pending]);

  /**
   * Sends one message and folds the answer back in.
   *
   * `about` is passed rather than read from the prop because picking from the
   * catalogue opens the document and sends its first message in the same tick,
   * before the new prop has arrived.
   */
  async function submit(content: string, about: string | null) {
    if (!content || pending) return;

    const asked: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(asked);
    setDraft("");
    setPending(true);
    setError(null);

    try {
      const turn = await sendChat(asked, about, data);
      setMessages([...asked, { role: "assistant", content: turn.reply }]);

      // A turn that changes the agreement has nothing to merge: what it
      // extracted belonged to the document being left behind.
      if (turn.documentType && turn.documentType !== about) {
        onDocumentType(turn.documentType);
      } else {
        onUpdates(turn.updates);
      }
    } catch (failure) {
      setMessages(messages);
      setDraft(content);
      setError(
        failure instanceof ApiError
          ? failure.message
          : "The assistant could not be reached. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  function send(event: FormEvent) {
    event.preventDefault();
    void submit(draft.trim(), documentType);
  }

  /**
   * Opens the agreement the user clicked, and says so in the conversation.
   *
   * The document appears at once rather than waiting on the round trip, which
   * is what keeps the catalogue working when the assistant is unavailable: the
   * turn then fails visibly and the review form is still there to fill in.
   */
  function pick(schema: DocumentSchema) {
    if (pending) return;
    onDocumentType(schema.documentType);
    void submit(`I need a ${schema.name}.`, schema.documentType);
  }

  // Enter sends; Shift+Enter starts a new line, as a notice address may need.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="flex h-[32rem] flex-col lg:h-[calc(100vh-16rem)]">
      <div
        ref={transcript}
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 space-y-3 overflow-y-auto px-1 py-2"
      >
        {messages.map((message, index) => (
          <Bubble key={index} message={message} />
        ))}
        {pending ? <Typing /> : null}
        {!documentType && !pending ? (
          <Catalogue schemas={schemas} onPick={pick} />
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-l-4 border-amber-200 border-l-brand-yellow bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:border-l-brand-yellow dark:bg-slate-900 dark:text-amber-200"
        >
          {error}
        </p>
      ) : null}

      <form onSubmit={send} className="mt-3 flex items-end gap-2">
        <textarea
          ref={composer}
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={pending}
          aria-label="Message"
          placeholder={
            documentType
              ? "Tell me about the agreement…"
              : "Tell me what you need to draft…"
          }
          className={`w-full flex-1 resize-none ${input}`}
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className={primaryButton}
        >
          Send
        </button>
      </form>
    </div>
  );
}

/**
 * Everything Prelegal drafts, to be picked from rather than asked about.
 *
 * Shown until an agreement is settled. Describing rather than only naming them
 * is the point: "Design Partner Agreement" means nothing to someone who has
 * not met one, and choosing the wrong template is expensive to undo.
 */
function Catalogue({
  schemas,
  onPick,
}: {
  schemas: DocumentSchema[];
  onPick: (schema: DocumentSchema) => void;
}) {
  return (
    <div className="pt-2">
      <p className="px-1 pb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
        The {schemas.length} agreements Prelegal drafts:
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {schemas.map((schema) => (
          <li key={schema.documentType}>
            <button
              type="button"
              onClick={() => onPick(schema)}
              className="h-full w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-brand-blue hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-blue/30 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-blue dark:hover:bg-slate-800"
            >
              {/* Full name, not `shortName`: this is where someone finds out
                  what exists, and "BAA" or "DPA" tells them nothing. The short
                  form is for the header, where space is tight. */}
              <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                {schema.name}
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-slate-500 dark:text-slate-400">
                {schema.description}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === "user";

  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <p
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          mine
            ? "bg-brand-navy text-white"
            : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
        }`}
      >
        <span className="sr-only">{mine ? "You said: " : "Assistant said: "}</span>
        {message.content}
      </p>
    </div>
  );
}

/** Three dots while the assistant reads the message and answers it. */
function Typing() {
  return (
    <div className="flex justify-start">
      <p className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800">
        <span className="sr-only">The assistant is typing</span>
        <span aria-hidden="true" className="flex gap-1">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              style={{ animationDelay: `${delay}ms` }}
              className="size-1.5 animate-bounce rounded-full bg-slate-400 dark:bg-slate-500"
            />
          ))}
        </span>
      </p>
    </div>
  );
}
