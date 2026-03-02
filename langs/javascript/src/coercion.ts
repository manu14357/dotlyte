/**
 * Type coercion engine for DOTLYTE.
 *
 * Converts string values from .env files and environment variables
 * to native JavaScript types.
 */

const NULL_VALUES = new Set(["null", "none", "nil", ""]);
const TRUE_VALUES = new Set(["true", "yes", "1", "on"]);
const FALSE_VALUES = new Set(["false", "no", "0", "off"]);

/**
 * Auto-convert a string value to the correct JavaScript type.
 *
 * Values that are already non-string types pass through unchanged.
 */
export function coerce(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const stripped = value.trim();
  const lower = stripped.toLowerCase();

  // Null
  if (NULL_VALUES.has(lower)) {
    return null;
  }

  // Boolean
  if (TRUE_VALUES.has(lower)) {
    return true;
  }
  if (FALSE_VALUES.has(lower)) {
    return false;
  }

  // Integer
  if (/^-?\d+$/.test(stripped)) {
    const num = Number(stripped);
    if (Number.isSafeInteger(num)) {
      return num;
    }
  }

  // Float
  if (/^-?\d+\.\d+$/.test(stripped)) {
    return parseFloat(stripped);
  }

  // List (comma-separated)
  if (stripped.includes(",")) {
    return stripped.split(",").map((item) => coerce(item.trim()));
  }

  // String — return as-is
  return stripped;
}

/**
 * Recursively coerce all string values in an object.
 */
export function coerceObject(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result[key] = coerceObject(value as Record<string, unknown>);
    } else if (typeof value === "string") {
      result[key] = coerce(value);
    } else {
      result[key] = value;
    }
  }

  return result;
}
