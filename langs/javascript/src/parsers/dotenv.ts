/**
 * Dotenv (.env file) parser for DOTLYTE v2.
 *
 * Supports:
 * - KEY=VALUE, KEY="VALUE", KEY='VALUE'
 * - `export KEY=VALUE` prefix
 * - Multiline values (double-quoted with \n)
 * - Inline comments: KEY=value # comment
 * - parseRaw() returns string values (pre-coercion) for interpolation
 */

import { readFileSync } from "node:fs";
import { coerce } from "../coercion.js";
import { ParseError } from "../errors.js";

export class DotenvParser {
  constructor(private readonly filepath: string) {}

  /**
   * Parse .env file and coerce values to native types.
   * For interpolation support, use parseRaw() + interpolate() + coerceObject() instead.
   */
  parse(): Record<string, unknown> {
    const raw = this.parseRaw();
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      result[key] = coerce(value);
    }
    return result;
  }

  /**
   * Parse .env file and return raw string values (no type coercion).
   * Used by the loader for interpolation before coercion.
   */
  parseRaw(): Record<string, string> {
    const result: Record<string, string> = {};

    let content: string;
    try {
      content = readFileSync(this.filepath, "utf-8");
    } catch {
      return result;
    }

    const lines = content.split("\n");
    let i = 0;

    while (i < lines.length) {
      let line = lines[i]!.trim();
      i++;

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
          `Invalid syntax in ${this.filepath}:${i}: expected KEY=VALUE, got: "${line}"`,
          this.filepath,
        );
      }

      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();

      // Handle double-quoted multiline values
      if (value.startsWith('"') && !value.endsWith('"')) {
        const parts = [value.slice(1)];
        while (i < lines.length) {
          const nextLine = lines[i]!;
          i++;
          if (nextLine.trimEnd().endsWith('"')) {
            parts.push(nextLine.trimEnd().slice(0, -1));
            break;
          }
          parts.push(nextLine);
        }
        value = parts.join("\n");
      } else {
        // Remove surrounding quotes
        if (
          value.length >= 2 &&
          value[0] === value[value.length - 1] &&
          (value[0] === '"' || value[0] === "'")
        ) {
          value = value.slice(1, -1);
        } else if (value[0] !== "'" && value[0] !== '"') {
          // Strip inline comments for unquoted values
          const hashIndex = value.indexOf(" #");
          if (hashIndex !== -1) {
            value = value.slice(0, hashIndex).trimEnd();
          }
        }
      }

      // Process escape sequences in double-quoted values
      value = value.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");

      result[key.toLowerCase()] = value;
    }

    return result;
  }
}
