export const RSI_BASE_URL = "https://robertsspaceindustries.com";

export type RSIApiParams = {
  url: string;
  payload: any;
  rsiToken: string;
  headers?: Record<string, string>;
};

export function fetchRSIApi(params: RSIApiParams) {
  return fetch(params.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "X-Rsi-Token": params.rsiToken,
      ...params.headers,
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

function fetchAccountPage(
  path: string,
  token: string,
  page: number,
  filters: Record<string, string> = {}
) {
  const query = new URLSearchParams({ page: String(page), ...filters });

  return fetch(`${RSI_BASE_URL}/account/${path}?${query}`, {
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

// Only the upgrades, which is all a CCU sync needs and a fraction of the pages.
export function fetchUpgradePledges(token: string, page = 1) {
  return fetchAccountPage("pledges", token, page, { "product-type": "upgrade" });
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

// The balances RSI's account panel shows, from the same GraphQL query: store
// credit in USD cents.
export function fetchStoreCredit(token: string) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/graphql`,
    payload: {
      operationName: "credit",
      variables: {},
      query:
        'query credit { customer { ledgerCredit: ledger(ledgerCode: "credit") { amount { value currency { code } } } } }',
    },
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

// The org admin pages: `content` holds the draft's raw text in its form, and
// `preview` renders the draft as the public page will once it is published.
export function fetchOrgAdminPage(
  token: string,
  sid: string,
  page: "content" | "preview"
) {
  return fetch(`${RSI_BASE_URL}/en/orgs/${encodeURIComponent(sid)}/admin/${page}`, {
    method: "GET",
    headers: {
      ...HTML_PAGE_HEADERS,
      "X-Rsi-Token": token,
    },
    credentials: "include",
    cache: "no-store",
  });
}

export function fetchOrgPage(sid: string) {
  return fetch(`${RSI_BASE_URL}/en/orgs/${encodeURIComponent(sid)}`, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
  });
}

const ORG_ADMIN_HEADERS = { "X-Requested-With": "XMLHttpRequest" };

export function saveOrgDraft(
  token: string,
  sid: string,
  field: string,
  value: string
) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/api/orgs/saveDraft`,
    payload: { symbol: sid, [field]: value },
    rsiToken: token,
    headers: ORG_ADMIN_HEADERS,
  });
}

// Publishes every pending change in the org's draft, not one field.
export function publishOrgDraft(token: string, sid: string) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/api/orgs/publishDraft`,
    payload: { symbol: sid },
    rsiToken: token,
    headers: ORG_ADMIN_HEADERS,
  });
}

// Any store page carries the CSRF token RSI's cart mutations ask for, in a
// meta tag of the HTML the server sends.
export function fetchCartPage(token: string) {
  return fetch(`${RSI_BASE_URL}/en/store/pledge/cart`, {
    method: "GET",
    headers: {
      ...HTML_PAGE_HEADERS,
      "X-Rsi-Token": token,
    },
    credentials: "include",
    cache: "no-store",
  });
}

const csrfHeaders = (csrfToken: string) => ({ "X-CSRF-TOKEN": csrfToken });

export function addSkusToCart(
  token: string,
  csrfToken: string,
  items: { skuId: number; qty: number }[]
) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/graphql`,
    payload: [
      {
        operationName: "AddCartMultiItemMutation",
        variables: {
          storeFront: "pledge",
          query: items.map(({ skuId, qty }) => ({ skuId: String(skuId), qty })),
        },
        query:
          'mutation AddCartMultiItemMutation($query: [CartAddInput!], $storeFront: String = "pledge") { store(name: $storeFront) { cart { mutations { addMany(query: $query) { count } } } } }',
      },
    ],
    rsiToken: token,
    headers: csrfHeaders(csrfToken),
  });
}

// The upgrade tool reads what it adds from this context: a pledge id makes the
// upgrade a buy-back, none a store purchase.
export function setUpgradeContext(
  token: string,
  csrfToken: string,
  context: {
    fromShipId: number;
    toShipId: number;
    toSkuId: number;
    pledgeId: number | null;
  }
) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/api/ship-upgrades/setContextToken`,
    payload: context,
    rsiToken: token,
    headers: csrfHeaders(csrfToken),
  });
}

// Answers with a JWT the cart takes for 30 seconds.
export function createUpgradeCartToken(
  token: string,
  csrfToken: string,
  from: number,
  to: number
) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/pledge-store/api/upgrade/v2/graphql`,
    payload: [
      {
        operationName: "addToCart",
        variables: { from, to },
        query:
          "mutation addToCart($from: Int!, $to: Int!) { addToCart(from: $from, to: $to) { jwt } }",
      },
    ],
    rsiToken: token,
    headers: csrfHeaders(csrfToken),
  });
}

export function redeemCartToken(token: string, csrfToken: string, jwt: string) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/api/store/v2/cart/token`,
    payload: { jwt },
    rsiToken: token,
    headers: csrfHeaders(csrfToken),
  });
}

// Replaces whatever the cart held: a buy-back is only ever bought alone.
export function buyBackPledge(token: string, csrfToken: string, id: number) {
  return fetchRSIApi({
    url: `${RSI_BASE_URL}/api/store/buyBackPledge`,
    payload: { id },
    rsiToken: token,
    headers: csrfHeaders(csrfToken),
  });
}
