/**
 * Environment variables parser for DOTLYTE.
 */

import { coerce } from "../coercion.js";

export class EnvVarsParser {
  private readonly prefix: string | undefined;

  constructor(prefix?: string) {
    this.prefix = prefix ? `${prefix.toUpperCase()}_` : undefined;
  }

  parse(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue;

      if (this.prefix) {
        if (!key.startsWith(this.prefix)) continue;

        const cleanKey = key.slice(this.prefix.length).toLowerCase();
        setNested(result, cleanKey, coerce(value));
      } else {
        result[key.toLowerCase()] = coerce(value);
      }
    }

    return result;
  }
}

function setNested(
  data: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const parts = key.split("_");
  let current = data;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]!] = value;
}
