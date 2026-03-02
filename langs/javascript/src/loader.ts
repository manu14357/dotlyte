/**
 * Main loader orchestrator for DOTLYTE.
 *
 * Discovers, parses, merges, and coerces configuration from all sources.
 */

import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { Config } from "./config.js";
import { deepMerge } from "./merger.js";
import { DefaultsParser } from "./parsers/defaults.js";
import { DotenvParser } from "./parsers/dotenv.js";
import { EnvVarsParser } from "./parsers/env.js";
import { JsonParser } from "./parsers/json.js";
import { YamlParser } from "./parsers/yaml.js";
import { TomlParser } from "./parsers/toml.js";

/** Options for the load() function. */
export interface LoadOptions {
  /** Explicit list of files to load. */
  files?: string[];
  /** Environment variable prefix to strip (e.g., "APP"). */
  prefix?: string;
  /** Default values (lowest priority). */
  defaults?: Record<string, unknown>;
  /** Custom source order. Valid: "env", "dotenv", "yaml", "json", "toml", "defaults". */
  sources?: string[];
  /** Environment name (e.g., "production"). Loads env-specific files. */
  env?: string;
}

/**
 * Load configuration from all available sources with layered priority.
 *
 * Higher layers override lower layers.
 *
 * @param options - Configuration loading options.
 * @returns A Config object with dot-notation access, get(), and require().
 *
 * @example
 * ```ts
 * const config = load();
 * config.port; // 8080
 * config.get("database.host", "localhost"); // "localhost"
 * ```
 */
export function load(options: LoadOptions = {}): Config {
  const baseDir = process.cwd();
  const layers: Record<string, unknown>[] = [];

  if (options.sources) {
    for (const source of options.sources) {
      const data = loadSource(source, baseDir, options);
      if (data && Object.keys(data).length > 0) {
        layers.push(data);
      }
    }
  } else {
    appendIf(layers, new DefaultsParser(options.defaults ?? {}).parse());
    appendIf(layers, loadTomlFiles(baseDir, options.env));
    appendIf(layers, loadYamlFiles(baseDir, options.env));
    appendIf(layers, loadJsonFiles(baseDir, options.env));
    appendIf(layers, loadDotenvFiles(baseDir, options.env));
    appendIf(layers, new EnvVarsParser(options.prefix).parse());
  }

  let merged: Record<string, unknown> = {};
  for (const layer of layers) {
    merged = deepMerge(merged, layer);
  }

  return new Config(merged);
}

function appendIf(
  layers: Record<string, unknown>[],
  data: Record<string, unknown>,
): void {
  if (data && Object.keys(data).length > 0) {
    layers.push(data);
  }
}

function loadSource(
  name: string,
  baseDir: string,
  options: LoadOptions,
): Record<string, unknown> {
  switch (name) {
    case "defaults":
      return new DefaultsParser(options.defaults ?? {}).parse();
    case "toml":
      return loadTomlFiles(baseDir, options.env);
    case "yaml":
      return loadYamlFiles(baseDir, options.env);
    case "json":
      return loadJsonFiles(baseDir, options.env);
    case "dotenv":
      return loadDotenvFiles(baseDir, options.env);
    case "env":
      return new EnvVarsParser(options.prefix).parse();
    default:
      return {};
  }
}

function loadDotenvFiles(
  baseDir: string,
  env?: string,
): Record<string, unknown> {
  const candidates = [".env"];
  if (env) candidates.push(`.env.${env}`);
  candidates.push(".env.local");

  let merged: Record<string, unknown> = {};
  for (const filename of candidates) {
    const filepath = resolve(baseDir, filename);
    if (existsSync(filepath)) {
      merged = deepMerge(merged, new DotenvParser(filepath).parse());
    }
  }
  return merged;
}

function loadYamlFiles(
  baseDir: string,
  env?: string,
): Record<string, unknown> {
  const candidates = ["config.yaml", "config.yml"];
  if (env) candidates.push(`config.${env}.yaml`, `config.${env}.yml`);

  let merged: Record<string, unknown> = {};
  for (const filename of candidates) {
    const filepath = resolve(baseDir, filename);
    if (existsSync(filepath)) {
      merged = deepMerge(merged, new YamlParser(filepath).parse());
    }
  }
  return merged;
}

function loadJsonFiles(
  baseDir: string,
  env?: string,
): Record<string, unknown> {
  const candidates = ["config.json"];
  if (env) candidates.push(`config.${env}.json`);

  let merged: Record<string, unknown> = {};
  for (const filename of candidates) {
    const filepath = resolve(baseDir, filename);
    if (existsSync(filepath)) {
      merged = deepMerge(merged, new JsonParser(filepath).parse());
    }
  }
  return merged;
}

function loadTomlFiles(
  baseDir: string,
  env?: string,
): Record<string, unknown> {
  const candidates = ["config.toml"];
  if (env) candidates.push(`config.${env}.toml`);

  let merged: Record<string, unknown> = {};
  for (const filename of candidates) {
    const filepath = resolve(baseDir, filename);
    if (existsSync(filepath)) {
      merged = deepMerge(merged, new TomlParser(filepath).parse());
    }
  }
  return merged;
}
