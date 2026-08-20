import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DocumentSchema } from "./documents";

/**
 * Reads the document schemas from `schemas/` at the repo root — the same files
 * the backend reads, so the two can never describe an agreement differently.
 *
 * Server-side only: these run at build time and the result is baked into the
 * statically rendered page. Import this from a Server Component and pass what
 * it returns down as props; `documents.ts` holds everything the browser needs.
 */

const SCHEMAS_DIR = path.join(process.cwd(), "..", "schemas");

/** Every agreement Prelegal can draft, in catalogue order. */
export function readDocumentSchemas(): DocumentSchema[] {
  return readdirSync(SCHEMAS_DIR)
    .filter((name) => name.endsWith(".json") && name !== "us-states.json")
    .sort()
    .map(
      (name) =>
        JSON.parse(
          readFileSync(path.join(SCHEMAS_DIR, name), "utf8"),
        ) as DocumentSchema,
    );
}

/** The states a governing-law field will accept. */
export function readUsStates(): string[] {
  return JSON.parse(
    readFileSync(path.join(SCHEMAS_DIR, "us-states.json"), "utf8"),
  ) as string[];
}
