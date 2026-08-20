/**
 * The shared look of the app chrome.
 *
 * These existed three times over before PL-7: the sign-in screen's primary
 * button was `brand-navy`, the Download and Send buttons were `slate-900`, and
 * the review form's inputs focused to `slate-900` while the composer's focused
 * to `brand-blue`. Same roles, different answers, which reads as two products
 * stitched together. One definition each now.
 *
 * The agreement itself is deliberately not styled from here — it keeps its
 * paper look in both themes and in print, and gets its rules from globals.css.
 */

/** The one primary action: sign in, download, send. */
export const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-md bg-brand-navy px-4 py-2 " +
  "text-sm font-medium text-white shadow-sm transition hover:bg-brand-blue " +
  "focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "dark:bg-brand-blue dark:hover:bg-brand-navy";

/** A quiet action that should not look like a button at all. */
export const linkButton =
  "rounded text-sm font-medium text-brand-blue underline-offset-2 transition " +
  "hover:underline focus-visible:ring-2 focus-visible:ring-brand-blue/30 " +
  "focus-visible:outline-none";

export const input =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "shadow-sm transition outline-none placeholder:text-slate-400 " +
  "focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 " +
  "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

export const label =
  "mb-1.5 block text-xs font-semibold tracking-wide text-slate-700 uppercase " +
  "dark:text-slate-300";

/** Guidance under a field, and other small print in the chrome. */
export const hint = "text-xs text-slate-500 dark:text-slate-400";

/** A raised surface: the sign-in form, a panel, a document in the list. */
export const card =
  "rounded-lg border border-slate-200 bg-white shadow-sm " +
  "dark:border-slate-800 dark:bg-slate-900";
