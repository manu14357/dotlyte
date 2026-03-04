/**
 * Encryption / decryption module for DOTLYTE.
 *
 * Encrypted .env files use AES-256-GCM with SOPS-style key-visible format:
 * keys are plaintext for meaningful git diffs, only values are encrypted.
 *
 * Format of .env.encrypted:
 *   KEY=ENC[aes-256-gcm,iv:base64,data:base64,tag:base64]
 *
 * Encryption key from (checked in order):
 *   1. DOTLYTE_KEY env var
 *   2. DOTLYTE_KEY_{ENV} env var (per-environment)
 *   3. .dotlyte-keys file (gitignored, maps env → key)
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DecryptionError, ParseError } from "./errors.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const ENCRYPTED_PATTERN = /^ENC\[aes-256-gcm,iv:([A-Za-z0-9+/=]+),data:([A-Za-z0-9+/=]+),tag:([A-Za-z0-9+/=]+)\]$/;

/* ──────── Key Management ──────── */

/**
 * Derive a 256-bit encryption key from a passphrase.
 */
function deriveKey(passphrase: string): Buffer {
  // Use scrypt with a fixed salt for deterministic key derivation
  // The salt is "dotlyte-v2" — not secret, just prevents rainbow tables
  return scryptSync(passphrase, "dotlyte-v2", KEY_LENGTH);
}

/**
 * Resolve the encryption key from environment or keyfile.
 *
 * @param env   — optional environment name (checks DOTLYTE_KEY_{ENV} first)
 * @param baseDir — where to look for .dotlyte-keys file
 * @returns The derived 256-bit key, or null if no key is available.
 */
export function resolveEncryptionKey(
  env?: string,
  baseDir: string = process.cwd(),
): Buffer | null {
  // 1. Per-environment key
  if (env) {
    const envSpecific = process.env[`DOTLYTE_KEY_${env.toUpperCase()}`];
    if (envSpecific) return deriveKey(envSpecific);
  }

  // 2. Global key
  const globalKey = process.env.DOTLYTE_KEY;
  if (globalKey) return deriveKey(globalKey);

  // 3. Keyfile
  const keyfilePath = resolve(baseDir, ".dotlyte-keys");
  if (existsSync(keyfilePath)) {
    try {
      const content = readFileSync(keyfilePath, "utf-8");
      const keys = parseKeyfile(content);
      if (env && keys[env]) return deriveKey(keys[env]!);
      if (keys["default"]) return deriveKey(keys["default"]!);
      // Use first key if no match
      const first = Object.values(keys)[0];
      if (first) return deriveKey(first);
    } catch {
      // Malformed keyfile — skip
    }
  }

  return null;
}

/**
 * Parse a .dotlyte-keys file. Format:
 *   default=my-secret-passphrase
 *   production=prod-secret
 *   staging=staging-secret
 */
function parseKeyfile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    result[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
  return result;
}

/* ──────── Encrypt ──────── */

/**
 * Encrypt a single string value.
 */
export function encryptValue(value: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `ENC[aes-256-gcm,iv:${iv.toString("base64")},data:${encrypted.toString("base64")},tag:${tag.toString("base64")}]`;
}

/**
 * Decrypt a single encrypted value string.
 */
export function decryptValue(encrypted: string, key: Buffer): string {
  const match = encrypted.match(ENCRYPTED_PATTERN);
  if (!match) {
    throw new DecryptionError(`Value is not in DOTLYTE encrypted format: ${encrypted.slice(0, 50)}...`);
  }

  const iv = Buffer.from(match[1]!, "base64");
  const data = Buffer.from(match[2]!, "base64");
  const tag = Buffer.from(match[3]!, "base64");

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf-8");
  } catch (e) {
    throw new DecryptionError(
      `Failed to decrypt value: ${e instanceof Error ? e.message : "unknown error"}. ` +
        `Check that DOTLYTE_KEY is correct.`,
    );
  }
}

/**
 * Check whether a value is in DOTLYTE encrypted format.
 */
export function isEncryptedValue(value: string): boolean {
  return ENCRYPTED_PATTERN.test(value);
}

/* ──────── File-level operations ──────── */

/**
 * Encrypt a .env file → .env.encrypted file.
 * Keys remain plaintext; only values are encrypted.
 *
 * @param inputPath  — path to the plaintext .env file
 * @param outputPath — path for the encrypted output (default: inputPath + ".encrypted")
 * @param key        — 256-bit encryption key
 */
export function encryptFile(inputPath: string, outputPath?: string, key?: Buffer): void {
  const encKey = key ?? resolveEncryptionKey();
  if (!encKey) {
    throw new DecryptionError(
      "No encryption key found. Set DOTLYTE_KEY env var or create a .dotlyte-keys file.",
      inputPath,
    );
  }

  const content = readFileSync(inputPath, "utf-8");
  const lines = content.split("\n");
  const encryptedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      encryptedLines.push(line);
      continue;
    }

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) {
      encryptedLines.push(line);
      continue;
    }

    const lkey = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    // Remove surrounding quotes for encryption
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }

    // Don't re-encrypt already encrypted values
    if (isEncryptedValue(value)) {
      encryptedLines.push(line);
      continue;
    }

    encryptedLines.push(`${lkey}=${encryptValue(value, encKey)}`);
  }

  const out = outputPath ?? inputPath.replace(/\.env/, ".env.encrypted");
  writeFileSync(out, encryptedLines.join("\n"), "utf-8");
}

/**
 * Decrypt a .env.encrypted file → returns key-value pairs as raw strings.
 * Used by the dotenv parser during load().
 *
 * @param filePath — path to the encrypted .env file
 * @param key      — 256-bit encryption key (resolved automatically if not provided)
 * @param env      — environment name for key resolution
 * @returns A map of plaintext key-value pairs.
 */
export function decryptFile(
  filePath: string,
  key?: Buffer,
  env?: string,
): Record<string, string> {
  const encKey = key ?? resolveEncryptionKey(env, dirname(filePath));
  if (!encKey) {
    throw new DecryptionError(
      "No decryption key found. Set DOTLYTE_KEY env var or create a .dotlyte-keys file.",
      filePath,
    );
  }

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    throw new DecryptionError(`Cannot read encrypted file: ${filePath}`, filePath);
  }

  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line || line.startsWith("#")) continue;

    // Strip optional "export "
    const clean = line.startsWith("export ") ? line.slice(7).trim() : line;

    const eqIdx = clean.indexOf("=");
    if (eqIdx === -1) {
      throw new ParseError(
        `Invalid syntax in ${filePath}:${i + 1}: expected KEY=VALUE, got: "${clean}"`,
        filePath,
      );
    }

    const k = clean.slice(0, eqIdx).trim();
    let v = clean.slice(eqIdx + 1).trim();

    // Decrypt if encrypted
    if (isEncryptedValue(v)) {
      v = decryptValue(v, encKey);
    } else {
      // Remove surrounding quotes
      if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) {
        v = v.slice(1, -1);
      }
    }

    result[k.toLowerCase()] = v;
  }

  return result;
}

/**
 * Generate a secure random passphrase for encryption.
 */
export function generateKey(): string {
  return randomBytes(32).toString("base64url");
}
