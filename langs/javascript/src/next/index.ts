/**
 * DOTLYTE Next.js integration — public API.
 *
 * @module dotlyte/next
 */

export {
  DotlyteProvider,
  getClientEnv,
  useEnv,
  createRuntimeScript,
  extractClientEnv,
} from "./provider.js";

export type { DotlyteProviderProps } from "./provider.js";

export { withDotlyte, generateRuntimeEnv } from "./config.js";

export type { NextConfig, WithDotlyteOptions } from "./config.js";
