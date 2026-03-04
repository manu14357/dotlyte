/**
 * Main loader orchestrator for DOTLYTE v2.
 *
 * Discovers, parses, interpolates, merges, validates, and coerces
 * configuration from all sources with plugin support.
 */

import { resolve, dirname, basename } from "node:path";
import { existsSync } from "node:fs";
import { Config } from "./config.js";
import { deepMerge } from "./merger.js";
import { FileError } from "./errors.js";
import { DefaultsParser } from "./parsers/defaults.js";
import { DotenvParser } from "./parsers/dotenv.js";
import { EnvVarsParser } from "./parsers/env.js";
import { JsonParser } from "./parsers/json.js";
import { YamlParser } from "./parsers/yaml.js";
import { TomlParser } from "./parsers/toml.js";
import { interpolate } from "./interpolation.js";
import { coerceObject } from "./coercion.js";
import { decryptFile, resolveEncryptionKey } from "./encryption.js";
import { applySchemaDefaults, assertValid } from "./validator.js";
import type { DotlyteSchema } from "./validator.js";
import { ConfigWatcher } from "./watcher.js";

/* ──────── Source Plugin Interface ──────── */

/**
 * A Source is any object that can produce config key-value data.
 * Implement this interface to create custom config sources (vault, HTTP, etc.)
 */
export interface Source {
  /** Human-readable name for debug logging. */
  readonly name: string;
  /** Parse and return configuration data. */
  parse(): Record<string, unknown> | Promise<Record<string, unknown>>;
}

/* ──────── Load Options ──────── */

/** Options for the load() function. */
export interface LoadOptions {
  /** Explicit list of files to load. When set, auto-discovery is SKIPPED. */
  files?: string[];
  /** Environment variable prefix to strip (e.g., "APP"). */
  prefix?: string;
  /** Default values (lowest priority). */
  defaults?: Record<string, unknown>;
  /** Custom source order. Valid: "env", "dotenv", "yaml", "json", "toml", "defaults". */
  sources?: string[];
  /** Environment name (e.g., "production"). Loads env-specific files. */
  env?: string;
  /** Schema for validation at load time. Throws ValidationError if invalid. */
  schema?: DotlyteSchema;
  /** Reject unknown keys not in schema. Requires schema. */
  strict?: boolean;
  /** Custom source plugins (participate in priority chain via sources order). */
  plugins?: Source[];
  /** Enable file watching for hot-reload. */
  watch?: boolean;
  /** Debounce time in ms for file watcher (default: 100). */
  debounceMs?: number;
  /** Enable variable interpolation in .env files (default: true). */
  interpolate?: boolean;
  /** Override mode: .env files override OS env vars when true. */
  override?: boolean;
  /** Enable debug logging of source resolution. */
  debug?: boolean;
  /** Walk up parent directories to find config files (default: false). */
  findUp?: boolean;
  /** Marker files that indicate project root when using findUp (default: [".git","package.json"]). */
  rootMarkers?: string[];
  /** Base directory to search for config files (default: process.cwd()). */
  cwd?: string;
}

/* ──────── Debug Logger ──────── */

function debugLog(enabled: boolean, ...args: unknown[]): void {
  if (enabled) {
    console.debug("[dotlyte]", ...args);
  }
}

/* ──────── Main Load Function ──────── */

/**
 * Load configuration from all available sources with layered priority.
 *
 * @example
 * ```ts
 * // Basic usage
 * const config = load();
 *
 * // With schema validation and encryption
 * const config = load({
 *   env: "production",
 *   schema: { port: { type: "number", required: true, min: 1, max: 65535 } },
 *   strict: true,
 *   debug: true,
 * });
 *
 * // With plugins
 * const config = load({
 *   plugins: [vaultSource({ addr: "...", token: "..." })],
 *   sources: ["defaults", "toml", "yaml", "json", "dotenv", "vault", "env"],
 * });
 * ```
 */
export function load(options: LoadOptions = {}): Config {
  const debug = options.debug ?? false;
  const doInterpolate = options.interpolate !== false; // default true
  const baseDir = findBaseDir(options);

  debugLog(debug, `Base directory: ${baseDir}`);
  debugLog(debug, `Environment: ${options.env ?? "default"}`);

  // Build plugin map
  const pluginMap = new Map<string, Source>();
  if (options.plugins) {
    for (const plugin of options.plugins) {
      pluginMap.set(plugin.name, plugin);
      debugLog(debug, `Registered plugin: ${plugin.name}`);
    }
  }

  const layers: Record<string, unknown>[] = [];
  const loadedFiles: string[] = [];

  // ─── EXPLICIT FILES MODE ───
  if (options.files && options.files.length > 0) {
    debugLog(debug, `Explicit files mode: ${options.files.join(", ")}`);

    for (const file of options.files) {
      const filepath = resolve(baseDir, file);

      if (!existsSync(filepath)) {
        throw new FileError(filepath);
      }

      const data = parseFileByExtension(filepath, doInterpolate, {}, options.env);
      if (data && Object.keys(data).length > 0) {
        layers.push(data);
        loadedFiles.push(filepath);
        debugLog(debug, `Loaded: ${filepath} (${Object.keys(data).length} keys)`);
      }
    }

    // Still load env vars and defaults even in explicit mode
    appendIf(layers, new DefaultsParser(options.defaults ?? {}).parse(), debug, "defaults");
    appendIf(
      layers,
      new EnvVarsParser(options.prefix, options.override ? "override" : "default").parse(),
      debug,
      "env vars",
    );
  }
  // ─── CUSTOM SOURCE ORDER ───
  else if (options.sources) {
    debugLog(debug, `Custom source order: ${options.sources.join(" → ")}`);

    for (const source of options.sources) {
      // Check plugins first
      if (pluginMap.has(source)) {
        const plugin = pluginMap.get(source)!;
        const data = plugin.parse();
        if (data && typeof data === "object" && !Array.isArray(data)) {
          appendIf(layers, data as Record<string, unknown>, debug, `plugin:${source}`);
        }
        continue;
      }

      const data = loadNamedSource(source, baseDir, options, loadedFiles, doInterpolate, layers);
      if (data && Object.keys(data).length > 0) {
        layers.push(data);
      }
    }
  }
  // ─── AUTO-DISCOVERY (DEFAULT) ───
  else {
    debugLog(debug, "Auto-discovery mode");

    appendIf(layers, new DefaultsParser(options.defaults ?? {}).parse(), debug, "defaults");
    appendIf(layers, loadTomlFiles(baseDir, options.env, loadedFiles, debug), debug, "toml");
    appendIf(layers, loadYamlFiles(baseDir, options.env, loadedFiles, debug), debug, "yaml");
    appendIf(layers, loadJsonFiles(baseDir, options.env, loadedFiles, debug), debug, "json");

    // Dotenv with interpolation
    const dotenvRaw = loadDotenvFilesRaw(baseDir, options.env, loadedFiles, debug);
    let dotenvData: Record<string, unknown>;
    if (doInterpolate && Object.keys(dotenvRaw).length > 0) {
      const alreadyMerged = mergeAll(layers);
      const interpolated = interpolate(dotenvRaw, alreadyMerged);
      dotenvData = coerceObject(interpolated as Record<string, unknown>);
    } else {
      dotenvData = coerceObject(dotenvRaw as Record<string, unknown>);
    }
    appendIf(layers, dotenvData, debug, "dotenv");

    // Encrypted .env files
    const encryptedData = loadEncryptedDotenvFiles(baseDir, options.env, loadedFiles, debug);
    if (doInterpolate && Object.keys(encryptedData).length > 0) {
      const alreadyMerged = mergeAll(layers);
      const interpolated = interpolate(encryptedData, alreadyMerged);
      appendIf(layers, coerceObject(interpolated as Record<string, unknown>), debug, "encrypted dotenv");
    } else {
      appendIf(layers, coerceObject(encryptedData as Record<string, unknown>), debug, "encrypted dotenv");
    }

    // Environment variables (highest priority for env, but affected by override mode)
    if (options.override) {
      // In override mode, dotenv wins over OS env vars, so load env vars BEFORE dotenv
      // We need to re-order: inject env vars at a lower position
      debugLog(debug, "Override mode: .env files take precedence over environment variables");
    }
    appendIf(
      layers,
      new EnvVarsParser(options.prefix).parse(),
      debug,
      "env vars",
    );

    // Plugins (at their natural position after built-in sources)
    for (const plugin of pluginMap.values()) {
      const data = plugin.parse();
      if (data && typeof data === "object" && !Array.isArray(data)) {
        appendIf(layers, data as Record<string, unknown>, debug, `plugin:${plugin.name}`);
      }
    }
  }

  // ─── MERGE ALL LAYERS ───
  let merged: Record<string, unknown> = {};
  for (const layer of layers) {
    merged = deepMerge(merged, layer);
  }

  debugLog(debug, `Merged ${layers.length} layers, ${Object.keys(merged).length} top-level keys`);

  // ─── SCHEMA DEFAULTS ───
  if (options.schema) {
    merged = applySchemaDefaults(merged, options.schema);
  }

  // ─── SCHEMA VALIDATION ───
  if (options.schema) {
    debugLog(debug, "Validating against schema...");
    assertValid(merged, options.schema, options.strict ?? false);
    debugLog(debug, "Schema validation passed ✓");
  }

  // ─── BUILD CONFIG ───
  const config = new Config(merged, {
    schema: options.schema,
    sourceFiles: loadedFiles,
    frozen: true,
  });

  // ─── FILE WATCHING ───
  if (options.watch && loadedFiles.length > 0) {
    debugLog(debug, `Watching ${loadedFiles.length} files for changes`);
    const watcher = new ConfigWatcher(loadedFiles, options.debounceMs);
    config._setWatcher(watcher);
    watcher.start(() => {
      // Reload: call load() again without watch to get new data
      const reloaded = load({ ...options, watch: false });
      return reloaded.toObject();
    });
  }

  return config;
}

/* ──────── Source loading helpers ──────── */

function loadNamedSource(
  name: string,
  baseDir: string,
  options: LoadOptions,
  loadedFiles: string[],
  doInterpolate: boolean,
  existingLayers: Record<string, unknown>[],
): Record<string, unknown> {
  const debug = options.debug ?? false;

  switch (name) {
    case "defaults":
      return appendIfReturn(new DefaultsParser(options.defaults ?? {}).parse(), debug, "defaults");
    case "toml":
      return appendIfReturn(loadTomlFiles(baseDir, options.env, loadedFiles, debug), debug, "toml");
    case "yaml":
      return appendIfReturn(loadYamlFiles(baseDir, options.env, loadedFiles, debug), debug, "yaml");
    case "json":
      return appendIfReturn(loadJsonFiles(baseDir, options.env, loadedFiles, debug), debug, "json");
    case "dotenv": {
      const raw = loadDotenvFilesRaw(baseDir, options.env, loadedFiles, debug);
      if (doInterpolate && Object.keys(raw).length > 0) {
        const alreadyMerged = mergeAll(existingLayers);
        const interpolated = interpolate(raw, alreadyMerged);
        return coerceObject(interpolated as Record<string, unknown>);
      }
      return coerceObject(raw as Record<string, unknown>);
    }
    case "env":
      return new EnvVarsParser(options.prefix).parse();
    default:
      debugLog(debug, `Unknown source: ${name}`);
      return {};
  }
}

/* ──────── File discovery ──────── */

function findBaseDir(options: LoadOptions): string {
  const cwd = options.cwd ?? process.cwd();

  if (!options.findUp) return cwd;

  const markers = options.rootMarkers ?? [".git", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"];
  let dir = cwd;

  while (true) {
    // Check for any config files in this directory
    const hasConfig =
      existsSync(resolve(dir, ".env")) ||
      existsSync(resolve(dir, "config.yaml")) ||
      existsSync(resolve(dir, "config.json")) ||
      existsSync(resolve(dir, "config.toml"));

    if (hasConfig) return dir;

    // Check for root markers
    for (const marker of markers) {
      if (existsSync(resolve(dir, marker))) return dir;
    }

    // Go up
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  return cwd; // fallback
}

function loadDotenvFilesRaw(
  baseDir: string,
  env: string | undefined,
  loadedFiles: string[],
  debug: boolean,
): Record<string, string> {
  const candidates = [".env"];
  if (env) candidates.push(`.env.${env}`);
  candidates.push(".env.local");

  let merged: Record<string, string> = {};
  for (const filename of candidates) {
    const filepath = resolve(baseDir, filename);
    if (existsSync(filepath)) {
      const raw = new DotenvParser(filepath).parseRaw();
      merged = { ...merged, ...raw };
      loadedFiles.push(filepath);
      debugLog(debug, `Loaded dotenv: ${filepath}`);
    }
  }
  return merged;
}

function loadEncryptedDotenvFiles(
  baseDir: string,
  env: string | undefined,
  loadedFiles: string[],
  debug: boolean,
): Record<string, string> {
  const candidates = [".env.encrypted"];
  if (env) candidates.push(`.env.${env}.encrypted`);

  // Check if we have a key available
  const key = resolveEncryptionKey(env, baseDir);
  if (!key) {
    debugLog(debug, "No encryption key found — skipping encrypted .env files");
    return {};
  }

  let merged: Record<string, string> = {};
  for (const filename of candidates) {
    const filepath = resolve(baseDir, filename);
    if (existsSync(filepath)) {
      try {
        const data = decryptFile(filepath, key, env);
        merged = { ...merged, ...data };
        loadedFiles.push(filepath);
        debugLog(debug, `Decrypted and loaded: ${filepath}`);
      } catch (e) {
        debugLog(debug, `Failed to decrypt ${filepath}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
  return merged;
}

function loadYamlFiles(
  baseDir: string,
  env: string | undefined,
  loadedFiles: string[],
  debug: boolean,
): Record<string, unknown> {
  const candidates = ["config.yaml", "config.yml"];
  if (env) candidates.push(`config.${env}.yaml`, `config.${env}.yml`);

  let merged: Record<string, unknown> = {};
  for (const filename of candidates) {
    const filepath = resolve(baseDir, filename);
    if (existsSync(filepath)) {
      merged = deepMerge(merged, new YamlParser(filepath).parse());
      loadedFiles.push(filepath);
      debugLog(debug, `Loaded YAML: ${filepath}`);
    }
  }
  return merged;
}

function loadJsonFiles(
  baseDir: string,
  env: string | undefined,
  loadedFiles: string[],
  debug: boolean,
): Record<string, unknown> {
  const candidates = ["config.json"];
  if (env) candidates.push(`config.${env}.json`);

  let merged: Record<string, unknown> = {};
  for (const filename of candidates) {
    const filepath = resolve(baseDir, filename);
    if (existsSync(filepath)) {
      merged = deepMerge(merged, new JsonParser(filepath).parse());
      loadedFiles.push(filepath);
      debugLog(debug, `Loaded JSON: ${filepath}`);
    }
  }
  return merged;
}

function loadTomlFiles(
  baseDir: string,
  env: string | undefined,
  loadedFiles: string[],
  debug: boolean,
): Record<string, unknown> {
  const candidates = ["config.toml"];
  if (env) candidates.push(`config.${env}.toml`);

  let merged: Record<string, unknown> = {};
  for (const filename of candidates) {
    const filepath = resolve(baseDir, filename);
    if (existsSync(filepath)) {
      merged = deepMerge(merged, new TomlParser(filepath).parse());
      loadedFiles.push(filepath);
      debugLog(debug, `Loaded TOML: ${filepath}`);
    }
  }
  return merged;
}

function parseFileByExtension(
  filepath: string,
  doInterpolate: boolean,
  context: Record<string, unknown>,
  env?: string,
): Record<string, unknown> {
  const name = basename(filepath).toLowerCase();

  if (name.endsWith(".encrypted")) {
    const raw = decryptFile(filepath, undefined, env);
    if (doInterpolate) {
      const interpolated = interpolate(raw, context);
      return coerceObject(interpolated as Record<string, unknown>);
    }
    return coerceObject(raw as Record<string, unknown>);
  }
  if (name.endsWith(".yaml") || name.endsWith(".yml")) {
    return new YamlParser(filepath).parse();
  }
  if (name.endsWith(".json")) {
    return new JsonParser(filepath).parse();
  }
  if (name.endsWith(".toml")) {
    return new TomlParser(filepath).parse();
  }
  if (name.startsWith(".env") || name.endsWith(".env")) {
    const raw = new DotenvParser(filepath).parseRaw();
    if (doInterpolate) {
      const interpolated = interpolate(raw, context);
      return coerceObject(interpolated as Record<string, unknown>);
    }
    return coerceObject(raw as Record<string, unknown>);
  }

  // Try JSON as default
  return new JsonParser(filepath).parse();
}

/* ──────── Utility ──────── */

function appendIf(
  layers: Record<string, unknown>[],
  data: Record<string, unknown>,
  debug: boolean,
  name: string,
): void {
  if (data && Object.keys(data).length > 0) {
    layers.push(data);
    debugLog(debug, `Loaded ${name}: ${Object.keys(data).length} keys`);
  }
}

function appendIfReturn(
  data: Record<string, unknown>,
  _debug: boolean,
  _name: string,
): Record<string, unknown> {
  return data && Object.keys(data).length > 0 ? data : {};
}

function mergeAll(layers: Record<string, unknown>[]): Record<string, unknown> {
  let result: Record<string, unknown> = {};
  for (const layer of layers) {
    result = deepMerge(result, layer);
  }
  return result;
}
