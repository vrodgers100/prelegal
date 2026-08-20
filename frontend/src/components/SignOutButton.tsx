"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/api";
import { clearSession } from "@/lib/session";

/**
 * Ends the session and returns to the sign-in screen.
 *
 * The server is told, so the token stops working rather than merely being
 * forgotten — otherwise signing out on a shared machine would leave a working
 * token behind in anyone's reach. The local session is cleared either way: if
 * the request fails, the user still asked to be signed out, and a token we can
 * no longer reach is not a reason to keep them signed in.
 */
export default function SignOutButton() {
  const router = useRouter();

  async function leave() {
    try {
      await signOut();
    } catch {
      // Nothing to tell the user: they are being signed out regardless.
    } finally {
      clearSession();
      router.replace("/");
    }
  }

  return (
    <button
      type="button"
      onClick={leave}
      className="rounded text-xs font-medium text-slate-500 underline-offset-2 transition hover:text-slate-900 hover:underline focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:outline-none dark:text-slate-400 dark:hover:text-slate-100"
    >
      Sign out
    </button>
  );
}
