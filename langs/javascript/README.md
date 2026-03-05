# dotlyte — JavaScript / TypeScript

The universal `.env` and configuration library for JavaScript and TypeScript.

## Installation

```bash
npm install dotlyte
# or
pnpm add dotlyte
# or
yarn add dotlyte
```

## Quick Start

```ts
import { load } from "dotlyte";

const config = load();

config.port;           // automatically number
config.debug;          // automatically boolean
config.database.host;  // dot-notation access
```

## Features

- **ESM + CJS** dual builds via tsup
- **Zero-config start** — `load()` with no arguments
- `.env` file loading — auto-detects `.env`, `.env.local`, `.env.{env}`
- YAML, JSON, TOML support
- **Type coercion** — `"true"` → `true`, `"8080"` → `8080`
- **Dot-notation access** — `config.database.host`
- **TypeScript first** — full type safety
- **Typed config** — `createTypedConfig()` with generic inference, Zod/Valibot support
- **Server/client boundaries** — Proxy-based enforcement for SSR frameworks
- **Next.js runtime provider** — solve Docker + `NEXT_PUBLIC_*` at runtime
- **Generic SSR runtime** — SvelteKit, Nuxt, Astro runtime env injection
- **Encryption & masking** — key rotation, vault workflows, audit proxies
- **CLI tool** — `dotlyte check`, `diff`, `generate-types`, `encrypt`, `doctor`, `init`
- **Monorepo support** — pnpm/turbo/nx/lerna workspace detection

## API

### `load(options?) → Config`

| Option | Type | Description |
|---|---|---|
| `files` | `string[]` | Explicit files to load |
| `prefix` | `string` | Strip env var prefix |
| `defaults` | `Record<string, unknown>` | Default values |
| `sources` | `string[]` | Custom source order |
| `env` | `string` | Environment name |

### `Config`

| Method | Description |
|---|---|
| `config.key` | Dot-notation access |
| `config.get(key, default?)` | Safe access with fallback |
| `config.require(key)` | Throws `DotlyteError` if missing |
| `config.toObject()` | Convert to plain object |
| `config.has(key)` | Check if key exists |

### `createTypedConfig(schema, options?) → Config`

TypeScript-first validated config with schema inference:

```ts
import { createTypedConfig } from "dotlyte";

const env = createTypedConfig({
  PORT: { type: "integer", default: 3000 },
  DEBUG: { type: "boolean", default: false },
  DATABASE_URL: { type: "string", format: "url", required: true },
  LOG_LEVEL: { type: "string", enum: ["debug", "info", "warn", "error"] as const },
});

env.PORT;          // number
env.DEBUG;         // boolean
env.DATABASE_URL;  // string (required — never undefined)
env.LOG_LEVEL;     // 'debug' | 'info' | 'warn' | 'error'
```

Supports **sectioned schemas** for server/client boundary enforcement:

```ts
const env = createTypedConfig({
  server: {
    DATABASE_URL: { type: "string", required: true },
  },
  client: {
    NEXT_PUBLIC_APP_URL: { type: "string", format: "url" },
  },
  shared: {
    NODE_ENV: { type: "string", enum: ["development", "test", "production"] as const },
  },
  clientPrefix: "NEXT_PUBLIC_",
});
```

### Subpath Exports

| Import | Description |
|---|---|
| `dotlyte/next` | `DotlyteProvider`, `withDotlyte`, `extractClientEnv`, `getClientEnv`, `generateRuntimeEnv` |
| `dotlyte/ssr` | `createRuntimeScript`, `getRuntimeEnv`, `getClientSafeEnv` |
| `dotlyte/zod` | `withZod()` adapter |
| `dotlyte/valibot` | `withValibot()` adapter |

### Next.js Runtime Provider

```tsx
// app/layout.tsx
import { DotlyteProvider } from "dotlyte/next";

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <DotlyteProvider env={process.env} clientPrefix="NEXT_PUBLIC_" />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### CLI

```bash
npx dotlyte check          # Validate env against schema
npx dotlyte diff           # Compare .env files
npx dotlyte generate-types # Generate TypeScript declarations
npx dotlyte encrypt        # Encrypt sensitive values
npx dotlyte doctor         # Diagnose config issues
npx dotlyte init           # Initialize dotlyte project
```

## License

[MIT](../../LICENSE)
