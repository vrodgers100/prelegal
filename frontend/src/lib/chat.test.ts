import { describe, expect, it } from "vitest";
import { applyUpdates } from "./chat";
import { createEmptyNda, type NdaData } from "./nda";

const base = (patch: Partial<NdaData> = {}): NdaData => ({
  ...createEmptyNda("2026-08-19"),
  ...patch,
});

describe("applyUpdates", () => {
  it("writes what the assistant learned", () => {
    const next = applyUpdates(base(), { jurisdiction: "New Castle, DE" });

    expect(next.jurisdiction).toBe("New Castle, DE");
  });

  it("leaves fields the assistant did not mention alone", () => {
    const data = base({ jurisdiction: "New Castle, DE" });

    const next = applyUpdates(data, { governingLaw: "Delaware" });

    expect(next.jurisdiction).toBe("New Castle, DE");
  });

  it("treats null as nothing learned rather than as a value", () => {
    const data = base({ purpose: "Evaluating a partnership." });

    const next = applyUpdates(data, { purpose: null, jurisdiction: undefined });

    expect(next.purpose).toBe("Evaluating a partnership.");
  });

  it("ignores a blank string", () => {
    const next = applyUpdates(base({ purpose: "Kept." }), { purpose: "   " });

    expect(next.purpose).toBe("Kept.");
  });

  it("trims what it does write", () => {
    expect(applyUpdates(base(), { jurisdiction: "  Austin, TX \n" }).jurisdiction).toBe(
      "Austin, TX",
    );
  });

  it("does not mutate the agreement it was given", () => {
    const data = base();

    applyUpdates(data, { governingLaw: "Delaware", partyOne: { company: "Acme, Inc." } });

    expect(data.governingLaw).toBe("");
    expect(data.partyOne.company).toBe("");
  });

  describe("governing law", () => {
    it("accepts a state the form can show", () => {
      expect(applyUpdates(base(), { governingLaw: "Delaware" }).governingLaw).toBe(
        "Delaware",
      );
    });

    it("drops anything that is not a state", () => {
      // Observed from the model: "Delphi" in place of Delaware. Leaving the
      // field empty is correctable; a plausible wrong state is not noticed.
      const next = applyUpdates(base(), { governingLaw: "Delphi" });

      expect(next.governingLaw).toBe("");
    });

    it("drops a country", () => {
      expect(applyUpdates(base(), { governingLaw: "England" }).governingLaw).toBe("");
    });
  });

  describe("dates", () => {
    it("accepts the format the date input uses", () => {
      expect(applyUpdates(base(), { effectiveDate: "2026-12-31" }).effectiveDate).toBe(
        "2026-12-31",
      );
    });

    it("drops a date it could not parse", () => {
      const next = applyUpdates(base({ effectiveDate: "2026-08-19" }), {
        effectiveDate: "next Tuesday",
      });

      expect(next.effectiveDate).toBe("2026-08-19");
    });
  });

  describe("term options", () => {
    it("accepts a known option", () => {
      const next = applyUpdates(base(), { mndaTermKind: "untilTerminated" });

      expect(next.mndaTermKind).toBe("untilTerminated");
    });

    it("drops an option the form has no checkbox for", () => {
      const next = applyUpdates(base(), {
        confidentialityTermKind: "forever" as "perpetual",
      });

      expect(next.confidentialityTermKind).toBe("years");
    });

    it("holds years inside the range the form allows", () => {
      expect(applyUpdates(base(), { mndaTermYears: 0 }).mndaTermYears).toBe(1);
      expect(applyUpdates(base(), { mndaTermYears: 500 }).mndaTermYears).toBe(99);
    });

    it("drops a fractional number of years", () => {
      const next = applyUpdates(base({ mndaTermYears: 2 }), { mndaTermYears: 1.5 });

      expect(next.mndaTermYears).toBe(2);
    });
  });

  describe("parties", () => {
    it("fills in one party without touching the other", () => {
      const data = base({
        partyTwo: {
          company: "Globex",
          signatoryName: "",
          signatoryTitle: "",
          noticeAddress: "",
        },
      });

      const next = applyUpdates(data, { partyOne: { company: "Acme, Inc." } });

      expect(next.partyOne.company).toBe("Acme, Inc.");
      expect(next.partyTwo.company).toBe("Globex");
    });

    it("keeps the details of a party it only partly learned", () => {
      const data = base({
        partyOne: {
          company: "Acme, Inc.",
          signatoryName: "Jane Doe",
          signatoryTitle: "CEO",
          noticeAddress: "legal@acme.com",
        },
      });

      const next = applyUpdates(data, { partyOne: { signatoryTitle: "President" } });

      expect(next.partyOne).toEqual({
        company: "Acme, Inc.",
        signatoryName: "Jane Doe",
        signatoryTitle: "President",
        noticeAddress: "legal@acme.com",
      });
    });

    it("ignores an empty party object", () => {
      const data = base({
        partyOne: {
          company: "Acme, Inc.",
          signatoryName: "",
          signatoryTitle: "",
          noticeAddress: "",
        },
      });

      expect(applyUpdates(data, { partyOne: {} }).partyOne.company).toBe("Acme, Inc.");
    });
  });

  it("keeps an edit made while the message was in flight", () => {
    // The whole reason the merge lives here: the reply carries only what it
    // learned, so a field typed into the form meanwhile is not rolled back.
    const typedMeanwhile = base({ jurisdiction: "New Castle, DE" });

    const next = applyUpdates(typedMeanwhile, { governingLaw: "Delaware" });

    expect(next).toMatchObject({
      jurisdiction: "New Castle, DE",
      governingLaw: "Delaware",
    });
  });
});
