import { describe, it, expect } from "vitest";
import { createRuntimeScript, getClientSafeEnv } from "../src/ssr/runtime.js";

describe("SSR Runtime", () => {
  describe("createRuntimeScript", () => {
    it("generates a script tag with serialized env", () => {
      const html = createRuntimeScript({ APP_URL: "http://example.com" }, "APP_");

      expect(html).toContain("<script>");
      expect(html).toContain("</script>");
      expect(html).toContain("__DOTLYTE_ENV__");
      expect(html).toContain("APP_URL");
      expect(html).toContain("http://example.com");
    });

    it("supports nonce attribute", () => {
      const html = createRuntimeScript(
        { APP_URL: "test" },
        "APP_",
        [],
        "my-nonce",
      );

      expect(html).toContain('nonce="my-nonce"');
    });

    it("filters by prefix when provided", () => {
      const html = createRuntimeScript(
        {
          VITE_APP_URL: "http://example.com",
          SECRET: "hidden",
        },
        "VITE_",
      );

      expect(html).toContain("VITE_APP_URL");
      expect(html).not.toContain("hidden");
    });
  });

  describe("getClientSafeEnv", () => {
    it("filters env vars by prefix", () => {
      const result = getClientSafeEnv(
        { VITE_URL: "http://example.com", DB_PASS: "secret" },
        "VITE_",
      );

      expect(result.VITE_URL).toBe("http://example.com");
      expect(result).not.toHaveProperty("DB_PASS");
    });
  });
});
