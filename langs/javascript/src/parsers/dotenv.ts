/**
 * Dotenv (.env file) parser for DOTLYTE.
 */

import { readFileSync } from "node:fs";
import { coerce } from "../coercion.js";
import { ParseError } from "../errors.js";

export class DotenvParser {
  constructor(private readonly filepath: string) {}

  parse(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    let content: string;
    try {
      content = readFileSync(this.filepath, "utf-8");
    } catch {
      return result;
    }

    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]!.trim();

      // Skip empty lines and comments
      if (!line || line.startsWith("#")) continue;

      // Strip optional "export " prefix
      if (line.startsWith("export ")) {
        line = line.slice(7).trim();
      }

      // Parse KEY=VALUE
      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) {
        throw new ParseError(
          `Invalid syntax in ${this.filepath}:${i + 1}: expected KEY=VALUE, got: "${line}"`,
        );
      }

      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();

      // Remove surrounding quotes
      if (
        value.length >= 2 &&
        value[0] === value[value.length - 1] &&
        (value[0] === '"' || value[0] === "'")
      ) {
        value = value.slice(1, -1);
      }

      result[key.toLowerCase()] = coerce(value);
    }

    return result;
  }
}
