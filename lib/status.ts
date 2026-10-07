export type RsiStatus =
  | { state: "signed-in"; handle: string }
  | { state: "signed-out" }
  | { state: "error" };

type SendToBackground = (message: string) => Promise<unknown>;

// An RSI-Token cookie can outlive the session it belongs to, so only a handle
// from identify counts as signed in.
export async function fetchRsiStatus(
  sendToBackground: SendToBackground
): Promise<RsiStatus> {
  try {
    const raw = await sendToBackground(JSON.stringify({ action: "identify" }));
    const response = JSON.parse(String(raw));
    const handle = response?.payload?.handle;

    if (response?.code === 200 && handle) {
      return { state: "signed-in", handle };
    }

    return { state: "signed-out" };
  } catch {
    return { state: "error" };
  }
}
