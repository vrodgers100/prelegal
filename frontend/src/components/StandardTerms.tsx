import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

/**
 * The Mutual NDA Standard Terms, rendered verbatim from the repo's template
 * markdown. Rendered on the server so the markdown parser stays out of the
 * client bundle — the terms never change in response to user input.
 *
 * `rehypeRaw` is needed for the template's inline
 * `<span class="coverpage_link">` markup, which cross-references fields on the
 * Cover Page (styled in globals.css). The markdown is part of this repo, not
 * user input, so allowing its raw HTML through is safe.
 */
export default function StandardTerms({ markdown }: { markdown: string }) {
  return (
    <article className="doc doc-standard-terms">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // The template's own title is a top-level heading; demote it so the
          // agreement keeps a single h1 (the Cover Page title).
          h1: ({ children }) => <h2>{children}</h2>,
        }}
      >
        {markdown}
      </Markdown>
    </article>
  );
}
