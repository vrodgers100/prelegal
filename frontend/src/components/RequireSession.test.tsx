import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RequireSession from "./RequireSession";
import { UNAUTHORIZED_EVENT } from "@/lib/api";
import { clearSession, writeSession, type Session } from "@/lib/session";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const SESSION: Session = {
  user: { id: 1, email: "ada@example.com", created_at: "2026-08-17" },
  token: "a-bearer-token",
};

function renderGuarded() {
  render(
    <RequireSession>
      <p>the platform</p>
    </RequireSession>,
  );
}

describe("RequireSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows the app to a signed-in user", async () => {
    writeSession(SESSION);

    renderGuarded();

    expect(await screen.findByText("the platform")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps a signed-in user on the page when it loads directly", async () => {
    // The reported defect: a reload or a pasted link bounced you to sign-in,
    // because the guard redirected on the hydration commit, when the store's
    // server snapshot is null, before the real session had been read.
    writeSession(SESSION);

    renderGuarded();

    await screen.findByText("the platform");
    await new Promise((settle) => setTimeout(settle, 20));
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to the sign-in screen", async () => {
    renderGuarded();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("never renders the app to a signed-out visitor", () => {
    renderGuarded();

    expect(screen.queryByText("the platform")).toBeNull();
  });

  it("sends the user back when the API rejects the session", async () => {
    // Routine rather than exceptional: the database is dropped on every
    // server restart, so a token can stop working while the page is open.
    writeSession(SESSION);
    renderGuarded();
    await screen.findByText("the platform");

    // What api.ts does on a 401: drop the session, then say so.
    clearSession();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("the platform")).toBeNull();
  });
});
