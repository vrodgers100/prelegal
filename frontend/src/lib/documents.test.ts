import { describe, expect, it } from "vitest";
import {
  createEmptyDocument,
  isParty,
  missingFieldLabels,
  withToday,
  type DocumentData,
  type DocumentSchema,
} from "./documents";
import { readDocumentSchemas, readUsStates } from "./documents.server";

const schemas = readDocumentSchemas();
const byType = (documentType: string): DocumentSchema =>
  schemas.find((schema) => schema.documentType === documentType)!;

const nda = byType("mutual-nda");

/** Every field of the Mutual NDA filled in, as a signable agreement would be. */
function complete(): DocumentData {
  const signatory = {
    company: "Acme, Inc.",
    signatoryName: "Jane Doe",
    signatoryTitle: "CEO",
    noticeAddress: "legal@acme.com",
  };
  return {
    ...createEmptyDocument(nda),
    effectiveDate: "2026-08-19",
    governingLaw: "Delaware",
    jurisdiction: "New Castle, DE",
    partyOne: { ...signatory },
    partyTwo: { ...signatory, company: "Globex" },
  };
}

describe("the schemas on disk", () => {
  it("loads every agreement Prelegal drafts", () => {
    expect(schemas.length).toBeGreaterThan(0);
    expect(schemas.map((schema) => schema.documentType)).toContain("mutual-nda");
  });

  it("gives the backend and the browser the same field keys", () => {
    // Both read these files, so this pins that the file is shaped as both
    // sides expect rather than that they agree with each other.
    for (const schema of schemas) {
      for (const field of schema.fields) {
        expect(field.key, `${schema.documentType} field key`).toBeTruthy();
        expect(field.label, `${schema.documentType}.${field.key} label`).toBeTruthy();
        expect(field.prompt, `${schema.documentType}.${field.key} prompt`).toBeTruthy();
      }
    }
  });

  it("names a template that exists for every agreement", () => {
    for (const schema of schemas) {
      expect(schema.templateFile).toMatch(/\.md$/);
    }
  });

  it("offers the states a governing-law field needs", () => {
    const states = readUsStates();

    expect(states).toHaveLength(51);
    expect(states).toContain("District of Columbia");
  });
});

describe("createEmptyDocument", () => {
  it("applies the defaults the schema declares", () => {
    const data = createEmptyDocument(nda);

    expect(data.purpose).toBe(
      "Evaluating whether to enter into a business relationship with the other party.",
    );
    expect(data.mndaTermKind).toBe("expires");
    expect(data.mndaTermYears).toBe(1);
    expect(data.confidentialityTermKind).toBe("years");
  });

  it("starts every party empty", () => {
    const data = createEmptyDocument(nda);

    expect(data.partyOne).toEqual({
      company: "",
      signatoryName: "",
      signatoryTitle: "",
      noticeAddress: "",
    });
  });

  it("gives each call its own parties", () => {
    const first = createEmptyDocument(nda);
    const second = createEmptyDocument(nda);

    expect(first.partyOne).not.toBe(second.partyOne);
  });

  it("covers every field the schema declares", () => {
    const data = createEmptyDocument(nda);

    expect(Object.keys(data).sort()).toEqual(nda.fields.map((f) => f.key).sort());
  });
});

describe("withToday", () => {
  it("dates an undated agreement from the viewer's clock", () => {
    const data = withToday(nda, createEmptyDocument(nda), "2026-08-20");

    expect(data.effectiveDate).toBe("2026-08-20");
  });

  it("leaves a date the user chose alone", () => {
    const chosen = { ...createEmptyDocument(nda), effectiveDate: "2026-01-01" };

    expect(withToday(nda, chosen, "2026-08-20").effectiveDate).toBe("2026-01-01");
  });

  it("does nothing before the clock has been read", () => {
    const data = createEmptyDocument(nda);

    expect(withToday(nda, data, "")).toBe(data);
  });
});

describe("missingFieldLabels", () => {
  it("says nothing is missing from a complete agreement", () => {
    expect(missingFieldLabels(nda, complete())).toEqual([]);
  });

  it("names each empty field", () => {
    const data = { ...complete(), governingLaw: "", jurisdiction: "" };

    expect(missingFieldLabels(nda, data)).toEqual(["Governing Law", "Jurisdiction"]);
  });

  it("treats whitespace as empty", () => {
    const data = { ...complete(), purpose: "   " };

    expect(missingFieldLabels(nda, data)).toContain("Purpose");
  });

  it("reports both parties separately", () => {
    const data = complete();
    const two = data.partyTwo;
    if (!isParty(two)) throw new Error("partyTwo is not a party");
    data.partyTwo = { ...two, company: "" };

    expect(missingFieldLabels(nda, data)).toEqual(["Party 2 company"]);
  });

  it("ignores the optional fields", () => {
    // Modifications are optional and the term options always have a default.
    const missing = missingFieldLabels(nda, createEmptyDocument(nda));

    expect(missing.some((label) => label.includes("Modifications"))).toBe(false);
    expect(missing.some((label) => label.includes("Term"))).toBe(false);
  });
});
