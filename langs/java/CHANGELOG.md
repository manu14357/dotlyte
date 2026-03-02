# Changelog — dotlyte (Java)

All notable changes to the Java implementation will be documented here.

## [Unreleased]

### Added

- Initial project scaffold with Gradle Kotlin DSL
- `Dotlyte.load()` with layered priority merging
- `Config` with `get()`, `require()`, `has()`, typed accessors
- `LoadOptions` builder pattern
- Type coercion engine
- Parsers: .env, YAML (SnakeYAML), JSON (Gson), environment variables
