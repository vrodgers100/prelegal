import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignInForm from "./SignInForm";
import { readSession } from "@/lib/session";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const USER = { id: 1, email: "ada@example.com", created_at: "2026-08-17" };

function stubFetch(status = 200, body: unknown = USER) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "ada@example.com");
  await user.type(screen.getByLabelText("Password"), "irrelevant");
}

describe("SignInForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("signs in, stores the session and enters the platform", async () => {
    const fetchMock = stubFetch();
    const user = userEvent.setup();
    render(<SignInForm />);

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/app"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/login");
    expect(readSession()).toEqual(USER);
  });

  it("calls the sign-up endpoint once the user switches mode", async () => {
    const fetchMock = stubFetch(201);
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/auth/signup");
  });

  it("shows the API's rejection and stays put", async () => {
    stubFetch(409, { detail: "That email is already registered." });
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That email is already registered.",
    );
    expect(push).not.toHaveBeenCalled();
    expect(readSession()).toBeNull();
  });

  it("explains an unreachable server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed")));
    const user = userEvent.setup();
    render(<SignInForm />);

    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server.",
    );
  });

  it("clears a stale error when switching mode", async () => {
    stubFetch(409, { detail: "That email is already registered." });
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await fillIn(user);
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
