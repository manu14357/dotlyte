# Changelog — dotlyte (Rust)

All notable changes to the Rust implementation will be documented here.

## [Unreleased]

### Added

- Initial project scaffold
- `load()` function with layered priority merging
- `Config` with `get()`, `require()`, `has()`, `to_map()`
- Type coercion engine
- Parsers: .env, YAML (optional), JSON, TOML (optional), environment variables
- Feature flags for optional parsers
