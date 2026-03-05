# Changelog — dotlyte (Java)

All notable changes to the Java implementation will be documented here.

## [0.1.2] — 2026-03-05

### Added

- `TypedConfig` — typed configuration loader with `FieldDescriptor` schemas, type coercion (boolean, integer, number, string), enum validation, min/max constraints, and sensitive field callbacks
- `BoundaryConfig` — boundary-aware configuration with server/client/shared key partitioning and immutable filtered views
- `Workspace` — monorepo support: `findMonorepoRoot()` detects pnpm, turbo, nx, lerna, npm/yarn workspaces; `loadWorkspace()` loads per-package config
- `Encryption.rotateKeys()` — re-encrypt values from an old key to a new key
- `Encryption.resolveKeyWithFallback()` — try multiple keys to decrypt a value
- `Encryption.encryptVault()` / `decryptVault()` — vault-style bulk encrypt/decrypt for sensitive keys
- `Masking.compilePatterns()` — glob-to-regex compilation for sensitive key detection
- `Masking.buildSensitiveSetWithPatterns()` — pattern-based sensitive key matching
- `Masking.createAuditWrapper()` — audit-aware map wrapper that triggers callbacks on sensitive key access
- Tests: `TypedConfigTest`, `BoundaryConfigTest`, `WorkspaceTest`

## [0.1.1]

### Added

- Initial project scaffold with Gradle Kotlin DSL
- `Dotlyte.load()` with layered priority merging
- `Config` with `get()`, `require()`, `has()`, typed accessors
- `LoadOptions` builder pattern
- Type coercion engine
- Parsers: .env, YAML (SnakeYAML), JSON (Gson), environment variables
