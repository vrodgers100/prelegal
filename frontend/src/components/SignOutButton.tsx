"use client";

import { useRouter } from "next/navigation";
import { clearSession } from "@/lib/session";

/** Drops the session and returns to the sign-in screen. */
export default function SignOutButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => {
        clearSession();
        router.replace("/");
      }}
      className="text-xs font-medium text-slate-500 underline-offset-2 transition hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
    >
      Sign out
    </button>
  );
}
