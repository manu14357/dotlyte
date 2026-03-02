/**
 * JSON config file parser for DOTLYTE.
 */

import { readFileSync } from "node:fs";
import { ParseError } from "../errors.js";

export class JsonParser {
  constructor(private readonly filepath: string) {}

  parse(): Record<string, unknown> {
    try {
      const content = readFileSync(this.filepath, "utf-8");
      const data: unknown = JSON.parse(content);
      return typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    } catch (e) {
      if (e instanceof SyntaxError) {
        throw new ParseError(
          `Invalid JSON syntax in ${this.filepath}: ${e.message}`,
        );
      }
      return {};
    }
  }
}
