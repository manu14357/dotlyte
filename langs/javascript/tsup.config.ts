import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/next/index.ts",
    "src/ssr/index.ts",
    "src/adapters/zod.ts",
    "src/adapters/valibot.ts",
    "src/cli/index.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: "es2022",
  outDir: "dist",
  /**
   * CJS/ESM compatibility shim.
   * - CJS already has `require` natively, so no banner needed.
   * - ESM needs `require` created via `createRequire(import.meta.url)`
   *   for optional dependency loading (yaml, smol-toml).
   */
  banner(ctx) {
    if (ctx.format === "esm") {
      return {
        js: `import{createRequire as __cr}from"module";const require=__cr(import.meta.url);`,
      };
    }
    return {};
  },
});
