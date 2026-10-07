import {
  identify,
  fetchPledges,
  fetchBuybacks,
  fetchBuybackDetail,
  setStoreAuthToken,
  fetchStorePricing,
  fetchCitizenPage,
  updateBio,
  fetchOrgAdminPage,
  fetchOrgPage,
  saveOrgDraft,
  publishOrgDraft,
} from "./rsi";
import {
  ORG_VERIFICATION_FIELD,
  SID_PATTERN,
  hasPendingChanges,
  isAccessDenied,
  parseDraftField,
  tokenOnPage,
} from "./org";
import { appendToken, removeAppendedToken } from "./tokens";
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
  "org-verify-write",
  "org-verify-remove",
] as const;

type VerifyAction = "verify-write" | "verify-remove";
type OrgVerifyAction = "org-verify-write" | "org-verify-remove";

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

// Requests for the same org (or the same bio) wait for each other: a remove
// sent while a slow write is still out would read the draft before the write
// lands, find nothing, and leave the token the write then publishes.
const queues = new Map<string, Promise<unknown>>();

function oneAtATime<T>(key: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(task, task);
  const settled = run.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });

  return run;
}

// The draft as it will be published, and the org page as it is now.
async function comparedPages(rsiToken: string, sid: string) {
  const [preview, live] = await Promise.all([
    fetchOrgAdminPage(rsiToken, sid, "preview"),
    fetchOrgPage(sid),
  ]);

  return {
    previewHtml: preview.ok ? await preview.text() : null,
    liveHtml: live.ok ? await live.text() : null,
  };
}

async function orgPages(rsiToken: string, sid: string) {
  const [content, compared] = await Promise.all([
    fetchOrgAdminPage(rsiToken, sid, "content"),
    comparedPages(rsiToken, sid),
  ]);

  return { content, ...compared };
}

async function draftField(rsiToken: string, sid: string) {
  const content = await fetchOrgAdminPage(rsiToken, sid, "content");

  return content.ok
    ? parseDraftField(await content.text(), ORG_VERIFICATION_FIELD)
    : null;
}

// Writes the token into the org's history and publishes it, for the org the
// signed-in account can edit. Only while nothing else waits in the org's
// draft: publishing takes the whole draft live, another officer's half-done
// edit included.
//
// Saving and publishing are decided apart, from the draft and from the live
// page: a run that saved but failed to publish is finished by the next one
// instead of found "already done".
async function verifyOrg(
  action: OrgVerifyAction,
  sid: unknown,
  verificationToken: unknown,
  rsiToken: string
) {
  if (
    typeof verificationToken !== "string" ||
    !VERIFICATION_TOKEN_PATTERN.test(verificationToken)
  ) {
    return { code: 400, action, error: "Invalid verification token" };
  }
  if (typeof sid !== "string" || !SID_PATTERN.test(sid)) {
    return { code: 400, action, error: "Invalid SID" };
  }

  // `changed` on a failure: the token may sit in the draft now, so the page
  // that asked should still have it taken out.
  const failed = (code: number, error: string, changed = false) => ({
    code,
    action,
    error,
    payload: { sid, changed },
  });

  const { content, previewHtml, liveHtml } = await orgPages(rsiToken, sid);
  if (!content.ok) return failed(content.status, "Org unreadable");

  const contentHtml = await content.text();
  if (isAccessDenied(contentHtml)) return failed(403, "No rights for this org");

  const draft = parseDraftField(contentHtml, ORG_VERIFICATION_FIELD);
  const pending =
    previewHtml && liveHtml ? hasPendingChanges(previewHtml, liveHtml) : null;
  if (draft === null || pending === null || !liveHtml) {
    return failed(422, "Org unreadable");
  }
  if (pending) return failed(409, "Unpublished changes");

  const onPage = tokenOnPage(liveHtml, verificationToken, ORG_VERIFICATION_FIELD);
  if (!onPage) return failed(422, "Org unreadable");

  const writing = action === "org-verify-write";
  const { text: next, changed: needsSave } = writing
    ? appendToken(draft, verificationToken)
    : removeAppendedToken(draft, verificationToken);

  // Somewhere other than where the extension puts it: not the extension's to
  // take out, and still public.
  if (
    !writing &&
    ((!needsSave && next.includes(verificationToken)) || onPage.elsewhere)
  ) {
    return failed(409, "Token placed by hand");
  }

  const needsPublish = writing !== onPage.inField;

  const succeeded = async (response: Response) =>
    response.ok && (await reportsSuccess(response));

  if (needsSave) {
    const saved = await saveOrgDraft(rsiToken, sid, ORG_VERIFICATION_FIELD, next);
    if (!(await succeeded(saved))) {
      return failed(saved.ok ? 502 : saved.status, "Org update failed");
    }
  }

  if (needsPublish) {
    // Another officer can save a draft while this one runs. Asked again right
    // before publishing, so their edit is not what goes live with the token.
    const again = await comparedPages(rsiToken, sid);
    const stillAlone =
      again.previewHtml && again.liveHtml
        ? hasPendingChanges(again.previewHtml, again.liveHtml) === false
        : false;

    if (!stillAlone) {
      // A remove that cannot publish leaves the draft without the token, which
      // is where it should end up anyway; the live page still shows it.
      if (!writing || !needsSave) return failed(409, "Unpublished changes");

      // Put back only what this request wrote: an officer who saved the
      // history since keeps their edit, and the token with it.
      const current = await draftField(rsiToken, sid);
      if (current !== next) return failed(409, "Unpublished changes", true);

      const restored = await saveOrgDraft(rsiToken, sid, ORG_VERIFICATION_FIELD, draft);
      if (!(await succeeded(restored))) {
        return failed(restored.ok ? 502 : restored.status, "Draft left with token", true);
      }

      return failed(409, "Unpublished changes");
    }

    const published = await publishOrgDraft(rsiToken, sid);
    if (!(await succeeded(published))) {
      return failed(published.ok ? 502 : published.status, "Org update failed");
    }
  }

  return {
    code: 200,
    action,
    payload: { sid, changed: needsSave || needsPublish },
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
      const result = await oneAtATime("bio", () =>
        verifyBio(message.action, message.token, token)
      ).catch(
        (error) => {
          console.error("FY Sync: Bio update failed", error);

          return { code: 500, action: message.action, error: "Bio update failed" };
        }
      );

      sendResponse(JSON.stringify(result));
    }
  } else if (
    message?.action == "org-verify-write" ||
    message?.action == "org-verify-remove"
  ) {
    console.info("FY Sync: Updating Org");

    const token = await getToken();
    if (!token) {
      sendResponse(
        JSON.stringify({ code: 401, action: message.action, error: "No RSI session" })
      );
    } else {
      const result = await oneAtATime(`org:${message.sid}`, () =>
        verifyOrg(message.action, message.sid, message.token, token)
      ).catch((error) => {
        console.error("FY Sync: Org update failed", error);

        return { code: 500, action: message.action, error: "Org update failed" };
      });

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
