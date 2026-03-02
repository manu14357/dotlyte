/**
 * YAML config file parser for DOTLYTE.
 *
 * YAML support is optional; gracefully returns {} if no parser is available.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { ParseError } from "../errors.js";

const require = createRequire(import.meta.url);

export class YamlParser {
  constructor(private readonly filepath: string) {}

  parse(): Record<string, unknown> {
    try {
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
