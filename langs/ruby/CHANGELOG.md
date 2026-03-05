# Changelog — dotlyte (Ruby)

All notable changes to the Ruby implementation will be documented here.

## [0.1.2] — 2026-03-05

### Added

- `Dotlyte::TypedConfig` — schema-driven typed configuration from ENV with validation, coercion, enum/min/max constraints, and sensitive-key callbacks
- `Dotlyte::BoundaryConfig` — boundary-aware configuration separating server, client, and shared keys with immutable access
- `Dotlyte::Workspace` — monorepo support with auto-detection (pnpm, turbo, nx, lerna, npm/yarn workspaces), shared .env loading, and per-package config
- `Dotlyte::CLI` — command-line interface with `check`, `diff`, `generate_types`, `encrypt`, `doctor`, and `init` commands
- `Dotlyte::Encryption.rotate_keys` — re-encrypt all values with a new key
- `Dotlyte::Encryption.resolve_key_with_fallback` — try multiple keys for decryption
- `Dotlyte::Encryption.encrypt_vault` / `decrypt_vault` — vault-style bulk encrypt/decrypt
- `Dotlyte::Masking.compile_patterns` — glob-to-regexp pattern compilation for sensitive key matching
- `Dotlyte::Masking.build_sensitive_set_with_patterns` — pattern-based sensitive key detection
- `Dotlyte::Masking.create_audit_proxy` — access-tracking proxy for sensitive data auditing
- `bin/dotlyte` executable

## [0.1.1] — 2025-12-01

### Added

- Initial project scaffold
- `Dotlyte.load` with layered priority merging
- `Config` with dot-notation via `method_missing`, `get`, `require`, `has?`
- Type coercion engine
- Parsers: .env, YAML, JSON, environment variables
