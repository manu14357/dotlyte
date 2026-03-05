# Changelog — dotlyte (Go)

All notable changes to the Go implementation will be documented here.

## [Unreleased]

## [0.1.2] — 2025-06-24

### Added

- **Typed Config** — `CreateTypedConfig()` and `CreateSectionedConfig()` for runtime-validated, schema-driven configuration with field descriptors (`FieldDescriptor`), enum validation, min/max constraints, and automatic type coercion.
- **Boundary Enforcement** — `NewBoundaryConfig()` with `Get()`, `ServerOnly()`, `ClientOnly()`, `IsServerContext()`, `IsClientContext()`, and `AllKeys()` for server/client config isolation.
- **Enhanced Encryption** — `RotateKeys()` for key rotation, `ResolveKeyWithFallback()` for multi-key decryption, `EncryptVault()` / `DecryptVault()` for SOPS-style selective encryption.
- **Enhanced Masking** — `CompilePatterns()` for glob-to-regex pattern matching, `BuildSensitiveSetWithPatterns()` combining auto-detection and custom patterns, `CreateAuditWrapper()` with `AuditAccessFunc` callback for access auditing.
- **Workspace / Monorepo** — `LoadWorkspace()`, `FindMonorepoRoot()`, and `GetSharedEnv()` supporting pnpm, Turborepo, Nx, Lerna, and Go workspaces.
- **CLI** — `cmd/dotlyte` binary with `check`, `diff`, `generate-types`, `encrypt`, `doctor`, and `init` commands.
- Tests: `typed_test.go`, `boundaries_test.go`, `workspace_test.go` with table-driven subtests.

## [0.1.1]

### Added

- Initial project scaffold
- `Load()` function with layered priority merging
- `Config` with `Get()`, `Require()`, `Has()`, `ToMap()`
- Type coercion engine
- Parsers: .env, YAML, JSON, TOML, environment variables
