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
          "verify-write",
          "verify-remove",
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
