import { beforeEach, describe, expect, it } from "vitest";
import type { User } from "./api";
import {
  clearSession,
  readSession,
  sessionSnapshot,
  writeSession,
} from "./session";

const USER: User = { id: 1, email: "ada@example.com", created_at: "2026-08-17" };

describe("session", () => {
  beforeEach(() => window.localStorage.clear());

  it("reads back what it wrote", () => {
    writeSession(USER);

    expect(readSession()).toEqual(USER);
  });

  it("reports nobody when nothing was stored", () => {
    expect(readSession()).toBeNull();
  });

  it("clears the stored user", () => {
    writeSession(USER);

    clearSession();

    expect(readSession()).toBeNull();
  });

  it("treats a corrupt entry as signed out and discards it", () => {
    window.localStorage.setItem("prelegal.user", "{not json");

    expect(readSession()).toBeNull();
    expect(window.localStorage.getItem("prelegal.user")).toBeNull();
  });
});

describe("sessionSnapshot", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns the same value on repeated reads, as a store snapshot must", () => {
    writeSession(USER);

    expect(sessionSnapshot()).toBe(sessionSnapshot());
  });

  it("is null when nobody is signed in", () => {
    expect(sessionSnapshot()).toBeNull();
  });
});
