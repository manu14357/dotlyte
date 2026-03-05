/**
 * `dotlyte init` — Interactive setup wizard.
 *
 * Usage:
 *   dotlyte init
 *   dotlyte init --framework next
 *
 * Steps:
 *   1. Detect framework (Next.js, Nuxt, Remix, SvelteKit, Vite, Node.js)
 *   2. Generate .env.example with common variables
 *   3. Generate dotlyte.config.ts / schema
 *   4. Update .gitignore
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

interface Framework {
  name: string;
  prefix: string;
  envFile: string;
  exampleVars: Record<string, string>;
}

const FRAMEWORKS: Record<string, Framework> = {
  next: {
    name: "Next.js",
    prefix: "NEXT_PUBLIC_",
    envFile: ".env.local",
    exampleVars: {
      NODE_ENV: "development",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_API_URL: "http://localhost:3000/api",
      DATABASE_URL: "postgresql://user:password@localhost:5432/db",
      NEXTAUTH_SECRET: "your-secret-here",
      NEXTAUTH_URL: "http://localhost:3000",
    },
  },
  nuxt: {
    name: "Nuxt",
    prefix: "NUXT_PUBLIC_",
    envFile: ".env",
    exampleVars: {
      NODE_ENV: "development",
      NUXT_PUBLIC_APP_URL: "http://localhost:3000",
      DATABASE_URL: "postgresql://user:password@localhost:5432/db",
    },
  },
  remix: {
    name: "Remix",
    prefix: "",
    envFile: ".env",
    exampleVars: {
      NODE_ENV: "development",
      SESSION_SECRET: "your-secret-here",
      DATABASE_URL: "postgresql://user:password@localhost:5432/db",
    },
  },
  sveltekit: {
    name: "SvelteKit",
    prefix: "PUBLIC_",
    envFile: ".env",
    exampleVars: {
      NODE_ENV: "development",
      PUBLIC_APP_URL: "http://localhost:5173",
      DATABASE_URL: "postgresql://user:password@localhost:5432/db",
    },
  },
  vite: {
    name: "Vite",
    prefix: "VITE_",
    envFile: ".env",
    exampleVars: {
      NODE_ENV: "development",
      VITE_APP_URL: "http://localhost:5173",
      VITE_API_URL: "http://localhost:3000/api",
    },
  },
  node: {
    name: "Node.js",
    prefix: "",
    envFile: ".env",
    exampleVars: {
      NODE_ENV: "development",
      PORT: "3000",
      DATABASE_URL: "postgresql://user:password@localhost:5432/db",
      LOG_LEVEL: "debug",
    },
  },
};

export async function init(args: string[]): Promise<void> {
  console.log("\n🚀 dotlyte init\n");

  // Parse --framework flag
  let frameworkKey: string | undefined;
  const fwIdx = args.indexOf("--framework");
  if (fwIdx !== -1 && args[fwIdx + 1]) {
    frameworkKey = args[fwIdx + 1]?.toLowerCase();
  }

  // Auto-detect framework
  if (!frameworkKey) {
    frameworkKey = detectFramework();
    if (frameworkKey) {
      console.log(`  Detected framework: ${FRAMEWORKS[frameworkKey]!.name}`);
    } else {
      frameworkKey = "node";
      console.log("  No specific framework detected, using Node.js defaults");
    }
  }

  const framework = FRAMEWORKS[frameworkKey];
  if (!framework) {
    console.log(`  Unknown framework: ${frameworkKey}`);
    console.log(`  Supported: ${Object.keys(FRAMEWORKS).join(", ")}`);
    process.exit(1);
    return;
  }

  console.log(`  Setting up for ${framework.name}...\n`);

  // Step 1: Create .env.example
  const examplePath = resolve(".env.example");
  if (existsSync(examplePath)) {
    console.log("  ⏭️  .env.example already exists, skipping");
  } else {
    const lines = Object.entries(framework.exampleVars).map(([k, v]) => `${k}=${v}`);
    writeFileSync(examplePath, lines.join("\n") + "\n");
    console.log("  ✓ Created .env.example");
  }

  // Step 2: Create .env from example if it doesn't exist
  const envPath = resolve(framework.envFile);
  if (existsSync(envPath)) {
    console.log(`  ⏭️  ${framework.envFile} already exists, skipping`);
  } else {
    const lines = Object.entries(framework.exampleVars).map(([k, v]) => `${k}=${v}`);
    writeFileSync(envPath, lines.join("\n") + "\n");
    console.log(`  ✓ Created ${framework.envFile}`);
  }

  // Step 3: Generate dotlyte.config.ts
  const configPath = resolve("dotlyte.config.ts");
  if (existsSync(configPath)) {
    console.log("  ⏭️  dotlyte.config.ts already exists, skipping");
  } else {
    const configContent = generateConfig(framework, frameworkKey);
    writeFileSync(configPath, configContent);
    console.log("  ✓ Created dotlyte.config.ts");
  }

  // Step 4: Generate env.ts (typed config)
  const envTsPath = resolve("src", "env.ts");
  if (existsSync(envTsPath)) {
    console.log("  ⏭️  src/env.ts already exists, skipping");
  } else {
    const envContent = generateEnvTs(framework, frameworkKey);
    writeFileSync(envTsPath, envContent);
    console.log("  ✓ Created src/env.ts (typed config)");
  }

  // Step 5: Update .gitignore
  const gitignorePath = resolve(".gitignore");
  const entriesToAdd = [".env", ".env.local", ".env.*.local", ".dotlyte-keys"];

  if (existsSync(gitignorePath)) {
    const existing = readFileSync(gitignorePath, "utf-8");
    const toAdd = entriesToAdd.filter((e) => !existing.includes(e));
    if (toAdd.length > 0) {
      appendFileSync(gitignorePath, "\n# dotlyte\n" + toAdd.join("\n") + "\n");
      console.log(`  ✓ Updated .gitignore (added ${toAdd.join(", ")})`);
    } else {
      console.log("  ✓ .gitignore already has env entries");
    }
  } else {
    writeFileSync(gitignorePath, "# dotlyte\n" + entriesToAdd.join("\n") + "\n");
    console.log("  ✓ Created .gitignore");
  }

  console.log("\n  ✅ Done! Run `dotlyte doctor` to verify your setup.\n");
}

function detectFramework(): string | undefined {
  const pkgPath = resolve("package.json");
  if (!existsSync(pkgPath)) return undefined;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    const deps = {
      ...(pkg.dependencies as Record<string, string> | undefined),
      ...(pkg.devDependencies as Record<string, string> | undefined),
    };

    if (deps.next) return "next";
    if (deps.nuxt) return "nuxt";
    if (deps["@remix-run/node"] || deps["@remix-run/dev"]) return "remix";
    if (deps["@sveltejs/kit"]) return "sveltekit";
    if (deps.vite) return "vite";
    return "node";
  } catch {
    return undefined;
  }
}

function generateConfig(framework: Framework, _key: string): string {
  return `import { load } from "dotlyte";

/**
 * Dotlyte configuration for ${framework.name}.
 * Customize sources, prefix, and defaults.
 */
export default {
  prefix: "${framework.prefix}",
  env: process.env.NODE_ENV ?? "development",
  defaults: {
    port: 3000,
  },
};

export const config = load({
  prefix: "${framework.prefix}",
  env: process.env.NODE_ENV ?? "development",
});
`;
}

function generateEnvTs(framework: Framework, key: string): string {
  const serverVars = Object.keys(framework.exampleVars)
    .filter((k) => !k.startsWith(framework.prefix) || !framework.prefix)
    .filter((k) => k !== "NODE_ENV");

  const clientVars = Object.keys(framework.exampleVars)
    .filter((k) => framework.prefix && k.startsWith(framework.prefix));

  if (key === "next") {
    return `import { createTypedConfig } from "dotlyte";

/**
 * Type-safe environment configuration.
 * Import this in your application code.
 */
export const env = createTypedConfig({
  server: {
${serverVars.map((v) => `    ${toCamelCase(v)}: { env: "${v}" },`).join("\n")}
  },
  client: {
${clientVars.map((v) => `    ${toCamelCase(v)}: { env: "${v}" },`).join("\n")}
  },
});
`;
  }

  return `import { createTypedConfig } from "dotlyte";

/**
 * Type-safe environment configuration.
 * Import this in your application code.
 */
export const env = createTypedConfig({
${Object.keys(framework.exampleVars)
  .filter((k) => k !== "NODE_ENV")
  .map((v) => `  ${toCamelCase(v)}: { env: "${v}" },`)
  .join("\n")}
});
`;
}

function toCamelCase(key: string): string {
  return key
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part, i) => (i === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join("");
}
