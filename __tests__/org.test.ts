import { describe, it, expect } from "vitest";
import {
  contentSections,
  hasPendingChanges,
  isAccessDenied,
  parseDraftField,
  tokenOnPage,
} from "@/lib/org";

// Trimmed from a live org page.
const orgPage = (history: string, manifesto = "Our manifesto.") => `
<title>Maru Inc. [MARU] - Organizations</title>
<div class="content block intro"><div class="markitup-text"><p>Welcome aboard.</p></div></div>
<div class="content-tab active" id="tab-history">
  <h2 class="tab-title">History</h2>
  <div class="markitup-text">${history}</div>
</div>
<div class="content-tab" id="tab-manifesto">
  <h2 class="tab-title">Manifesto</h2>
  <div class="markitup-text"><p>${manifesto}</p></div>
</div>`;

const contentPage = (history: string) => `
<title>Description - Admin - Maru Inc. [MARU]</title>
<textarea name="introduction" class="js-text-editor" maxlength="300">Welcome aboard.</textarea>
<textarea name="history" class="js-text-editor">
${history}</textarea>`;

describe("isAccessDenied", () => {
  it("reads RSI's page for an account without rights", () => {
    expect(isAccessDenied("<title>Access denied - Roberts Space Industries</title>")).toBe(true);
  });

  it("leaves the admin page alone", () => {
    expect(isAccessDenied(contentPage("History"))).toBe(false);
  });
});

describe("parseDraftField", () => {
  it("reads the field's raw text, formatting included", () => {
    expect(
      parseDraftField(contentPage("h1. Our story\n\n*bold* &amp; more"), "history")
    ).toBe("h1. Our story\n\n*bold* & more");
  });

  it("refuses a page without the field", () => {
    expect(parseDraftField("<title>Something else</title>", "history")).toBeNull();
  });
});

describe("contentSections", () => {
  it("reads every section by name, without tokens", () => {
    expect(
      contentSections(
        orgPage(
          '<p>Our board.</p>\n\n<p><span class="caps">FLEETYARDS</span>-ABCDEFGHIJ</p>'
        )
      )
    ).toEqual(
      new Map([
        ["introduction", "<p>Welcome aboard.</p>"],
        ["history", "<p>Our board.</p>"],
        ["manifesto", "<p>Our manifesto.</p>"],
      ])
    );
  });

  it("reads a section past the divs Textile nests in it", () => {
    expect(
      contentSections(orgPage("<div class=\"note\"><p>Inner</p></div><p>After</p>"))
        ?.get("history")
    ).toBe('<div class="note"><p>Inner</p></div><p>After</p>');
  });

  it("refuses a page without text blocks", () => {
    expect(contentSections("<title>Access denied</title>")).toBeNull();
  });
});

describe("hasPendingChanges", () => {
  it("sees nothing pending when only tokens differ", () => {
    expect(
      hasPendingChanges(
        orgPage("<p>Our board.</p>"),
        orgPage("<p>Our board.</p><p>FLEETYARDS-ABCDEFGHIJ</p>")
      )
    ).toBe(false);
  });

  it("sees another officer's unpublished edit", () => {
    expect(
      hasPendingChanges(
        orgPage("<p>Our board.</p>", "A new manifesto."),
        orgPage("<p>Our board.</p>")
      )
    ).toBe(true);
  });

  it("sees a change that only touches markup", () => {
    expect(
      hasPendingChanges(
        orgPage('<p>Our board. <img src="new.png" /></p>'),
        orgPage('<p>Our board. <img src="old.png" /></p>')
      )
    ).toBe(true);
  });

  it("sees a change after a nested div", () => {
    expect(
      hasPendingChanges(
        orgPage("<div><p>Same</p></div><p>Edited</p>"),
        orgPage("<div><p>Same</p></div><p>Original</p>")
      )
    ).toBe(true);
  });

  it("reads a section one page leaves out as empty", () => {
    const withEmptyCharter = `${orgPage("<p>Our board.</p>")}<div class="content-tab" id="tab-charter"><div class="markitup-text"></div></div>`;

    expect(
      hasPendingChanges(withEmptyCharter, orgPage("<p>Our board.</p>"))
    ).toBe(false);
  });

  it("refuses to compare a page it cannot read", () => {
    expect(hasPendingChanges("<html></html>", orgPage("<p>x</p>"))).toBeNull();
  });
});

describe("tokenOnPage", () => {
  const token = "FLEETYARDS-ABCDEFGHIJ";

  it("finds a token Textile split with a span in the history", () => {
    expect(
      tokenOnPage(
        orgPage('<p>Our board.</p><p><span class="caps">FLEETYARDS</span>-ABCDEFGHIJ</p>'),
        token,
        "history"
      )
    ).toEqual({ inField: true, elsewhere: false });
  });

  it("tells a token in another section apart", () => {
    expect(
      tokenOnPage(orgPage("<p>Our board.</p>", token), token, "history")
    ).toEqual({ inField: false, elsewhere: true });
  });

  it("refuses a page it cannot read", () => {
    expect(tokenOnPage("<html></html>", token, "history")).toBeNull();
  });
});
