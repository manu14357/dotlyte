/**
 * `dotlyte diff` — Compare two env files.
 *
 * Usage:
 *   dotlyte diff <file1> <file2>
 *
 * Shows added, removed, and changed keys. Sensitive values are masked.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { isAutoSensitive, REDACTED } from "../../masking.js";

export async function diff(args: string[]): Promise<void> {
  if (args.length < 2) {
    throw new Error("Usage: dotlyte diff <file1> <file2>");
  }

  const file1 = resolve(args[0]!);
  const file2 = resolve(args[1]!);

  if (!existsSync(file1)) throw new Error(`File not found: ${file1}`);
  if (!existsSync(file2)) throw new Error(`File not found: ${file2}`);

  const env1 = parseEnvFile(readFileSync(file1, "utf-8"));
  const env2 = parseEnvFile(readFileSync(file2, "utf-8"));

  const allKeys = new Set([...Object.keys(env1), ...Object.keys(env2)]);

  const added: string[] = [];
  const removed: string[] = [];
  const changed: { key: string; from: string; to: string }[] = [];
  const unchanged: string[] = [];

  for (const key of allKeys) {
    const in1 = key in env1;
    const in2 = key in env2;

    if (!in1 && in2) {
      added.push(key);
    } else if (in1 && !in2) {
      removed.push(key);
    } else if (env1[key] !== env2[key]) {
      changed.push({
        key,
        from: maskIfSensitive(key, env1[key]!),
        to: maskIfSensitive(key, env2[key]!),
      });
    } else {
      unchanged.push(key);
    }
  }

  console.log(`\n📊 dotlyte diff\n`);
  console.log(`  ${args[0]} ↔ ${args[1]}\n`);

  if (added.length > 0) {
    console.log(`  ➕ Added (${added.length}):`);
    for (const k of added) {
      console.log(`     + ${k}=${maskIfSensitive(k, env2[k]!)}`);
    }
  }

  if (removed.length > 0) {
    console.log(`  ➖ Removed (${removed.length}):`);
    for (const k of removed) {
      console.log(`     - ${k}=${maskIfSensitive(k, env1[k]!)}`);
    }
  }

  if (changed.length > 0) {
    console.log(`  ✏️  Changed (${changed.length}):`);
    for (const c of changed) {
      console.log(`     ~ ${c.key}: ${c.from} → ${c.to}`);
    }
  }

  console.log(`\n  Summary: ${added.length} added, ${removed.length} removed, ${changed.length} changed, ${unchanged.length} unchanged\n`);
}

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const stripped = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eqIdx = stripped.indexOf("=");
    if (eqIdx > 0) {
      const key = stripped.slice(0, eqIdx).trim();
      let value = stripped.slice(eqIdx + 1).trim();
      // Remove quotes
      if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }
  return result;
}

function maskIfSensitive(key: string, value: string): string {
  if (isAutoSensitive(key)) {
    return REDACTED;
  }
  // Also mask long values that look like secrets
  if (value.length > 40 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
    return value.slice(0, 8) + "..." + value.slice(-4);
  }
  return value;
}
