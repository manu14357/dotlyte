# DOTLYTE — AI Agent Orientation

## What is this repo?

DOTLYTE is a cross-language configuration loading library. `load()` loads `.env`, YAML, JSON, TOML, and environment variables with automatic type coercion and layered priority merging.

## Architecture

- `spec/` — **Source of truth.** All API contracts, type coercion rules, priority rules, and shared test fixtures live here.
- `langs/<language>/` — Language-specific implementations. Each is an independently versioned package.
- `.github/` — CI workflows (one per language), Copilot instructions, issue/PR templates.

## Key Rules

1. The spec governs all implementations. Change the spec first, then update implementations.
2. All implementations must pass shared test fixtures in `spec/fixtures/`.
3. Each language uses its ecosystem's idiomatic patterns (naming, error handling, project layout).
4. Conventional commits required: `<type>(<scope>): <description>`.

## Quick Commands

| Language | Test | Lint |
|---|---|---|
| Python | `cd langs/python && pytest` | `ruff check . && ruff format --check .` |
| JS/TS | `cd langs/javascript && pnpm test` | `pnpm lint && pnpm typecheck` |
| Go | `cd langs/go && go test ./...` | `gofmt -l . && go vet ./...` |
| Rust | `cd langs/rust && cargo test` | `cargo fmt --check && cargo clippy` |
| Java | `cd langs/java && ./gradlew test` | — |
| Ruby | `cd langs/ruby && bundle exec rspec` | `bundle exec rubocop` |
| PHP | `cd langs/php && vendor/bin/phpunit` | `vendor/bin/phpstan analyse` |
| .NET | `cd langs/dotnet && dotnet test` | `dotnet format --verify-no-changes` |
