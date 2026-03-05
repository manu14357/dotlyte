# Changelog — dotlyte (Python)

All notable changes to the Python implementation will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] — 2026-03-05

### Added

- **Typed Config** — `create_typed_config()` with schema-driven validation, type coercion, enum/min/max checks, and server/client section support
- **Boundary Enforcement** — `create_boundary_proxy()`, `is_client_context()`, `is_server_context()` for separating server/client configs
- **Enhanced Encryption** — `rotate_keys()`, `resolve_key_with_fallback()`, `encrypt_vault()`, `decrypt_vault()`
- **Enhanced Masking** — `compile_patterns()`, `build_sensitive_set_with_patterns()`, `create_audit_proxy()` with `AuditProxy`
- **CLI** — `dotlyte` command with subcommands: `check`, `diff`, `generate-types`, `encrypt`, `doctor`, `init`
- **Workspace Support** — `load_workspace()`, `find_monorepo_root()`, `get_shared_env()` for monorepo-aware config loading

## [0.1.1] — 2025-12-01

### Added

- Initial project scaffold
- `load()` function with layered priority merging
- `Config` class with dot-notation access, `get()`, `require()`
- Type coercion engine (bool, int, float, list, null)
- Parsers: .env, YAML, JSON, TOML, environment variables, defaults
- Shared spec fixture test infrastructure
