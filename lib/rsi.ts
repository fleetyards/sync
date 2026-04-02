export const RSI_BASE_URL = "https://robertsspaceindustries.com";

export type RSIApiParams = {
  url: string;
  payload: any;
  rsiToken: string;
};

export function fetchRSIApi(params: RSIApiParams) {
  return fetch(params.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "X-Rsi-Token": params.rsiToken,
    },
    credentials: "include",
    body: JSON.stringify(params.payload),
  });
}

export function identify(token: string) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/api/spectrum/auth/identify`,
    payload: {},
    rsiToken: token,
  });
}

export function fetchPledges(token: string, page = 1) {
  return fetch(`${RSI_BASE_URL}/account/pledges?page=${page}`, {
    method: "GET",
    headers: {
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "Cache-Control": "max-age=0",
      "X-Rsi-Token": token,
    },
    credentials: "include",
  });
}
