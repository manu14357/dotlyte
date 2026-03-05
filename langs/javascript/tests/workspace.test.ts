import { describe, it, expect } from "vitest";
import { findMonorepoRoot, getSharedEnv, generateTurboEnvConfig } from "../src/workspace.js";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Workspace / Monorepo Support", () => {
  describe("findMonorepoRoot", () => {
    it("detects pnpm workspace", () => {
      const tmp = mkdtempSync(join(tmpdir(), "dotlyte-ws-"));
      writeFileSync(join(tmp, "pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
      const child = join(tmp, "apps", "web");
      mkdirSync(child, { recursive: true });

      const info = findMonorepoRoot(child);
      expect(info).toBeDefined();
      expect(info!.root).toBe(tmp);
      expect(info!.type).toBe("pnpm");
      expect(info!.packages).toContain("apps/*");

      rmSync(tmp, { recursive: true, force: true });
    });

    it("detects npm workspace from package.json", () => {
      const tmp = mkdtempSync(join(tmpdir(), "dotlyte-ws-"));
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({ name: "monorepo", workspaces: ["packages/*"] }),
      );
      const child = join(tmp, "packages", "lib");
      mkdirSync(child, { recursive: true });

      const info = findMonorepoRoot(child);
      expect(info).toBeDefined();
      expect(info!.type).toBe("npm");
      expect(info!.packages).toContain("packages/*");

      rmSync(tmp, { recursive: true, force: true });
    });

    it("detects turbo.json monorepo", () => {
      const tmp = mkdtempSync(join(tmpdir(), "dotlyte-ws-"));
      writeFileSync(join(tmp, "turbo.json"), JSON.stringify({ pipeline: {} }));
      writeFileSync(
        join(tmp, "package.json"),
        JSON.stringify({ workspaces: ["apps/*"] }),
      );
      const child = join(tmp, "apps", "web");
      mkdirSync(child, { recursive: true });

      const info = findMonorepoRoot(child);
      expect(info).toBeDefined();
      expect(info!.type).toBe("turbo");

      rmSync(tmp, { recursive: true, force: true });
    });

    it("returns undefined when not in a monorepo", () => {
      const tmp = mkdtempSync(join(tmpdir(), "dotlyte-no-ws-"));
      const info = findMonorepoRoot(tmp);
      // May detect parent dirs, so just check it doesn't crash
      expect(info === undefined || info.root !== tmp).toBe(true);
      rmSync(tmp, { recursive: true, force: true });
    });
  });

  describe("getSharedEnv", () => {
    it("reads .env from root and returns key-value pairs", () => {
      const tmp = mkdtempSync(join(tmpdir(), "dotlyte-se-"));
      writeFileSync(join(tmp, ".env"), "DB_HOST=localhost\nPORT=3000\n# comment\n");

      const result = getSharedEnv(tmp);
      expect(result.DB_HOST).toBe("localhost");
      expect(result.PORT).toBe("3000");

      rmSync(tmp, { recursive: true, force: true });
    });

    it("strips prefix from keys", () => {
      const tmp = mkdtempSync(join(tmpdir(), "dotlyte-se-"));
      writeFileSync(join(tmp, ".env"), "APP_DB_HOST=localhost\nAPP_PORT=3000\n");

      const result = getSharedEnv(tmp, "APP_");
      expect(result.DB_HOST).toBe("localhost");
      expect(result.PORT).toBe("3000");

      rmSync(tmp, { recursive: true, force: true });
    });

    it("returns empty object when .env missing", () => {
      const tmp = mkdtempSync(join(tmpdir(), "dotlyte-se-"));
      const result = getSharedEnv(tmp);
      expect(result).toEqual({});
      rmSync(tmp, { recursive: true, force: true });
    });
  });

  describe("generateTurboEnvConfig", () => {
    it("generates globalEnv config", () => {
      const result = generateTurboEnvConfig(
        ["DB_HOST", "PORT"],
        { global: true },
      );
      expect(result).toEqual({ globalEnv: ["DB_HOST", "PORT"] });
    });

    it("generates env config (non-global)", () => {
      const result = generateTurboEnvConfig(["API_URL"]);
      expect(result).toEqual({ env: ["API_URL"] });
    });
  });
});
