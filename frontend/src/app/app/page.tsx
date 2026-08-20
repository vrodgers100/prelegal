import type { Metadata } from "next";
import DocumentCreator from "@/components/DocumentCreator";
import RequireSession from "@/components/RequireSession";
import StandardTerms from "@/components/StandardTerms";
import { readDocumentSchemas, readUsStates } from "@/lib/documents.server";
import { readStandardTerms } from "@/lib/templates";

export const metadata: Metadata = {
  title: "Agreement creator — Prelegal",
  description:
    "Talk through what you need and get a complete, signable legal agreement you can download.",
};

/**
 * The agreement creator (PL-6), behind the sign-in screen.
 *
 * Every agreement's Standard Terms are read from the repo's template dataset
 * and rendered here, on the server, then handed to the client component as
 * elements. All of them, not just the one in use: the page is statically
 * exported, so there is no server left by the time the user picks one. Only
 * the Cover Page reacts to what the conversation learns.
 */
export default function CreatorPage() {
  const schemas = readDocumentSchemas();
  const standardTerms = Object.fromEntries(
    schemas.map((schema) => [
      schema.documentType,
      <StandardTerms key={schema.documentType} markdown={readStandardTerms(schema.templateFile)} />,
    ]),
  );

  return (
    <RequireSession>
      <DocumentCreator
        schemas={schemas}
        usStates={readUsStates()}
        standardTerms={standardTerms}
      />
    </RequireSession>
  );
}
