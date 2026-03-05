/**
 * `dotlyte encrypt` — Encrypt sensitive values in .env files.
 *
 * Usage:
 *   dotlyte encrypt <file> [--keys KEY1,KEY2,...] [--output <file>]
 *
 * Encrypts values for specified keys (or all if not specified).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { encryptValue, resolveEncryptionKey, generateKey, isEncryptedValue } from "../../encryption.js";
import { isAutoSensitive } from "../../masking.js";

export async function encrypt(args: string[]): Promise<void> {
  if (args.length === 0) {
    throw new Error("Usage: dotlyte encrypt <file> [--keys KEY1,KEY2] [--output <file>]");
  }

  const inputFile = args[0]!;
  const keysArg = getArg(args, "--keys");
  const outputFile = getArg(args, "--output");

  const inputPath = resolve(inputFile);
  if (!existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  // Resolve encryption key
  let encKey = resolveEncryptionKey();
  if (!encKey) {
    console.log("⚠️  No encryption key found. Generating a new one...\n");
    const passphrase = generateKey();
    console.log(`  🔑 New key: ${passphrase}`);
    console.log(`  Set DOTLYTE_KEY=${passphrase} in your environment`);
    console.log(`  Or add it to .dotlyte-keys: default=${passphrase}\n`);

    // Use the generated key for this operation
    const { scryptSync } = await import("node:crypto");
    encKey = scryptSync(passphrase, "dotlyte-v2", 32);
  }

  const content = readFileSync(inputPath, "utf-8");
  const targetKeys = keysArg ? new Set(keysArg.split(",").map((k) => k.trim())) : null;
  const lines = content.split("\n");
  const encryptedLines: string[] = [];
  let encryptedCount = 0;

  console.log(`\n🔒 dotlyte encrypt\n`);
  console.log(`  File: ${inputFile}`);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      encryptedLines.push(line);
      continue;
    }

    const stripped = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eqIdx = stripped.indexOf("=");
    if (eqIdx <= 0) {
      encryptedLines.push(line);
      continue;
    }

    const key = stripped.slice(0, eqIdx).trim();
    let value = stripped.slice(eqIdx + 1).trim();

    // Remove quotes
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }

    // Skip already encrypted
    if (isEncryptedValue(value)) {
      encryptedLines.push(line);
      continue;
    }

    // Determine if this key should be encrypted
    const shouldEncrypt = targetKeys
      ? targetKeys.has(key)
      : isAutoSensitive(key);

    if (shouldEncrypt) {
      const encrypted = encryptValue(value, encKey);
      encryptedLines.push(`${key}=${encrypted}`);
      encryptedCount++;
      console.log(`  🔐 ${key} — encrypted`);
    } else {
      encryptedLines.push(line);
    }
  }

  const outPath = outputFile ? resolve(outputFile) : inputPath.replace(/\.env/, ".env.encrypted");
  writeFileSync(outPath, encryptedLines.join("\n"), "utf-8");

  console.log(`\n  ✅ Encrypted ${encryptedCount} value(s) → ${outPath}\n`);
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}
