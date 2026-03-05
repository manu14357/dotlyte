/**
 * TypeScript-first typed configuration API for DOTLYTE.
 *
 * Provides `createTypedConfig()` with full TypeScript generic type inference,
 * server/client boundary enforcement, and Zod/Valibot schema support.
 *
 * @example
 * ```ts
 * import { createTypedConfig } from 'dotlyte'
 *
 * const env = createTypedConfig({
 *   DATABASE_URL: { type: 'string', format: 'url', required: true },
 *   PORT: { type: 'integer', default: 3000 },
 *   DEBUG: { type: 'boolean', default: false },
 *   LOG_LEVEL: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] as const, default: 'info' },
 *   REDIS_URL: { type: 'string', format: 'url', required: false },
 * })
 *
 * env.DATABASE_URL  // string (never undefined — required)
 * env.PORT          // number (never undefined — has default)
 * env.DEBUG         // boolean
 * env.LOG_LEVEL     // 'debug' | 'info' | 'warn' | 'error'
 * env.REDIS_URL     // string | undefined
 * ```
 *
 * @module dotlyte/typed
 */

import { load } from "./loader.js";
import { DotlyteError, ValidationError } from "./errors.js";
import type { LoadOptions } from "./loader.js";
import { createBoundaryProxy } from "./boundaries.js";

/* ──────── Schema Descriptor Types ──────── */

/** Primitive type names supported in DotlyteSchema descriptors. */
export type TypeName = "string" | "integer" | "number" | "boolean" | "url";

/** A single field descriptor in the typed config schema. */
export interface FieldDescriptor<
  T extends TypeName = TypeName,
  E extends readonly unknown[] = readonly unknown[],
  D = undefined,
  R extends boolean = true,
> {
  /** The expected type. */
  type: T;
  /** Format constraint (e.g., 'url', 'email'). */
  format?: string;
  /** Whether this field is required. Defaults to `true`. */
  required?: R;
  /** Default value. If provided, the field is never undefined. */
  default?: D;
  /** Allowed values. Narrows the inferred type to a union. */
  enum?: E;
  /** Minimum value (numbers) or length (strings). */
  min?: number;
  /** Maximum value (numbers) or length (strings). */
  max?: number;
  /** Mark as sensitive — value will be redacted in logs. */
  sensitive?: boolean;
  /** Human-readable description. */
  doc?: string;
}

/* ──────── Type Inference Engine ──────── */

/** Map type names to their TypeScript types. */
type TypeNameToTS<T extends TypeName> = T extends "string" | "url"
  ? string
  : T extends "integer" | "number"
    ? number
    : T extends "boolean"
      ? boolean
      : unknown;

/** Infer the TypeScript type from a single field descriptor. */
type InferField<F> =
  F extends { enum: readonly (infer E)[] }
    ? F extends { default: infer _D }
      ? E
      : F extends { required: false }
        ? E | undefined
        : E
    : F extends { type: infer T extends TypeName }
      ? F extends { default: infer _D }
        ? TypeNameToTS<T>
        : F extends { required: false }
          ? TypeNameToTS<T> | undefined
          : TypeNameToTS<T>
      : unknown;

/** Check if a value is a Zod-like schema (has _def property). */
type IsZodSchema<T> = T extends { _def: unknown; parse: (...args: unknown[]) => unknown } ? true : false;

/** Check if a value is a Valibot-like schema. */
type IsValibotSchema<T> = T extends { type: string; _parse: unknown } ? true : false;

/** Infer type from a Zod schema. */
type InferZodField<T> = T extends { _output: infer O } ? O : unknown;

/** Infer type from a Valibot schema. We rely on the pipe mechanism. */
type InferValibotField<T> = T extends { type: "optional"; wrapped: infer W }
  ? InferValibotField<W> | undefined
  : T extends { type: "string" }
    ? string
    : T extends { type: "number" }
      ? number
      : T extends { type: "boolean" }
        ? boolean
        : unknown;

/**
 * Infer the type for a single field, supporting DotlyteSchema, Zod, and Valibot.
 */
type InferAnyField<F> =
  IsZodSchema<F> extends true
    ? InferZodField<F>
    : IsValibotSchema<F> extends true
      ? InferValibotField<F>
      : InferField<F>;

/** Infer the full config type from a flat schema object. */
export type InferConfig<S extends Record<string, unknown>> = {
  readonly [K in keyof S]: InferAnyField<S[K]>;
};

/* ──────── Sectioned Schema Types ──────── */

/** Schema with server/client/shared sections. */
export interface SectionedSchema<
  S extends Record<string, unknown> = Record<string, unknown>,
  C extends Record<string, unknown> = Record<string, unknown>,
  H extends Record<string, unknown> = Record<string, unknown>,
> {
  server: S;
  client: C;
  shared?: H;
  /** Prefix required for client variables (default: 'NEXT_PUBLIC_'). */
  clientPrefix?: string;
}

/** Detect whether a schema is sectioned. */
type IsSectionedSchema<S> = S extends { server: Record<string, unknown>; client: Record<string, unknown> }
  ? true
  : false;

/** Infer the combined config type from a sectioned schema. */
type InferSectionedConfig<S> = S extends SectionedSchema<infer Srv, infer Cli, infer Sh>
  ? InferConfig<Srv> & InferConfig<Cli> & InferConfig<Sh>
  : never;

/** The full inferred type: flat or sectioned depending on input. */
export type InferTypedConfig<S> =
  IsSectionedSchema<S> extends true ? InferSectionedConfig<S> : InferConfig<S & Record<string, unknown>>;

/* ──────── Options ──────── */

/** Options for createTypedConfig. */
export interface TypedConfigOptions extends Omit<LoadOptions, "schema"> {
  /**
   * Skip validation (useful in tests).
   * @default false
   */
  skipValidation?: boolean;
  /**
   * Callback invoked when a sensitive key is accessed.
   * Useful for audit logging (SOC2/HIPAA compliance).
   */
  onSecretAccess?: (key: string, context: string) => void;
}

/* ──────── Runtime Validators ──────── */

/** Validate and coerce a value against a DotlyteSchema field descriptor. */
function validateField(key: string, raw: unknown, descriptor: FieldDescriptor<TypeName, readonly unknown[], unknown, boolean>): unknown {
  const isRequired = descriptor.required !== false;
  const hasDefault = descriptor.default !== undefined;

  // Apply default
  let value = raw;
  if ((value === undefined || value === null || value === "") && hasDefault) {
    value = descriptor.default;
  }

  // Check required
  if ((value === undefined || value === null || value === "") && isRequired) {
    throw new DotlyteError(
      `Missing required environment variable '${key}'.` +
        (descriptor.doc ? ` (${descriptor.doc})` : "") +
        ` Set it in your .env file, config file, or as an environment variable.`,
      key,
      "MISSING_REQUIRED_KEY",
    );
  }

  // Optional and absent
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  // Coerce to target type
  const strValue = String(value);

  switch (descriptor.type) {
    case "boolean": {
      if (typeof value === "boolean") break;
      const lower = strValue.toLowerCase();
      if (["true", "yes", "1", "on"].includes(lower)) {
        value = true;
      } else if (["false", "no", "0", "off"].includes(lower)) {
        value = false;
      } else {
        throw new DotlyteError(
          `Environment variable '${key}' expected boolean, got '${strValue}'.`,
          key,
          "VALIDATION_ERROR",
        );
      }
      break;
    }
    case "integer":
    case "number": {
      if (typeof value === "number") break;
      const num = Number(strValue);
      if (isNaN(num)) {
        throw new DotlyteError(
          `Environment variable '${key}' expected number, got '${strValue}'.`,
          key,
          "VALIDATION_ERROR",
        );
      }
      if (descriptor.type === "integer" && !Number.isInteger(num)) {
        throw new DotlyteError(
          `Environment variable '${key}' expected integer, got '${strValue}'.`,
          key,
          "VALIDATION_ERROR",
        );
      }
      value = num;
      break;
    }
    case "string":
    case "url":
      value = strValue;
      break;
  }

  // Format validation
  if (descriptor.format === "url" || descriptor.type === "url") {
    try {
      new URL(String(value));
    } catch {
      throw new DotlyteError(
        `Environment variable '${key}' is not a valid URL: '${String(value)}'.`,
        key,
        "VALIDATION_ERROR",
      );
    }
  }

  // Enum validation
  if (descriptor.enum && !descriptor.enum.includes(value)) {
    throw new DotlyteError(
      `Environment variable '${key}' must be one of [${descriptor.enum.join(", ")}], got '${String(value)}'.`,
      key,
      "VALIDATION_ERROR",
    );
  }

  // Min/max validation
  if (typeof value === "number") {
    if (descriptor.min !== undefined && value < descriptor.min) {
      throw new DotlyteError(
        `Environment variable '${key}' value ${value} is below minimum ${descriptor.min}.`,
        key,
        "VALIDATION_ERROR",
      );
    }
    if (descriptor.max !== undefined && value > descriptor.max) {
      throw new DotlyteError(
        `Environment variable '${key}' value ${value} exceeds maximum ${descriptor.max}.`,
        key,
        "VALIDATION_ERROR",
      );
    }
  }

  if (typeof value === "string") {
    if (descriptor.min !== undefined && value.length < descriptor.min) {
      throw new DotlyteError(
        `Environment variable '${key}' length ${value.length} is below minimum ${descriptor.min}.`,
        key,
        "VALIDATION_ERROR",
      );
    }
    if (descriptor.max !== undefined && value.length > descriptor.max) {
      throw new DotlyteError(
        `Environment variable '${key}' length ${value.length} exceeds maximum ${descriptor.max}.`,
        key,
        "VALIDATION_ERROR",
      );
    }
  }

  return value;
}

/** Check if a value looks like a Zod schema. */
function isZodSchema(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    "_def" in (value as Record<string, unknown>) &&
    "parse" in (value as Record<string, unknown>)
  );
}

/** Check if a value looks like a Valibot schema. */
function isValibotSchema(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    "type" in (value as Record<string, unknown>) &&
    "_run" in (value as Record<string, unknown>)
  );
}

/** Validate a value with a Zod schema. */
function validateWithZod(key: string, value: unknown, schema: { parse: (v: unknown) => unknown }): unknown {
  try {
    return schema.parse(value ?? undefined);
  } catch (err: unknown) {
    const message =
      err !== null && typeof err === "object" && "message" in err
        ? String((err as Record<string, unknown>).message)
        : String(err);
    throw new DotlyteError(
      `Validation failed for '${key}': ${message}`,
      key,
      "VALIDATION_ERROR",
    );
  }
}

/** Validate a value with a Valibot schema. */
function validateWithValibot(
  key: string,
  value: unknown,
  schema: { _run: (dataset: unknown, config: unknown) => unknown },
): unknown {
  try {
    // Valibot v1 uses safeParse or the _run internal method
    // Try to find safeParse at runtime for compatibility
    const result = schema._run(
      { typed: false, value: value ?? undefined },
      { abortEarly: true },
    ) as { typed: boolean; value: unknown; issues?: unknown[] };

    if (result.issues && result.issues.length > 0) {
      const issue = result.issues[0] as { message?: string };
      throw new DotlyteError(
        `Validation failed for '${key}': ${issue.message ?? "unknown error"}`,
        key,
        "VALIDATION_ERROR",
      );
    }

    return result.value;
  } catch (err) {
    if (err instanceof DotlyteError) throw err;
    throw new DotlyteError(
      `Validation failed for '${key}': ${err instanceof Error ? err.message : String(err)}`,
      key,
      "VALIDATION_ERROR",
    );
  }
}

/* ──────── Main API ──────── */

/**
 * Create a strongly-typed, validated configuration object.
 *
 * Validates at import-time (fail fast on app startup). Returns a frozen object
 * with full TypeScript type inference.
 *
 * Supports three schema formats:
 * - DotlyteSchema descriptors (built-in, zero dependencies)
 * - Zod schemas (auto-detected, optional peer dep)
 * - Valibot schemas (auto-detected, optional peer dep)
 *
 * Also supports server/client/shared sections for SSR framework safety.
 *
 * @example
 * ```ts
 * // Flat schema
 * const env = createTypedConfig({
 *   PORT: { type: 'integer', default: 3000 },
 *   DEBUG: { type: 'boolean', default: false },
 * })
 *
 * // Sectioned schema (Next.js / Nuxt)
 * const env = createTypedConfig({
 *   server: { DATABASE_URL: { type: 'string', required: true } },
 *   client: { NEXT_PUBLIC_APP_URL: { type: 'string', format: 'url' } },
 *   shared: { NODE_ENV: { type: 'string', enum: ['development', 'test', 'production'] } },
 * })
 * ```
 */
export function createTypedConfig<const S extends Record<string, unknown>>(
  schema: S,
  options: TypedConfigOptions = {},
): InferTypedConfig<S> {
  const isSectioned = "server" in schema && "client" in schema;

  if (isSectioned) {
    return createSectionedConfig(schema as unknown as SectionedSchema, options) as InferTypedConfig<S>;
  }

  return createFlatConfig(schema, options) as InferTypedConfig<S>;
}

/** Handle flat (non-sectioned) schemas. */
function createFlatConfig(
  schema: Record<string, unknown>,
  options: TypedConfigOptions,
): Record<string, unknown> {
  // Load raw values from all sources
  const config = load({
    ...options,
    defaults: options.defaults,
  });
  const raw = config.toObject();
  const envVars = process.env;

  const result: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [key, descriptor] of Object.entries(schema)) {
    try {
      // Read from: raw config (which includes env vars) > process.env directly
      const rawValue = raw[key.toLowerCase()] ?? raw[key] ?? envVars[key];

      if (isZodSchema(descriptor)) {
        result[key] = validateWithZod(key, rawValue, descriptor as { parse: (v: unknown) => unknown });
      } else if (isValibotSchema(descriptor)) {
        result[key] = validateWithValibot(
          key,
          rawValue,
          descriptor as { _run: (d: unknown, c: unknown) => unknown },
        );
      } else {
        result[key] = validateField(key, rawValue, descriptor as FieldDescriptor<TypeName, readonly unknown[], unknown, boolean>);
      }
    } catch (err) {
      if (options.skipValidation) {
        result[key] = raw[key.toLowerCase()] ?? raw[key] ?? envVars[key] ?? undefined;
      } else {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(
      errors.map((msg, i) => ({
        key: Object.keys(schema)[i] ?? "unknown",
        rule: "typed-config",
        message: msg,
      })),
    );
  }

  // Freeze the result — make it truly immutable
  return Object.freeze(result);
}

/** Handle sectioned (server/client/shared) schemas. */
function createSectionedConfig(
  schema: SectionedSchema,
  options: TypedConfigOptions,
): Record<string, unknown> {
  const serverSchema = schema.server ?? {};
  const clientSchema = schema.client ?? {};
  const sharedSchema = schema.shared ?? {};
  const clientPrefix = schema.clientPrefix ?? "NEXT_PUBLIC_";

  // Validate that client keys start with the prefix
  for (const key of Object.keys(clientSchema)) {
    if (!key.startsWith(clientPrefix)) {
      throw new DotlyteError(
        `Client environment variable '${key}' must start with '${clientPrefix}'. ` +
          `Move it to the 'server' section or rename it.`,
        key,
        "VALIDATION_ERROR",
      );
    }
  }

  // Merge all into one flat schema for validation
  const allSchema = { ...serverSchema, ...clientSchema, ...sharedSchema };
  const result = createFlatConfig(allSchema, options);

  // Build sets for boundary enforcement
  const serverKeys = new Set(Object.keys(serverSchema));
  const clientKeys = new Set(Object.keys(clientSchema));
  const sharedKeys = new Set(Object.keys(sharedSchema));

  // Return a Proxy that enforces server/client boundaries
  return createBoundaryProxy(
    result as Record<string, unknown>,
    serverKeys,
    clientKeys,
    sharedKeys,
    options.onSecretAccess,
  );
}

/**
 * Extract the inferred config type from a schema.
 *
 * @example
 * ```ts
 * const schema = {
 *   PORT: { type: 'integer' as const, default: 3000 },
 *   DEBUG: { type: 'boolean' as const, default: false },
 * } as const
 *
 * type Env = InferConfig<typeof schema>
 * // { readonly PORT: number; readonly DEBUG: boolean }
 * ```
 */
