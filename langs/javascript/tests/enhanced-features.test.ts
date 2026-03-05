import { describe, it, expect, vi } from "vitest";
import {
  compilePatterns,
  buildSensitiveSetWithPatterns,
  createAuditProxy,
} from "../src/masking.js";
import {
  rotateKeys,
  resolveKeyWithFallback,
  encryptValue,
  decryptValue,
  generateKey,
} from "../src/encryption.js";
import { scryptSync, randomBytes } from "node:crypto";

function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, "dotlyte-v2", 32);
}

describe("Enhanced Masking", () => {
  describe("compilePatterns", () => {
    it("compiles glob patterns to RegExp", () => {
      const regexes = compilePatterns(["*_KEY", "DATABASE_*", "SECRET"]);

      expect(regexes).toHaveLength(3);
      expect(regexes[0]!.test("API_KEY")).toBe(true);
      expect(regexes[0]!.test("NOT_A_KEZ")).toBe(false);
      expect(regexes[1]!.test("DATABASE_URL")).toBe(true);
      expect(regexes[2]!.test("SECRET")).toBe(true);
    });
  });

  describe("buildSensitiveSetWithPatterns", () => {
    it("matches keys using patterns", () => {
      const result = buildSensitiveSetWithPatterns(
        ["API_KEY", "DATABASE_URL", "PORT", "SECRET_TOKEN"],
        ["*_KEY", "*_TOKEN"],
        new Set(),
      );

      expect(result.has("API_KEY")).toBe(true);
      expect(result.has("SECRET_TOKEN")).toBe(true);
      expect(result.has("PORT")).toBe(false);
    });

    it("includes schema-sensitive keys", () => {
      const result = buildSensitiveSetWithPatterns(
        ["API_KEY", "PORT"],
        [],
        new Set(["PORT"]),
      );

      expect(result.has("PORT")).toBe(true);
    });
  });

  describe("createAuditProxy", () => {
    it("calls onAccess when sensitive key is read", () => {
      const onAccess = vi.fn();
      const proxy = createAuditProxy(
        { API_KEY: "secret123", PORT: 3000 },
        new Set(["API_KEY"]),
        onAccess,
      );

      // Access a sensitive key
      const _ = (proxy as Record<string, unknown>).API_KEY;
      expect(onAccess).toHaveBeenCalledWith("API_KEY", "server");

      // Access a non-sensitive key — should not trigger
      const _2 = (proxy as Record<string, unknown>).PORT;
      expect(onAccess).toHaveBeenCalledTimes(1);
    });
  });
});

describe("Enhanced Encryption", () => {
  describe("resolveKeyWithFallback", () => {
    it("tries multiple keys for decryption", () => {
      const passphrase = generateKey();
      const keyBuf = deriveKey(passphrase);
      const encrypted = encryptValue("my-secret", keyBuf);
      const result = resolveKeyWithFallback(
        ["wrong-passphrase", passphrase],
        encrypted,
      );

      expect(result).not.toBeNull();
      // The returned key should be able to decrypt the value
      const decrypted = decryptValue(encrypted, result!);
      expect(decrypted).toBe("my-secret");
    });

    it("returns null if no key works", () => {
      const passphrase = generateKey();
      const keyBuf = deriveKey(passphrase);
      const encrypted = encryptValue("test", keyBuf);
      const result = resolveKeyWithFallback(
        ["wrong-key-1", "wrong-key-2"],
        encrypted,
      );

      expect(result).toBeNull();
    });
  });
});
