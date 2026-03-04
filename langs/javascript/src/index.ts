/**
 * DOTLYTE — The universal configuration library.
 *
 * One API, every language, every config source.
 * Load .env, YAML, JSON, TOML, environment variables, and defaults
 * with automatic type coercion, schema validation, encryption, and layered priority.
 *
 * @example
 * ```ts
 * import { load } from "dotlyte";
 *
 * // Basic usage — auto-discovers .env, config.yaml, etc.
 * const config = load();
 * config.port;           // automatically number
 * config.debug;          // automatically boolean
 * config.database.host;  // dot-notation access
 *
 * // Advanced — schema, encryption, watch, debug
 * const config = load({
 *   env: "production",
 *   schema: {
 *     port: { type: "number", required: true, min: 1, max: 65535 },
 *     database: { type: "object", required: true },
 *   },
 *   strict: true,
 *   watch: true,
 *   debug: true,
 * });
 *
 * config.onChange((event) => console.log("Config changed:", event));
 * ```
 *
 * @module dotlyte
 */

// Core
export { load } from "./loader.js";
export { Config } from "./config.js";

// Errors
export {
  DotlyteError,
  MissingRequiredKeyError,
  ParseError,
  FileError,
  ValidationError,
  InterpolationError,
  DecryptionError,
} from "./errors.js";

// Types
export type { LoadOptions, Source } from "./loader.js";
export type { DotlyteSchema, SchemaRule } from "./validator.js";
export type { SchemaViolation } from "./errors.js";
export type { ChangeEvent, ChangeCallback, KeyChangeCallback, ErrorCallback } from "./watcher.js";

// Utilities (re-exported for advanced use cases)
export { coerce, coerceObject } from "./coercion.js";
export { interpolate } from "./interpolation.js";
export { validateSchema, assertValid, applySchemaDefaults, getSensitiveKeys } from "./validator.js";
export { encryptFile, decryptFile, encryptValue, decryptValue, generateKey, resolveEncryptionKey } from "./encryption.js";
export { redactObject, buildSensitiveSet, REDACTED, formatRedacted } from "./masking.js";
export { ConfigWatcher } from "./watcher.js";
