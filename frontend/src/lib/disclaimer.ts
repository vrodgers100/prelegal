/**
 * The draft notice.
 *
 * Two wordings of one point, in one place so they cannot drift apart. The long
 * one is set into the agreement itself, where it travels into every download;
 * the short one sits in the app chrome while drafting.
 *
 * Not in `schemas/*.json`: it is the same for all eleven agreements and is not
 * something the drafting model should ever see, let alone rewrite.
 */

/** On the cover page, and therefore in the printed PDF. */
export const DRAFT_NOTICE =
  "Draft — not legal advice. This document was generated from a template and " +
  "has not been reviewed by a lawyer. Have qualified legal counsel review it " +
  "before signing.";

/** In the app, while drafting. */
export const DRAFT_NOTICE_SHORT =
  "Drafts are not legal advice. Have a lawyer review this before anyone signs it.";
