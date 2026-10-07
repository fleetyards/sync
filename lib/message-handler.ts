import { identify, fetchPledges, fetchBuybacks } from "./rsi";

type GetToken = () => Promise<string | null>;
type SendResponse = (message: string) => void;

export const SUPPORTED_ACTIONS = [
  "health",
  "identify",
  "sync",
  "syncBuyback",
] as const;

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
