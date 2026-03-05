# Changelog — dotlyte (JavaScript/TypeScript)

All notable changes to the JavaScript/TypeScript implementation will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.2] - 2025-07-18

### Added

- **TypeScript-first typed config** (`createTypedConfig`): generic type inference, field descriptors with type/enum/min/max/required/default, Zod and Valibot schema auto-detection
- **Server/client boundary enforcement** (`createBoundaryProxy`): Proxy-based immutable config with `serverOnly()`, `clientOnly()` methods and audit callbacks
- **Zod adapter** (`dotlyte/zod`): `withZod()` passthrough adapter for Zod schema integration
- **Valibot adapter** (`dotlyte/valibot`): `withValibot()` passthrough adapter for Valibot schema integration
- **Next.js runtime provider** (`dotlyte/next`): `DotlyteProvider`, `extractClientEnv`, `getClientEnv`, `withDotlyte` next.config wrapper, `generateRuntimeEnv` — solves Docker + NEXT_PUBLIC_ problem
- **Generic SSR runtime** (`dotlyte/ssr`): `createRuntimeScript`, `getRuntimeEnv`, `getClientSafeEnv` — for SvelteKit, Nuxt, Astro, etc.
- **Enhanced encryption**: `rotateKeys()`, `resolveKeyWithFallback()`, `decryptVault()`, `encryptForVault()` for key rotation and vault workflows
- **Enhanced masking**: `compilePatterns()` glob-to-regex, `buildSensitiveSetWithPatterns()`, `createAuditProxy()` for SOC2/HIPAA audit logging
- **CLI tool** (`dotlyte` bin): 6 commands — `check`, `diff`, `generate-types`, `encrypt`, `doctor`, `init`
- **Monorepo/workspace support** (`loadWorkspace`): auto-detects pnpm/turbo/nx/lerna/npm/yarn workspaces, shared env management, `generateTurboEnvConfig()`
- Subpath exports: `dotlyte/next`, `dotlyte/ssr`, `dotlyte/zod`, `dotlyte/valibot`
- Optional peer dependencies: `zod ^3.0.0`, `valibot >=0.30.0`
- 49 new tests across 7 test files

## [0.1.1]

### Added
