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

const HTML_PAGE_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
  "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
  "Cache-Control": "max-age=0",
};

function fetchAccountPage(path: string, token: string, page: number) {
  return fetch(`${RSI_BASE_URL}/account/${path}?page=${page}`, {
    method: "GET",
    headers: {
      ...HTML_PAGE_HEADERS,
      "X-Rsi-Token": token,
    },
    credentials: "include",
  });
}

export function fetchPledges(token: string, page = 1) {
  return fetchAccountPage("pledges", token, page);
}

export function fetchBuybacks(token: string, page = 1) {
  return fetchAccountPage("buy-back-pledges", token, page);
}

export function fetchBuybackDetail(token: string, id: string) {
  return fetch(`${RSI_BASE_URL}/pledge/buyback/${id}`, {
    method: "GET",
    headers: {
      ...HTML_PAGE_HEADERS,
      "X-Rsi-Token": token,
    },
    credentials: "include",
  });
}

// The store prices in the account's currency once it has a store token, which
// RSI's own pages ask for the same way before they show a price. Without one
// it answers in USD whatever the account uses.
export function setStoreAuthToken(token: string) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/api/account/v2/setAuthToken`,
    payload: {},
    rsiToken: token,
  });
}

export function fetchStorePricing(token: string) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/pledge-store/api/upgrade/v2/graphql`,
    payload: [
      {
        operationName: "pricing",
        variables: {},
        query:
          "query pricing { app { pricing { currencyCode exchangeRate taxRate isTaxInclusive } } }",
      },
    ],
    rsiToken: token,
  });
}

export function fetchCitizenPage(handle: string) {
  return fetch(`${RSI_BASE_URL}/en/citizens/${encodeURIComponent(handle)}`, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
  });
}

export function updateBio(token: string, bio: string) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/api/settings/UpdateField`,
    payload: { pageId: "my_profile", fieldId: "biography", value: bio },
    rsiToken: token,
  });
}
