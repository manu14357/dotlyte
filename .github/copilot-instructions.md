# DOTLYTE — Copilot Instructions

## Project Overview

DOTLYTE is a **cross-language, open-source configuration loading library**. One API, every language, every config source.

- **Mission:** `dotlyte.load()` — one call to load `.env`, YAML, JSON, TOML, environment variables, and defaults with automatic type coercion and layered priority.
- **Architecture:** Monorepo with 8 language implementations under `langs/`, governed by a shared specification in `spec/`.

## Repository Layout

```
spec/                  → Source of truth: API spec, type coercion rules, priority rules, shared test fixtures
langs/python/          → pip install dotlyte (hatchling, ruff, pytest, mypy)
langs/javascript/      → npm install dotlyte (pnpm, tsup, vitest, TypeScript)
langs/go/              → go get ... (flat layout, go test)
langs/rust/            → cargo add dotlyte (edition 2021, thiserror)
langs/java/            → Maven/Gradle (Gradle Kotlin DSL, JUnit 5)
langs/ruby/            → gem install dotlyte (RSpec, RuboCop)
langs/php/             → composer require dotlyte/dotlyte (PHPUnit, PHPStan, PSR-4)
langs/dotnet/          → dotnet add package Dotlyte (.NET 6+/8, xUnit)
.github/workflows/     → One CI workflow per language + spec conformance
.github/instructions/  → Per-language Copilot instructions (path-specific)
```

## Universal API Contract

All implementations MUST expose the same public API:

```
load(options?) → Config
Config.{key}              → dot-notation access
Config.get(key, default?) → safe access with fallback
Config.require(key)       → throws DotlyteError if missing
```

### Load Options (all optional)

| Option | Type | Description |
|---|---|---|
| `files` | `string[]` | Explicit files to load |
| `prefix` | `string` | Strip env var prefix: `APP_DB_HOST` → `db.host` |
| `defaults` | `dict/map` | Default values (lowest priority) |
| `sources` | `string[]` | Custom source order |
| `env` | `string` | Environment name: loads `config.{env}.yaml`, `.env.{env}` |

### Priority Order (higher wins)

1. Environment variables (`os.environ` / `process.env`)
2. `.env` files (`.env`, `.env.local`, `.env.{env}`)
3. YAML/JSON config files
4. TOML/INI config files
5. Hardcoded defaults

### Type Coercion Rules

- `"true"` / `"yes"` / `"1"` / `"on"` → `true` (bool)
- `"false"` / `"no"` / `"0"` / `"off"` → `false` (bool)
- `"8080"` → `8080` (int)
- `"3.14"` → `3.14` (float)
- `"a,b,c"` → `["a", "b", "c"]` (list/array)
- `"null"` / `"none"` / `"nil"` / `""` → `null`/`None`/`nil`
- Already-typed values from YAML/JSON pass through unchanged

## Coding Rules

1. **Spec compliance is mandatory.** Never add a language-specific public API without updating `spec/` first.
2. **Every implementation must pass the shared test fixtures** in `spec/fixtures/`.
3. **Follow language idioms.** Each implementation should feel native to its ecosystem (e.g., snake_case in Python/Ruby, camelCase in JS/Java, PascalCase in C#).
4. **Error messages must be clear and actionable.** Include the missing key name, source files checked, and a suggestion.
5. **Zero required dependencies where possible.** Optional heavy deps (YAML, TOML parsers) should degrade gracefully if not installed.

## Build & Test Commands

| Language | Build | Test | Lint |
|---|---|---|---|
| Python | `pip install -e ".[dev]"` | `pytest` | `ruff check . && ruff format --check .` |
| JavaScript | `pnpm install && pnpm build` | `pnpm test` | `pnpm lint && pnpm typecheck` |
| Go | `go build ./...` | `go test -race ./...` | `gofmt -l . && go vet ./...` |
| Rust | `cargo build` | `cargo test` | `cargo fmt --check && cargo clippy -- -D warnings` |
| Java | `./gradlew build` | `./gradlew test` | — |
| Ruby | `bundle install` | `bundle exec rspec` | `bundle exec rubocop` |
| PHP | `composer install` | `vendor/bin/phpunit` | `vendor/bin/phpstan analyse` |
| .NET | `dotnet build` | `dotnet test` | `dotnet format --verify-no-changes` |

## Commit Format

Use conventional commits: `<type>(<scope>): <description>`

Scopes: `python`, `js`, `go`, `rust`, `java`, `ruby`, `php`, `dotnet`, `spec`, `ci`, `docs`

## PR Rules

- One language per PR (unless it's a spec change)
- All CI checks must pass
- Must include tests (especially spec conformance tests)
- Update `CHANGELOG.md` in the affected `langs/<lang>/` directory
