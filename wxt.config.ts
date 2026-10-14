import { defineConfig } from "wxt";
import { firefoxVueConfig } from "./build/firefox-vue";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-vue"],
  vite: ({ browser }) => (browser === "firefox" ? firefoxVueConfig() : {}),
  manifest: ({ browser }) => ({
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "{5a0fc547-124c-494c-961a-73a605636482}",
              strict_min_version: "140.0",
              data_collection_permissions: {
                required: [
                  "personallyIdentifyingInfo",
                  "authenticationInfo",
                  "financialAndPaymentInfo",
                  "websiteContent",
                ],
              },
            },
            gecko_android: { strict_min_version: "142.0" },
          },
        }
      : {}),
    homepage_url: "https://fleetyards.net",
    permissions: ["cookies"],
    host_permissions: ["https://robertsspaceindustries.com/*"],
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "96": "icon/96.png",
      "128": "icon/128.png",
    },
  }),
});
