import { Fragment, type ReactNode } from "react";

/**
 * The little bit of markdown the cover-page wording needs: `**bold**` and
 * `[text](href)`.
 *
 * The schemas hold this prose as strings, and the Standard Terms renderer is
 * server-only, so rather than pull a markdown parser into the client bundle
 * for two sentences per agreement, this handles exactly the two marks the
 * Common Paper cover pages use. Anything else renders as written.
 */

const PATTERN = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;

export default function RichText({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(PATTERN)) {
    const [whole, bold, linkText, href] = match;
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));

    parts.push(
      bold ? (
        <strong key={match.index}>{bold}</strong>
      ) : (
        <a key={match.index} href={href}>
          {linkText}
        </a>
      ),
    );
    cursor = match.index + whole.length;
  }

  parts.push(text.slice(cursor));

  return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
}
