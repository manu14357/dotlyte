/**
 * Schema validation engine for DOTLYTE.
 *
 * Validates config values against a user-defined schema. Collects ALL
 * violations before throwing — never fail-on-first.
 *
 * Supports: required, type, format, enum, min/max, sensitive, doc, default.
 *
 * @example
 * ```ts
 * const schema: DotlyteSchema = {
 *   port:     { type: "number", required: true, min: 1, max: 65535, doc: "Server port" },
 *   host:     { type: "string", format: "hostname" },
 *   debug:    { type: "boolean", default: false },
 *   api_key:  { type: "string", required: true, sensitive: true },
 *   log:      { type: "string", enum: ["debug","info","warn","error"] },
 * };
 * ```
 */

import { ValidationError, type SchemaViolation } from "./errors.js";

/* ──────── Schema definition types ──────── */

export type SchemaType = "string" | "number" | "boolean" | "array" | "object";

export type SchemaFormat =
  | "url"
  | "email"
  | "ip"
  | "ipv4"
  | "ipv6"
  | "hostname"
  | "port"
  | "uuid"
  | "date"
  | "iso-date"
  | (string & {}); // allows arbitrary regex patterns

export interface SchemaRule {
  /** Expected type after coercion. */
  type?: SchemaType;
  /** Key is mandatory — must be present and non-null. */
  required?: boolean;
  /** Built-in format name or regex pattern string. */
  format?: SchemaFormat;
  /** List of allowed values. */
  enum?: unknown[];
  /** Minimum value (numbers) or length (strings/arrays). */
  min?: number;
  /** Maximum value (numbers) or length (strings/arrays). */
  max?: number;
  /** Default value if key is missing. Applied before validation. */
  default?: unknown;
  /** Mark this key as sensitive — will be redacted in toString/toJSON. */
  sensitive?: boolean;
  /** Human-readable description. Self-documenting config. */
  doc?: string;
  /** Custom validator function. Return string error or null for pass. */
  validator?: (value: unknown) => string | null;
}

/** Full schema: a map of dot-notation keys to rules. */
export type DotlyteSchema = Record<string, SchemaRule>;

/* ──────── Built-in format validators ──────── */

const FORMAT_VALIDATORS: Record<string, (v: string) => boolean> = {
  url: (v) => {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  },
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  ip: (v) => FORMAT_VALIDATORS.ipv4!(v) || FORMAT_VALIDATORS.ipv6!(v),
  ipv4: (v) =>
    /^(\d{1,3}\.){3}\d{1,3}$/.test(v) &&
    v.split(".").every((n) => parseInt(n) >= 0 && parseInt(n) <= 255),
  ipv6: (v) => /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(v),
  hostname: (v) => /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})*$/.test(v),
  port: (v) => {
    const n = parseInt(v, 10);
    return !isNaN(n) && n >= 1 && n <= 65535;
  },
  uuid: (v) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
  date: (v) => !isNaN(Date.parse(v)),
  "iso-date": (v) => /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v),
};

/* ──────── Core validation ──────── */

/**
 * Apply default values from schema to the config data.
 * Returns a new object — does not mutate input.
 */
export function applySchemaDefaults(
  data: Record<string, unknown>,
  schema: DotlyteSchema,
): Record<string, unknown> {
  const result = { ...data };

  for (const [key, rule] of Object.entries(schema)) {
    if (rule.default !== undefined) {
      const current = getNestedValue(result, key);
      if (current === undefined || current === null) {
        setNestedValue(result, key, rule.default);
      }
    }
  }

  return result;
}

/**
 * Validate config data against a schema.
 *
 * @param data   — the merged, coerced config object
 * @param schema — the schema rules
 * @param strict — if true, reject keys NOT in the schema (catch typos)
 * @returns Array of violations (empty = valid)
 */
export function validateSchema(
  data: Record<string, unknown>,
  schema: DotlyteSchema,
  strict = false,
): SchemaViolation[] {
  const violations: SchemaViolation[] = [];

  // Validate declared keys
  for (const [key, rule] of Object.entries(schema)) {
    const value = getNestedValue(data, key);

    // Required check
    if (rule.required && (value === undefined || value === null)) {
      violations.push({
        key,
        rule: "required",
        message: `Key '${key}' is required but missing or null.${rule.doc ? ` (${rule.doc})` : ""}`,
      });
      continue; // Skip further checks on missing required key
    }

    // Skip optional keys that are absent
    if (value === undefined || value === null) continue;

    // Type check
    if (rule.type) {
      if (!checkType(value, rule.type)) {
        violations.push({
          key,
          rule: "type",
          message: `Key '${key}' expected type '${rule.type}', got '${typeof value}'.`,
          expected: rule.type,
          actual: typeof value,
        });
      }
    }

    // Format check (only for strings)
    if (rule.format && typeof value === "string") {
      const builtin = FORMAT_VALIDATORS[rule.format];
      if (builtin) {
        if (!builtin(value)) {
          violations.push({
            key,
            rule: "format",
            message: `Key '${key}' does not match format '${rule.format}'. Got: '${value}'.`,
            expected: rule.format,
            actual: value,
          });
        }
      } else {
        // Treat as regex pattern
        try {
          if (!new RegExp(rule.format).test(value)) {
            violations.push({
              key,
              rule: "format",
              message: `Key '${key}' does not match pattern '${rule.format}'.`,
              expected: rule.format,
              actual: value,
            });
          }
        } catch {
          violations.push({
            key,
            rule: "format",
            message: `Invalid format pattern '${rule.format}' for key '${key}'.`,
          });
        }
      }
    }

    // Enum check
    if (rule.enum && !rule.enum.includes(value)) {
      violations.push({
        key,
        rule: "enum",
        message: `Key '${key}' must be one of [${rule.enum.join(", ")}], got '${value}'.`,
        expected: rule.enum,
        actual: value,
      });
    }

    // Min/max (numbers)
    if (typeof value === "number") {
      if (rule.min !== undefined && value < rule.min) {
        violations.push({
          key,
          rule: "min",
          message: `Key '${key}' value ${value} is below minimum ${rule.min}.`,
          expected: rule.min,
          actual: value,
        });
      }
      if (rule.max !== undefined && value > rule.max) {
        violations.push({
          key,
          rule: "max",
          message: `Key '${key}' value ${value} exceeds maximum ${rule.max}.`,
          expected: rule.max,
          actual: value,
        });
      }
    }

    // Min/max (strings — length)
    if (typeof value === "string") {
      if (rule.min !== undefined && value.length < rule.min) {
        violations.push({
          key,
          rule: "min",
          message: `Key '${key}' length ${value.length} is below minimum ${rule.min}.`,
        });
      }
      if (rule.max !== undefined && value.length > rule.max) {
        violations.push({
          key,
          rule: "max",
          message: `Key '${key}' length ${value.length} exceeds maximum ${rule.max}.`,
        });
      }
    }

    // Min/max (arrays — length)
    if (Array.isArray(value)) {
      if (rule.min !== undefined && value.length < rule.min) {
        violations.push({
          key,
          rule: "min",
          message: `Key '${key}' has ${value.length} items, minimum is ${rule.min}.`,
        });
      }
      if (rule.max !== undefined && value.length > rule.max) {
        violations.push({
          key,
          rule: "max",
          message: `Key '${key}' has ${value.length} items, maximum is ${rule.max}.`,
        });
      }
    }

    // Custom validator
    if (rule.validator) {
      const err = rule.validator(value);
      if (err) {
        violations.push({ key, rule: "validator", message: err });
      }
    }
  }

  // Strict mode: reject keys not in schema
  if (strict) {
    const schemaKeys = new Set(Object.keys(schema));
    const allDataKeys = flattenKeys(data);
    for (const key of allDataKeys) {
      if (!schemaKeys.has(key)) {
        violations.push({
          key,
          rule: "strict",
          message: `Unknown config key '${key}' — not defined in schema. Possible typo?`,
        });
      }
    }
  }

  return violations;
}

/**
 * Validate and throw if violations exist.
 */
export function assertValid(
  data: Record<string, unknown>,
  schema: DotlyteSchema,
  strict = false,
): void {
  const violations = validateSchema(data, schema, strict);
  if (violations.length > 0) {
    throw new ValidationError(violations);
  }
}

/**
 * Extract the set of sensitive keys from a schema.
 */
export function getSensitiveKeys(schema: DotlyteSchema): Set<string> {
  const keys = new Set<string>();
  for (const [key, rule] of Object.entries(schema)) {
    if (rule.sensitive) keys.add(key);
  }
  return keys;
}

/* ──────── Helpers ──────── */

function checkType(value: unknown, expected: SchemaType): boolean {
  switch (expected) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !isNaN(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
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

function setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;
}

function flattenKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
}
