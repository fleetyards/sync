import { describe, it, expect } from "vitest";
import {
  BIO_MAX_LENGTH,
  BioTooLongError,
  parseBio,
  withToken,
  withoutToken,
} from "@/lib/bio";

const page = (bio?: string) => `
  <div class="profile">
    <p class="entry">
      <span class="label">Handle name</span>
      <strong class="value">Pilot</strong>
    </p>
  </div>
  ${
    bio === undefined
      ? ""
      : `<div class="entry bio">
                <span class="label">Bio</span>
                <div class="value">
                                                      ${bio}
                </div>
              </div>`
  }`;

describe("parseBio", () => {
  it("turns line breaks back into newlines", () => {
    expect(parseBio(page("First line<br />\n<br />\nThird line"))).toBe(
      "First line\n\nThird line"
    );
  });

  it("decodes escaped characters", () => {
    expect(parseBio(page("Tom &amp; Jerry &lt;3 &quot;hi&quot; &#039;yo&#039;"))).toBe(
      `Tom & Jerry <3 "hi" 'yo'`
    );
  });

  it("reads a citizen page without a bio as an empty bio", () => {
    expect(parseBio(page())).toBe("");
  });

  it("refuses a bio with markup it cannot reverse", () => {
    expect(parseBio(page('see <a href="https://x.test">x</a>'))).toBeNull();
  });

  it("reads CRLF line breaks as single newlines", () => {
    expect(parseBio(page("First<br />\r\nSecond\r\nThird"))).toBe(
      "First\nSecond\nThird"
    );
  });

  it("refuses an entity it does not know", () => {
    expect(parseBio(page("caf&eacute;"))).toBeNull();
  });

  it("refuses a code point out of range", () => {
    expect(parseBio(page("&#x110000;"))).toBeNull();
  });

  it("refuses a bio entry whose markup changed", () => {
    expect(
      parseBio(
        page().replace(
          "</div>\n  </div>",
          ""
        ) +
          '<div class="entry bio"><h4>Bio</h4><div class="value markdown">Mine</div></div>'
      )
    ).toBeNull();
  });

  it("refuses a page that is not a citizen page", () => {
    expect(parseBio("<html>Not found</html>")).toBeNull();
  });
});

describe("withToken", () => {
  const token = "FLEETYARDS-ABCDEFGHIJ";

  it("appends the token after a blank line", () => {
    expect(withToken("Hello", token)).toEqual({
      bio: `Hello\n\n${token}`,
      added: true,
    });
  });

  it("puts the token alone into an empty bio", () => {
    expect(withToken("", token)).toEqual({ bio: token, added: true });
  });

  it("leaves a bio that already has the token alone", () => {
    expect(withToken(`${token} first`, token)).toEqual({
      bio: `${token} first`,
      added: false,
    });
  });

  it("throws when the token does not fit", () => {
    expect(() => withToken("x".repeat(BIO_MAX_LENGTH - 5), token)).toThrow(
      BioTooLongError
    );
  });
});

describe("withoutToken", () => {
  const token = "FLEETYARDS-ABCDEFGHIJ";

  it("removes the token withToken appended", () => {
    expect(withoutToken(`Hello\n\n${token}`, token)).toEqual({
      bio: "Hello",
      removed: true,
    });
  });

  it("empties a bio that held only the token", () => {
    expect(withoutToken(token, token)).toEqual({ bio: "", removed: true });
  });

  it("leaves a token the user placed elsewhere", () => {
    expect(withoutToken(`${token}\nHello`, token)).toEqual({
      bio: `${token}\nHello`,
      removed: false,
    });
  });
});
