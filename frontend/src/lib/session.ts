/**
 * The signed-in user, kept in localStorage.
 *
 * V1 has no authentication, so there is no token or cookie to manage — the
 * session is just a note of who walked in. Real sessions arrive with real
 * sign-in.
 */

import type { User } from "./api";

const STORAGE_KEY = "prelegal.user";

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

/** Reads the stored user, or null if nobody is signed in. */
export function readSession(): User | null {
  const stored = sessionSnapshot();
  if (!stored) return null;

  try {
    return JSON.parse(stored) as User;
  } catch {
    // A corrupt entry is not worth surfacing; treat it as signed out.
    clearSession();
    return null;
  }
}

export function writeSession(user: User): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
