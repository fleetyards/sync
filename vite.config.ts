import { defineConfig } from "vite";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";

function generateManifest() {
  const manifest = readJsonFile("src/manifest.json");
  const pkg = readJsonFile("package.json");
  return {
    name: pkg.name,
    description: pkg.description,
    version: pkg.version,
    content_scripts: [
      {
        matches: [
          process.env.ENVIRONMENT === "production"
            ? "https://fleetyards.net/*"
            : process.env.ENVIRONMENT === "staging"
            ? "https://fleetyards.dev/*"
            : "http://fleetyards.test/*",
        ],
        js: ["src/content.ts"],
      },
    ],
    ...manifest,
  };
}

export default defineConfig({
  plugins: [
    webExtension({
      browser: process.env.TARGET || "chrome",
      manifest: generateManifest,
      watchFilePaths: ["src/*", "package.json", "manifest.json"],
    }),
  ],
});
