# Changelog — dotlyte (Python)

All notable changes to the Python implementation will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial project scaffold
- `load()` function with layered priority merging
- `Config` class with dot-notation access, `get()`, `require()`
- Type coercion engine (bool, int, float, list, null)
- Parsers: .env, YAML, JSON, TOML, environment variables, defaults
- Shared spec fixture test infrastructure
