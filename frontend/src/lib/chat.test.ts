import { describe, expect, it } from "vitest";
import { applyUpdates, type DocumentUpdates } from "./chat";
import { createEmptyDocument, isParty, type DocumentData, type Party } from "./documents";
import { readDocumentSchemas, readUsStates } from "./documents.server";

/**
 * Run against the real Mutual NDA schema rather than a fixture, so a change to
 * `schemas/mutual-nda.json` that breaks the merge is caught here.
 */
const schemas = readDocumentSchemas();
const nda = schemas.find((schema) => schema.documentType === "mutual-nda")!;
const usStates = readUsStates();

const base = (patch: DocumentData = {}): DocumentData => ({
  ...createEmptyDocument(nda),
  effectiveDate: "2026-08-19",
  ...patch,
});

const merge = (data: DocumentData, updates: DocumentUpdates) =>
  applyUpdates(nda, data, updates, usStates);

/** Narrows a field value to a party, so the assertions can read its details. */
const party = (data: DocumentData, key: string): Party => {
  const value = data[key];
  if (!isParty(value)) throw new Error(`${key} is not a party`);
  return value;
};

describe("applyUpdates", () => {
  it("writes what the assistant learned", () => {
    const next = merge(base(), { jurisdiction: "New Castle, DE" });

    expect(next.jurisdiction).toBe("New Castle, DE");
  });

  it("leaves fields the assistant did not mention alone", () => {
    const data = base({ jurisdiction: "New Castle, DE" });

    const next = merge(data, { governingLaw: "Delaware" });

    expect(next.jurisdiction).toBe("New Castle, DE");
  });

  it("ignores a key the agreement does not have", () => {
    // A reply for one agreement must not write fields into another's.
    const next = merge(base(), { pilotPeriod: "30 days" });

    expect(next.pilotPeriod).toBeUndefined();
  });

  it("treats null as nothing learned rather than as a value", () => {
    const data = base({ purpose: "Evaluating a partnership." });

    const next = merge(data, { purpose: null, jurisdiction: undefined });

    expect(next.purpose).toBe("Evaluating a partnership.");
  });

  it("ignores a blank string", () => {
    const next = merge(base({ purpose: "Kept." }), { purpose: "   " });

    expect(next.purpose).toBe("Kept.");
  });

  it("trims what it does write", () => {
    expect(merge(base(), { jurisdiction: "  Austin, TX \n" }).jurisdiction).toBe(
      "Austin, TX",
    );
  });

  it("does not mutate the agreement it was given", () => {
    const data = base();

    merge(data, { governingLaw: "Delaware", partyOne: { company: "Acme, Inc." } });

    expect(data.governingLaw).toBe("");
    expect(party(data, "partyOne").company).toBe("");
  });

  describe("governing law", () => {
    it("accepts a state the form can show", () => {
      expect(merge(base(), { governingLaw: "Delaware" }).governingLaw).toBe("Delaware");
    });

    it("drops anything that is not a state", () => {
      // Observed from the model: "Delphi" in place of Delaware. Leaving the
      // field empty is correctable; a plausible wrong state is not noticed.
      const next = merge(base(), { governingLaw: "Delphi" });

      expect(next.governingLaw).toBe("");
    });

    it("drops a country", () => {
      expect(merge(base(), { governingLaw: "England" }).governingLaw).toBe("");
    });
  });

  describe("dates", () => {
    it("accepts the format the date input uses", () => {
      expect(merge(base(), { effectiveDate: "2026-12-31" }).effectiveDate).toBe(
        "2026-12-31",
      );
    });

    it("drops a date it could not parse", () => {
      const next = merge(base({ effectiveDate: "2026-08-19" }), {
        effectiveDate: "next Tuesday",
      });

      expect(next.effectiveDate).toBe("2026-08-19");
    });
  });

  describe("term options", () => {
    it("accepts a known option", () => {
      const next = merge(base(), { mndaTermKind: "untilTerminated" });

      expect(next.mndaTermKind).toBe("untilTerminated");
    });

    it("drops an option the form has no checkbox for", () => {
      const next = merge(base(), { confidentialityTermKind: "forever" });

      expect(next.confidentialityTermKind).toBe("years");
    });

    it("holds years inside the range the schema allows", () => {
      expect(merge(base(), { mndaTermYears: 0 }).mndaTermYears).toBe(1);
      expect(merge(base(), { mndaTermYears: 500 }).mndaTermYears).toBe(99);
    });

    it("drops a fractional number of years", () => {
      const next = merge(base({ mndaTermYears: 2 }), { mndaTermYears: 1.5 });

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

      const next = merge(data, { partyOne: { company: "Acme, Inc." } });

      expect(party(next, "partyOne").company).toBe("Acme, Inc.");
      expect(party(next, "partyTwo").company).toBe("Globex");
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

      const next = merge(data, { partyOne: { signatoryTitle: "President" } });

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

      expect(party(merge(data, { partyOne: {} }), "partyOne").company).toBe("Acme, Inc.");
    });
  });

  it("keeps an edit made while the message was in flight", () => {
    // The whole reason the merge lives here: the reply carries only what it
    // learned, so a field typed into the form meanwhile is not rolled back.
    const typedMeanwhile = base({ jurisdiction: "New Castle, DE" });

    const next = merge(typedMeanwhile, { governingLaw: "Delaware" });

    expect(next).toMatchObject({
      jurisdiction: "New Castle, DE",
      governingLaw: "Delaware",
    });
  });
});
