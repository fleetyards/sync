import { defineConfig, version } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-vue"],
  manifest: {
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
  },
});
