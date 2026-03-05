/**
 * `dotlyte check` — Validate .env files against schema.
 *
 * Usage:
 *   dotlyte check [--schema <file>] [--env <file>]
 *
 * Validates .env/config files and exits with code 1 on failure (CI-friendly).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "../../loader.js";
import { validateSchema } from "../../validator.js";
import type { DotlyteSchema } from "../../validator.js";

export async function check(args: string[]): Promise<void> {
  const schemaPath = getArg(args, "--schema") ?? findSchemaFile();
  const envFile = getArg(args, "--env");
  const strict = args.includes("--strict");

  console.log("🔍 dotlyte check\n");

  if (!schemaPath) {
    console.log("⚠️  No schema file found. Performing basic validation...\n");
    basicCheck(envFile);
    return;
  }

  console.log(`Schema: ${schemaPath}`);

  // Load schema
  let schema: DotlyteSchema;
  try {
    const content = readFileSync(resolve(schemaPath), "utf-8");
    schema = JSON.parse(content) as DotlyteSchema;
  } catch {
    throw new Error(`Failed to read schema file: ${schemaPath}`);
  }

  // Load config
  const config = load({
    files: envFile ? [envFile] : undefined,
    schema: undefined, // We'll validate manually for better reporting
  });

  const data = config.toObject();
  const violations = validateSchema(data, schema, strict);

  if (violations.length === 0) {
    console.log("\n✅ All checks passed!\n");
    return;
  }

  console.log(`\n❌ ${violations.length} issue(s) found:\n`);
  for (const v of violations) {
    console.log(`  ✗ ${v.key}: ${v.message}`);
  }
  console.log();
  process.exit(1);
}

function basicCheck(envFile?: string): void {
  const files = [".env", ".env.local", ".env.example"];
  if (envFile) files.unshift(envFile);

  let found = false;
  for (const file of files) {
    const path = resolve(file);
    if (existsSync(path)) {
      found = true;
      console.log(`  ✓ ${file} exists`);

      // Check for duplicate keys
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
        console.log(`    ⚠️  Duplicate keys: ${dupes.map(([k]) => k).join(", ")}`);
      }
    }
  }

  if (!found) {
    console.log("  ⚠️  No .env files found in current directory");
  }

  console.log("\n✅ Basic check complete\n");
}

function findSchemaFile(): string | null {
  const candidates = [
    "env-schema.json",
    ".env.schema.json",
    "dotlyte.schema.json",
    "env-schema.ts",
  ];
  for (const c of candidates) {
    if (existsSync(resolve(c))) return c;
  }
  return null;
}

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}
