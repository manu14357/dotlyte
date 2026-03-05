# Changelog — dotlyte (PHP)

All notable changes to the PHP implementation will be documented here.

## [0.1.2] — 2026-03-05

### Added

- `TypedConfig::create()` — schema-driven typed configuration from environment variables with type coercion, validation (required, enum, min, max), and sensitive-key callbacks
- `BoundaryConfig` — server/client key boundary enforcement with `serverOnly()`, `clientOnly()`, and access auditing
- `Workspace::findMonorepoRoot()` — auto-detect pnpm, Turbo, Nx, Lerna, and npm workspaces
- `Workspace::loadWorkspace()` / `Workspace::getSharedEnv()` — cross-package config loading with prefix stripping
- `Encryption::rotateKeys()` — re-encrypt all values from an old key to a new key
- `Encryption::resolveKeyWithFallback()` — try multiple keys to decrypt a value
- `Encryption::encryptVault()` / `Encryption::decryptVault()` — encrypt/decrypt entire config arrays with optional selective key targeting
- `Masking::compilePatterns()` — compile glob patterns (`*`, `**`) to regex for sensitive-key matching
- `Masking::buildSensitiveSetWithPatterns()` — combine auto-detection, glob patterns, and schema flags
- `Masking::createAuditProxy()` — `ArrayAccess` wrapper that triggers a callback on every read
- `AuditProxy` class implementing `ArrayAccess` for immutable audited config access
- CLI entry point (`bin/dotlyte`) with `dump`, `get`, `validate`, and `version` commands

### Changed

- Bumped version to 0.1.2
- Added `bin` entry to `composer.json`

## [Unreleased]

### Added

- Initial project scaffold
- `Dotlyte::load()` with layered priority merging
- `Config` with dot-notation via `__get`, `get()`, `require()`, `has()`
- Type coercion engine
- Parsers: .env, YAML, JSON, environment variables
