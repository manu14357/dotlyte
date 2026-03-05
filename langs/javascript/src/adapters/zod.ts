/**
 * Zod schema adapter for DOTLYTE.
 *
 * Allows using Zod schemas directly in `createTypedConfig()` for validation
 * and type inference. Zod is an optional peer dependency.
 *
 * @example
 * ```ts
 * import { createTypedConfig } from 'dotlyte'
 * import { withZod } from 'dotlyte/zod'
 * import { z } from 'zod'
 *
 * const env = createTypedConfig(withZod({
 *   server: {
 *     DATABASE_URL: z.string().url(),
 *     AUTH_SECRET: z.string().min(32),
 *     PORT: z.coerce.number().default(3000),
 *   },
 *   client: {
 *     NEXT_PUBLIC_APP_URL: z.string().url(),
 *   },
 * }))
 * ```
 *
 * @module dotlyte/zod
 */

/**
 * Zod schema type — minimal interface for type inference.
 * This avoids requiring zod as a direct dependency.
 */
export interface ZodType<Output = unknown> {
  _def: unknown;
  _output: Output;
  parse: (data: unknown) => Output;
  safeParse: (data: unknown) => { success: boolean; data?: Output; error?: unknown };
  optional: () => ZodType<Output | undefined>;
}

/** Infer TypeScript type from a Zod schema map. */
export type InferZodSchema<T extends Record<string, ZodType>> = {
  readonly [K in keyof T]: T[K]["_output"];
};

/**
 * Wrap a schema with Zod types for use with `createTypedConfig()`.
 *
 * This is a pass-through identity function that provides type hints
 * and ensures Zod schemas are properly recognized at runtime.
 *
 * @example
 * ```ts
 * const env = createTypedConfig(withZod({
 *   DATABASE_URL: z.string().url(),
 *   PORT: z.coerce.number().default(3000),
 * }))
 * ```
 */
export function withZod<T extends Record<string, unknown>>(schema: T): T {
  // Mark the schema as Zod-based for runtime detection
  return { ...schema, __adapter: "zod" as const } as T;
}

/**
 * Validate environment variables using a Zod schema map.
 *
 * @param schemaMap — a map of env var names to Zod schemas
 * @param values    — the raw env var values to validate
 * @returns Validated and typed values
 * @throws Aggregated validation error with all failures
 */
export function validateWithZodSchemas(
  schemaMap: Record<string, ZodType>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const errors: { key: string; message: string }[] = [];

  for (const [key, schema] of Object.entries(schemaMap)) {
    const raw = values[key] ?? values[key.toLowerCase()];

    try {
      result[key] = schema.parse(raw);
    } catch (err: unknown) {
      const message =
        err !== null && typeof err === "object" && "issues" in err
          ? formatZodIssues((err as { issues: Array<{ message: string }> }).issues)
          : err instanceof Error
            ? err.message
            : String(err);
      errors.push({ key, message });
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

function formatZodIssues(issues: Array<{ message: string }>): string {
  return issues.map((i) => i.message).join("; ");
}
