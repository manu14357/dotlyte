/**
 * Server/Client boundary enforcement for DOTLYTE.
 *
 * Prevents server-only environment variables (API keys, database URLs, secrets)
 * from being accidentally accessed in client-side code. Essential for
 * Next.js, Nuxt, SvelteKit, and other SSR frameworks.
 *
 * Uses JavaScript Proxy to intercept property access and check the execution context.
 *
 * @module dotlyte/boundaries
 */

import { DotlyteError } from "./errors.js";

/**
 * Detect whether the current code is running in a client (browser) context.
 *
 * Checks for `window` and `document` as indicators of a browser environment.
 * In SSR frameworks like Next.js, server components run in Node.js (no window).
 */
export function isClientContext(): boolean {
  // Use globalThis checks to avoid needing DOM lib types
  return typeof (globalThis as Record<string, unknown>).window !== "undefined"
    && typeof (globalThis as Record<string, unknown>).document !== "undefined";
}

/**
 * Detect whether the current code is running in a server context.
 */
export function isServerContext(): boolean {
  return !isClientContext();
}

/**
 * Create a Proxy that enforces server/client boundaries on config access.
 *
 * - Server keys: accessible only on the server; throw on client access.
 * - Client keys: accessible everywhere.
 * - Shared keys: accessible everywhere.
 *
 * @param data        — the validated config object
 * @param serverKeys  — keys restricted to server context
 * @param clientKeys  — keys safe for client context
 * @param sharedKeys  — keys available in both contexts
 * @param onSecretAccess — optional audit callback for sensitive value access
 * @returns A Proxy-wrapped config object
 */
export function createBoundaryProxy(
  data: Record<string, unknown>,
  serverKeys: Set<string>,
  clientKeys: Set<string>,
  sharedKeys: Set<string>,
  onSecretAccess?: (key: string, context: string) => void,
): Record<string, unknown> {
  // Store metadata for clientOnly() method
  const allKeys = new Set([...serverKeys, ...clientKeys, ...sharedKeys]);

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop, receiver) {
      // Handle special methods
      if (prop === "clientOnly") {
        return () => {
          const clientData: Record<string, unknown> = {};
          for (const key of clientKeys) {
            clientData[key] = target[key];
          }
          for (const key of sharedKeys) {
            clientData[key] = target[key];
          }
          return Object.freeze(clientData);
        };
      }

      if (prop === "serverOnly") {
        return () => {
          const serverData: Record<string, unknown> = {};
          for (const key of serverKeys) {
            serverData[key] = target[key];
          }
          for (const key of sharedKeys) {
            serverData[key] = target[key];
          }
          return Object.freeze(serverData);
        };
      }

      // Allow internal/symbol access
      if (typeof prop === "symbol") {
        return Reflect.get(target, prop, receiver);
      }

      // Allow standard object methods
      if (["toJSON", "toString", "valueOf", "constructor", "then"].includes(prop)) {
        if (prop === "toJSON") {
          return () => {
            const safe: Record<string, unknown> = {};
            for (const key of clientKeys) safe[key] = target[key];
            for (const key of sharedKeys) safe[key] = target[key];
            if (isServerContext()) {
              for (const key of serverKeys) safe[key] = target[key];
            }
            return safe;
          };
        }
        return Reflect.get(target, prop, receiver);
      }

      // Check for unknown keys
      if (!allKeys.has(prop)) {
        return undefined;
      }

      // Server key accessed in client context
      if (serverKeys.has(prop) && isClientContext()) {
        throw new DotlyteError(
          `Server-only env var '${prop}' accessed in client context. ` +
            `This variable contains sensitive data and must not be exposed to the browser. ` +
            `Move it to the 'server' section and only access it in server-side code.`,
          prop,
          "BOUNDARY_VIOLATION",
        );
      }

      // Audit logging for sensitive access
      if (onSecretAccess && serverKeys.has(prop)) {
        const context = isClientContext() ? "client" : "server";
        onSecretAccess(prop, context);
      }

      return target[prop];
    },

    set(_target, prop) {
      throw new DotlyteError(
        `Cannot set property '${String(prop)}' on typed config. Config is immutable.`,
        String(prop),
        "IMMUTABLE_CONFIG",
      );
    },

    deleteProperty(_target, prop) {
      throw new DotlyteError(
        `Cannot delete property '${String(prop)}' from typed config. Config is immutable.`,
        String(prop),
        "IMMUTABLE_CONFIG",
      );
    },

    has(_target, prop) {
      if (typeof prop === "symbol") return false;
      return allKeys.has(prop);
    },

    ownKeys() {
      if (isClientContext()) {
        return [...clientKeys, ...sharedKeys];
      }
      return [...allKeys];
    },

    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && allKeys.has(prop)) {
        // For server keys in client context, hide them
        if (serverKeys.has(prop) && isClientContext()) {
          return undefined;
        }
        return {
          configurable: true,
          enumerable: true,
          value: target[prop],
          writable: false,
        };
      }
      return undefined;
    },
  };

  return new Proxy(data, handler);
}

/* ──────── TypeScript Types for Boundary Enforcement ──────── */

/**
 * Server-only config type — includes all keys.
 */
export type ServerEnv<S, C, H> = S & C & H;

/**
 * Client-only config type — excludes server keys.
 */
export type ClientEnv<C, H> = C & H;

/**
 * Shared config type — available everywhere.
 */
export type SharedEnv<H> = H;
