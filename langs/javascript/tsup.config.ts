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
});
