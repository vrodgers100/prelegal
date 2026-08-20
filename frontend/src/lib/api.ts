/**
 * Calls to the Prelegal API.
 *
 * The app is served by the same FastAPI process that exposes /api, so requests
 * are same-origin by default. `NEXT_PUBLIC_API_BASE` exists for `next dev`,
 * which serves the frontend on its own port and needs an absolute base.
 *
 * Every call goes through `request`, which attaches the bearer token when
 * there is one. That is deliberate: no call site should have to remember, and
 * forgetting would look like a bug in the feature rather than in the plumbing.
 */

import type { ChatMessage, ChatTurn } from "./chat";
import type { DocumentData } from "./documents";
import { clearSession, readToken, type Session } from "./session";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/**
 * Fired when the API rejects our token.
 *
 * The database is dropped on every server restart, which invalidates every
 * session, so this is a normal thing to happen mid-visit rather than an
 * exceptional one. RequireSession listens and sends the user back to sign in;
 * this module stays out of routing.
 */
export const UNAUTHORIZED_EVENT = "prelegal:unauthorized";

/** A signed-in user, as `/api/auth/*` returns one. */
export interface User {
  id: number;
  email: string;
  created_at: string;
}

/** A saved document as the list shows it. */
export interface DocumentSummary {
  id: number;
  documentType: string;
  createdAt: string;
  updatedAt: string;
}

/** A saved document, with enough to put it back on screen. */
export interface SavedDocument extends DocumentSummary {
  fields: DocumentData;
}

/** Raised when the API answers with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = readToken();
  const response = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    // A rejected token means the session is gone, whatever the caller was
    // doing. Drop it once, here, so no screen is left showing a signed-in
    // shell it cannot fill.
    if (response.status === 401 && token) {
      clearSession();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(response.status, await errorMessage(response));
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** Pulls FastAPI's `detail` out of an error body, falling back to the status. */
async function errorMessage(response: Response): Promise<string> {
  const detail: unknown = await response
    .json()
    .then((body) => (body as { detail?: unknown }).detail)
    .catch(() => undefined);

  return typeof detail === "string" ? detail : `Request failed (${response.status}).`;
}

export interface Credentials {
  email: string;
  password: string;
}

/** Registers a new user and signs them in. Rejects with 409 if the email is taken. */
export function signUp(credentials: Credentials): Promise<Session> {
  return request<Session>("POST", "/auth/signup", credentials);
}

/** Signs in. Rejects with 401 if the email or password is wrong. */
export function signIn(credentials: Credentials): Promise<Session> {
  return request<Session>("POST", "/auth/login", credentials);
}

/** Ends this session on the server. Signing out twice is not an error. */
export function signOut(): Promise<void> {
  return request<void>("POST", "/auth/logout");
}

/**
 * Sends one turn of the drafting conversation.
 *
 * The whole transcript and the document as it currently stands go up every
 * time: the API keeps no session, so the browser is the only thing that
 * remembers. Answers with a 503 when the assistant has no API key configured.
 *
 * A null `documentType` asks which agreement to draft; the reply carries the
 * one it settled on, if it settled on any.
 */
export function sendChat(
  messages: ChatMessage[],
  documentType: string | null,
  fields: DocumentData,
): Promise<ChatTurn> {
  return request<ChatTurn>("POST", "/chat", { messages, documentType, fields });
}

/** Starts saving a new document. */
export function startDocument(documentType: string): Promise<SavedDocument> {
  return request<SavedDocument>("POST", "/documents", { documentType });
}

/** Replaces a saved document's fields. This is what autosave calls. */
export function saveDocumentFields(
  id: number,
  fields: DocumentData,
): Promise<SavedDocument> {
  return request<SavedDocument>("PUT", `/documents/${id}/fields`, { fields });
}

/** The signed-in user's documents, most recently worked on first. */
export function listDocuments(): Promise<DocumentSummary[]> {
  return request<DocumentSummary[]>("GET", "/documents");
}

/** Reads one saved document back. */
export function getDocument(id: number): Promise<SavedDocument> {
  return request<SavedDocument>("GET", `/documents/${id}`);
}
