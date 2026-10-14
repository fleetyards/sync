import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { compileTemplate } from "vue/compiler-sfc";
import { describe, expect, it } from "vitest";
import { firefoxVueConfig } from "../build/firefox-vue";

describe("Firefox Vue rendering", () => {
  it("compiles large static templates as DOM nodes", () => {
    const plugin = firefoxVueConfig().plugins[0];
    const options = { template: { compilerOptions: { hoistStatic: true } } };
    Reflect.apply(plugin!.configResolved, {}, [
      { plugins: [{ name: "vite:vue", api: { options } }] },
    ]);

    const source = `<section>${"<span>Static content</span>".repeat(30)}<p>{{ message }}</p></section>`;
    const baseline = compileTemplate({
      source,
      filename: "fixture.vue",
      id: "fixture",
    });
    expect(baseline.code).toContain("createStaticVNode");

    const compiled = compileTemplate({
      source,
      filename: "fixture.vue",
      id: "fixture",
      compilerOptions: options.template.compilerOptions,
    });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).not.toContain("createStaticVNode");
    expect(compiled.code).toContain("toDisplayString");
  });

  it("removes the static HTML sink from the production bundle", () => {
    execFileSync("pnpm", ["build:firefox"], {
      cwd: resolve(import.meta.dirname, ".."),
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "production" },
    });
    const chunks = resolve(import.meta.dirname, "../.output/firefox-mv2/chunks");
    const popup = readdirSync(chunks).find(
      (name) => name.startsWith("popup-") && name.endsWith(".js"),
    );
    expect(popup).toBeDefined();
    const code = readFileSync(resolve(chunks, popup!), "utf8");
    expect(code).toContain("Static HTML is disabled in Firefox builds");
    expect(code).not.toMatch(/\.innerHTML\s*=(?!=)/);
  }, 30000);
});
