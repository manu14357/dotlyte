/**
 * Next.js configuration helper for DOTLYTE.
 *
 * Provides `withDotlyte()` to wrap next.config.ts and auto-configure:
 * - `transpilePackages` includes 'dotlyte'
 * - Build-time env validation
 * - Runtime env auto-mapping (replaces `experimental__runtimeEnv` boilerplate)
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withDotlyte } from 'dotlyte/next'
 *
 * export default withDotlyte({
 *   // ... normal next config
 * })
 * ```
 *
 * @module dotlyte/next
 */

/** Minimal Next.js config type (avoids dependency on 'next'). */
export interface NextConfig {
  transpilePackages?: string[];
  env?: Record<string, string | undefined>;
  [key: string]: unknown;
}

/**
 * Options for the withDotlyte Next.js wrapper.
 */
export interface WithDotlyteOptions {
  /** Client-prefixed keys to auto-map (auto-detected from process.env if not provided). */
  clientKeys?: string[];
  /** Client prefix (default: 'NEXT_PUBLIC_'). */
  clientPrefix?: string;
  /** Whether to validate env at build time (default: true). */
  validateOnBuild?: boolean;
}

/**
 * Auto-generate the runtimeEnv mapping from environment variables.
 *
 * In @t3-oss/env-nextjs, users must manually write:
 * ```ts
 * experimental__runtimeEnv: {
 *   NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
 *   NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL,
 * }
 * ```
 *
 * dotlyte auto-generates this from the client prefix.
 *
 * @param clientPrefix — prefix to match (default: 'NEXT_PUBLIC_')
 * @param clientKeys   — explicit list of keys (auto-detected from process.env if not provided)
 * @returns A map of key → process.env[key]
 */
export function generateRuntimeEnv(
  clientPrefix = "NEXT_PUBLIC_",
  clientKeys?: string[],
): Record<string, string | undefined> {
  const keys =
    clientKeys ??
    Object.keys(process.env).filter((k) => k.startsWith(clientPrefix));

  const runtimeEnv: Record<string, string | undefined> = {};
  for (const key of keys) {
    runtimeEnv[key] = process.env[key];
  }
  return runtimeEnv;
}

/**
 * Wrap a Next.js config with dotlyte configuration.
 *
 * Automatically:
 * 1. Adds 'dotlyte' to transpilePackages
 * 2. Auto-maps NEXT_PUBLIC_* vars to runtime env
 * 3. Validates env at build time (optional)
 *
 * @example
 * ```ts
 * // next.config.ts
 * import { withDotlyte } from 'dotlyte/next'
 *
 * export default withDotlyte({
 *   reactStrictMode: true,
 * })
 * ```
 */
export function withDotlyte(
  nextConfig: NextConfig = {},
  options: WithDotlyteOptions = {},
): NextConfig {
  const { clientPrefix = "NEXT_PUBLIC_", validateOnBuild = true } = options;

  // 1. Add dotlyte to transpilePackages
  const transpilePackages = [...(nextConfig.transpilePackages ?? [])];
  if (!transpilePackages.includes("dotlyte")) {
    transpilePackages.push("dotlyte");
  }

  // 2. Auto-map client env vars
  const runtimeEnv = generateRuntimeEnv(clientPrefix, options.clientKeys);

  // 3. Merge env into next config
  const env = {
    ...(nextConfig.env ?? {}),
    ...Object.fromEntries(
      Object.entries(runtimeEnv)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, v as string]),
    ),
  };

  // 4. Build-time validation log
  if (validateOnBuild) {
    const clientVarCount = Object.keys(runtimeEnv).length;
    if (clientVarCount > 0) {
      // Log is suppressed in production, only for build-time info
      if (process.env.NODE_ENV !== "production") {
        console.log(`[dotlyte] Auto-mapped ${clientVarCount} ${clientPrefix}* vars for runtime injection`);
      }
    }
  }

  return {
    ...nextConfig,
    transpilePackages,
    env,
  };
}
