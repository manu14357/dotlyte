/**
 * Custom error types for DOTLYTE v2.
 *
 * Error hierarchy:
 *   DotlyteError (base)
 *   ├── MissingRequiredKeyError  — require() on absent key
 *   ├── ParseError               — invalid file syntax
 *   ├── FileError                — explicitly requested file missing
 *   ├── ValidationError          — schema validation failure
 *   ├── InterpolationError       — circular / undefined variable ref
 *   └── DecryptionError          — missing key or corrupt encrypted file
 */

/** Base error class for all DOTLYTE errors. */
export class DotlyteError extends Error {
  /** The config key that caused the error (if applicable). */
  readonly key?: string;
  /** Machine-readable error code. */
  readonly code: string;

  constructor(message: string, key?: string, code = "DOTLYTE_ERROR") {
    super(message);
    this.name = "DotlyteError";
    this.key = key;
    this.code = code;
  }
}

/** Raised when require() encounters a missing key. */
export class MissingRequiredKeyError extends DotlyteError {
  constructor(key: string, sourcesChecked: string[] = []) {
    const sources = sourcesChecked.length
      ? ` Sources checked: ${sourcesChecked.join(", ")}.`
      : "";
    super(
      `Required config key '${key}' is missing.${sources} ` +
        `Set it in your .env file, config file, or as an environment variable.`,
      key,
      "MISSING_REQUIRED_KEY",
    );
    this.name = "MissingRequiredKeyError";
  }
}

/** Raised when a config file has invalid syntax. */
export class ParseError extends DotlyteError {
  /** Path of the file that failed to parse. */
  readonly filePath?: string;

  constructor(message: string, filePath?: string) {
    super(message, undefined, "PARSE_ERROR");
    this.name = "ParseError";
    this.filePath = filePath;
  }
}

/** Raised when an explicitly requested file doesn't exist. */
export class FileError extends DotlyteError {
  readonly filePath: string;

  constructor(filePath: string) {
    super(
      `Requested config file '${filePath}' does not exist. ` +
        `Check the path or remove it from the files option.`,
      undefined,
      "FILE_NOT_FOUND",
    );
    this.name = "FileError";
    this.filePath = filePath;
  }
}

/** A single schema violation. */
export interface SchemaViolation {
  key: string;
  rule: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

/** Raised when schema validation fails. Carries all violations. */
export class ValidationError extends DotlyteError {
  readonly violations: SchemaViolation[];

  constructor(violations: SchemaViolation[]) {
    const summary = violations.map((v) => `  - ${v.key}: ${v.message}`).join("\n");
    super(
      `Config validation failed with ${violations.length} error(s):\n${summary}`,
      undefined,
      "VALIDATION_ERROR",
    );
    this.name = "ValidationError";
    this.violations = violations;
  }
}

/** Raised for circular or undefined variable references during interpolation. */
export class InterpolationError extends DotlyteError {
  constructor(message: string, key?: string) {
    super(message, key, "INTERPOLATION_ERROR");
    this.name = "InterpolationError";
  }
}

/** Raised when encrypted files can't be decrypted. */
export class DecryptionError extends DotlyteError {
  readonly filePath?: string;

  constructor(message: string, filePath?: string) {
    super(message, undefined, "DECRYPTION_ERROR");
    this.name = "DecryptionError";
    this.filePath = filePath;
  }
}
