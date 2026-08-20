import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useAutosave } from "./useAutosave";
import { saveDocumentFields, startDocument } from "./api";
import type { DocumentData } from "./documents";

vi.mock("./api", () => ({
  startDocument: vi.fn(),
  saveDocumentFields: vi.fn(),
}));

const started = vi.mocked(startDocument);
const saved = vi.mocked(saveDocumentFields);

/** A saved document as the API returns one. */
function record(id: number, fields: DocumentData = {}) {
  return {
    id,
    documentType: "mutual-nda",
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-20T10:00:00.000Z",
    fields,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  started.mockResolvedValue(record(7));
  saved.mockResolvedValue(record(7));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** Lets pending promises settle while the clock is frozen. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Waits out the debounce and lets the save settle.
 *
 * Several microtask turns, not one: the save is a promise chained onto a
 * promise, and `waitFor` is no help here because it polls on the very timers
 * this test has frozen.
 */
async function quiet() {
  await act(async () => {
    vi.advanceTimersByTime(1000);
    for (let turn = 0; turn < 5; turn++) await Promise.resolve();
  });
}

describe("useAutosave", () => {
  it("saves nothing until an agreement is chosen", async () => {
    renderHook(() => useAutosave(null, {}));
    await settle();

    expect(started).not.toHaveBeenCalled();
  });

  it("starts saving as soon as one is", async () => {
    renderHook(() => useAutosave("mutual-nda", {}));
    await settle();

    expect(started).toHaveBeenCalledWith("mutual-nda");
  });

  it("starts it only once", async () => {
    const { rerender } = renderHook(
      ({ data }) => useAutosave("mutual-nda", data),
      { initialProps: { data: {} as DocumentData } },
    );
    await settle();

    rerender({ data: { governingLaw: "Delaware" } });
    await settle();

    expect(started).toHaveBeenCalledTimes(1);
  });

  it("writes the fields once they have stopped changing", async () => {
    const { rerender } = renderHook(
      ({ data }) => useAutosave("mutual-nda", data),
      { initialProps: { data: {} as DocumentData } },
    );
    await settle();

    rerender({ data: { governingLaw: "Delaware" } });
    await quiet();

    expect(saved).toHaveBeenCalledWith(7, { governingLaw: "Delaware" });
  });

  it("coalesces a flurry of edits into one write", async () => {
    // Typing in the review form arrives as one change per keystroke. Saving
    // each one would be a request per character.
    const { rerender } = renderHook(
      ({ data }) => useAutosave("mutual-nda", data),
      { initialProps: { data: {} as DocumentData } },
    );
    await settle();

    for (const purpose of ["A", "A m", "A me", "A merger."]) {
      rerender({ data: { purpose } });
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
    }
    await quiet();

    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledWith(7, { purpose: "A merger." });
  });

  it("does not write back what it just read", async () => {
    // Choosing an agreement creates an empty record; saving that same empty
    // document straight back would be a request that changes nothing.
    renderHook(() => useAutosave("mutual-nda", {}));
    await settle();
    await quiet();

    expect(saved).not.toHaveBeenCalled();
  });

  it("resumes an existing document instead of forking a second one", async () => {
    // Reopening a saved draft already has a row. Creating another would split
    // the document in two every time the user looked at it.
    const { rerender } = renderHook(
      ({ data }) => useAutosave("mutual-nda", data, 42),
      { initialProps: { data: {} as DocumentData } },
    );
    await settle();

    rerender({ data: { governingLaw: "Delaware" } });
    await quiet();

    expect(started).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledWith(42, { governingLaw: "Delaware" });
  });

  it("reports that it is saved", async () => {
    const { result, rerender } = renderHook(
      ({ data }) => useAutosave("mutual-nda", data),
      { initialProps: { data: {} as DocumentData } },
    );
    await settle();

    rerender({ data: { governingLaw: "Delaware" } });
    await quiet();

    expect(result.current.status).toBe("saved");
  });

  it("reports a failure rather than pretending it saved", async () => {
    saved.mockRejectedValue(new Error("offline"));
    const { result, rerender } = renderHook(
      ({ data }) => useAutosave("mutual-nda", data),
      { initialProps: { data: {} as DocumentData } },
    );
    await settle();

    rerender({ data: { governingLaw: "Delaware" } });
    await quiet();

    expect(result.current.status).toBe("error");
  });
});
