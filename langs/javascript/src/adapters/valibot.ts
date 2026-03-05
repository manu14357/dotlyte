/**
 * Valibot schema adapter for DOTLYTE.
 *
 * Allows using Valibot schemas directly in `createTypedConfig()` for validation
 * and type inference. Valibot is an optional peer dependency.
 *
 * @example
 * ```ts
 * import { createTypedConfig } from 'dotlyte'
 * import { withValibot } from 'dotlyte/valibot'
 * import * as v from 'valibot'
 *
 * const env = createTypedConfig(withValibot({
 *   server: {
 *     DATABASE_URL: v.pipe(v.string(), v.url()),
 *     PORT: v.optional(v.pipe(v.string(), v.transform(Number)), '3000'),
 *   },
 * }))
 * ```
 *
 * @module dotlyte/valibot
 */


/**
 * Valibot schema type — minimal interface for detection.
 */
export interface ValibotSchema {
  type: string;
  _run: (dataset: unknown, config: unknown) => unknown;
}

/**
 * Wrap a schema with Valibot types for use with `createTypedConfig()`.
 *
 * Pass-through identity function that ensures Valibot schemas are recognized.
 */
export function withValibot<T extends Record<string, unknown>>(schema: T): T {
  return { ...schema, __adapter: "valibot" as const } as T;
}

/**
 * Validate environment variables using a Valibot schema map.
 *
 * @param schemaMap — a map of env var names to Valibot schemas
 * @param values    — the raw env var values to validate
 * @returns Validated and typed values
 */
export function validateWithValibotSchemas(
  schemaMap: Record<string, ValibotSchema>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const errors: { key: string; message: string }[] = [];

  for (const [key, schema] of Object.entries(schemaMap)) {
    const raw = values[key] ?? values[key.toLowerCase()];

    try {
      const output = schema._run(
        { typed: false, value: raw },
        { abortEarly: true },
      ) as { typed: boolean; value: unknown; issues?: Array<{ message: string }> };

      if (output.issues && output.issues.length > 0) {
        errors.push({
          key,
          message: output.issues.map((i) => i.message).join("; "),
        });
      } else {
        result[key] = output.value;
      }
    } catch (err) {
      errors.push({
        key,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (errors.length > 0) {
    const summary = errors.map((e) => `  - ${e.key}: ${e.message}`).join("\n");
    throw new Error(
      `❌ Environment validation failed:\n${summary}\n\n` +
        `Fix these variables in your .env file or environment.`,
    );
  }

  return result;
}
