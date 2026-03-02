# Contributing to DOTLYTE

Thank you for your interest in contributing to DOTLYTE! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Spec-First Workflow](#spec-first-workflow)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Conventional Commits](#conventional-commits)
- [Pull Request Process](#pull-request-process)
- [Adding a New Language](#adding-a-new-language)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

---

## Spec-First Workflow

DOTLYTE is a **spec-driven** project. The `spec/` directory is the single source of truth for all implementations.

**The workflow:**

1. **Propose API changes as spec PRs first** — Before changing any implementation, propose the change in `spec/`
2. **Add test fixtures** — Include expected inputs and outputs in `spec/fixtures/`
3. **Implement** — Each language implements to pass the new fixtures
4. **Verify** — CI validates conformance across all languages

> **Rule:** Never add a language-specific public API without spec approval. All public APIs must be consistent across languages.

---

## How to Contribute

### Bug Reports

- Use the [Bug Report template](https://github.com/dotlyte-io/dotlyte/issues/new?template=bug_report.yml)
- Include the language, version, and minimal reproduction steps

### Feature Requests

- Use the [Feature Request template](https://github.com/dotlyte-io/dotlyte/issues/new?template=feature_request.yml)
- Explain the use case and how it fits the universal API

### Code Contributions

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes following our conventions
4. Ensure all tests pass (including shared spec fixtures)
5. Submit a pull request

---

## Development Setup

Each language has its own development setup. Navigate to the relevant directory:

| Language | Directory | Setup | Test | Lint |
|---|---|---|---|---|
| Python | `langs/python/` | `pip install -e ".[dev]"` | `pytest` | `ruff check . && ruff format --check .` |
| JavaScript | `langs/javascript/` | `pnpm install` | `pnpm test` | `pnpm lint` |
| Go | `langs/go/` | `go mod download` | `go test ./...` | `gofmt -l .` |
| Rust | `langs/rust/` | `cargo build` | `cargo test` | `cargo fmt --check && cargo clippy` |
| Java | `langs/java/` | `./gradlew build` | `./gradlew test` | — |
| Ruby | `langs/ruby/` | `bundle install` | `bundle exec rspec` | `bundle exec rubocop` |
| PHP | `langs/php/` | `composer install` | `vendor/bin/phpunit` | `vendor/bin/phpstan analyse` |
| .NET | `langs/dotnet/` | `dotnet build` | `dotnet test` | — |

### Shared Spec Fixtures

Every implementation must pass the shared test fixtures in `spec/fixtures/`. Each fixture directory contains:

- Input files (`.env`, `config.yaml`, `config.json`, etc.)
- `expected.json` — The exact output every language must produce

Your language's test suite should include a **spec conformance test** that reads these fixtures and validates the output.

---

## Conventional Commits

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>
```

### Types

| Type | Description |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, no logic change) |
| `refactor` | Code restructuring (no feature/fix) |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `ci` | CI/CD changes |
| `chore` | Maintenance, dependencies, tooling |

### Scopes

Use the language or area as the scope:

| Scope | When |
|---|---|
| `python` | Changes in `langs/python/` |
| `js` | Changes in `langs/javascript/` |
| `go` | Changes in `langs/go/` |
| `rust` | Changes in `langs/rust/` |
| `java` | Changes in `langs/java/` |
| `ruby` | Changes in `langs/ruby/` |
| `php` | Changes in `langs/php/` |
| `dotnet` | Changes in `langs/dotnet/` |
| `spec` | Changes in `spec/` |
| `ci` | Changes in `.github/workflows/` |
| `docs` | Changes in `docs/` or documentation |

### Examples

```
feat(python): add TOML parser support
fix(go): correct type coercion for empty strings
docs(spec): clarify priority layering for CLI args
ci(rust): add nightly toolchain to matrix
test(js): add spec conformance tests for nested configs
chore: update .editorconfig for PHP indent rules
feat(spec)!: change default priority order  ← breaking change
```

---

## Pull Request Process

1. **One language per PR** — Keep PRs focused on a single language or the spec
2. **Title follows conventional commits** — e.g., `feat(python): add JSON parser`
3. **Fill out the PR template** completely
4. **All CI checks must pass** before review
5. **Checklist:**
   - [ ] Follows the spec in `spec/`
   - [ ] Tests pass (including shared spec fixtures)
   - [ ] Linter passes
   - [ ] Commit messages follow conventional commits
   - [ ] Updated `CHANGELOG.md` in the relevant `langs/<lang>/`

---

## Adding a New Language

Want to add DOTLYTE support for a new language? Here's how:

### 1. Read the Spec

Read everything in `spec/` — especially:
- `spec/api.md` — The exact API your implementation must expose
- `spec/type-coercion.md` — Type coercion rules with all edge cases
- `spec/priority.md` — Layer priority order

### 2. Scaffold the Implementation

Create a new directory under `langs/<language>/` with:
- Package manifest (e.g., `pyproject.toml`, `package.json`, `Cargo.toml`)
- Source code implementing the spec
- Tests including **spec conformance tests** that read from `spec/fixtures/`
- `README.md` with language-specific install and usage instructions
- `CHANGELOG.md`

### 3. Pass the Spec Fixtures

Your test suite must:
- Read each fixture from `spec/fixtures/`
- Load config using your implementation
- Assert the output matches `expected.json` exactly

### 4. Submit the PR

- Title: `feat(<language>): initial implementation`
- Include a CI workflow: `.github/workflows/ci-<language>.yml`
- Add a Copilot instruction: `.github/instructions/<language>.instructions.md`

---

## Questions?

Open a [discussion](https://github.com/dotlyte-io/dotlyte/discussions) or reach out to the maintainers.

Thank you for helping make configuration loading universal! 🌍
