/**
 * `dotlyte doctor` — Check for common env issues.
 *
 * Usage:
 *   dotlyte doctor
 *
 * Checks:
 *   - Missing .env.example while .env exists
 *   - .env in git (should be gitignored)
 *   - Keys in .env.example missing from .env
 *   - Duplicate keys
 *   - Values that look like placeholders
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PLACEHOLDER_PATTERNS = [
  /^your[-_]?.*[-_]?here$/i,
  /^changeme$/i,
  /^todo$/i,
  /^fixme$/i,
  /^replace[-_]?me$/i,
  /^xxx+$/i,
  /^placeholder$/i,
  /^<.*>$/,
  /^\[.*\]$/,
  /^{.*}$/,
];

export async function doctor(_args: string[]): Promise<void> {
  console.log("\n🩺 dotlyte doctor\n");

  let issues = 0;
  let warnings = 0;

  // Check 1: .env exists but .env.example doesn't
  if (existsSync(resolve(".env")) && !existsSync(resolve(".env.example"))) {
    console.log("  ⚠️  .env exists but .env.example is missing");
    console.log("     Create .env.example to help team members set up their environment\n");
    warnings++;
  }

  // Check 2: .env in git
  if (existsSync(resolve(".gitignore"))) {
    const gitignore = readFileSync(resolve(".gitignore"), "utf-8");
    const hasEnvIgnore = gitignore.split("\n").some((line) => {
      const trimmed = line.trim();
      return trimmed === ".env" || trimmed === ".env*" || trimmed === ".env.*";
    });

    if (!hasEnvIgnore && existsSync(resolve(".env"))) {
      console.log("  ❌ .env is NOT in .gitignore — secrets may be committed!");
      console.log("     Add '.env' to your .gitignore file\n");
      issues++;
    } else if (hasEnvIgnore) {
      console.log("  ✓ .env is properly gitignored");
    }
  }

  // Check 3: Keys in .env.example missing from .env
  if (existsSync(resolve(".env.example")) && existsSync(resolve(".env"))) {
    const exampleKeys = getKeys(readFileSync(resolve(".env.example"), "utf-8"));
    const envKeys = getKeys(readFileSync(resolve(".env"), "utf-8"));

    const missing = exampleKeys.filter((k) => !envKeys.includes(k));
    if (missing.length > 0) {
      console.log(`  ⚠️  Keys in .env.example missing from .env: ${missing.join(", ")}`);
      warnings++;
    } else {
      console.log("  ✓ All .env.example keys are present in .env");
    }

    const extra = envKeys.filter((k) => !exampleKeys.includes(k));
    if (extra.length > 0) {
      console.log(`  ℹ️  Keys in .env not in .env.example: ${extra.join(", ")}`);
    }
  }

  // Check 4: Duplicate keys in .env files
  for (const file of [".env", ".env.local", ".env.example"]) {
    const path = resolve(file);
    if (!existsSync(path)) continue;

    const content = readFileSync(path, "utf-8");
    const keys = new Map<string, number>();
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        keys.set(key, (keys.get(key) ?? 0) + 1);
      }
    }

    const dupes = [...keys.entries()].filter(([, count]) => count > 1);
    if (dupes.length > 0) {
      console.log(`  ⚠️  Duplicate keys in ${file}: ${dupes.map(([k]) => k).join(", ")}`);
      warnings++;
    }
  }

  // Check 5: Placeholder values
  if (existsSync(resolve(".env"))) {
    const content = readFileSync(resolve(".env"), "utf-8");
    const placeholders: string[] = [];

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
          value = value.slice(1, -1);
        }
        if (PLACEHOLDER_PATTERNS.some((p) => p.test(value))) {
          placeholders.push(key);
        }
      }
    }

    if (placeholders.length > 0) {
      console.log(`  ⚠️  Placeholder values detected: ${placeholders.join(", ")}`);
      console.log("     Replace these with real values before deploying");
      warnings++;
    }
  }

  // Check 6: .dotlyte-keys in git
  if (existsSync(resolve(".dotlyte-keys"))) {
    if (existsSync(resolve(".gitignore"))) {
      const gitignore = readFileSync(resolve(".gitignore"), "utf-8");
      if (!gitignore.includes(".dotlyte-keys")) {
        console.log("  ❌ .dotlyte-keys is NOT in .gitignore — encryption keys may leak!");
        issues++;
      }
    }
  }

  // Check 7: Encrypted .env file without key
  if (existsSync(resolve(".env.encrypted"))) {
    const hasKey = !!process.env.DOTLYTE_KEY || existsSync(resolve(".dotlyte-keys"));
    if (!hasKey) {
      console.log("  ⚠️  .env.encrypted exists but no DOTLYTE_KEY found");
      console.log("     Set DOTLYTE_KEY environment variable or create .dotlyte-keys");
      warnings++;
    }
  }

  // Summary
  console.log(`\n  📋 Summary: ${issues} error(s), ${warnings} warning(s)\n`);

  if (issues > 0) {
    process.exit(1);
  }
}

function getKeys(content: string): string[] {
  const keys: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const stripped = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eqIdx = stripped.indexOf("=");
    if (eqIdx > 0) {
      keys.push(stripped.slice(0, eqIdx).trim());
    }
  }
  return keys;
}
