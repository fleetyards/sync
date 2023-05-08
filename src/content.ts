import browser from "webextension-polyfill";

function handleResponse(response: any) {
  const origin = window.parent.location.origin;

  if (origin === "https://fleetyards.dev") {
    window.postMessage(
      {
        direction: "fy-sync",
        message: response,
      },
      "https://fleetyards.dev"
    );
  } else if (origin === "https://fleetyards.net") {
    window.postMessage(
      {
        direction: "fy-sync",
        message: response,
      },
      "https://fleetyards.net"
    );
  } else if (origin === "http://fleetyards.test") {
    window.postMessage(
      {
        direction: "fy-sync",
        message: response,
      },
      "http://fleetyards.test"
    );
  }
}

window.addEventListener("message", async (event) => {
  if (event.source == window && event.data && event.data.direction == "fy") {
    const response = await browser.runtime.sendMessage(event.data.message);

    handleResponse(response);
  }
});
