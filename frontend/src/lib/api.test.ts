import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  UNAUTHORIZED_EVENT,
  listDocuments,
  saveDocumentFields,
  signIn,
  signUp,
  startDocument,
} from "./api";
import { readSession, writeSession, type Session } from "./session";

const USER = { id: 1, email: "ada@example.com", created_at: "2026-08-17" };
const SESSION: Session = { user: USER, token: "a-bearer-token" };
const CREDENTIALS = { email: "ada@example.com", password: "irrelevant" };

function respondWith(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

/** The options object the last fetch was called with. */
function lastCall() {
  return vi.mocked(fetch).mock.calls[0][1] as RequestInit;
}

describe("api", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", respondWith(200, SESSION));
  });
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

  it("returns the session the API sent back", async () => {
    await expect(signIn(CREDENTIALS)).resolves.toEqual(SESSION);
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

  describe("the bearer token", () => {
    it("is attached to every call once there is a session", async () => {
      // Every call, without any call site remembering to: forgetting would
      // look like a bug in the feature rather than in the plumbing.
      writeSession(SESSION);

      await listDocuments();

      expect(lastCall().headers).toMatchObject({
        Authorization: "Bearer a-bearer-token",
      });
    });

    it("is left off when nobody is signed in", async () => {
      await signIn(CREDENTIALS);

      expect(lastCall().headers).not.toHaveProperty("Authorization");
    });

    it("is not sent to sign-in, which is what issues it", async () => {
      writeSession(SESSION);

      await signIn(CREDENTIALS);

      expect(lastCall().headers).toMatchObject({
        Authorization: "Bearer a-bearer-token",
      });
    });
  });

  describe("when the API rejects the token", () => {
    beforeEach(() => {
      writeSession(SESSION);
      vi.stubGlobal("fetch", respondWith(401, { detail: "Sign in to continue." }));
    });

    it("clears the session", async () => {
      await expect(listDocuments()).rejects.toThrow();

      expect(readSession()).toBeNull();
    });

    it("announces it, so the guard can send the user back", async () => {
      const heard = vi.fn();
      window.addEventListener(UNAUTHORIZED_EVENT, heard);

      await expect(listDocuments()).rejects.toThrow();

      expect(heard).toHaveBeenCalledTimes(1);
      window.removeEventListener(UNAUTHORIZED_EVENT, heard);
    });

    it("says nothing when there was no session to lose", async () => {
      // A 401 from sign-in means the password was wrong, not that a session
      // ended. Announcing it would bounce the user off the sign-in screen.
      window.localStorage.clear();
      const heard = vi.fn();
      window.addEventListener(UNAUTHORIZED_EVENT, heard);

      await expect(signIn(CREDENTIALS)).rejects.toThrow();

      expect(heard).not.toHaveBeenCalled();
      window.removeEventListener(UNAUTHORIZED_EVENT, heard);
    });
  });

  describe("documents", () => {
    beforeEach(() => writeSession(SESSION));

    it("starts one for the chosen agreement", async () => {
      await startDocument("mutual-nda");

      expect(fetch).toHaveBeenCalledWith(
        "/api/documents",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ documentType: "mutual-nda" }),
        }),
      );
    });

    it("replaces the fields of one that exists", async () => {
      await saveDocumentFields(7, { governingLaw: "Delaware" });

      expect(fetch).toHaveBeenCalledWith(
        "/api/documents/7/fields",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ fields: { governingLaw: "Delaware" } }),
        }),
      );
    });

    it("asks for the list without a body", async () => {
      await listDocuments();

      expect(lastCall()).not.toHaveProperty("body");
      expect(lastCall().method).toBe("GET");
    });
  });
});
