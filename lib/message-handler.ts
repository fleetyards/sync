import {
  identify,
  fetchPledges,
  fetchBuybacks,
  fetchBuybackDetail,
  setStoreAuthToken,
  fetchStorePricing,
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
  "syncBuybackPricing",
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

type StorePricing = {
  currencyCode: string;
  exchangeRate: number;
  taxRate: number;
  isTaxInclusive: boolean;
};

function isStorePricing(value: any): value is StorePricing {
  return (
    typeof value?.currencyCode === "string" &&
    Number.isFinite(value?.exchangeRate) &&
    Number.isFinite(value?.taxRate) &&
    typeof value?.isTaxInclusive === "boolean"
  );
}

// The currency, exchange rate and tax RSI converts the account's prices with,
// so FleetYards can turn a buy-back price back into RSI's own USD figure.
async function storePricing(token: string) {
  const auth = await setStoreAuthToken(token);
  if (!auth.ok || !(await reportsSuccess(auth))) {
    return { code: auth.ok ? 502 : auth.status, error: "Store token failed" };
  }

  const response = await fetchStorePricing(token);
  if (!response.ok) {
    return { code: response.status, error: "Store pricing failed" };
  }

  const results: any = await response.json().catch(() => undefined);
  const pricing = Array.isArray(results)
    ? results[0]?.data?.app?.pricing
    : undefined;
  if (!isStorePricing(pricing)) {
    return { code: 502, error: "Store pricing unreadable" };
  }

  const { currencyCode, exchangeRate, taxRate, isTaxInclusive } = pricing;

  return {
    code: 200,
    payload: { currencyCode, exchangeRate, taxRate, isTaxInclusive },
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
  } else if (message?.action == "syncBuybackPricing") {
    const token = await getToken();

    if (!token) {
      sendResponse(
        JSON.stringify({ code: 401, action: message.action, error: "No RSI session" })
      );
    } else {
      const result = await storePricing(token).catch((error) => {
        console.error("FY Sync: Store pricing failed", error);

        return { code: 500, error: "Store pricing failed" };
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
