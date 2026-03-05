/**
 * DOTLYTE SSR Runtime Environment — generic (non-framework-specific).
 *
 * For use with any SSR framework (SvelteKit, Nuxt, Astro, etc.)
 * that needs runtime env injection into client-side code.
 *
 * @module dotlyte/ssr
 */

/** Global key for runtime env injection. */
const WINDOW_KEY = "__DOTLYTE_ENV__";

/**
 * Create an HTML script tag string for injecting runtime env vars.
 *
 * @param env          — the full config object
 * @param clientPrefix — prefix for client-safe variables
 * @param sharedKeys   — additional keys to expose to the client
 * @param nonce        — optional CSP nonce
 * @returns HTML script tag string
 *
 * @example
 * ```ts
 * import { createRuntimeScript } from 'dotlyte/ssr'
 *
 * const scriptTag = createRuntimeScript(env, 'VITE_', ['NODE_ENV'])
 * // <script>window.__DOTLYTE_ENV__={"VITE_APP_URL":"...",...};</script>
 * ```
 */
export function createRuntimeScript(
  env: Record<string, unknown>,
  clientPrefix = "NEXT_PUBLIC_",
  sharedKeys: string[] = [],
  nonce?: string,
): string {
  const clientEnv: Record<string, unknown> = {};
  const sharedSet = new Set(sharedKeys);

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(clientPrefix) || sharedSet.has(key)) {
      if (value !== undefined && typeof value !== "function" && typeof value !== "symbol") {
        clientEnv[key] = value;
      }
    }
  }

  const serialized = JSON.stringify(clientEnv);
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
  return `<script${nonceAttr}>window.${WINDOW_KEY}=${serialized};</script>`;
}

/**
 * Get runtime environment on the client side.
 *
 * @param key — specific key to access, or undefined for the full env object
 */
export function getRuntimeEnv(): Record<string, unknown>;
export function getRuntimeEnv(key: string): unknown;
export function getRuntimeEnv(key?: string): unknown {
  if (typeof (globalThis as Record<string, unknown>).window !== "undefined") {
    const env = (globalThis as Record<string, unknown>)[WINDOW_KEY] as Record<string, unknown> | undefined;
    if (!env) {
      throw new Error(
        "DOTLYTE runtime env not found. Inject it using createRuntimeScript() in your HTML <head>.",
      );
    }
    return key ? env[key] : env;
  }

  // Server fallback
  return key ? process.env[key] : process.env;
}

/**
 * Create a JSON object of client-safe env vars (for custom injection).
 */
export function getClientSafeEnv(
  env: Record<string, unknown>,
  clientPrefix = "NEXT_PUBLIC_",
  sharedKeys: string[] = [],
): Record<string, unknown> {
  const clientEnv: Record<string, unknown> = {};
  const sharedSet = new Set(sharedKeys);

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(clientPrefix) || sharedSet.has(key)) {
      if (value !== undefined && typeof value !== "function" && typeof value !== "symbol") {
        clientEnv[key] = value;
      }
    }
  }

  return clientEnv;
}
