"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { UNAUTHORIZED_EVENT } from "@/lib/api";
import { sessionSnapshot } from "@/lib/session";

/**
 * Watches for the session ending under us.
 *
 * The API clears the stored session and fires this when it is told a token is
 * no good, which is routine rather than exceptional: the database is dropped
 * on every server restart, so a session can end while the page is still open.
 */
function subscribeToSession(onChange: () => void) {
  window.addEventListener(UNAUTHORIZED_EVENT, onChange);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, onChange);
}

/**
 * Whether the browser has taken over from the prerendered HTML.
 *
 * A store rather than a piece of state, so it costs no effect and no extra
 * render pass: the server snapshot is false, the client snapshot is true, and
 * React swaps them at exactly the moment hydration finishes.
 */
const notYet = () => false;
const byNow = () => true;
const subscribeToNothing = () => () => {};

const noSessionOnServer = () => null;

/**
 * Keeps signed-out visitors out of the platform.
 *
 * The check runs in the browser because the session lives in localStorage and
 * the pages are statically exported — there is no server render that could
 * know who is asking.
 *
 * Hydration is tracked separately from the session, and that is the whole
 * point. Before PL-7 this component redirected whenever the session read as
 * null, which during the hydration commit it always does — the store's server
 * snapshot is null by definition. So a direct load of /app signed you out: a
 * reload, a bookmark or a pasted link all bounced to the sign-in screen, and
 * only arriving from the form worked. Waiting for `hydrated` distinguishes
 * "nobody is signed in" from "we have not looked yet".
 */
export default function RequireSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeToNothing, byNow, notYet);
  const session = useSyncExternalStore(
    subscribeToSession,
    sessionSnapshot,
    noSessionOnServer,
  );

  useEffect(() => {
    if (hydrated && !session) router.replace("/");
  }, [hydrated, session, router]);

  if (!hydrated) return <Checking />;
  if (!session) return null;

  return <>{children}</>;
}

/**
 * Shown for the moment it takes to read the session.
 *
 * Brief, but a blank page that then jumps is worse than a quiet one that
 * settles, and on a slow device the moment is not that brief.
 */
function Checking() {
  return (
    <div
      role="status"
      className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950"
    >
      <span className="sr-only">Loading Prelegal</span>
      <span aria-hidden="true" className="flex gap-1.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            style={{ animationDelay: `${delay}ms` }}
            className="size-2 animate-bounce rounded-full bg-brand-blue/60"
          />
        ))}
      </span>
    </div>
  );
}
