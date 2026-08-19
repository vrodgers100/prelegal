import type { Metadata } from "next";
import NdaCreator from "@/components/NdaCreator";
import RequireSession from "@/components/RequireSession";
import StandardTerms from "@/components/StandardTerms";
import { readMutualNdaStandardTerms } from "@/lib/templates";

export const metadata: Metadata = {
  title: "Mutual NDA creator — Prelegal",
  description:
    "Fill in a short form and get a complete, signable Mutual Non-Disclosure Agreement you can download.",
};

/**
 * The Mutual NDA creator (PL-3), behind the sign-in screen.
 *
 * The Standard Terms are read from the repo's template dataset and rendered
 * here, on the server, then handed to the client component as an element. Only
 * the Cover Page reacts to form input.
 */
export default function CreatorPage() {
  const standardTerms = readMutualNdaStandardTerms();

  return (
    <RequireSession>
      <NdaCreator standardTerms={<StandardTerms markdown={standardTerms} />} />
    </RequireSession>
  );
}
