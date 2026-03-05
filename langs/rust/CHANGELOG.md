# Changelog — dotlyte (Rust)

All notable changes to the Rust implementation will be documented here.

## [0.1.2] — 2026-03-05

### Added

- **Typed config** (`typed.rs`): `create_typed_config()` with `FieldDescriptor`, `FieldType`, enum/min/max validation
- **Boundary config** (`boundaries.rs`): `BoundaryConfig` with server/client/shared key segregation
- **Workspace support** (`workspace.rs`): `load_workspace()`, `find_monorepo_root()`, `get_shared_env()` for monorepos
- **Enhanced encryption**: `rotate_keys()`, `resolve_key_with_fallback()`, `encrypt_vault()`, `decrypt_vault()`
- **Enhanced masking**: `compile_patterns()`, `build_sensitive_set_with_patterns()`, `check_sensitive_access()`
- Integration tests for typed config, boundaries, and workspace modules

## [Unreleased]

### Added

- Initial project scaffold
- `load()` function with layered priority merging
- `Config` with `get()`, `require()`, `has()`, `to_map()`
- Type coercion engine
- Parsers: .env, YAML (optional), JSON, TOML (optional), environment variables
- Feature flags for optional parsers
