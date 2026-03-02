/**
 * Config object with dot-notation access, get(), and require().
 */

import { DotlyteError } from "./errors.js";

/**
 * Configuration object with dot-notation property access.
 *
 * @example
 * ```ts
 * const config = new Config({ port: 8080, database: { host: "localhost" } });
 * config.port;           // 8080
 * config.database.host;  // "localhost"
 * ```
 */
export class Config {
  private readonly _data: Record<string, unknown>;
  [key: string]: unknown;

  constructor(data: Record<string, unknown>) {
    this._data = data;

    for (const [key, value] of Object.entries(data)) {
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        (this as Record<string, unknown>)[key] = new Config(
          value as Record<string, unknown>,
        );
      } else {
        (this as Record<string, unknown>)[key] = value;
      }
    }
  }

  /**
   * Safe access with an optional fallback value.
   * Supports dot-notation keys for nested access.
   *
   * @param key - Configuration key (e.g., "database.host").
   * @param defaultValue - Fallback value if key doesn't exist.
   * @returns The configuration value, or the default.
   */
  get(key: string, defaultValue?: unknown): unknown {
    try {
      const parts = key.split(".");
      let val: unknown = this._data;
      for (const part of parts) {
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
          val = (val as Record<string, unknown>)[part];
        } else {
          return defaultValue;
        }
      }
      return val ?? defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Access a required configuration key.
   *
   * @param key - Configuration key (e.g., "database.host").
   * @returns The configuration value.
   * @throws {DotlyteError} If the key is missing or undefined.
   */
  require(key: string): unknown {
    const val = this.get(key);
    if (val === undefined || val === null) {
      throw new DotlyteError(
        `Required config key '${key}' is missing. ` +
          `Set it in your .env file or as an environment variable.`,
        key,
      );
    }
    return val;
  }

  /**
   * Convert the Config back to a plain object.
   */
  toObject(): Record<string, unknown> {
    return { ...this._data };
  }

  /**
   * Check if a key exists in the config.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined && this.get(key) !== null;
  }
}
