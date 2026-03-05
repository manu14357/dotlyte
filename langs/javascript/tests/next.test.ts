import { describe, it, expect } from "vitest";
import {
  DotlyteProvider,
  extractClientEnv,
  getClientEnv,
} from "../src/next/provider.js";
import { withDotlyte, generateRuntimeEnv } from "../src/next/config.js";

describe("Next.js Provider", () => {
  describe("extractClientEnv", () => {
    it("filters only NEXT_PUBLIC_ prefixed keys", () => {
      const result = extractClientEnv({
        SECRET_KEY: "hidden",
        NEXT_PUBLIC_URL: "http://example.com",
        NEXT_PUBLIC_API: "/api",
        DB_PASSWORD: "secret",
      });

      expect(result).toEqual({
        NEXT_PUBLIC_URL: "http://example.com",
        NEXT_PUBLIC_API: "/api",
      });
    });

    it("supports custom prefix", () => {
      const result = extractClientEnv(
        {
          APP_URL: "http://example.com",
          SECRET: "hidden",
          APP_NAME: "test",
        },
        "APP_",
      );

      expect(result).toEqual({
        APP_URL: "http://example.com",
        APP_NAME: "test",
      });
    });

    it("returns empty object when no matching keys", () => {
      const result = extractClientEnv({
        DB_HOST: "localhost",
        SECRET_KEY: "hidden",
      });

      expect(result).toEqual({});
    });
  });

  describe("DotlyteProvider", () => {
    it("generates a script tag with client env", () => {
      const html = DotlyteProvider({
        env: {
          NEXT_PUBLIC_URL: "http://example.com",
          SECRET: "should-not-appear",
        },
      });

      expect(html).toContain("<script>");
      expect(html).toContain("__DOTLYTE_ENV__");
      expect(html).toContain("NEXT_PUBLIC_URL");
      // Server secrets should NOT be serialized
      expect(html).not.toContain("should-not-appear");
    });

    it("supports nonce for CSP", () => {
      const html = DotlyteProvider({
        env: { NEXT_PUBLIC_URL: "http://example.com" },
        nonce: "abc123",
      });

      expect(html).toContain('nonce="abc123"');
    });
  });

  describe("getClientEnv", () => {
    it("falls back to process.env on server", () => {
      process.env.NEXT_PUBLIC_TEST_VAR = "server-val";

      const result = getClientEnv("NEXT_PUBLIC_TEST_VAR");
      expect(result).toBe("server-val");

      delete process.env.NEXT_PUBLIC_TEST_VAR;
    });
  });
});

describe("Next.js Config", () => {
  describe("generateRuntimeEnv", () => {
    it("maps NEXT_PUBLIC_ vars from process.env", () => {
      process.env.NEXT_PUBLIC_A = "valueA";
      process.env.NEXT_PUBLIC_B = "valueB";
      process.env.SECRET = "hidden";

      const result = generateRuntimeEnv();
      expect(result.NEXT_PUBLIC_A).toBe("valueA");
      expect(result.NEXT_PUBLIC_B).toBe("valueB");
      expect(result).not.toHaveProperty("SECRET");

      delete process.env.NEXT_PUBLIC_A;
      delete process.env.NEXT_PUBLIC_B;
      delete process.env.SECRET;
    });
  });

  describe("withDotlyte", () => {
    it("wraps a next config with transpilePackages", () => {
      const result = withDotlyte({});

      expect(result.transpilePackages).toContain("dotlyte");
    });

    it("preserves existing config", () => {
      const result = withDotlyte({
        reactStrictMode: true,
        transpilePackages: ["other-pkg"],
      });

      expect(result.reactStrictMode).toBe(true);
      expect(result.transpilePackages).toContain("other-pkg");
      expect(result.transpilePackages).toContain("dotlyte");
    });
  });
});
