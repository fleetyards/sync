import { decodeEntities } from "./bio";

// The org text field the token goes into: the history has no length limit,
// unlike the 300-character introduction, and is rarely the org's front page.
export const ORG_VERIFICATION_FIELD = "history";

// As the site and RSI print an org's SID: up to ten capitals and digits.
export const SID_PATTERN = /^[A-Z0-9]{1,10}$/;


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

// Every way a rendered page shows a FleetYards token: Textile wraps the
// capitals in a span.
const TOKEN_IN_MARKUP =
  /(?:<span class="caps">)?FLEETYARDS(?:<\/span>)?-[A-Z0-9]{10}/g;

const BLOCK_START = '<div class="markitup-text">';

// A block's inner markup up to its own closing tag: Textile's `div.` blocks
// nest divs inside it.
function blockAt(html: string, start: number) {
  const tags = /<div\b|<\/div>/g;
  tags.lastIndex = start;
  let depth = 1;

  for (let tag = tags.exec(html); tag; tag = tags.exec(html)) {
    depth += tag[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(start, tag.index);
  }

  return null;
}

// Which org text a block belongs to: the content tab it sits in, or the
// introduction above the tabs.
function sectionOf(html: string, index: number) {
  const tab = [...html.slice(0, index).matchAll(/id="tab-([a-z]+)"/g)].pop();

  return tab ? tab[1]! : "introduction";
}

// Each org text section's inner markup as rendered, by name. Null when the
// page has none, or a block never closes: markup this cannot read.
function rawSections(html: string): Map<string, string> | null {
  const sections = new Map<string, string>();

  for (
    let index = html.indexOf(BLOCK_START);
    index !== -1;
    index = html.indexOf(BLOCK_START, index + 1)
  ) {
    const inner = blockAt(html, index + BLOCK_START.length);
    if (inner === null) return null;

    sections.set(sectionOf(html, index), inner);
  }

  return sections.size > 0 ? sections : null;
}

// The org's text sections for comparing two renderings of the page: markup
// kept, so an image, a link or formatting counts as a change too; every
// FleetYards token, the paragraphs left empty by taking one out, and
// whitespace dropped.
export function contentSections(html: string): Map<string, string> | null {
  const sections = rawSections(html);
  if (!sections) return null;

  return new Map(
    [...sections].map(([name, inner]) => [
      name,
      inner
        .replace(TOKEN_IN_MARKUP, "")
        .replace(/<p>\s*<\/p>/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    ])
  );
}

// Whether the org's draft holds changes besides FleetYards tokens: RSI
// publishes the whole draft at once, so writing then would publish them too.
// A section one page leaves out counts as empty.
export function hasPendingChanges(
  previewHtml: string,
  publicHtml: string
): boolean | null {
  const draft = contentSections(previewHtml);
  const live = contentSections(publicHtml);
  if (!draft || !live) return null;

  return [...new Set([...draft.keys(), ...live.keys()])].some(
    (section) => (draft.get(section) ?? "") !== (live.get(section) ?? "")
  );
}

// Where a rendered org page shows the token, Textile's markup aside: in the
// section the extension writes, or anywhere else, which it never wrote and
// cannot take out. Null for a page it cannot read.
export function tokenOnPage(
  html: string,
  token: string,
  field: string
): { inField: boolean; elsewhere: boolean } | null {
  const sections = rawSections(html);
  if (!sections) return null;

  const shows = (markup: string) => markup.replace(/<[^>]*>/g, "").includes(token);

  return {
    inField: shows(sections.get(field) ?? ""),
    elsewhere: [...sections].some(
      ([name, markup]) => name !== field && shows(markup)
    ),
  };
}
