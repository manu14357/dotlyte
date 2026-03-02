---
applyTo: "langs/rust/**"
---

# Rust Implementation — Copilot Instructions

## Build System
- **Edition:** 2021
- **Package:** `cargo add dotlyte` / crates.io
- **Crate type:** Library (`lib`)

## Conventions
- **Formatter:** `cargo fmt` (rustfmt)
- **Linter:** `cargo clippy` — zero warnings (`-D warnings`)
- **Test framework:** built-in `#[test]` + integration tests in `tests/`
- **Documentation:** Doc comments (`///`) on all public items

## Code Style
- Use `snake_case` for functions, variables, modules
- Use `PascalCase` for types, traits, enums
- Use `UPPER_SNAKE_CASE` for constants
- Return `Result<T, DotlyteError>` — never `unwrap()` in library code
- Use `thiserror` for error types
- Prefer `impl Into<String>` for string parameters

## Architecture
- `src/lib.rs` — Public API: re-exports `load()`, `Config`, `DotlyteError`
- `src/loader.rs` — Main orchestrator
- `src/config.rs` — Config struct with `get::<T>()`, `require()` methods
- `src/coercion.rs` — Type coercion engine
- `src/error.rs` — Error types with `thiserror`
- `src/parsers/mod.rs` — Parser trait + implementations
- `src/parsers/{env,yaml,json,toml}.rs` — Source-specific parsers

## Commands
```bash
cd langs/rust
cargo build
cargo test
cargo fmt --check
cargo clippy -- -D warnings
cargo doc --no-deps --open    # Generate docs
```

## Dependencies
- `serde` + `serde_json` — JSON + deserialization
- `serde_yaml` — YAML parsing
- `toml` — TOML parsing
- `thiserror` — Error type derivation

## Dev Dependencies
- `pretty_assertions` — Better test diffs
