# Changelog — dotlyte (.NET)

All notable changes to the .NET implementation will be documented here.

## [0.1.2] - 2026-03-05

### Added

- `TypedConfig.Create()` — schema-driven typed configuration from environment variables with coercion and validation
- `FieldDescriptor` class for defining field type, constraints, defaults, and sensitivity
- `BoundaryConfig` — server/client key boundary enforcement with filtered views
- `Workspace` — monorepo discovery (`FindMonorepoRoot`), workspace loading, shared env
- `Workspace.MonorepoInfo` record and `WorkspaceOptions` class
- `Encryption.RotateKeys()` — re-encrypt values from old key to new key
- `Encryption.ResolveKeyWithFallback()` — try multiple keys for decryption
- `Encryption.EncryptVault()` / `DecryptVault()` — bulk encrypt/decrypt string dictionaries
- `Masking.CompilePatterns()` — compile regex patterns for sensitive key detection
- `Masking.BuildSensitiveSetWithPatterns()` — combine explicit keys, patterns, and schema-sensitive keys
- `ConfigAuditProxy` — indexer-based audit proxy that triggers callbacks on sensitive key access

## [Unreleased]

### Added

- Initial project scaffold
- `DotlyteLoader.Load()` with layered priority merging
- `Config` with `Get<T>()`, `Require()`, `Has()`, indexer access
- Type coercion engine
- Parsers: .env, JSON, environment variables
