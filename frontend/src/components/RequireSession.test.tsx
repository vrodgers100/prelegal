import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RequireSession from "./RequireSession";
import { writeSession } from "@/lib/session";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const USER = { id: 1, email: "ada@example.com", created_at: "2026-08-17" };

describe("RequireSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows the app to a signed-in user", () => {
    writeSession(USER);

    render(
      <RequireSession>
        <p>the platform</p>
      </RequireSession>,
    );

    expect(screen.getByText("the platform")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to the sign-in screen", async () => {
    render(
      <RequireSession>
        <p>the platform</p>
      </RequireSession>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("never renders the app to a signed-out visitor", () => {
    render(
      <RequireSession>
        <p>the platform</p>
      </RequireSession>,
    );

    expect(screen.queryByText("the platform")).toBeNull();
  });
});
