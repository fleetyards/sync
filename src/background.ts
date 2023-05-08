import browser from "webextension-polyfill";

const RSI_BASE_URL = "https://robertsspaceindustries.com";

async function getRSIToken(): Promise<string | null> {
  const cookie = await browser.cookies.get({
    url: RSI_BASE_URL,
    name: "Rsi-Token",
  });

  if (cookie) {
    return cookie.value;
  }

  return null;
}

type RSIApiParams = {
  url: string;
  payload: any;
  rsiToken: string;
};

async function fetchRSIApi(params: RSIApiParams) {
  var url = params.url;
  var payload = params.payload;
  var rsiToken = params.rsiToken;

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "X-Rsi-Token": rsiToken,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
}

function identify(token: string) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/api/spectrum/auth/identify`,
    payload: {},
    rsiToken: token,
  });
}

async function fetchPledges(page = 1) {
  return fetch(`${RSI_BASE_URL}/account/pledges?page=${page}`, {
    method: "GET",
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "Cache-Control": "max-age=0",
    },
    credentials: "include",
  });
}

async function onMessage(
  rawMessage: string,
  sendResponse: (message: string) => void
) {
  const message = JSON.parse(rawMessage || "{}");

  if (message?.action == "health") {
    console.info("FY Sync: Health check");

    sendResponse(JSON.stringify({ code: 200, action: message.action }));
  } else if (message?.action == "identify") {
    console.info("FY Sync: Fetching Identity");

    const token = await getRSIToken();
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
    const response = await fetchPledges(message.page);
    const payload = await response.text();

    sendResponse(
      JSON.stringify({
        code: response.status,
        action: message.action,
        payload,
      })
    );
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

browser.runtime.onMessage.addListener(function (
  message,
  _sender,
  sendResponse
) {
  onMessage(message, sendResponse);

  return true;
});
