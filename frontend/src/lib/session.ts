/**
 * The signed-in user and the token that proves it, kept in localStorage.
 *
 * The token is what the API actually trusts; the user is here so the chrome
 * can say who is signed in without asking. Both arrive together from
 * `/api/auth/*` and are cleared together.
 *
 * localStorage rather than a cookie because the frontend is a static export
 * served by the same process as the API: there is no server render that could
 * read a cookie, and every authenticated call is made from JavaScript anyway.
 */

import type { User } from "./api";

const STORAGE_KEY = "prelegal.session";

/** A signed-in session: who, and the proof. */
export interface Session {
  user: User;
  token: string;
}

/**
 * The stored session exactly as localStorage holds it, or null.
 *
 * A string is a stable value to compare, which is what `useSyncExternalStore`
 * needs from a snapshot — parsing here would hand back a fresh object every
 * render and loop forever. See RequireSession.
 */
export function sessionSnapshot(): string | null {
  return window.localStorage.getItem(STORAGE_KEY);
}

/** Reads the stored session, or null if nobody is signed in. */
export function readSession(): Session | null {
  const stored = sessionSnapshot();
  if (!stored) return null;

  try {
    const session = JSON.parse(stored) as Partial<Session>;
    // A session without a token cannot authenticate anything, so it is no
    // more use than no session at all.
    if (!session?.token || !session.user) {
      clearSession();
      return null;
    }
    return session as Session;
  } catch {
    // A corrupt entry is not worth surfacing; treat it as signed out.
    clearSession();
    return null;
  }
}

/** The bearer token for the current session, if there is one. */
export function readToken(): string | null {
  return readSession()?.token ?? null;
}

export function writeSession(session: Session): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
