"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { sessionSnapshot } from "@/lib/session";

/**
 * Keeps signed-out visitors out of the platform.
 *
 * The check runs in the browser because the session lives in localStorage and
 * the pages are statically exported — there is no server render that could know
 * who is asking. Reading it through useSyncExternalStore gives a null server
 * snapshot and the real value on the client, so children stay hidden until a
 * session is confirmed and the app never flashes into view before the redirect.
 * Storage is never watched for changes, hence the no-op subscribe.
 */
const subscribeToNothing = () => () => {};
const noSessionOnServer = () => null;

export default function RequireSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const session = useSyncExternalStore(
    subscribeToNothing,
    sessionSnapshot,
    noSessionOnServer,
  );

  useEffect(() => {
    if (!session) router.replace("/");
  }, [session, router]);

  if (!session) return null;

  return <>{children}</>;
}
