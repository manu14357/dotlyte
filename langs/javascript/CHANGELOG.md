# Changelog — dotlyte (JavaScript/TypeScript)

All notable changes to the JavaScript/TypeScript implementation will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Initial project scaffold
- `load()` function with layered priority merging
- `Config` class with dot-notation access, `get()`, `require()`, `has()`, `toObject()`
- Type coercion engine (boolean, number, list, null)
- Parsers: .env, YAML, JSON, TOML, environment variables, defaults
- ESM + CJS dual build via tsup
- Full TypeScript types
