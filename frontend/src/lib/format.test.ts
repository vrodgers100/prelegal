import { describe, expect, it } from "vitest";
import { formatLongDate, missingFieldLabels, pluralYears } from "./format";
import { createEmptyNda, type NdaData } from "./nda";

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

describe("missingFieldLabels", () => {
  const complete = (): NdaData => ({
    ...createEmptyNda("2026-08-17"),
    governingLaw: "Delaware",
    jurisdiction: "New Castle, DE",
    partyOne: {
      company: "Acme, Inc.",
      signatoryName: "Ada Lovelace",
      signatoryTitle: "CEO",
      noticeAddress: "ada@acme.example",
    },
    partyTwo: {
      company: "Globex LLC",
      signatoryName: "Grace Hopper",
      signatoryTitle: "CTO",
      noticeAddress: "grace@globex.example",
    },
  });

  it("reports nothing when every field is filled in", () => {
    expect(missingFieldLabels(complete())).toEqual([]);
  });

  it("names each empty field", () => {
    const data = { ...complete(), governingLaw: "", jurisdiction: "" };

    expect(missingFieldLabels(data)).toEqual(["Governing Law", "Jurisdiction"]);
  });

  it("treats whitespace as empty", () => {
    const data = { ...complete(), purpose: "   " };

    expect(missingFieldLabels(data)).toContain("Purpose");
  });

  it("reports both parties separately", () => {
    const data = complete();
    data.partyTwo = { ...data.partyTwo, company: "" };

    expect(missingFieldLabels(data)).toEqual(["Party 2 company"]);
  });
});
