import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, signIn, signUp } from "./api";

const USER = { id: 1, email: "ada@example.com", created_at: "2026-08-17" };
const CREDENTIALS = { email: "ada@example.com", password: "irrelevant" };

function respondWith(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe("api", () => {
  beforeEach(() => vi.stubGlobal("fetch", respondWith(200, USER)));
  afterEach(() => vi.unstubAllGlobals());

  it("posts credentials to the sign-in endpoint", async () => {
    await signIn(CREDENTIALS);

    expect(fetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(CREDENTIALS),
    });
  });

  it("posts credentials to the sign-up endpoint", async () => {
    await signUp(CREDENTIALS);

    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/signup",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns the user the API sent back", async () => {
    await expect(signIn(CREDENTIALS)).resolves.toEqual(USER);
  });

  it("raises the API's own message for a rejected request", async () => {
    vi.stubGlobal(
      "fetch",
      respondWith(409, { detail: "That email is already registered." }),
    );

    await expect(signUp(CREDENTIALS)).rejects.toThrow(
      "That email is already registered.",
    );
  });

  it("carries the status on the error", async () => {
    vi.stubGlobal("fetch", respondWith(409, { detail: "Taken." }));

    await expect(signUp(CREDENTIALS)).rejects.toMatchObject(
      new ApiError(409, "Taken."),
    );
  });

  it("falls back to the status when the body has no detail", async () => {
    vi.stubGlobal("fetch", respondWith(500, "not json at all"));

    await expect(signIn(CREDENTIALS)).rejects.toThrow("Request failed (500).");
  });
});
