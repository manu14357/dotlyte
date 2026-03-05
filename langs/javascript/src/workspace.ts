/**
 * Monorepo / Workspace Support
 *
 * Detects monorepo root (pnpm-workspace.yaml, lerna.json, nx.json, turbo.json),
 * loads root-level .env first, then package/app-level .env on top.
 * Supports env inheritance: root defaults → package overrides.
 *
 * @example
 * ```ts
 * import { loadWorkspace } from "dotlyte";
 *
 * const config = loadWorkspace({
 *   package: "apps/web",
 *   inherit: true,         // inherit root .env (default: true)
 * });
 * ```
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import type { LoadOptions } from "./loader.js";
import { load } from "./loader.js";

export interface WorkspaceOptions extends LoadOptions {
  /** Sub-package path relative to monorepo root (e.g. "apps/web") */
  package?: string;
  /** Inherit root-level .env files (default: true) */
  inherit?: boolean;
  /** Monorepo root (auto-detected if omitted) */
  root?: string;
}

export interface MonorepoInfo {
  root: string;
  type: "pnpm" | "npm" | "yarn" | "nx" | "turbo" | "lerna" | "unknown";
  packages: string[];
}

/**
 * Auto-detect the monorepo root by walking up from `cwd`.
 */
export function findMonorepoRoot(cwd: string = process.cwd()): MonorepoInfo | undefined {
  let dir = resolve(cwd);
  const root = resolve("/");

  while (dir !== root) {
    const detected = detectMonorepoAt(dir);
    if (detected) return detected;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return undefined;
}

function detectMonorepoAt(dir: string): MonorepoInfo | undefined {
  // pnpm workspaces
  const pnpmWs = join(dir, "pnpm-workspace.yaml");
  if (existsSync(pnpmWs)) {
    return {
      root: dir,
      type: "pnpm",
      packages: extractPnpmWorkspaces(pnpmWs),
    };
  }

  // Turbo
  const turboJson = join(dir, "turbo.json");
  if (existsSync(turboJson)) {
    return {
      root: dir,
      type: "turbo",
      packages: extractPackageJsonWorkspaces(dir),
    };
  }

  // Nx
  const nxJson = join(dir, "nx.json");
  if (existsSync(nxJson)) {
    return {
      root: dir,
      type: "nx",
      packages: extractPackageJsonWorkspaces(dir),
    };
  }

  // Lerna
  const lernaJson = join(dir, "lerna.json");
  if (existsSync(lernaJson)) {
    return {
      root: dir,
      type: "lerna",
      packages: extractLernaPackages(lernaJson),
    };
  }

  // npm/yarn workspaces (package.json)
  const pkgPath = join(dir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      if (pkg.workspaces) {
        const isYarn = existsSync(join(dir, "yarn.lock"));
        return {
          root: dir,
          type: isYarn ? "yarn" : "npm",
          packages: extractFromWorkspacesField(pkg.workspaces),
        };
      }
    } catch {
      // ignore
    }
  }

  return undefined;
}

/**
 * Load config with monorepo-aware env inheritance.
 *
 * Priority (highest wins):
 *   1. Environment variables
 *   2. Package .env files (apps/web/.env, .env.local, .env.{env})
 *   3. Root .env files (.env, .env.local, .env.{env})
 *   4. Defaults
 */
export function loadWorkspace(options: WorkspaceOptions = {}): ReturnType<typeof load> {
  const pkgPath = options.package;
  const inherit = options.inherit ?? true;
  const explicitRoot = options.root;

  // Build LoadOptions by stripping workspace-specific fields
  const { package: _pkg, inherit: _inh, root: _root, ...loadOptions } = options;

  // Find monorepo root
  const monoRoot = explicitRoot ?? findMonorepoRoot()?.root;

  if (!monoRoot && inherit) {
    // Not a monorepo, fall back to regular load
    return load(loadOptions);
  }

  if (!inherit || !monoRoot) {
    // No inheritance, just load from package dir
    return load(loadOptions);
  }

  // Load root-level config
  const rootFiles = resolveEnvFiles(monoRoot, options.env);

  // Load package-level config
  const packageDir = pkgPath
    ? resolve(monoRoot, pkgPath)
    : process.cwd();
  const packageFiles = resolveEnvFiles(packageDir, options.env);

  // Merge: root files first (lower priority), then package files (higher priority)
  const allFiles = [...rootFiles, ...packageFiles];
  const existingFiles = allFiles.filter((f) => existsSync(f));

  return load({
    ...loadOptions,
    files: existingFiles.length > 0 ? existingFiles : undefined,
  });
}

/**
 * Resolve potential env files in a directory.
 */
function resolveEnvFiles(dir: string, env?: string): string[] {
  const files = [
    join(dir, ".env"),
    join(dir, ".env.local"),
  ];

  if (env) {
    files.push(join(dir, `.env.${env}`));
    files.push(join(dir, `.env.${env}.local`));
  }

  return files;
}

/**
 * Get shared env keys that should be available to all packages.
 * Reads from root .env and applies prefix stripping.
 */
export function getSharedEnv(
  root: string,
  prefix?: string,
): Record<string, string> {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return {};

  const content = readFileSync(envPath, "utf-8");
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;

    let key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();

    if (prefix && key.startsWith(prefix)) {
      key = key.slice(prefix.length);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Generate a turbo.json `globalEnv` / `env` passthrough config
 * from the current environment variables.
 */
export function generateTurboEnvConfig(
  envKeys: string[],
  options?: { global?: boolean },
): Record<string, unknown> {
  if (options?.global) {
    return { globalEnv: envKeys };
  }
  return { env: envKeys };
}

// --- Internal workspace detection helpers ---

function extractPnpmWorkspaces(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    const packages: string[] = [];
    let inPackages = false;

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed === "packages:") {
        inPackages = true;
        continue;
      }
      if (inPackages && trimmed.startsWith("- ")) {
        packages.push(trimmed.slice(2).replace(/['"]/g, ""));
      } else if (inPackages && !trimmed.startsWith("-") && trimmed !== "") {
        break;
      }
    }

    return packages;
  } catch {
    return [];
  }
}

function extractPackageJsonWorkspaces(dir: string): string[] {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return [];

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
    return extractFromWorkspacesField(pkg.workspaces);
  } catch {
    return [];
  }
}

function extractFromWorkspacesField(workspaces: unknown): string[] {
  if (Array.isArray(workspaces)) {
    return workspaces.filter((w): w is string => typeof w === "string");
  }
  if (workspaces && typeof workspaces === "object" && "packages" in workspaces) {
    const pkgs = (workspaces as { packages: unknown }).packages;
    if (Array.isArray(pkgs)) {
      return pkgs.filter((w): w is string => typeof w === "string");
    }
  }
  return [];
}

function extractLernaPackages(filePath: string): string[] {
  try {
    const content = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
    const pkgs = content.packages;
    if (Array.isArray(pkgs)) {
      return pkgs.filter((w): w is string => typeof w === "string");
    }
    return ["packages/*"];
  } catch {
    return [];
  }
}
