import { decodeEntities } from "./bio";

// The org text field the token goes into: the history has no length limit,
// unlike the 300-character introduction, and is rarely the org's front page.
export const ORG_VERIFICATION_FIELD = "history";

// As the site and RSI print an org's SID: up to ten capitals and digits.
export const SID_PATTERN = /^[A-Z0-9]{1,10}$/;

const TOKEN_IN_TEXT = /FLEETYARDS-[A-Z0-9]{10}/g;

// Without content rights RSI still answers 200, with a page titled so.
export function isAccessDenied(html: string) {
  return /<title>\s*Access denied/i.test(html);
}

// A draft field exactly as an officer typed it: the admin content page renders
// it into its textarea, only escaped. HTML drops one newline straight after
// the opening tag, so the field's text starts after it.
export function parseDraftField(html: string, field: string): string | null {
  const textarea = html.match(
    new RegExp(
      `<textarea\\b[^>]*\\bname="${field}"[^>]*>([\\s\\S]*?)</textarea>`
    )
  );
  if (!textarea) return null;

  return decodeEntities(textarea[1]!.replace(/^\r?\n/, ""));
}

// The org's text blocks as a reader sees them, for comparing two renderings
// of the page: tags and every FleetYards token dropped, whitespace collapsed.
// Null when the page has none, which is markup this cannot read.
export function contentBlocks(html: string): string[] | null {
  const blocks = [
    ...html.matchAll(/<div class="markitup-text">([\s\S]*?)<\/div>/g),
  ].map((match) =>
    match[1]!
      .replace(/<[^>]*>/g, "")
      .replace(/&[^;\s]+;/g, (entity) => decodeEntities(entity) ?? entity)
      .replace(TOKEN_IN_TEXT, "")
      .replace(/\s+/g, " ")
      .trim()
  );

  return blocks.length > 0 ? blocks : null;
}

// Whether the org's draft holds changes besides FleetYards tokens: RSI
// publishes the whole draft at once, so writing then would publish them too.
export function hasPendingChanges(
  previewHtml: string,
  publicHtml: string
): boolean | null {
  const draft = contentBlocks(previewHtml);
  const live = contentBlocks(publicHtml);
  if (!draft || !live) return null;

  return (
    draft.length !== live.length ||
    draft.some((block, index) => block !== live[index])
  );
}
