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

## License

[MIT](../../LICENSE)
