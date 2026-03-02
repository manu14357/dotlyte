/**
 * TOML config file parser for DOTLYTE.
 *
 * TOML support is optional; gracefully returns {} if no parser is available.
 * Users can install smol-toml, @iarna/toml, or similar.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ParseError } from "../errors.js";

const require = createRequire(import.meta.url);

export class TomlParser {
  constructor(private readonly filepath: string) {}

  parse(): Record<string, unknown> {
    try {
      const content = readFileSync(this.filepath, "utf-8");

      const toml = require("smol-toml");
      return toml.parse(content) as Record<string, unknown>;
    } catch (e) {
      if (e instanceof Error && e.message.includes("Cannot find module")) {
        // No TOML parser installed — degrade gracefully
        return {};
      }
      if (e instanceof Error) {
        throw new ParseError(`Invalid TOML syntax in ${this.filepath}: ${e.message}`);
      }
      return {};
    }
  }
}
