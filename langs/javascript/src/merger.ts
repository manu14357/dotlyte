/**
 * Deep merge utility for DOTLYTE configuration layers.
 */

/**
 * Deep merge two objects. Values in `override` take precedence.
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (
      key in result &&
      result[key] !== null &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key]) &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
