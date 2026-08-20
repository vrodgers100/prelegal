import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads legal template text from the `templates/` dataset at the repo root
 * (see `catalog.json`), which is the single source of truth for agreement
 * wording. Server-side only — these run at build time and the resulting text
 * is baked into the statically rendered page.
 */

const TEMPLATES_DIR = path.join(process.cwd(), "..", "templates");

/**
 * The Standard Terms for one agreement, verbatim. Its Cover Page incorporates
 * these by reference, so a self-contained agreement includes them unaltered.
 */
export function readStandardTerms(filename: string): string {
  return readFileSync(path.join(TEMPLATES_DIR, filename), "utf8");
}
