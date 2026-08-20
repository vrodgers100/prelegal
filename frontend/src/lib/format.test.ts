import { describe, expect, it } from "vitest";
import { formatLongDate, pluralYears, toDateInputValue } from "./format";

describe("formatLongDate", () => {
  it("spells out an ISO date the way a legal document does", () => {
    expect(formatLongDate("2026-08-17")).toBe("August 17, 2026");
  });

  it("does not shift the date across time zones", () => {
    expect(formatLongDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatLongDate("2026-12-31")).toBe("December 31, 2026");
  });

  it("returns an empty string for input it cannot parse", () => {
    for (const input of ["", "17/08/2026", "not a date", "2026-8-1"]) {
      expect(formatLongDate(input)).toBe("");
    }
  });
});

describe("pluralYears", () => {
  it("keeps 'year' singular for one", () => {
    expect(pluralYears(1)).toBe("1 year");
  });

  it("pluralises everything else", () => {
    expect(pluralYears(2)).toBe("2 years");
    expect(pluralYears(0)).toBe("0 years");
  });
});

describe("toDateInputValue", () => {
  it("zero-pads the way an input[type=date] expects", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
