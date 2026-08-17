import NdaCreator from "@/components/NdaCreator";
import StandardTerms from "@/components/StandardTerms";
import { readMutualNdaStandardTerms } from "@/lib/templates";

/**
 * The Mutual NDA creator (PL-3).
 *
 * The Standard Terms are read from the repo's template dataset and rendered
 * here, on the server, then handed to the client component as an element. Only
 * the Cover Page reacts to form input.
 */
export default function Home() {
  const standardTerms = readMutualNdaStandardTerms();

  return <NdaCreator standardTerms={<StandardTerms markdown={standardTerms} />} />;
}
