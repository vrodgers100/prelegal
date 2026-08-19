import { describe, expect, it } from "vitest";
import { DEFAULT_PURPOSE, createEmptyNda, toDateInputValue } from "./nda";

describe("createEmptyNda", () => {
  it("mirrors the template's suggested defaults", () => {
    const nda = createEmptyNda();

    expect(nda.purpose).toBe(DEFAULT_PURPOSE);
    expect(nda.mndaTermKind).toBe("expires");
    expect(nda.mndaTermYears).toBe(1);
    expect(nda.confidentialityTermKind).toBe("years");
    expect(nda.confidentialityTermYears).toBe(1);
  });

  it("leaves the effective date to the caller", () => {
    expect(createEmptyNda().effectiveDate).toBe("");
    expect(createEmptyNda("2026-08-17").effectiveDate).toBe("2026-08-17");
  });

  it("gives each call its own parties", () => {
    const first = createEmptyNda();
    first.partyOne.company = "Acme, Inc.";

    expect(createEmptyNda().partyOne.company).toBe("");
  });
});

describe("toDateInputValue", () => {
  it("zero-pads the month and day", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("uses the local calendar date", () => {
    expect(toDateInputValue(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});
