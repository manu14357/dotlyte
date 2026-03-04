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
