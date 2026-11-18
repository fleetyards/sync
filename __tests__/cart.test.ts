import { describe, it, expect, vi, beforeEach } from "vitest";
import { addToCart, parseCartItems, parseCsrfToken } from "@/lib/cart";
import { onMessage } from "@/lib/message-handler";

const CART_PAGE = '<html><head><meta name="csrf-token" content="csrf-123"></head></html>';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Answers by path, and records each request's path, headers and body.
function mockRsi(routes: Record<string, (body: any) => Response>) {
  const calls: { path: string; headers: Record<string, string>; body: any }[] = [];

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, headers: (init?.headers ?? {}) as Record<string, string>, body });

    if (path === "/en/store/pledge/cart") return new Response(CART_PAGE);
    const route = routes[path];
    if (!route) throw new Error(`unexpected request to ${path}`);

    return route(body);
  });

  return calls;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("parseCartItems", () => {
  it("reads every kind, ids given as strings or numbers", () => {
    expect(
      parseCartItems([
        { id: "a", kind: "sku", skuId: "17402" },
        { id: "b", kind: "upgrade", fromShipId: 271, toShipId: 103, toSkuId: 13053 },
        { id: "c", kind: "upgrade", fromShipId: 56, toShipId: 329, toSkuId: 19753, pledgeId: "115843848" },
        { id: "d", kind: "buyback", pledgeId: "115575665" },
      ])
    ).toEqual([
      { id: "a", kind: "sku", skuId: 17402, qty: 1 },
      { id: "b", kind: "upgrade", fromShipId: 271, toShipId: 103, toSkuId: 13053, pledgeId: null },
      { id: "c", kind: "upgrade", fromShipId: 56, toShipId: 329, toSkuId: 19753, pledgeId: 115843848 },
      { id: "d", kind: "buyback", pledgeId: 115575665 },
    ]);
  });

  it("refuses anything but plain ids", () => {
    expect(parseCartItems([{ id: "a", kind: "sku", skuId: "1/../2" }])).toBeNull();
    expect(parseCartItems([{ id: "a", kind: "buyback", pledgeId: "https://x" }])).toBeNull();
    expect(parseCartItems([{ id: "a", kind: "upgrade", fromShipId: 1, toShipId: 2 }])).toBeNull();
    expect(parseCartItems([{ id: "a b", kind: "sku", skuId: 1 }])).toBeNull();
    expect(parseCartItems([{ id: "a", kind: "checkout" }])).toBeNull();
    expect(parseCartItems([])).toBeNull();
    expect(parseCartItems("a")).toBeNull();
  });

  it("refuses more than a cart's worth", () => {
    const items = Array.from({ length: 51 }, (_, index) => ({ id: `i${index}`, kind: "sku", skuId: 1 }));

    expect(parseCartItems(items)).toBeNull();
  });
});

describe("parseCsrfToken", () => {
  it("reads the meta tag in either attribute order", () => {
    expect(parseCsrfToken(CART_PAGE)).toBe("csrf-123");
    expect(parseCsrfToken('<meta content="csrf-456" name="csrf-token" />')).toBe("csrf-456");
    expect(parseCsrfToken("<html></html>")).toBeNull();
  });
});

describe("addToCart", () => {
  it("adds a store SKU with the page's CSRF token", async () => {
    const calls = mockRsi({
      "/graphql": () => json([{ data: { store: { cart: { mutations: { addMany: { count: 1 } } } } } }]),
    });

    const result = await addToCart("rsi-token", [{ id: "a", kind: "sku", skuId: 17402, qty: 1 }]);

    expect(result).toEqual({ code: 200, payload: { results: [{ id: "a", ok: true }] } });
    const mutation = calls.find((call) => call.path === "/graphql")!;
    expect(mutation.headers["X-CSRF-TOKEN"]).toBe("csrf-123");
    expect(mutation.headers["X-Rsi-Token"]).toBe("rsi-token");
    expect(mutation.body[0].variables.query).toEqual([{ skuId: "17402", qty: 1 }]);
  });

  it("adds an upgrade in three steps, a bought-back one naming its pledge", async () => {
    const calls = mockRsi({
      "/api/ship-upgrades/setContextToken": () => json({ success: 1, code: "OK" }),
      "/pledge-store/api/upgrade/v2/graphql": () => json([{ data: { addToCart: { jwt: "jwt-1" } } }]),
      "/api/store/v2/cart/token": () => json({ success: 1, code: "OK", data: true }),
    });

    const result = await addToCart("rsi-token", [
      { id: "b", kind: "upgrade", fromShipId: 56, toShipId: 329, toSkuId: 19753, pledgeId: 115843848 },
    ]);

    expect(result.payload?.results).toEqual([{ id: "b", ok: true }]);
    expect(calls.map((call) => call.path)).toEqual([
      "/en/store/pledge/cart",
      "/api/ship-upgrades/setContextToken",
      "/pledge-store/api/upgrade/v2/graphql",
      "/api/store/v2/cart/token",
    ]);
    expect(calls[1]!.body).toEqual({ fromShipId: 56, toShipId: 329, toSkuId: 19753, pledgeId: 115843848 });
    expect(calls[2]!.body[0].variables).toEqual({ from: 56, to: 19753 });
    expect(calls[3]!.body).toEqual({ jwt: "jwt-1" });
  });

  it("says why RSI refused each item, and goes on with the next", async () => {
    mockRsi({
      "/graphql": () =>
        json([
          {
            errors: [
              {
                message: "Invalid cart",
                code: "TyCartValidationException",
                extensions: { details: { skus: "Cannot acquire more than 1 item at once with a Pledge Buy-Back" } },
              },
            ],
          },
        ]),
      "/api/ship-upgrades/setContextToken": () => json({ success: 1 }),
      "/pledge-store/api/upgrade/v2/graphql": () =>
        json([{ errors: [{ message: "Upgrade not available. Upgrade from ship 103 to ship sku 13053 is not available." }], data: null }]),
      "/api/store/buyBackPledge": () => json({ success: 0, code: "ErrBuyBackPledge", msg: "Invalid Buy-Back Pledge" }),
    });

    const result = await addToCart("rsi-token", [
      { id: "a", kind: "sku", skuId: 17402, qty: 1 },
      { id: "b", kind: "upgrade", fromShipId: 103, toShipId: 103, toSkuId: 13053, pledgeId: null },
      { id: "c", kind: "buyback", pledgeId: 1 },
    ]);

    expect(result.payload?.results).toEqual([
      { id: "a", ok: false, error: "buybackNotAlone", message: "Cannot acquire more than 1 item at once with a Pledge Buy-Back" },
      { id: "b", ok: false, error: "unavailable", message: "Upgrade not available. Upgrade from ship 103 to ship sku 13053 is not available." },
      { id: "c", ok: false, error: "buybackInvalid", message: "Invalid Buy-Back Pledge" },
    ]);
  });

  it("reads an unknown SKU as unavailable", async () => {
    mockRsi({
      "/graphql": () =>
        json([{ errors: [{ message: "Invalid cart", code: "TyCartValidationException", extensions: { details: null } }] }]),
    });

    const result = await addToCart("rsi-token", [{ id: "a", kind: "sku", skuId: 1, qty: 1 }]);

    expect(result.payload?.results).toEqual([{ id: "a", ok: false, error: "unavailable", message: "Invalid cart" }]);
  });

  it("adds nothing when the store page carries no CSRF token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html></html>"));

    const result = await addToCart("rsi-token", [{ id: "a", kind: "sku", skuId: 1, qty: 1 }]);

    expect(result).toEqual({ code: 502, error: "Store unreadable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("onMessage addToCart", () => {
  it("answers 400 for items it will not send to RSI", async () => {
    const sendResponse = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await onMessage(
      JSON.stringify({ action: "addToCart", items: [{ id: "a", kind: "sku", skuId: "x" }] }),
      sendResponse,
      vi.fn().mockResolvedValue("rsi-token"),
      "1.0.0"
    );

    expect(JSON.parse(sendResponse.mock.calls[0]![0])).toEqual({
      code: 400,
      action: "addToCart",
      error: "Invalid cart items",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers 401 without an RSI session", async () => {
    const sendResponse = vi.fn();

    await onMessage(
      JSON.stringify({ action: "addToCart", items: [{ id: "a", kind: "sku", skuId: 1 }] }),
      sendResponse,
      vi.fn().mockResolvedValue(null),
      "1.0.0"
    );

    expect(JSON.parse(sendResponse.mock.calls[0]![0])).toEqual({
      code: 401,
      action: "addToCart",
      error: "No RSI session",
    });
  });

  it("answers with a result per item", async () => {
    const sendResponse = vi.fn();
    mockRsi({ "/api/store/buyBackPledge": () => json({ success: 1, code: "OK" }) });

    await onMessage(
      JSON.stringify({ action: "addToCart", items: [{ id: "d", kind: "buyback", pledgeId: "115575665" }] }),
      sendResponse,
      vi.fn().mockResolvedValue("rsi-token"),
      "1.0.0"
    );

    expect(JSON.parse(sendResponse.mock.calls[0]![0])).toEqual({
      action: "addToCart",
      code: 200,
      payload: { results: [{ id: "d", ok: true }] },
    });
  });
});
