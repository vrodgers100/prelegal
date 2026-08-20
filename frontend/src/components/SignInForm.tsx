"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, signIn, signUp } from "@/lib/api";
import { writeSession } from "@/lib/session";
import { card, hint, input, label, linkButton, primaryButton } from "@/lib/ui";
import { Wordmark } from "./AppShell";

type Mode = "signin" | "signup";

const COPY = {
  signin: {
    heading: "Sign in",
    lead: "Pick up where you left off.",
    submit: "Sign in",
    busy: "Signing in…",
    switchPrompt: "New to Prelegal?",
    switchAction: "Create an account",
  },
  signup: {
    heading: "Create your account",
    lead: "Draft an agreement in a conversation, then download it.",
    submit: "Create account",
    busy: "Creating account…",
    switchPrompt: "Already have an account?",
    switchAction: "Sign in",
  },
} as const;

/** The shortest password the API accepts, said here so the form can say so. */
const MIN_PASSWORD = 8;

/**
 * The sign-in screen.
 *
 * Real credentials since PL-7: the password is hashed, stored and checked, and
 * an unknown email is no longer registered on the way past — you sign up or
 * you sign in, and the form says which it is doing.
 *
 * The one thing it goes out of its way to be honest about is how long an
 * account lasts. The database is a scratch store dropped whenever the server
 * restarts; a product that quietly loses your work is worse than one that says
 * it might.
 */
export default function SignInForm() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const hintId = useId();

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Wordmark className="scale-125" />
          <p className={`mt-3 ${hint}`}>
            Draft legal agreements from vetted templates.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className={`${card} p-6`}
        >
          <h1 className="text-base font-semibold tracking-tight">{copy.heading}</h1>
          <p className={`mt-1 mb-5 ${hint}`}>{copy.lead}</p>

          <div className="space-y-4">
            <label className="block" htmlFor={emailId}>
              <span className={label}>Email</span>
              <input
                id={emailId}
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={input}
                placeholder="you@company.com"
              />
            </label>

            {/* The hint sits outside the label deliberately: inside, it would
                become part of the field's accessible name, so the password
                box would announce itself as "Password At least 8 characters".
                `aria-describedby` attaches it without that. */}
            <div>
              <label className="block" htmlFor={passwordId}>
                <span className={label}>Password</span>
                <input
                  id={passwordId}
                  type="password"
                  required
                  minLength={MIN_PASSWORD}
                  aria-describedby={mode === "signup" ? hintId : undefined}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={input}
                />
              </label>
              {mode === "signup" ? (
                <p id={hintId} className={`mt-1.5 ${hint}`}>
                  At least {MIN_PASSWORD} characters.
                </p>
              ) : null}
            </div>
          </div>

          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={busy} className={`mt-6 w-full ${primaryButton}`}>
            {busy ? copy.busy : copy.submit}
          </button>

          <p className={`mt-4 text-center ${hint}`}>
            {copy.switchPrompt}{" "}
            <button type="button" onClick={switchMode} className={linkButton}>
              {copy.switchAction}
            </button>
          </p>
        </form>

        <p className={`mt-6 text-center ${hint}`}>
          Preview build — accounts and saved documents are cleared whenever the
          server restarts.
        </p>
      </div>
    </main>
  );
}
