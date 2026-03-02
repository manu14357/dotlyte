/**
 * DOTLYTE — The universal configuration library.
 *
 * @example
 * ```ts
 * import { load } from "dotlyte";
 *
 * const config = load();
 * config.port;           // automatically number
 * config.debug;          // automatically boolean
 * config.database.host;  // dot-notation access
 * ```
 *
 * @module dotlyte
 */

export { load } from "./loader.js";
export { Config } from "./config.js";
export { DotlyteError } from "./errors.js";
export type { LoadOptions } from "./loader.js";
