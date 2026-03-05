/**
 * Sensitive value masking and redaction for DOTLYTE.
 *
 * Auto-detects keys that contain sensitive data and redacts them in
 * toString(), toJSON(), and toObjectRedacted(). Actual values remain
 * accessible via get() and require().
 *
 * Auto-sensitive patterns (case-insensitive):
 *   secret, password, passwd, token, key, credential, auth, api_key,
 *   apikey, private, certificate, cert
 */

const SENSITIVE_PATTERNS = [
  /secret/i,
  /password/i,
  /passwd/i,
  /token/i,
  /\bkey\b/i,
  /credential/i,
  /\bauth\b/i,
  /api[_-]?key/i,
  /private/i,
  /certificate/i,
  /\bcert\b/i,
  /\bdsn\b/i,
  /\bsalt\b/i,
  /\bhash\b/i,
  /\bsigning/i,
  /\bencrypt/i,
  /connection[_-]?string/i,
];

/** The mask string used to replace sensitive values. */
export const REDACTED = "***REDACTED***";

/**
 * Check if a key name is auto-detected as sensitive.
 */
export function isAutoSensitive(key: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(key));
}

/**
 * Build the complete set of sensitive keys from:
 *  1. Schema-defined sensitive: true
 *  2. Auto-detected patterns
 *  3. minus explicit sensitive: false overrides
 *
 * @param allKeys      — all config keys (flat, dot-notation)
 * @param schemaSensitive — keys explicitly marked sensitive in schema
 * @param schemaNotSensitive — keys explicitly marked sensitive: false
 */
export function buildSensitiveSet(
  allKeys: string[],
  schemaSensitive: Set<string> = new Set(),
  schemaNotSensitive: Set<string> = new Set(),
): Set<string> {
  const result = new Set(schemaSensitive);

  for (const key of allKeys) {
    if (schemaNotSensitive.has(key)) continue;
    // Check the leaf part of the key (after last dot)
    const leaf = key.includes(".") ? key.split(".").pop()! : key;
    if (isAutoSensitive(leaf)) {
      result.add(key);
    }
  }

  return result;
}

/**
 * Deep-redact sensitive values in a config object.
 *
 * @param data     — the config data
 * @param sensitive — set of sensitive keys (dot-notation)
 * @param prefix   — current key prefix for recursion
 * @returns New object with sensitive values replaced by REDACTED.
 */
export function redactObject(
  data: Record<string, unknown>,
  sensitive: Set<string>,
  prefix = "",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (sensitive.has(fullKey)) {
      result[key] = REDACTED;
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = redactObject(value as Record<string, unknown>, sensitive, fullKey);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Format a config object as a human-readable string with redaction.
 */
export function formatRedacted(
  data: Record<string, unknown>,
  sensitive: Set<string>,
): string {
  const redacted = redactObject(data, sensitive);
  return JSON.stringify(redacted, null, 2);
}

/* ──────── Configurable Sensitive Patterns ──────── */

/**
 * Convert glob-like patterns (e.g., "*_KEY", "DATABASE_*") to regex patterns.
 *
 * Supports:
 *   - `*` → match anything
 *   - Literal string matching (case-insensitive)
 *
 * @param patterns — array of glob patterns
 * @returns Array of compiled RegExp patterns
 */
export function compilePatterns(patterns: string[]): RegExp[] {
  return patterns.map((p) => {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
    return new RegExp(`^${escaped}$`, "i");
  });
}

/**
 * Build a sensitive key set using custom patterns.
 *
 * @param allKeys   — all config keys (flat)
 * @param patterns  — glob-like patterns (e.g., ["*_KEY", "*_SECRET", "DATABASE_*"])
 * @param schemaSensitive — keys explicitly marked sensitive in schema
 * @returns Set of matching sensitive keys
 */
export function buildSensitiveSetWithPatterns(
  allKeys: string[],
  patterns: string[],
  schemaSensitive: Set<string> = new Set(),
): Set<string> {
  const result = new Set(schemaSensitive);
  const compiled = compilePatterns(patterns);

  for (const key of allKeys) {
    const leaf = key.includes(".") ? key.split(".").pop()! : key;
    // Check against custom patterns
    if (compiled.some((re) => re.test(leaf) || re.test(key))) {
      result.add(key);
    }
    // Also check built-in patterns
    if (isAutoSensitive(leaf)) {
      result.add(key);
    }
  }

  return result;
}

/** Callback for secret access audit logging. */
export type SecretAccessCallback = (key: string, context: string) => void;

/**
 * Create a Proxy that wraps a config object and fires audit callbacks
 * when sensitive keys are accessed.
 *
 * @param data            — the config data
 * @param sensitiveKeys   — set of sensitive keys
 * @param onAccess        — callback fired each time a sensitive key is read
 * @returns Proxied config object
 */
export function createAuditProxy(
  data: Record<string, unknown>,
  sensitiveKeys: Set<string>,
  onAccess: SecretAccessCallback,
): Record<string, unknown> {
  return new Proxy(data, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && sensitiveKeys.has(prop)) {
        const context = typeof (globalThis as Record<string, unknown>).window !== "undefined" ? "client" : "server";
        onAccess(prop, context);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

