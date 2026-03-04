/**
 * Variable interpolation engine for DOTLYTE.
 *
 * Supports:
 *   ${VAR}           — substitute with value of VAR
 *   ${VAR:-default}  — fallback if VAR is unset or empty
 *   ${VAR:?error}    — throw if VAR is unset
 *   $$               — literal $ escape
 *
 * Resolution order: same file (top-to-bottom) → already-merged config → env vars.
 * Circular references are detected and throw InterpolationError.
 */

import { InterpolationError } from "./errors.js";

/** Regex matching ${VAR}, ${VAR:-default}, ${VAR:?message} */
const INTERPOLATION_RE = /\$\{([^}]+)\}/g;

/**
 * Interpolate all `${VAR}` references in a flat key-value map.
 *
 * @param data     — raw key-value pairs from dotenv parsing (pre-coercion)
 * @param context  — already-resolved config values from higher-priority sources
 * @param envVars  — process.env for fallback resolution
 * @returns A new map with all interpolations resolved.
 */
export function interpolate(
  data: Record<string, string>,
  context: Record<string, unknown> = {},
  envVars: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const result: Record<string, string> = {};
  const resolving = new Set<string>();

  function resolve(key: string): string {
    // Already resolved in this pass
    if (key in result) return result[key]!;

    // Circular reference detection
    if (resolving.has(key)) {
      throw new InterpolationError(
        `Circular variable reference detected: ${[...resolving, key].join(" → ")}`,
        key,
      );
    }

    const raw = data[key];
    if (raw === undefined) {
      // Not in this file — check context > env
      const fromContext = flatGet(context, key);
      if (fromContext !== undefined) return String(fromContext);
      const fromEnv = envVars[key] ?? envVars[key.toUpperCase()];
      if (fromEnv !== undefined) return fromEnv;
      return "";
    }

    resolving.add(key);
    result[key] = expandValue(raw, resolve, context, envVars);
    resolving.delete(key);

    return result[key]!;
  }

  // Resolve all keys (order = insertion order = file order)
  for (const key of Object.keys(data)) {
    if (!(key in result)) {
      resolve(key);
    }
  }

  return result;
}

/**
 * Expand a single value string, replacing all ${...} references.
 */
function expandValue(
  value: string,
  resolve: (key: string) => string,
  context: Record<string, unknown>,
  envVars: Record<string, string | undefined>,
): string {
  // Handle literal $$ → $
  let escaped = value.replace(/\$\$/g, "\x00DOLLAR\x00");

  escaped = escaped.replace(INTERPOLATION_RE, (_match, expr: string) => {
    // ${VAR:?error message}
    if (expr.includes(":?")) {
      const [varName, ...errParts] = expr.split(":?");
      const errMsg = errParts.join(":?").trim();
      const resolved = resolveVar(varName!.trim(), resolve, context, envVars);
      if (resolved === undefined || resolved === "") {
        throw new InterpolationError(
          errMsg || `Required variable '${varName!.trim()}' is not set`,
          varName!.trim(),
        );
      }
      return resolved;
    }

    // ${VAR:-default}
    if (expr.includes(":-")) {
      const [varName, ...defaultParts] = expr.split(":-");
      const defaultVal = defaultParts.join(":-");
      const resolved = resolveVar(varName!.trim(), resolve, context, envVars);
      return resolved !== undefined && resolved !== "" ? resolved : defaultVal;
    }

    // ${VAR}
    const resolved = resolveVar(expr.trim(), resolve, context, envVars);
    return resolved ?? "";
  });

  return escaped.replace(/\x00DOLLAR\x00/g, "$");
}

/**
 * Resolve a variable name from: same-file data → context → env vars.
 */
function resolveVar(
  name: string,
  resolve: (key: string) => string,
  context: Record<string, unknown>,
  envVars: Record<string, string | undefined>,
): string | undefined {
  // Try same-file first (will recurse into resolve())
  try {
    const fromFile = resolve(name);
    if (fromFile !== "") return fromFile;
  } catch {
    // Not in file — fall through
  }

  // Try context (already-merged config)
  const fromContext = flatGet(context, name);
  if (fromContext !== undefined) return String(fromContext);

  // Try env vars (case-insensitive fallback)
  const fromEnv = envVars[name] ?? envVars[name.toUpperCase()];
  if (fromEnv !== undefined) return fromEnv;

  return undefined;
}

/**
 * Dot-notation or flat lookup in a nested object.
 */
function flatGet(obj: Record<string, unknown>, key: string): unknown {
  // Direct key first
  if (key in obj) return obj[key];

  // Dot-notation traversal
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current !== null && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}
