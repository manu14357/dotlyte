#!/usr/bin/env node
/**
 * DOTLYTE CLI — `npx dotlyte`
 *
 * Commands:
 *   dotlyte check          — Validate .env files against schema
 *   dotlyte diff           — Compare two env files
 *   dotlyte generate-types — Generate TypeScript types from .env
 *   dotlyte encrypt        — Encrypt sensitive values in .env
 *   dotlyte doctor         — Check for common env issues
 *   dotlyte init           — Interactive setup wizard
 *
 * @module dotlyte/cli
 */

import { resolve } from "node:path";
import { check } from "./commands/check.js";
import { diff } from "./commands/diff.js";
import { generateTypes } from "./commands/generate-types.js";
import { encrypt } from "./commands/encrypt.js";
import { doctor } from "./commands/doctor.js";
import { init } from "./commands/init.js";

const VERSION = "0.1.2";

const HELP = `
dotlyte v${VERSION} — The universal configuration CLI

Usage: dotlyte <command> [options]

Commands:
  check             Validate .env files against schema
  diff <f1> <f2>    Compare two env files
  generate-types    Generate TypeScript types from .env
  encrypt <file>    Encrypt sensitive values in .env
  doctor            Check for common env issues
  init              Interactive setup wizard
  version           Show version

Options:
  --help, -h        Show help
  --version, -v     Show version

Examples:
  npx dotlyte check --schema ./env-schema.ts
  npx dotlyte diff .env.development .env.production
  npx dotlyte generate-types --input .env.example --output src/env.d.ts
  npx dotlyte encrypt .env --keys API_KEY,DB_PASSWORD
  npx dotlyte doctor
  npx dotlyte init
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }

  if (args.includes("--version") || args.includes("-v") || args[0] === "version") {
    console.log(VERSION);
    process.exit(0);
  }

  const command = args[0]!;
  const restArgs = args.slice(1);

  try {
    switch (command) {
      case "check":
        await check(restArgs);
        break;
      case "diff":
        await diff(restArgs);
        break;
      case "generate-types":
        await generateTypes(restArgs);
        break;
      case "encrypt":
        await encrypt(restArgs);
        break;
      case "doctor":
        await doctor(restArgs);
        break;
      case "init":
        await init(restArgs);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

// Suppress unused import warning
void resolve;

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
