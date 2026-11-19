import {
  addSkusToCart,
  buyBackPledge,
  createUpgradeCartToken,
  fetchCartPage,
  redeemCartToken,
  setUpgradeContext,
} from "./rsi";

export type CartItem =
  | { id: string; kind: "sku"; skuId: number; qty: number }
  | {
      id: string;
      kind: "upgrade";
      fromShipId: number;
      toShipId: number;
      toSkuId: number;
      pledgeId: number | null;
    }
  | { id: string; kind: "buyback"; pledgeId: number };

// What the page shows the user, by cause rather than by RSI's wording.
export type CartError =
  | "unavailable"
  | "buybackInvalid"
  | "buybackNotAlone"
  | "failed";

export type CartResult =
  | { id: string; ok: true }
  | { id: string; ok: false; error: CartError; message?: string };

// The page asking can be any script on a FleetYards origin, so it names what
// to add by ids alone, and only a cart's worth of them.
export const MAX_CART_ITEMS = 50;
const ITEM_ID_PATTERN = /^[\w:-]{1,64}$/;
const ID_PATTERN = /^\d{1,12}$/;

const rsiId = (value: unknown) =>
  (typeof value === "number" || typeof value === "string") &&
  ID_PATTERN.test(String(value))
    ? Number(value)
    : undefined;

export function parseCartItems(value: unknown): CartItem[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CART_ITEMS) {
    return null;
  }

  const items: CartItem[] = [];
  for (const raw of value) {
    const id = raw?.id;
    if (typeof id !== "string" || !ITEM_ID_PATTERN.test(id)) return null;

    if (raw.kind === "sku") {
      const skuId = rsiId(raw.skuId);
      const qty = raw.qty ?? 1;
      if (!skuId || !Number.isInteger(qty) || qty < 1 || qty > 20) return null;
      items.push({ id, kind: "sku", skuId, qty });
    } else if (raw.kind === "upgrade") {
      const fromShipId = rsiId(raw.fromShipId);
      const toShipId = rsiId(raw.toShipId);
      const toSkuId = rsiId(raw.toSkuId);
      const pledgeId = raw.pledgeId == null ? null : rsiId(raw.pledgeId);
      if (!fromShipId || !toShipId || !toSkuId || pledgeId === undefined) return null;
      items.push({ id, kind: "upgrade", fromShipId, toShipId, toSkuId, pledgeId });
    } else if (raw.kind === "buyback") {
      const pledgeId = rsiId(raw.pledgeId);
      if (!pledgeId) return null;
      items.push({ id, kind: "buyback", pledgeId });
    } else {
      return null;
    }
  }

  return items;
}

export function parseCsrfToken(html: string) {
  const tag = html.match(/<meta\b[^>]*\bname="csrf-token"[^>]*>/i)?.[0];

  return tag?.match(/\bcontent="([^"]+)"/i)?.[1] ?? null;
}

const BUYBACK_ALONE = /Buy-?Back/i;

// GraphQL refusals come back with a 200: the cause sits in `errors`.
function graphqlError(body: any): { error: CartError; message?: string } | null {
  const error = (Array.isArray(body) ? body[0] : body)?.errors?.[0];
  if (!error) return null;

  const details = error.extensions?.details;
  if (typeof details?.skus === "string" && BUYBACK_ALONE.test(details.skus)) {
    return { error: "buybackNotAlone", message: details.skus };
  }
  if (
    error.code === "TyCartValidationException" ||
    /not available/i.test(error.message ?? "")
  ) {
    return { error: "unavailable", message: error.message };
  }

  return { error: "failed", message: error.message };
}

// RSI's REST endpoints refuse with a 200 and `success: 0`.
function restError(body: any): { error: CartError; message?: string } | null {
  if (body?.success !== 0) return null;

  return {
    error: body.code === "ErrBuyBackPledge" ? "buybackInvalid" : "failed",
    message: body.msg,
  };
}

async function readJson(response: Response) {
  return response.json().catch(() => undefined);
}

type Outcome = { error: CartError; message?: string } | null;

async function addSku(token: string, csrf: string, item: Extract<CartItem, { kind: "sku" }>): Promise<Outcome> {
  const response = await addSkusToCart(token, csrf, [item]);
  if (!response.ok) return { error: "failed", message: `HTTP ${response.status}` };

  const body = await readJson(response);
  const error = graphqlError(body);
  if (error) return error;

  const added = (Array.isArray(body) ? body[0] : body)?.data?.store?.cart?.mutations?.addMany?.count;

  return added ? null : { error: "unavailable" };
}

async function addUpgrade(token: string, csrf: string, item: Extract<CartItem, { kind: "upgrade" }>): Promise<Outcome> {
  const { fromShipId, toShipId, toSkuId, pledgeId } = item;

  const context = await setUpgradeContext(token, csrf, { fromShipId, toShipId, toSkuId, pledgeId });
  if (!context.ok) return { error: "failed", message: `HTTP ${context.status}` };
  const contextError = restError(await readJson(context));
  if (contextError) return contextError;

  const created = await createUpgradeCartToken(token, csrf, fromShipId, toSkuId);
  if (!created.ok) return { error: "failed", message: `HTTP ${created.status}` };
  const body = await readJson(created);
  const createError = graphqlError(body);
  if (createError) return createError;

  const jwt = (Array.isArray(body) ? body[0] : body)?.data?.addToCart?.jwt;
  if (typeof jwt !== "string") return { error: "failed" };

  const redeemed = await redeemCartToken(token, csrf, jwt);
  if (!redeemed.ok) return { error: "failed", message: `HTTP ${redeemed.status}` };

  return restError(await readJson(redeemed));
}

async function addBuyback(token: string, csrf: string, item: Extract<CartItem, { kind: "buyback" }>): Promise<Outcome> {
  const response = await buyBackPledge(token, csrf, item.pledgeId);
  if (!response.ok) return { error: "failed", message: `HTTP ${response.status}` };

  return restError(await readJson(response));
}

// One at a time, so each item gets its own answer: one SKU RSI refuses fails
// a whole batched mutation without saying which.
export async function addToCart(token: string, items: CartItem[]) {
  const page = await fetchCartPage(token);
  const csrf = page.ok ? parseCsrfToken(await page.text()) : null;
  if (!csrf) {
    return { code: page.ok ? 502 : page.status, error: "Store unreadable" };
  }

  const results: CartResult[] = [];
  for (const item of items) {
    const outcome = await (item.kind === "sku"
      ? addSku(token, csrf, item)
      : item.kind === "upgrade"
        ? addUpgrade(token, csrf, item)
        : addBuyback(token, csrf, item)
    ).catch((error): Outcome => ({ error: "failed", message: String(error?.message ?? error) }));

    results.push(outcome ? { id: item.id, ok: false, ...outcome } : { id: item.id, ok: true });
  }

  return { code: 200, payload: { results } };
}
