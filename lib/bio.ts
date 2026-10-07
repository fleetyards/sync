export const BIO_MAX_LENGTH = 1024;

export const VERIFICATION_TOKEN_PATTERN = /^FLEETYARDS-[A-Z0-9]{10}$/;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

// Null for an entity it does not know: written back as it stands, it would
// show up in the bio as literal text.
function decodeEntities(text: string): string | null {
  let unknown = false;

  const decoded = text.replace(
    /&(#x[0-9a-f]+|#\d+|\w+);/gi,
    (entity, name: string) => {
      if (name[0] === "#") {
        const code =
          name[1]!.toLowerCase() === "x"
            ? parseInt(name.slice(2), 16)
            : parseInt(name.slice(1), 10);

        if (code > 0x10ffff) {
          unknown = true;
          return entity;
        }

        return String.fromCodePoint(code);
      }

      const character = ENTITIES[name.toLowerCase()];
      if (character === undefined) unknown = true;

      return character ?? entity;
    }
  );

  return unknown ? null : decoded;
}

// The settings API that writes the bio has no read counterpart we can call, so
// the bio is read back from the public citizen page. That page renders it
// escaped, with a <br /> per line break. Anything else in there is markup this
// cannot turn back into the text the user typed, so it answers null rather than
// a bio that would overwrite theirs with something slightly different.
export function parseBio(html: string): string | null {
  if (!html.includes('<span class="label">Handle name</span>')) return null;

  // Only a page without the bio entry at all has an empty bio. One with an
  // entry this does not recognise is markup that changed, and reading it as
  // empty would replace the user's whole bio with the token.
  if (!html.includes('class="entry bio"')) return "";

  const entry = html.match(
    /<div class="entry bio">\s*<span class="label">[^<]*<\/span>\s*<div class="value">([\s\S]*?)<\/div>/
  );
  if (!entry) return null;

  const text = entry[1]!
    .trim()
    .replace(/<br\s*\/?>(\r?\n)?/g, "\n")
    .replace(/\r\n?/g, "\n");
  if (/<[a-z/!]/i.test(text)) return null;

  return decodeEntities(text);
}

export class BioTooLongError extends Error {}

export function withToken(bio: string, token: string) {
  if (bio.includes(token)) return { bio, added: false };

  const next = bio ? `${bio}\n\n${token}` : token;
  if (next.length > BIO_MAX_LENGTH) throw new BioTooLongError();

  return { bio: next, added: true };
}

// Only the token as withToken appended it: one the user put elsewhere in their
// bio themselves is theirs to remove.
export function withoutToken(bio: string, token: string) {
  if (bio === token) return { bio: "", removed: true };

  const suffix = `\n\n${token}`;
  if (bio.endsWith(suffix)) {
    return { bio: bio.slice(0, -suffix.length), removed: true };
  }

  return { bio, removed: false };
}
