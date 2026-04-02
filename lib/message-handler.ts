import { identify, fetchPledges } from "./rsi";

type GetToken = () => Promise<string | null>;
type SendResponse = (message: string) => void;

export async function onMessage(
  rawMessage: string,
  sendResponse: SendResponse,
  getToken: GetToken
) {
  const message = JSON.parse(rawMessage || "{}");

  if (message?.action == "health") {
    console.info("FY Sync: Health check");

    sendResponse(JSON.stringify({ code: 200, action: message.action }));
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
  } else if (message?.action == "sync") {
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
      const response = await fetchPledges(token, message.page);
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

export function handleResponse(
  response: any,
  origin: string,
  postMessage: (data: any, targetOrigin: string) => void
) {
  if (ALLOWED_ORIGINS.includes(origin as any)) {
    postMessage(
      {
        direction: "fy-sync",
        message: response,
      },
      origin
    );
  }
}
