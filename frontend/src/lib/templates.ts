import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads legal template text from the `templates/` dataset at the repo root
 * (see `catalog.json`), which is the single source of truth for agreement
 * wording. Server-side only — these run at build time and the resulting text
 * is baked into the statically rendered page.
 */

const TEMPLATES_DIR = path.join(process.cwd(), "..", "templates");

function readTemplate(filename: string): string {
  return readFileSync(path.join(TEMPLATES_DIR, filename), "utf8");
}

/**
 * The Common Paper Mutual NDA Standard Terms (Version 1.0), verbatim. The
 * Cover Page incorporates these by reference, so a self-contained agreement
 * includes them unaltered.
 */
export function readMutualNdaStandardTerms(): string {
  return readTemplate("mutual-nda.md");
}
