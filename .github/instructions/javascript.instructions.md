---
applyTo: "langs/javascript/**"
---

# JavaScript/TypeScript Implementation — Copilot Instructions

## Build System
- **Package manager:** pnpm
- **Bundler:** tsup (ESM + CJS dual output with .d.ts)
- **Language:** TypeScript (strict mode)
- **Package:** `npm install dotlyte`

## Conventions
- **Node.js version:** >=18
- **Module:** ESM-first (`"type": "module"`) with CJS compatibility
- **Linter:** ESLint v9 (flat config)
- **Test framework:** vitest
- **Type checking:** `tsc --noEmit`

## Code Style
- Use `camelCase` for functions and variables
- Use `PascalCase` for classes and interfaces
- Use `UPPER_SNAKE_CASE` for constants
- JSDoc comments on all public exports
- Prefer `const` over `let`; never use `var`

## Architecture
- `src/index.ts` — Public API: `load()`, `Config`, `DotlyteError`
- `src/loader.ts` — Main orchestrator
- `src/config.ts` — Config class with dot-notation, `get()`, `require()`
- `src/coercion.ts` — Type coercion engine
- `src/parsers/` — One module per source type (env, yaml, json, toml)

## Exports
```json
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  }
}
```

## Commands
```bash
cd langs/javascript
pnpm install
pnpm build                      # Build with tsup
pnpm test                       # Run tests with vitest
pnpm lint                       # ESLint
pnpm typecheck                  # tsc --noEmit
```

## Dependencies
- Runtime: zero (parse .env and JSON natively; YAML/TOML optional)
- Dev: `tsup`, `typescript`, `vitest`, `eslint`, `@typescript-eslint/eslint-plugin`
