import type { WxtViteConfig } from "wxt";

export function firefoxVueConfig() {
  return {
    plugins: [
      {
        name: "firefox-vue-static-content",
        configResolved(config) {
          const vue = config.plugins.find((plugin) => plugin.name === "vite:vue");
          if (!vue?.api?.options) {
            throw new Error("Vue compiler options are unavailable");
          }
          const options = vue.api.options;
          options.template ??= {};
          options.template.compilerOptions ??= {};
          options.template.compilerOptions.hoistStatic = false;
        },
        transform(code, id) {
          if (!id.endsWith("/@vue/runtime-dom/dist/runtime-dom.esm-bundler.js")) {
            return;
          }

          // Firefox validates even unreachable HTML sinks. Templates use DOM nodes instead.
          const ast = this.parse(code);
          for (const statement of ast.body) {
            if (statement.type !== "VariableDeclaration") continue;
            for (const declaration of statement.declarations) {
              if (
                declaration.id.type !== "Identifier" ||
                declaration.id.name !== "nodeOps" ||
                declaration.init?.type !== "ObjectExpression"
              ) {
                continue;
              }
              for (const property of declaration.init.properties) {
                if (
                  property.type !== "Property" ||
                  property.key.type !== "Identifier" ||
                  property.key.name !== "insertStaticContent" ||
                  property.value.type !== "FunctionExpression"
                ) {
                  continue;
                }
                const { start, end } = property.value.body as typeof property.value.body & {
                  start: number;
                  end: number;
                };
                return {
                  code:
                    code.slice(0, start) +
                    '{ throw new Error("Static HTML is disabled in Firefox builds"); }' +
                    code.slice(end),
                  map: null,
                };
              }
            }
          }
          this.error(
            "Vue static-content implementation changed; review Firefox rendering",
          );
        },
      },
    ],
  } satisfies WxtViteConfig;
}
