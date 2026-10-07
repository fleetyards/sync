import {
  identify,
  fetchPledges,
  fetchBuybacks,
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
  "verify-write",
  "verify-remove",
] as const;

type VerifyAction = "verify-write" | "verify-remove";

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
    if (!response.ok) {
      return {
        code: response.status,
        action,
        error: "Bio update failed",
        payload: { handle },
      };
    }
  }

  return { code: 200, action, payload: { handle, changed } };
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
        JSON.stringify({
          code: 400,
          action: message.action,
          error: "Token not found" + message?.action,
        })
      );
    } else {
      const result = await verifyBio(message.action, message.token, token).catch(
        () => ({ code: 500, action: message.action, error: "Bio update failed" })
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
