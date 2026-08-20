"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import SignOutButton from "./SignOutButton";
import { DRAFT_NOTICE_SHORT } from "@/lib/disclaimer";

/**
 * The chrome every signed-in screen shares: who we are, where you can go, the
 * standing draft notice, and the way out.
 *
 * Before this, the creator built its own header and the sign-in screen built
 * another, so moving between them felt like moving between two products. This
 * owns identity and navigation only — a screen's own actions stay on the
 * screen, which is why `actions` is a slot rather than a list of buttons.
 *
 * `no-print` throughout: the download is the agreement, not the application
 * around it.
 */
export default function AppShell({
  actions,
  children,
}: {
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-shell flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link
            href="/app"
            className="flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:outline-none"
          >
            <Wordmark />
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1">
            <NavLink href="/app">New agreement</NavLink>
            <NavLink href="/documents">Your documents</NavLink>
          </nav>

          <div className="ml-auto flex items-center gap-4">
            {actions}
            <SignOutButton />
          </div>
        </div>

        <p className="border-t border-amber-200/70 bg-amber-50 px-6 py-1.5 text-center text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          {DRAFT_NOTICE_SHORT}
        </p>
      </header>

      <div className="flex-1">{children}</div>
    </div>
  );
}

/**
 * Highlights the screen you are on.
 *
 * `startsWith` rather than equality because the export gives every route a
 * trailing slash, so /app is /app/ by the time it reaches the browser.
 */
function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const here = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={here ? "page" : undefined}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:outline-none ${
        here
          ? "bg-slate-100 text-brand-navy dark:bg-slate-800 dark:text-white"
          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}

/** The Prelegal mark: a document corner in the brand navy, and the name. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-6 text-brand-navy dark:text-brand-blue"
      >
        <path
          fill="currentColor"
          d="M6 2h8l6 6v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"
          opacity="0.15"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          d="M14 2.8H6a1 1 0 0 0-1 1v17.4a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V8.6Z"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
          d="M13.8 2.8v6h6.1"
        />
        <path
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          d="M8.4 13h8.2M8.4 16.6h5.4"
        />
      </svg>
      <span className="text-base font-semibold tracking-tight text-brand-navy dark:text-white">
        Prelegal
      </span>
    </span>
  );
}
