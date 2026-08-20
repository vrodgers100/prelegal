import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "./api";
import {
  clearSession,
  readSession,
  readToken,
  sessionSnapshot,
  writeSession,
  type Session,
} from "./session";

const USER: User = { id: 1, email: "ada@example.com", created_at: "2026-08-17" };
const SESSION: Session = { user: USER, token: "a-bearer-token" };
const KEY = "prelegal.session";

describe("session", () => {
  beforeEach(() => window.localStorage.clear());

  it("reads back what it wrote", () => {
    writeSession(SESSION);

    expect(readSession()).toEqual(SESSION);
  });

  it("reports nobody when nothing was stored", () => {
    expect(readSession()).toBeNull();
  });

  it("clears the stored session", () => {
    writeSession(SESSION);

    clearSession();

    expect(readSession()).toBeNull();
  });

  it("treats a corrupt entry as signed out and discards it", () => {
    window.localStorage.setItem(KEY, "{not json");

    expect(readSession()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("treats a session with no token as signed out", () => {
    // A token is the only part the API trusts, so a session without one
    // cannot do anything a signed-out visitor could not.
    window.localStorage.setItem(KEY, JSON.stringify({ user: USER }));

    expect(readSession()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

describe("readToken", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns the token of the stored session", () => {
    writeSession(SESSION);

    expect(readToken()).toBe("a-bearer-token");
  });

  it("is null when nobody is signed in", () => {
    expect(readToken()).toBeNull();
  });
});

describe("sessionSnapshot", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns the same value on repeated reads, as a store snapshot must", () => {
    writeSession(SESSION);

    expect(sessionSnapshot()).toBe(sessionSnapshot());
  });

  it("is null when nobody is signed in", () => {
    expect(sessionSnapshot()).toBeNull();
  });
});
