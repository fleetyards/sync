import { RSI_BASE_URL } from "@/lib/rsi";
import { onMessage } from "@/lib/message-handler";

export default defineBackground(() => {
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

  browser.runtime.onMessage.addListener(function (
    message,
    _sender,
    sendResponse
  ) {
    onMessage(message, sendResponse, getRSIToken);

    return true;
  });
});
