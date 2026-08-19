"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, signIn, signUp } from "@/lib/api";
import { writeSession } from "@/lib/session";

type Mode = "signin" | "signup";

const COPY = {
  signin: {
    heading: "Sign in",
    submit: "Sign in",
    busy: "Signing in…",
    switchPrompt: "New to Prelegal?",
    switchAction: "Create an account",
  },
  signup: {
    heading: "Create your account",
    submit: "Create account",
    busy: "Creating account…",
    switchPrompt: "Already have an account?",
    switchAction: "Sign in",
  },
} as const;

/**
 * The sign-in screen.
 *
 * V1 has no authentication: any email gets you in, and an unrecognised one is
 * registered on the way past. The form still talks to the API and the database
 * so the path is the one real sign-in will use.
 */
export default function SignInForm() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const copy = COPY[mode];

  const switchMode = () => {
    setMode(mode === "signin" ? "signup" : "signin");
    setError("");
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const submit = mode === "signin" ? signIn : signUp;
      writeSession(await submit({ email, password }));
      router.push("/app");
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not reach the server. Is it running?",
      );
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-6 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-brand-navy dark:text-white">
            Prelegal
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Draft legal agreements from vetted templates.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <h2 className="mb-5 text-sm font-semibold">{copy.heading}</h2>

          <div className="space-y-4">
            <label className="block" htmlFor={emailId}>
              <span className={labelClass}>Email</span>
              <input
                id={emailId}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={inputClass}
                placeholder="you@company.com"
              />
            </label>

            <label className="block" htmlFor={passwordId}>
              <span className={labelClass}>Password</span>
              <input
                id={passwordId}
                type="password"
                required
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 w-full rounded-md bg-brand-navy px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue/40 focus-visible:outline-none disabled:opacity-60"
          >
            {busy ? copy.busy : copy.submit}
          </button>

          <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
            {copy.switchPrompt}{" "}
            <button
              type="button"
              onClick={switchMode}
              className="font-medium text-brand-blue underline-offset-2 hover:underline"
            >
              {copy.switchAction}
            </button>
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          Preview build — sign-in is not yet secured, so any email will do.
        </p>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition outline-none placeholder:text-slate-400 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const labelClass =
  "mb-1.5 block text-xs font-semibold tracking-wide text-slate-700 uppercase dark:text-slate-300";
