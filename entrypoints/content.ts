import { handleResponse } from "@/lib/message-handler";

export default defineContentScript({
  matches: import.meta.env.PROD
    ? ["*://*.fleetyards.net/*", "*://*.fleetyards.dev/*"]
    : ["*://fleetyards.test/*", "*://fleetyards.dev/*"],
  main() {
    window.addEventListener("message", async (event) => {
      if (
        event.source == window &&
        event.data &&
        event.data.direction == "fy"
      ) {
        const response = await browser.runtime.sendMessage(event.data.message);

        handleResponse(
          response,
          window.parent.location.origin,
          window.postMessage.bind(window)
        );
      }
    });
  },
});
