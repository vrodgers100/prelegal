"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ApiError, sendChat } from "@/lib/api";
import { GREETING, type ChatMessage, type DocumentUpdates } from "@/lib/chat";
import type { DocumentData } from "@/lib/documents";

/**
 * The drafting conversation.
 *
 * Owns the transcript; the agreement itself belongs to DocumentCreator, which
 * is handed each turn's findings through `onUpdates`. A failed turn puts the
 * message back in the composer rather than stranding it in the transcript, so
 * "send" is always the way to retry.
 *
 * While `documentType` is null the conversation is working out which agreement
 * to draft; `onDocumentType` fires once it has.
 */
export default function DocumentChat({
  documentType,
  data,
  onUpdates,
  onDocumentType,
}: {
  documentType: string | null;
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

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [messages, pending]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || pending) return;

    const asked: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(asked);
    setDraft("");
    setPending(true);
    setError(null);

    try {
      const turn = await sendChat(asked, documentType, data);
      setMessages([...asked, { role: "assistant", content: turn.reply }]);

      if (!documentType && turn.documentType) onDocumentType(turn.documentType);
      onUpdates(turn.updates);
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
      // Back to the composer, so a conversation is one uninterrupted stream of
      // typing. The textarea is disabled while the turn is in flight, and a
      // disabled element cannot hold focus, so this has to run after it is
      // enabled again — hence the timeout rather than a bare focus() call.
      setTimeout(() => composer.current?.focus(), 0);
    }
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
          className="w-full flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition outline-none placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-blue"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-slate-900/30 focus-visible:outline-none disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Send
        </button>
      </form>
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
