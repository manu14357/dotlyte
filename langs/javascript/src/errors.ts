/**
 * Custom error types for DOTLYTE.
 */

/**
 * Base error class for all DOTLYTE errors.
 */
export class DotlyteError extends Error {
  /** The config key that caused the error (if applicable). */
  readonly key?: string;

  constructor(message: string, key?: string) {
    super(message);
    this.name = "DotlyteError";
    this.key = key;
  }
}

/**
 * Raised when require() encounters a missing key.
 */
export class MissingRequiredKeyError extends DotlyteError {
  constructor(key: string) {
    super(
      `Required config key '${key}' is missing. ` +
        `Set it in your .env file or as an environment variable.`,
      key,
    );
    this.name = "MissingRequiredKeyError";
  }
}

/**
 * Raised when a config file has invalid syntax.
 */
export class ParseError extends DotlyteError {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}
