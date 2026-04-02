import { describe, it, expect, vi, beforeEach } from "vitest";
import { onMessage, handleResponse } from "@/lib/message-handler";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("onMessage", () => {
  it("responds to health action", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn();

    await onMessage(JSON.stringify({ action: "health" }), sendResponse, getToken);

    const result = JSON.parse(sendResponse.mock.calls[0][0]);
    expect(result).toEqual({ code: 200, action: "health" });
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

    await onMessage(JSON.stringify({ action: "identify" }), sendResponse, getToken);

    const result = JSON.parse(sendResponse.mock.calls[0][0]);
    expect(result.code).toBe(200);
    expect(result.action).toBe("identify");
    expect(result.payload.handle).toBe("TestUser");
  });

  it("responds to identify action without token", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn().mockResolvedValue(null);

    await onMessage(JSON.stringify({ action: "identify" }), sendResponse, getToken);

    const result = JSON.parse(sendResponse.mock.calls[0][0]);
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
      getToken
    );

    const result = JSON.parse(sendResponse.mock.calls[0][0]);
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

    await onMessage(JSON.stringify({ action: "sync" }), sendResponse, getToken);

    const result = JSON.parse(sendResponse.mock.calls[0][0]);
    expect(result.code).toBe(400);
    expect(result.error).toContain("Token not found");
  });

  it("responds to unknown action", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn();

    await onMessage(JSON.stringify({ action: "unknown" }), sendResponse, getToken);

    const result = JSON.parse(sendResponse.mock.calls[0][0]);
    expect(result.code).toBe(500);
    expect(result.error).toBe("Unknown Action");
  });

  it("handles empty message", async () => {
    const sendResponse = vi.fn();
    const getToken = vi.fn();

    await onMessage("", sendResponse, getToken);

    const result = JSON.parse(sendResponse.mock.calls[0][0]);
    expect(result.code).toBe(500);
    expect(result.error).toBe("Unknown Action");
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

  it("does not post message for unknown origin", () => {
    const postMessage = vi.fn();
    handleResponse({ data: "test" }, "https://evil.com", postMessage);

    expect(postMessage).not.toHaveBeenCalled();
  });
});
