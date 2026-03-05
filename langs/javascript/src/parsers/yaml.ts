/**
 * YAML config file parser for DOTLYTE.
 *
 * YAML support is optional; gracefully returns {} if no parser is available.
 *
 * Note: `require()` is available in CJS natively. For ESM, tsup injects a
 * `require` shim via banner (see tsup.config.ts).
 */

import { readFileSync } from "node:fs";
import { ParseError } from "../errors.js";

export class YamlParser {
  constructor(private readonly filepath: string) {}

  parse(): Record<string, unknown> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const yaml = require("yaml");
      const content = readFileSync(this.filepath, "utf-8");
      const data = yaml.parse(content);
      return typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    } catch (e) {
      if (e instanceof Error && e.message.includes("Cannot find module")) {
        return {};
      }
      if (e instanceof Error) {
        throw new ParseError(`Invalid YAML syntax in ${this.filepath}: ${e.message}`);
      }
      return {};
    }
  }
}
