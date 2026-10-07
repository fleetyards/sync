import { describe, it, expect, vi, beforeEach } from "vitest";
import { onMessage, handleResponse } from "@/lib/message-handler";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("onMessage", () => {
  it("responds to health action", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn();

    await onMessage(
      JSON.stringify({ action: "health" }),
      sendResponse,
      getToken,
      "1.2.3"
    );

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result).toEqual({
      code: 200,
      action: "health",
      payload: {
        version: "1.2.3",
        actions: [
          "health",
          "identify",
          "sync",
          "syncBuyback",
          "syncBuybackDetail",
          "syncBuybackPricing",
          "verify-write",
          "verify-remove",
          "org-verify-write",
          "org-verify-remove",
        ],
      },
    });
    expect(getToken).not.toHaveBeenCalled();
  });

  it("responds to identify action with token", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn().mockResolvedValue("test-token");

    const mockResponse = {
      status: 200,
      json: vi.fn().mockResolvedValue({
        data: { member: { nickname: "TestUser" } },
      }),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any);

    await onMessage(JSON.stringify({ action: "identify" }), sendResponse, getToken, "1.0.0");

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result.code).toBe(200);
    expect(result.action).toBe("identify");
    expect(result.payload.handle).toBe("TestUser");
  });

  it("responds to identify action without token", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn().mockResolvedValue(null);

    await onMessage(JSON.stringify({ action: "identify" }), sendResponse, getToken, "1.0.0");

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result.code).toBe(400);
    expect(result.error).toContain("Token not found");
  });

  it("responds to sync action with token", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn().mockResolvedValue("test-token");

    const mockResponse = {
      status: 200,
      text: vi.fn().mockResolvedValue("<html>pledge data</html>"),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any);

    await onMessage(
      JSON.stringify({ action: "sync", page: 2 }),
      sendResponse,
      getToken,
      "1.0.0"
    );

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result.code).toBe(200);
    expect(result.action).toBe("sync");
    expect(result.payload).toBe("<html>pledge data</html>");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://robertsspaceindustries.com/account/pledges?page=2",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("responds to sync action without token", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn().mockResolvedValue(null);

    await onMessage(JSON.stringify({ action: "sync" }), sendResponse, getToken, "1.0.0");

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result.code).toBe(400);
    expect(result.error).toContain("Token not found");
  });

  it("responds to syncBuyback action with token", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn().mockResolvedValue("test-token");

    const mockResponse = {
      status: 200,
      text: vi.fn().mockResolvedValue("<html>buyback data</html>"),
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse as any);

    await onMessage(
      JSON.stringify({ action: "syncBuyback", page: 2 }),
      sendResponse,
      getToken,
      "1.0.0"
    );

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result.code).toBe(200);
    expect(result.action).toBe("syncBuyback");
    expect(result.payload).toBe("<html>buyback data</html>");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://robertsspaceindustries.com/account/buy-back-pledges?page=2",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("fetches a buy-back detail page by pledge id", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn().mockResolvedValue("test-token");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      status: 200,
      text: vi.fn().mockResolvedValue("<html>detail</html>"),
    } as any);

    await onMessage(
      JSON.stringify({ action: "syncBuybackDetail", id: "1000001" }),
      sendResponse,
      getToken,
      "1.0.0"
    );

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result).toEqual({
      code: 200,
      action: "syncBuybackDetail",
      id: "1000001",
      payload: "<html>detail</html>",
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://robertsspaceindustries.com/pledge/buyback/1000001",
      expect.objectContaining({ method: "GET" })
    );
  });

  it.each([["../../account/settings"], ["1000001?x=1"], [""], [undefined]])(
    "refuses a buy-back detail id of %s",
    async (id) => {
      const sendResponse = vi.fn();
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      await onMessage(
        JSON.stringify({ action: "syncBuybackDetail", id }),
        sendResponse,
        vi.fn().mockResolvedValue("test-token"),
        "1.0.0"
      );

      const result = JSON.parse(sendResponse.mock.calls[0]![0]);
      expect(result.code).toBe(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it("answers a buy-back detail request that fails", async () => {
    const sendResponse = vi.fn();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await onMessage(
      JSON.stringify({ action: "syncBuybackDetail", id: "1000001" }),
      sendResponse,
      vi.fn().mockResolvedValue("test-token"),
      "1.0.0"
    );

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result).toEqual({
      code: 500,
      action: "syncBuybackDetail",
      id: "1000001",
      error: "Buy-back detail failed",
    });
  });

  it("reads the account's store pricing after asking for a store token", async () => {
    const sendResponse = vi.fn();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: 1, data: "token" }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              data: {
                app: {
                  pricing: {
                    currencyCode: "EUR",
                    exchangeRate: 8800,
                    taxRate: 1900,
                    isTaxInclusive: true,
                  },
                },
              },
            },
          ]),
          { status: 200 }
        )
      );

    await onMessage(
      JSON.stringify({ action: "syncBuybackPricing" }),
      sendResponse,
      vi.fn().mockResolvedValue("test-token"),
      "1.0.0"
    );

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result).toEqual({
      code: 200,
      action: "syncBuybackPricing",
      payload: {
        currencyCode: "EUR",
        exchangeRate: 8800,
        taxRate: 1900,
        isTaxInclusive: true,
      },
    });
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "https://robertsspaceindustries.com/api/account/v2/setAuthToken",
      "https://robertsspaceindustries.com/pledge-store/api/upgrade/v2/graphql",
    ]);
  });

  // Without a store token RSI prices in USD whatever the account uses, so
  // reading on would convert other currencies with the wrong rate.
  it("reads no pricing when RSI refuses the store token", async () => {
    const sendResponse = vi.fn();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ success: 0 }), { status: 200 })
      );

    await onMessage(
      JSON.stringify({ action: "syncBuybackPricing" }),
      sendResponse,
      vi.fn().mockResolvedValue("test-token"),
      "1.0.0"
    );

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result.code).toBe(502);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("fails store pricing RSI answers without its rates", async () => {
    const sendResponse = vi.fn();
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: 1 }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ data: { app: { pricing: { currencyCode: "EUR" } } } }]),
          { status: 200 }
        )
      );

    await onMessage(
      JSON.stringify({ action: "syncBuybackPricing" }),
      sendResponse,
      vi.fn().mockResolvedValue("test-token"),
      "1.0.0"
    );

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result.code).toBe(502);
  });

  it("responds to syncBuyback action without token", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn().mockResolvedValue(null);

    await onMessage(
      JSON.stringify({ action: "syncBuyback" }),
      sendResponse,
      getToken,
      "1.0.0"
    );

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result.code).toBe(400);
    expect(result.error).toContain("Token not found");
  });

  it("responds to unknown action", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn();

    await onMessage(JSON.stringify({ action: "unknown" }), sendResponse, getToken, "1.0.0");

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result.code).toBe(500);
    expect(result.error).toBe("Unknown Action");
  });

  it("handles empty message", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn();

    await onMessage("", sendResponse, getToken, "1.0.0");

    const result = JSON.parse(sendResponse.mock.calls[0]![0]);
    expect(result.code).toBe(500);
    expect(result.error).toBe("Unknown Action");
  });
});

describe("onMessage verify actions", () => {
  const verificationToken = "FLEETYARDS-ABCDEFGHIJ";

  const citizenPage = (bio: string) =>
    `<span class="label">Handle name</span><div class="entry bio"><span class="label">Bio</span><div class="value">${bio}</div></div>`;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  const mockRsi = (bio: string, updateStatus = 200) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith("/api/spectrum/auth/identify")) {
        return json({ data: { member: { nickname: "Pilot" } } });
      }
      if (target.endsWith("/en/citizens/Pilot")) {
        return new Response(citizenPage(bio), { status: 200 });
      }
      if (target.endsWith("/api/settings/UpdateField")) {
        return json({ success: updateStatus === 200 }, updateStatus);
      }
      throw new Error(`unexpected ${target}`);
    });

  const send = async (message: object) => {
    const sendResponse = vi.fn();
    await onMessage(
      JSON.stringify(message),
      sendResponse,
      vi.fn().mockResolvedValue("rsi-token"),
      "1.2.3"
    );
    return JSON.parse(sendResponse.mock.calls[0]![0]);
  };

  const writtenBio = (fetch: ReturnType<typeof mockRsi>) => {
    const call = fetch.mock.calls.find(([url]) =>
      String(url).endsWith("/api/settings/UpdateField")
    );
    return call && JSON.parse(String(call[1]?.body));
  };

  it("appends the token to the signed-in account's bio", async () => {
    const fetch = mockRsi("Hello<br />\nthere");

    const result = await send({ action: "verify-write", token: verificationToken });

    expect(result).toEqual({
      code: 200,
      action: "verify-write",
      payload: { handle: "Pilot", changed: true },
    });
    expect(writtenBio(fetch)).toEqual({
      pageId: "my_profile",
      fieldId: "biography",
      value: `Hello\nthere\n\n${verificationToken}`,
    });
  });

  it("does not write a bio that already has the token", async () => {
    const fetch = mockRsi(verificationToken);

    const result = await send({ action: "verify-write", token: verificationToken });

    expect(result.payload).toEqual({ handle: "Pilot", changed: false });
    expect(writtenBio(fetch)).toBeUndefined();
  });

  it("answers 413 when the token does not fit", async () => {
    const fetch = mockRsi("x".repeat(1020));

    const result = await send({ action: "verify-write", token: verificationToken });

    expect(result.code).toBe(413);
    expect(writtenBio(fetch)).toBeUndefined();
  });

  it("answers 422 for a bio it cannot read back exactly", async () => {
    const fetch = mockRsi('<a href="https://x.test">x</a>');

    const result = await send({ action: "verify-write", token: verificationToken });

    expect(result.code).toBe(422);
    expect(writtenBio(fetch)).toBeUndefined();
  });

  it("passes on a failed update", async () => {
    mockRsi("Hello", 403);

    const result = await send({ action: "verify-write", token: verificationToken });

    expect(result.code).toBe(403);
  });

  it("treats a 200 that says it failed as a failed update", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith("/api/spectrum/auth/identify")) {
        return json({ data: { member: { nickname: "Pilot" } } });
      }
      if (target.endsWith("/en/citizens/Pilot")) {
        return new Response(citizenPage("Hello"), { status: 200 });
      }
      return json({ success: 0, msg: "ErrCsrf" });
    });

    const result = await send({ action: "verify-write", token: verificationToken });

    expect(result.code).not.toBe(200);
  });

  it("answers 401 without an RSI session cookie", async () => {
    const sendResponse = vi.fn();

    await onMessage(
      JSON.stringify({ action: "verify-write", token: verificationToken }),
      sendResponse,
      vi.fn().mockResolvedValue(null),
      "1.2.3"
    );

    expect(JSON.parse(sendResponse.mock.calls[0]![0])).toMatchObject({
      code: 401,
      action: "verify-write",
    });
  });

  it("answers 500 when RSI cannot be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));

    const result = await send({ action: "verify-write", token: verificationToken });

    expect(result).toMatchObject({ code: 500, action: "verify-write" });
  });

  it("refuses anything that is not a verification token", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");

    const result = await send({ action: "verify-write", token: "hello <b>world</b>" });

    expect(result.code).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("removes the token it appended", async () => {
    const fetch = mockRsi(`Hello<br />\n<br />\n${verificationToken}`);

    const result = await send({ action: "verify-remove", token: verificationToken });

    expect(result.payload).toEqual({ handle: "Pilot", changed: true });
    expect(writtenBio(fetch).value).toBe("Hello");
  });

  it("leaves a bio without the appended token alone", async () => {
    const fetch = mockRsi("Hello");

    const result = await send({ action: "verify-remove", token: verificationToken });

    expect(result.payload).toEqual({ handle: "Pilot", changed: false });
    expect(writtenBio(fetch)).toBeUndefined();
  });
});

describe("onMessage org verify actions", () => {
  const verificationToken = "FLEETYARDS-ABCDEFGHIJ";

  const orgPage = (history: string, manifesto = "Ours.") =>
    `<div class="markitup-text"><p>Intro.</p></div><div class="markitup-text">${history}</div><div class="markitup-text"><p>${manifesto}</p></div>`;

  const contentPage = (history: string) =>
    `<title>Description - Admin</title><textarea name="history">\n${history}</textarea>`;

  type Rsi = {
    content?: string;
    preview?: string;
    live?: string;
    save?: unknown;
    publish?: unknown;
  };

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  const mockRsi = ({
    content = contentPage("Our board."),
    preview = orgPage("<p>Our board.</p>"),
    live = orgPage("<p>Our board.</p>"),
    save = { success: 1 },
    publish = { success: 1 },
  }: Rsi = {}) =>
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith("/en/orgs/MARU/admin/content")) return new Response(content);
      if (target.endsWith("/en/orgs/MARU/admin/preview")) return new Response(preview);
      if (target.endsWith("/en/orgs/MARU")) return new Response(live);
      if (target.endsWith("/api/orgs/saveDraft")) return json(save);
      if (target.endsWith("/api/orgs/publishDraft")) return json(publish);
      throw new Error(`unexpected ${target}`);
    });

  const send = async (message: object) => {
    const sendResponse = vi.fn();
    await onMessage(
      JSON.stringify(message),
      sendResponse,
      vi.fn().mockResolvedValue("rsi-token"),
      "1.2.3"
    );
    return JSON.parse(sendResponse.mock.calls[0]![0]);
  };

  const posted = (fetch: ReturnType<typeof mockRsi>, path: string) =>
    fetch.mock.calls
      .filter(([url]) => String(url).endsWith(path))
      .map(([, init]) => JSON.parse(String(init?.body)));

  it("appends the token to the history and publishes it", async () => {
    const fetch = mockRsi();

    const result = await send({ action: "org-verify-write", sid: "MARU", token: verificationToken });

    expect(result).toEqual({
      code: 200,
      action: "org-verify-write",
      payload: { sid: "MARU", changed: true },
    });
    expect(posted(fetch, "/api/orgs/saveDraft")).toEqual([
      { symbol: "MARU", history: `Our board.\n\n${verificationToken}` },
    ]);
    expect(posted(fetch, "/api/orgs/publishDraft")).toEqual([{ symbol: "MARU" }]);
  });

  it("answers 403 for an account without rights on the org", async () => {
    const fetch = mockRsi({ content: "<title>Access denied - Roberts Space Industries</title>" });

    const result = await send({ action: "org-verify-write", sid: "MARU", token: verificationToken });

    expect(result.code).toBe(403);
    expect(posted(fetch, "/api/orgs/saveDraft")).toEqual([]);
  });

  it("answers 409 while another edit waits in the draft", async () => {
    const fetch = mockRsi({ preview: orgPage("<p>Our board.</p>", "Half done.") });

    const result = await send({ action: "org-verify-write", sid: "MARU", token: verificationToken });

    expect(result.code).toBe(409);
    expect(posted(fetch, "/api/orgs/saveDraft")).toEqual([]);
    expect(posted(fetch, "/api/orgs/publishDraft")).toEqual([]);
  });

  it("answers 422 for org pages it cannot read", async () => {
    const fetch = mockRsi({ preview: "<html></html>" });

    const result = await send({ action: "org-verify-write", sid: "MARU", token: verificationToken });

    expect(result.code).toBe(422);
    expect(posted(fetch, "/api/orgs/saveDraft")).toEqual([]);
  });

  it("does not publish when saving the draft was refused", async () => {
    const fetch = mockRsi({ save: { success: 0, msg: "ErrCsrf" } });

    const result = await send({ action: "org-verify-write", sid: "MARU", token: verificationToken });

    expect(result.code).toBe(502);
    expect(posted(fetch, "/api/orgs/publishDraft")).toEqual([]);
  });

  it("refuses an SID that is not one", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");

    const result = await send({ action: "org-verify-write", sid: "../x", token: verificationToken });

    expect(result.code).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("publishes a token a failed run left in the draft", async () => {
    const fetch = mockRsi({
      content: contentPage(`Our board.\n\n${verificationToken}`),
    });

    const result = await send({ action: "org-verify-write", sid: "MARU", token: verificationToken });

    expect(result.payload).toEqual({ sid: "MARU", changed: true });
    expect(posted(fetch, "/api/orgs/saveDraft")).toEqual([]);
    expect(posted(fetch, "/api/orgs/publishDraft")).toEqual([{ symbol: "MARU" }]);
  });

  it("does nothing for a token already in the draft and live", async () => {
    const fetch = mockRsi({
      content: contentPage(`Our board.\n\n${verificationToken}`),
      live: orgPage(`<p>Our board.</p><p>${verificationToken}</p>`),
      preview: orgPage(`<p>Our board.</p><p>${verificationToken}</p>`),
    });

    const result = await send({ action: "org-verify-write", sid: "MARU", token: verificationToken });

    expect(result.payload).toEqual({ sid: "MARU", changed: false });
    expect(posted(fetch, "/api/orgs/publishDraft")).toEqual([]);
  });

  it("puts the draft back when another edit arrives before publishing", async () => {
    let previewReads = 0;
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const target = String(url);
      if (target.endsWith("/admin/content")) return new Response(contentPage("Our board."));
      if (target.endsWith("/admin/preview")) {
        previewReads += 1;
        return new Response(
          previewReads === 1
            ? orgPage("<p>Our board.</p>")
            : orgPage("<p>Our board.</p>", "Someone else's draft.")
        );
      }
      if (target.endsWith("/en/orgs/MARU")) return new Response(orgPage("<p>Our board.</p>"));
      return json({ success: 1 });
    });

    const result = await send({ action: "org-verify-write", sid: "MARU", token: verificationToken });

    expect(result.code).toBe(409);
    expect(posted(fetch, "/api/orgs/saveDraft")).toEqual([
      { symbol: "MARU", history: `Our board.\n\n${verificationToken}` },
      { symbol: "MARU", history: "Our board." },
    ]);
    expect(posted(fetch, "/api/orgs/publishDraft")).toEqual([]);
  });

  it("answers 409 for a token it did not place", async () => {
    mockRsi({
      content: contentPage(`${verificationToken}\n\nOur board.`),
      live: orgPage(`<p>${verificationToken}</p><p>Our board.</p>`),
    });

    const result = await send({ action: "org-verify-remove", sid: "MARU", token: verificationToken });

    expect(result.code).toBe(409);
  });

  it("lets a remove wait for a write to the same org", async () => {
    const order: string[] = [];
    let releaseWrite: () => void = () => {};
    let draft = "Our board.";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const target = String(url);
      if (target.endsWith("/admin/content")) return new Response(contentPage(draft));
      if (target.endsWith("/admin/preview")) return new Response(orgPage("<p>Our board.</p>"));
      if (target.endsWith("/en/orgs/MARU")) return new Response(orgPage("<p>Our board.</p>"));
      if (target.endsWith("/api/orgs/saveDraft")) {
        const { history } = JSON.parse(String(init?.body));
        order.push(history.includes(verificationToken) ? "save-token" : "save-clean");
        if (history.includes(verificationToken)) {
          await new Promise<void>((resolve) => (releaseWrite = resolve));
        }
        draft = history;
      }
      return json({ success: 1 });
    });

    const write = send({ action: "org-verify-write", sid: "MARU", token: verificationToken });
    await vi.waitFor(() => expect(order).toEqual(["save-token"]));
    const remove = send({ action: "org-verify-remove", sid: "MARU", token: verificationToken });
    releaseWrite();
    await write;
    await remove;

    expect(order).toEqual(["save-token", "save-clean"]);
  });

  it("removes the token it appended and publishes again", async () => {
    const fetch = mockRsi({
      content: contentPage(`Our board.\n\n${verificationToken}`),
      live: orgPage(`<p>Our board.</p><p>${verificationToken}</p>`),
    });

    const result = await send({ action: "org-verify-remove", sid: "MARU", token: verificationToken });

    expect(result.payload).toEqual({ sid: "MARU", changed: true });
    expect(posted(fetch, "/api/orgs/saveDraft")).toEqual([
      { symbol: "MARU", history: "Our board." },
    ]);
    expect(posted(fetch, "/api/orgs/publishDraft")).toHaveLength(1);
  });
});

describe("handleResponse", () => {
  it("posts message for fleetyards.net origin", () => {
    const postMessage = vi.fn();
    handleResponse({ data: "test" }, "https://fleetyards.net", postMessage);

    expect(postMessage).toHaveBeenCalledWith(
      { direction: "fy-sync", message: { data: "test" } },
      "https://fleetyards.net"
    );
  });

  it("posts message for fleetyards.dev origin", () => {
    const postMessage = vi.fn();
    handleResponse({ data: "test" }, "https://fleetyards.dev", postMessage);

    expect(postMessage).toHaveBeenCalledWith(
      { direction: "fy-sync", message: { data: "test" } },
      "https://fleetyards.dev"
    );
  });

  it("posts message for fleetyards.test origin", () => {
    const postMessage = vi.fn();
    handleResponse({ data: "test" }, "http://fleetyards.test", postMessage);

    expect(postMessage).toHaveBeenCalledWith(
      { direction: "fy-sync", message: { data: "test" } },
      "http://fleetyards.test"
    );
  });

  it("posts message for localhost worktree origin", () => {
    const postMessage = vi.fn();
    handleResponse({ data: "test" }, "http://localhost:8123", postMessage);

    expect(postMessage).toHaveBeenCalledWith(
      { direction: "fy-sync", message: { data: "test" } },
      "http://localhost:8123"
    );
  });

  it("does not post message for localhost outside the 8xxx range", () => {
    const postMessage = vi.fn();
    handleResponse({ data: "test" }, "http://localhost:3000", postMessage);
    handleResponse({ data: "test" }, "http://localhost:80000", postMessage);

    expect(postMessage).not.toHaveBeenCalled();
  });

  it("does not post message for unknown origin", () => {
    const postMessage = vi.fn();
    handleResponse({ data: "test" }, "https://evil.com", postMessage);

    expect(postMessage).not.toHaveBeenCalled();
  });
});
