import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import DocumentsList from "@/components/DocumentsList";
import RequireSession from "@/components/RequireSession";
import { readDocumentSchemas } from "@/lib/documents.server";

export const metadata: Metadata = {
  title: "Your documents — Prelegal",
  description: "Every agreement you have drafted, saved as you go.",
};

/**
 * The list of saved documents (PL-7), behind sign-in.
 *
 * Reads the schemas at build time so a row can name its agreement without
 * another request, but deliberately does not read the Standard Terms: this
 * screen never renders a whole agreement, and pulling all eleven templates
 * into it would double the exported payload to show a list of names. Opening
 * one goes to `/app`, which already has them.
 */
export default function DocumentsPage() {
  return (
    <RequireSession>
      <AppShell>
        <DocumentsList schemas={readDocumentSchemas()} />
      </AppShell>
    </RequireSession>
  );
}
