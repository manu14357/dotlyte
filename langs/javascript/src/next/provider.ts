/**
 * DOTLYTE Next.js Runtime Environment Provider.
 *
 * Solves the "Docker + NEXT_PUBLIC_*" problem: Next.js inlines public env vars
 * at build time, so deploying one Docker image to multiple environments
 * (staging, prod) gets the wrong values. This provider injects them at runtime.
 *
 * Usage in app/layout.tsx:
 * ```tsx
 * import { DotlyteProvider } from 'dotlyte/next'
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <head>
 *         <DotlyteProvider env={env} clientPrefix="NEXT_PUBLIC_" />
 *       </head>
 *       <body>{children}</body>
 *     </html>
 *   )
 * }
 * ```
 *
 * @module dotlyte/next
 */

/** Global key for runtime env injection. */
const WINDOW_KEY = "__DOTLYTE_ENV__";

/**
 * Props for the DotlyteProvider component.
 */
export interface DotlyteProviderProps {
  /** The typed config object from createTypedConfig(). */
  env: Record<string, unknown>;
  /** Prefix for client-safe variables (default: 'NEXT_PUBLIC_'). */
  clientPrefix?: string;
  /** Additional shared keys to expose to the client. */
  sharedKeys?: string[];
  /** Custom nonce for Content-Security-Policy. */
  nonce?: string;
}

/**
 * Extract client-safe variables from a config object.
 *
 * Only variables starting with the client prefix (or in sharedKeys) are included.
 * Server secrets are NEVER serialized.
 */
export function extractClientEnv(
  env: Record<string, unknown>,
  clientPrefix = "NEXT_PUBLIC_",
  sharedKeys: string[] = [],
): Record<string, unknown> {
  const clientEnv: Record<string, unknown> = {};
  const sharedSet = new Set(sharedKeys);

  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith(clientPrefix) || sharedSet.has(key)) {
      // Only serialize primitive values (no functions, no symbols)
      if (value !== undefined && typeof value !== "function" && typeof value !== "symbol") {
        clientEnv[key] = value;
      }
    }
  }

  return clientEnv;
}

/**
 * Generate the script tag content for runtime env injection.
 *
 * Renders a `<script>` tag that sets `window.__DOTLYTE_ENV__` with
 * client-safe variables only. Server secrets are never included.
 */
export function createRuntimeScript(
  env: Record<string, unknown>,
  clientPrefix = "NEXT_PUBLIC_",
  sharedKeys: string[] = [],
): string {
  const clientEnv = extractClientEnv(env, clientPrefix, sharedKeys);
  const serialized = JSON.stringify(clientEnv);
  return `window.${WINDOW_KEY}=${serialized};`;
}

/**
 * React Server Component that injects runtime environment variables.
 *
 * Renders a `<script>` tag in the document `<head>` that makes client-safe
 * env vars available at runtime (not baked in at build time).
 *
 * This is a function that returns the HTML string for the script tag.
 * For React frameworks, wrap this in a component.
 */
export function DotlyteProvider(props: DotlyteProviderProps): string {
  const { env, clientPrefix = "NEXT_PUBLIC_", sharedKeys = [], nonce } = props;
  const script = createRuntimeScript(env, clientPrefix, sharedKeys);
  const nonceAttr = nonce ? ` nonce="${nonce}"` : "";
  return `<script${nonceAttr}>${script}</script>`;
}

/**
 * Get runtime environment on the client side.
 *
 * Reads from `window.__DOTLYTE_ENV__` (injected by DotlyteProvider) on the client,
 * or falls back to `process.env` on the server.
 *
 * @param key — specific key to access, or undefined for the full env object
 */
export function getClientEnv(): Record<string, unknown>;
export function getClientEnv(key: string): unknown;
export function getClientEnv(key?: string): unknown {
  // Client: read from injected script
  if (typeof (globalThis as Record<string, unknown>).window !== "undefined") {
    const env = (globalThis as Record<string, unknown>)[WINDOW_KEY] as Record<string, unknown> | undefined;
    if (!env) {
      throw new Error(
        "DOTLYTE runtime env not found. Did you add <DotlyteProvider> to your layout?",
      );
    }
    return key ? env[key] : env;
  }

  // Server: read from process.env
  if (key) {
    return process.env[key];
  }

  return process.env;
}

/**
 * React hook (function signature) for accessing runtime env in client components.
 *
 * This is a plain function (not a true React hook) that can be used in any context.
 * In a real React app, you'd wrap this in a proper hook with useState/useEffect.
 *
 * @example
 * ```tsx
 * import { useEnv } from 'dotlyte/next'
 *
 * function MyComponent() {
 *   const env = useEnv()
 *   return <a href={env.NEXT_PUBLIC_APP_URL}>Home</a>
 * }
 * ```
 */
export function useEnv<T extends Record<string, unknown> = Record<string, unknown>>(): T {
  return getClientEnv() as T;
}
