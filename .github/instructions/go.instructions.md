---
applyTo: "langs/go/**"
---

# Go Implementation — Copilot Instructions

## Build System
- **Module:** `github.com/dotlyte-io/dotlyte/langs/go`
- **Go version:** >=1.21
- **Layout:** Flat package layout (no `src/` directory) — Go convention

## Conventions
- **Formatter:** `gofmt` (enforced by CI)
- **Linter:** `go vet` + `golangci-lint` (recommended)
- **Test framework:** `testing` (stdlib)
- **Documentation:** GoDoc comments on all exported symbols

## Code Style
- Use `PascalCase` for exported names, `camelCase` for unexported
- Exported function: `Load()`, `NewConfig()`, not `load()`, `newConfig()`
- Return `(value, error)` — never panic in library code
- Prefer table-driven tests
- Group imports: stdlib, external, internal

## Architecture
- `dotlyte.go` — Public API: `Load()`, `LoadWith(options)`, `Config` struct
- `loader.go` — Main orchestrator
- `config.go` — Config methods: `GetString()`, `GetInt()`, `GetBool()`, `Get()`, `Require()`
- `coercion.go` — Type coercion engine
- `parser_env.go` — .env file parser
- `parser_yaml.go` — YAML parser
- `parser_json.go` — JSON parser
- `parser_toml.go` — TOML parser

## Commands
```bash
cd langs/go
go build ./...
go test -race -coverprofile=coverage.out ./...
gofmt -l .
go vet ./...
```

## Dependencies
- `gopkg.in/yaml.v3` — YAML parsing
- `github.com/BurntSushi/toml` — TOML parsing
- JSON: stdlib `encoding/json`
