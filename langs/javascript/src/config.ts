/**
 * Config object v2 — immutable by default, with dot-notation access,
 * scoped sub-configs, schema validation, sensitive masking, typed access,
 * batch require, serialization, and watcher support.
 */

import { writeFileSync } from "node:fs";
import { MissingRequiredKeyError, DotlyteError } from "./errors.js";
import type { DotlyteSchema } from "./validator.js";
import { validateSchema, assertValid, getSensitiveKeys } from "./validator.js";
import { buildSensitiveSet, redactObject, formatRedacted } from "./masking.js";
import type { ChangeCallback, KeyChangeCallback, ErrorCallback } from "./watcher.js";
import { ConfigWatcher } from "./watcher.js";

/**
 * Configuration object with dot-notation property access.
 *
 * Immutable by default after construction. Use toObject() for a mutable copy.
 *
 * @example
 * ```ts
 * const config = new Config({ port: 8080, database: { host: "localhost" } });
 * config.port;           // 8080
 * config.database.host;  // "localhost"
 * config.get("port");    // 8080
 * config.require("database.host"); // "localhost"
 * config.scope("database").get("host"); // "localhost"
 * ```
 */
export class Config {
  private readonly _data: Readonly<Record<string, unknown>>;
  private _sensitiveKeys: Set<string>;
  private _schema?: DotlyteSchema;
  private _watcher?: ConfigWatcher;
  private _sourceFiles: string[];
  private _frozen: boolean;
  [key: string]: unknown;

  constructor(
    data: Record<string, unknown>,
    options: {
      schema?: DotlyteSchema;
      sensitiveKeys?: Set<string>;
      sourceFiles?: string[];
      frozen?: boolean;
    } = {},
  ) {
    this._data = data;
    this._schema = options.schema;
    this._sourceFiles = options.sourceFiles ?? [];
    this._frozen = options.frozen ?? true;

    // Build sensitive keys set
    const allKeys = this._flattenKeys(data);
    const schemaSensitive = options.schema ? getSensitiveKeys(options.schema) : new Set<string>();
    this._sensitiveKeys = options.sensitiveKeys ?? buildSensitiveSet(allKeys, schemaSensitive);

    // Set dot-notation properties
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        (this as Record<string, unknown>)[key] = new Config(
          value as Record<string, unknown>,
          {
            sensitiveKeys: this._scopedSensitiveKeys(key),
            frozen: this._frozen,
          },
        );
      } else {
        (this as Record<string, unknown>)[key] = value;
      }
    }

    // Freeze if immutable mode (default)
    if (this._frozen) {
      Object.freeze(this._data);
    }
  }

  /* ──────── Core Access ──────── */

  /**
   * Safe access with optional fallback. Supports dot-notation.
   *
   * @param key - Configuration key (e.g., "database.host").
   * @param defaultValue - Fallback if key is missing.
   */
  get(key: string, defaultValue?: unknown): unknown {
    try {
      const parts = key.split(".");
      let val: unknown = this._data;
      for (const part of parts) {
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
          val = (val as Record<string, unknown>)[part];
        } else {
          return defaultValue;
        }
      }
      return val ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Access a required key. Throws with actionable message if missing.
   */
  require(key: string): unknown {
    const val = this.get(key);
    if (val === undefined || val === null) {
      throw new MissingRequiredKeyError(key, this._sourceFiles);
    }
    return val;
  }

  /**
   * Batch require multiple keys. Reports ALL missing keys at once.
   *
   * @throws {DotlyteError} With all missing key names if any are absent.
   */
  requireKeys(...keys: string[]): Record<string, unknown> {
    const missing: string[] = [];
    const result: Record<string, unknown> = {};

    for (const key of keys) {
      const val = this.get(key);
      if (val === undefined || val === null) {
        missing.push(key);
      } else {
        result[key] = val;
      }
    }

    if (missing.length > 0) {
      throw new DotlyteError(
        `Required config keys are missing: ${missing.map((k) => `'${k}'`).join(", ")}. ` +
          `Set them in your .env file, config file, or as environment variables.`,
      );
    }

    return result;
  }

  /**
   * Check if a key exists and is non-null.
   */
  has(key: string): boolean {
    const val = this.get(key);
    return val !== undefined && val !== null;
  }

  /* ──────── Scoped Access ──────── */

  /**
   * Return a new Config scoped to a subtree.
   *
   * @example
   * config.scope("database").get("host") === config.get("database.host")
   */
  scope(prefix: string): Config {
    const val = this.get(prefix);
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return new Config(val as Record<string, unknown>, {
        sensitiveKeys: this._scopedSensitiveKeys(prefix),
        frozen: this._frozen,
      });
    }
    return new Config({}, { frozen: this._frozen });
  }

  /* ──────── Enumeration ──────── */

  /**
   * Return all keys in flat dot-notation form.
   */
  keys(): string[] {
    return this._flattenKeys(this._data);
  }

  /**
   * Return a flat map of all keys → values (dot-notation).
   */
  toFlatMap(): Record<string, unknown> {
    return this._flattenToMap(this._data);
  }

  /* ──────── Serialization ──────── */

  /**
   * Convert to a plain mutable object (deep copy).
   */
  toObject(): Record<string, unknown> {
    return JSON.parse(JSON.stringify(this._data));
  }

  /**
   * Convert to a redacted object (sensitive values replaced with ***).
   */
  toObjectRedacted(): Record<string, unknown> {
    return redactObject(this.toObject(), this._sensitiveKeys);
  }

  /**
   * JSON representation with sensitive values redacted.
   */
  toJSON(): Record<string, unknown> {
    return this.toObjectRedacted();
  }

  /**
   * Human-readable string with sensitive values redacted.
   */
  toString(): string {
    return formatRedacted(this._data as Record<string, unknown>, this._sensitiveKeys);
  }

  /**
   * Write config to a file.
   *
   * @param filePath — output file path
   * @param format — "json" | "env" | "yaml" | "toml" (default: auto-detect from extension)
   */
  writeTo(filePath: string, format?: "json" | "env" | "yaml" | "toml"): void {
    const fmt = format ?? detectFormat(filePath);
    let content: string;

    switch (fmt) {
      case "json":
        content = JSON.stringify(this._data, null, 2) + "\n";
        break;
      case "env":
        content = this._toEnvString();
        break;
      case "yaml":
        content = this._toYamlString(this._data as Record<string, unknown>);
        break;
      case "toml":
        content = this._toTomlString(this._data as Record<string, unknown>);
        break;
      default:
        content = JSON.stringify(this._data, null, 2) + "\n";
    }

    writeFileSync(filePath, content, "utf-8");
  }

  /* ──────── Validation ──────── */

  /**
   * Validate against a schema. Returns all violations.
   */
  validate(schema?: DotlyteSchema, strict = false) {
    const s = schema ?? this._schema;
    if (!s) {
      throw new DotlyteError("No schema provided for validation.");
    }
    return validateSchema(this._data as Record<string, unknown>, s, strict);
  }

  /**
   * Validate and throw if any violations.
   */
  assertValid(schema?: DotlyteSchema, strict = false): void {
    const s = schema ?? this._schema;
    if (!s) {
      throw new DotlyteError("No schema provided for validation.");
    }
    assertValid(this._data as Record<string, unknown>, s, strict);
  }

  /* ──────── Watch / Hot-Reload ──────── */

  /** Register a callback for any config change. */
  onChange(callback: ChangeCallback): void {
    this._watcher?.onChange(callback);
  }

  /** Register a callback for a specific key change. */
  onKeyChange(key: string, callback: KeyChangeCallback): void {
    this._watcher?.onKeyChange(key, callback);
  }

  /** Register a callback for reload errors. */
  onError(callback: ErrorCallback): void {
    this._watcher?.onError(callback);
  }

  /** Stop watching and clean up resources. */
  close(): void {
    this._watcher?.close();
  }

  /** @internal — Set the watcher instance (called by loader). */
  _setWatcher(watcher: ConfigWatcher): void {
    this._watcher = watcher;
  }

  /* ──────── Typed Access ──────── */

  /**
   * Get a value and coerce to a specific type.
   * Useful for TypeScript consumers who need typed access.
   *
   * @example
   * config.getTyped<number>("port");
   * config.getTyped<boolean>("debug");
   */
  getTyped<T>(key: string, defaultValue?: T): T {
    const val = this.get(key, defaultValue);
    return val as T;
  }

  /**
   * Unmarshal the entire config (or a scope) into a plain object
   * matching a TypeScript interface. Essentially a typed toObject().
   */
  as<T extends Record<string, unknown>>(): T {
    return this.toObject() as T;
  }

  /* ──────── Private helpers ──────── */

  private _flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
    const keys: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        keys.push(...this._flattenKeys(value as Record<string, unknown>, full));
      } else {
        keys.push(full);
      }
    }
    return keys;
  }

  private _flattenToMap(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        Object.assign(result, this._flattenToMap(value as Record<string, unknown>, full));
      } else {
        result[full] = value;
      }
    }
    return result;
  }

  private _scopedSensitiveKeys(prefix: string): Set<string> {
    const scoped = new Set<string>();
    const p = prefix + ".";
    for (const key of this._sensitiveKeys) {
      if (key.startsWith(p)) {
        scoped.add(key.slice(p.length));
      }
    }
    return scoped;
  }

  private _toEnvString(): string {
    const flat = this.toFlatMap();
    const lines: string[] = [];
    for (const [key, value] of Object.entries(flat)) {
      const envKey = key.replace(/\./g, "_").toUpperCase();
      const strVal = value === null ? "" : String(value);
      // Quote if contains spaces or special chars
      if (/[\s#"'=]/.test(strVal)) {
        lines.push(`${envKey}="${strVal}"`);
      } else {
        lines.push(`${envKey}=${strVal}`);
      }
    }
    return lines.join("\n") + "\n";
  }

  private _toYamlString(data: Record<string, unknown>, indent = 0): string {
    let result = "";
    const pad = "  ".repeat(indent);
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        result += `${pad}${key}:\n`;
        result += this._toYamlString(value as Record<string, unknown>, indent + 1);
      } else if (Array.isArray(value)) {
        result += `${pad}${key}:\n`;
        for (const item of value) {
          result += `${pad}  - ${formatYamlValue(item)}\n`;
        }
      } else {
        result += `${pad}${key}: ${formatYamlValue(value)}\n`;
      }
    }
    return result;
  }

  private _toTomlString(data: Record<string, unknown>, section = ""): string {
    let result = "";
    const scalars: [string, unknown][] = [];
    const tables: [string, Record<string, unknown>][] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        tables.push([key, value as Record<string, unknown>]);
      } else {
        scalars.push([key, value]);
      }
    }

    // Write scalars first
    for (const [key, value] of scalars) {
      result += `${key} = ${formatTomlValue(value)}\n`;
    }

    // Then tables
    for (const [key, value] of tables) {
      const sectionName = section ? `${section}.${key}` : key;
      result += `\n[${sectionName}]\n`;
      result += this._toTomlString(value, sectionName);
    }

    return result;
  }
}

/* ──────── Format helpers ──────── */

function detectFormat(filePath: string): "json" | "env" | "yaml" | "toml" {
  if (filePath.endsWith(".json")) return "json";
  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) return "yaml";
  if (filePath.endsWith(".toml")) return "toml";
  return "env";
}

function formatYamlValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (/[:#{}[\],&*?|>!%@`]/.test(value) || value === "" || value.includes("\n")) {
      return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return JSON.stringify(value);
}

function formatTomlValue(value: unknown): string {
  if (value === null || value === undefined) return '""';
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  if (Array.isArray(value)) return `[${value.map(formatTomlValue).join(", ")}]`;
  return `"${String(value)}"`;
}
