import {
  identify,
  fetchPledges,
  fetchBuybacks,
  fetchBuybackDetail,
  fetchUpgradePrices,
  MAX_UPGRADE_PRICES,
  type UpgradePair,
  fetchCitizenPage,
  updateBio,
} from "./rsi";
import {
  BioTooLongError,
  VERIFICATION_TOKEN_PATTERN,
  parseBio,
  withToken,
  withoutToken,
} from "./bio";

type GetToken = () => Promise<string | null>;
type SendResponse = (message: string) => void;

export const SUPPORTED_ACTIONS = [
  "health",
  "identify",
  "sync",
  "syncBuyback",
  "syncBuybackDetail",
  "syncBuybackUpgradePrices",
  "verify-write",
  "verify-remove",
] as const;

type VerifyAction = "verify-write" | "verify-remove";

// RSI's APIs answer some refusals with a 200 and `success: 0` in the body.
async function reportsSuccess(response: Response) {
  const body = await response.json().catch(() => undefined);

  return !(body && typeof body === "object" && "success" in body && !body.success);
}

// Writes into the signed-in account's own bio, and only ever a FleetYards
// verification token: the page that asks can be any script on a FleetYards
// origin, so it gets no say over what else ends up there.
async function verifyBio(
  action: VerifyAction,
  verificationToken: unknown,
  rsiToken: string
) {
  if (
    typeof verificationToken !== "string" ||
    !VERIFICATION_TOKEN_PATTERN.test(verificationToken)
  ) {
    return { code: 400, action, error: "Invalid verification token" };
  }

  const identity = await identify(rsiToken);
  const handle: string | undefined = identity.ok
    ? (await identity.json()).data?.member?.nickname
    : undefined;
  if (!handle) {
    return { code: 401, action, error: "No RSI session" };
  }

  const page = await fetchCitizenPage(handle);
  const bio = page.ok ? parseBio(await page.text()) : null;
  if (bio === null) {
    return { code: 422, action, error: "Bio unreadable", payload: { handle } };
  }

  let next: string;
  let changed: boolean;
  try {
    if (action === "verify-write") {
      ({ bio: next, added: changed } = withToken(bio, verificationToken));
    } else {
      ({ bio: next, removed: changed } = withoutToken(bio, verificationToken));
    }
  } catch (error) {
    if (error instanceof BioTooLongError) {
      return { code: 413, action, error: "Bio too long", payload: { handle } };
    }
    throw error;
  }

  if (changed) {
    const response = await updateBio(rsiToken, next);
    if (!response.ok || !(await reportsSuccess(response))) {
      return {
        code: response.ok ? 502 : response.status,
        action,
        error: "Bio update failed",
        payload: { handle },
      };
    }
  }

  return { code: 200, action, payload: { handle, changed } };
}

// The page asking can be any script on a FleetYards origin, so it only ever
// names a pledge by its numeric id and never a URL of its own.
const PLEDGE_ID_PATTERN = /^\d{1,12}$/;

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function upgradePairs(value: unknown): UpgradePair[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_UPGRADE_PRICES
  ) {
    return null;
  }

  const pairs = value.map((pair) =>
    isPositiveInteger(pair?.from) && isPositiveInteger(pair?.to)
      ? { from: pair.from, to: pair.to }
      : null
  );

  return pairs.every((pair) => pair) ? (pairs as UpgradePair[]) : null;
}

type GraphqlResult = {
  data?: {
    app?: { pricing?: { currencyCode?: string } };
    price?: { amount?: number };
  } | null;
};

// One answer per operation, in order: the currency first, then one price per
// pair. A pair RSI does not know fails on its own and comes back as `null`.
async function upgradePrices(token: string, pairs: UpgradePair[]) {
  const response = await fetchUpgradePrices(token, pairs);
  if (!response.ok) {
    return { code: response.status, error: "Upgrade prices failed" };
  }

  // A pair RSI does not price still answers, with `data: null`; a batch with
  // fewer answers than questions is not read at all.
  const results: unknown = await response.json().catch(() => undefined);
  const currency =
    Array.isArray(results) && results.length === pairs.length + 1
      ? (results as GraphqlResult[])[0]?.data?.app?.pricing?.currencyCode
      : undefined;
  if (!currency) {
    return { code: 502, error: "Upgrade prices unreadable" };
  }

  return {
    code: 200,
    payload: {
      currency,
      prices: pairs.map((pair, index) => ({
        ...pair,
        amount:
          (results as GraphqlResult[])[index + 1]?.data?.price?.amount ?? null,
      })),
    },
  };
}

export async function onMessage(
  rawMessage: string,
  sendResponse: SendResponse,
  getToken: GetToken,
  version: string
) {
  const message = JSON.parse(rawMessage || "{}");

  if (message?.action == "health") {
    console.info("FY Sync: Health check");

    sendResponse(
      JSON.stringify({
        code: 200,
        action: message.action,
        payload: { version, actions: SUPPORTED_ACTIONS },
      })
    );
  } else if (
    message?.action == "verify-write" ||
    message?.action == "verify-remove"
  ) {
    console.info("FY Sync: Updating Bio");

    const token = await getToken();
    if (!token) {
      sendResponse(
        JSON.stringify({ code: 401, action: message.action, error: "No RSI session" })
      );
    } else {
      const result = await verifyBio(message.action, message.token, token).catch(
        (error) => {
          console.error("FY Sync: Bio update failed", error);

          return { code: 500, action: message.action, error: "Bio update failed" };
        }
      );

      sendResponse(JSON.stringify(result));
    }
  } else if (message?.action == "identify") {
    console.info("FY Sync: Fetching Identity");

    const token = await getToken();
    if (!token) {
      sendResponse(
        JSON.stringify({
          code: 400,
          action: message.action,
          error: "Token not found" + message?.action,
        })
      );
    } else {
      const response = await identify(token);
      const body = await response.json();

      sendResponse(
        JSON.stringify({
          code: response.status,
          action: message.action,
          payload: {
            handle: body.data?.member?.nickname,
          },
        })
      );
    }
  } else if (message?.action == "syncBuybackDetail") {
    const id = String(message.id ?? "");
    const token = await getToken();

    if (!PLEDGE_ID_PATTERN.test(id)) {
      sendResponse(
        JSON.stringify({ code: 400, action: message.action, error: "Invalid pledge id" })
      );
    } else if (!token) {
      sendResponse(
        JSON.stringify({ code: 401, action: message.action, id, error: "No RSI session" })
      );
    } else {
      const result = await fetchBuybackDetail(token, id)
        .then(async (response) => ({
          code: response.status,
          payload: await response.text(),
        }))
        .catch((error) => {
          console.error("FY Sync: Buy-back detail failed", error);

          return { code: 500, error: "Buy-back detail failed" };
        });

      sendResponse(JSON.stringify({ action: message.action, id, ...result }));
    }
  } else if (message?.action == "syncBuybackUpgradePrices") {
    const pairs = upgradePairs(message.upgrades);
    const token = await getToken();

    if (!pairs) {
      sendResponse(
        JSON.stringify({ code: 400, action: message.action, error: "Invalid upgrades" })
      );
    } else if (!token) {
      sendResponse(
        JSON.stringify({ code: 401, action: message.action, error: "No RSI session" })
      );
    } else {
      const result = await upgradePrices(token, pairs).catch((error) => {
        console.error("FY Sync: Upgrade prices failed", error);

        return { code: 500, error: "Upgrade prices failed" };
      });

      sendResponse(JSON.stringify({ action: message.action, ...result }));
    }
  } else if (message?.action == "sync" || message?.action == "syncBuyback") {
    const token = await getToken();
    if (!token) {
      sendResponse(
        JSON.stringify({
          code: 400,
          action: message.action,
          error: "Token not found" + message?.action,
        })
      );
    } else {
      const fetchPage =
        message.action == "syncBuyback" ? fetchBuybacks : fetchPledges;
      const response = await fetchPage(token, message.page);
      const payload = await response.text();

      sendResponse(
        JSON.stringify({
          code: response.status,
          action: message.action,
          payload,
        })
      );
    }
  } else {
    console.info("FY Sync: Unknown Action");

    sendResponse(
      JSON.stringify({
        code: 500,
        action: message.action,
        error: "Unknown Action",
      })
    );
  }
}

const ALLOWED_ORIGINS = [
  "https://fleetyards.net",
  "https://fleetyards.dev",
  "http://fleetyards.test",
] as const;

const LOCAL_WORKTREE_ORIGIN = /^http:\/\/localhost:8\d{3}$/;

function isAllowedOrigin(origin: string) {
  return (
    ALLOWED_ORIGINS.includes(origin as any) ||
    LOCAL_WORKTREE_ORIGIN.test(origin)
  );
}

export function handleResponse(
  response: any,
  origin: string,
  postMessage: (data: any, targetOrigin: string) => void
) {
  if (isAllowedOrigin(origin)) {
    postMessage(
      {
        direction: "fy-sync",
        message: response,
      },
      origin
    );
  }
}
