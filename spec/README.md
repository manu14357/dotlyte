# DOTLYTE Specification

This directory is the **single source of truth** for all DOTLYTE implementations.

## Contents

| File | Description |
|---|---|
| [api.md](api.md) | Universal API specification — function signatures, options, return types |
| [type-coercion.md](type-coercion.md) | Type coercion rules with all edge cases |
| [priority.md](priority.md) | Layer priority order for config sources |
| [fixtures/](fixtures/) | Shared test fixtures all implementations must pass |
| [schema.json](schema.json) | JSON Schema for expected test output format |

## Spec-Driven Development

1. **All behavior is defined here first** — implementations follow
2. **Shared test fixtures** guarantee cross-language consistency
3. **Any API change** must start as a PR to this directory
4. **Breaking changes** require a spec version bump

## Spec Version

Current: **1.0.0-alpha**

The spec version is independent of individual package versions. All packages implementing Spec v1.x are interchangeable in behavior.

## How to Propose Changes

1. Open an issue with the `spec` label describing the proposed change
2. Submit a PR modifying the relevant spec document(s)
3. Add or update test fixtures in `fixtures/`
4. Once merged, each language implementation updates to match
