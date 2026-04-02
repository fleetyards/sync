import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchRSIApi, identify, fetchPledges, RSI_BASE_URL } from "@/lib/rsi";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("RSI_BASE_URL", () => {
  it("is the correct RSI URL", () => {
    expect(RSI_BASE_URL).toBe("https://robertsspaceindustries.com");
  });
});

describe("fetchRSIApi", () => {
  it("makes a POST request with correct headers", async () => {
    const mockResponse = new Response("{}", { status: 200 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    await fetchRSIApi({
      url: "https://example.com/api",
      payload: { key: "value" },
      rsiToken: "my-token",
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("https://example.com/api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "*/*",
        "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
        "X-Rsi-Token": "my-token",
      },
      credentials: "include",
      body: JSON.stringify({ key: "value" }),
    });
  });
});

describe("identify", () => {
  it("calls the spectrum auth identify endpoint", async () => {
    const mockResponse = new Response("{}", { status: 200 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    await identify("test-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://robertsspaceindustries.com/api/spectrum/auth/identify",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Rsi-Token": "test-token",
        }),
        body: "{}",
      })
    );
  });
});

describe("fetchPledges", () => {
  it("fetches pledges with default page 1", async () => {
    const mockResponse = new Response("html", { status: 200 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    await fetchPledges("test-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://robertsspaceindustries.com/account/pledges?page=1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-Rsi-Token": "test-token",
          "Cache-Control": "max-age=0",
        }),
      })
    );
  });

  it("fetches pledges with specified page", async () => {
    const mockResponse = new Response("html", { status: 200 });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockResponse);

    await fetchPledges("test-token", 5);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://robertsspaceindustries.com/account/pledges?page=5",
      expect.anything()
    );
  });
});
