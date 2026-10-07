export const VERIFICATION_TOKEN_PATTERN = /^FLEETYARDS-[A-Z0-9]{10}$/;

// A verification token goes after the text, a blank line apart, and only that
// is ever taken out again: the same token placed elsewhere by hand is the
// owner's to remove.
export function appendToken(text: string, token: string) {
  if (text.includes(token)) return { text, changed: false };

  return { text: text ? `${text}\n\n${token}` : token, changed: true };
}

export function removeAppendedToken(text: string, token: string) {
  if (text === token) return { text: "", changed: true };

  const suffix = `\n\n${token}`;
  if (text.endsWith(suffix)) {
    return { text: text.slice(0, -suffix.length), changed: true };
  }

  return { text, changed: false };
}
