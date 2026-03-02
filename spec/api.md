# DOTLYTE API Specification

**Spec Version:** 1.0.0-alpha

This document defines the universal API that every DOTLYTE implementation MUST expose.

---

## Core Function: `load(options?)`

Loads configuration from all available sources, merges them by priority, applies type coercion, and returns a `Config` object.

### Signature (pseudocode)

```
load(options?: LoadOptions) → Config
```

### Parameters

`options` is an optional object/struct/dict with the following fields (all optional):

| Field | Type | Default | Description |
|---|---|---|---|
| `files` | `string[]` | `[]` | Explicit list of files to load. When empty, auto-discovers files in the current directory. |
| `prefix` | `string` | `""` | Environment variable prefix to strip. `"APP"` makes `APP_DB_HOST` available as `db.host`. |
| `defaults` | `map<string, any>` | `{}` | Default values. Lowest priority — overridden by everything else. |
| `sources` | `string[]` | `null` | Custom source order. Valid values: `"env"`, `"dotenv"`, `"yaml"`, `"json"`, `"toml"`, `"defaults"`. |
| `env` | `string` | `""` | Environment name. Loads `config.{env}.yaml`, `.env.{env}`, etc. in addition to base files. |

### Return Value

Returns a `Config` object (see below).

### Behavior

1. **Determine sources:** If `sources` is provided, use that order. Otherwise use the default priority stack.
2. **Load each source:**
   - Sources that don't exist are silently skipped (no error for missing files).
   - Parse errors in existing files MUST throw/return an error.
3. **Merge layers:** Later layers (higher priority) override earlier layers. Deep merge for nested objects.
4. **Strip prefix:** If `prefix` is set, strip it from environment variable keys and convert `_` separators to dot-notation nesting. `APP_DB_HOST` with prefix `"APP"` becomes `db.host`.
5. **Apply type coercion:** String values from `.env` files and environment variables are coerced to native types. Values from YAML/JSON that are already typed pass through unchanged. See [type-coercion.md](type-coercion.md).
6. **Return Config object.**

---

## Config Object

### Dot-Notation Access

```
config.port          → 8080 (int)
config.database.host → "localhost" (string)
config.debug         → true (bool)
```

Implementations should provide property/field access where the language supports it:
- **Python:** `__getattr__` on the Config class
- **JavaScript:** Proxy or plain object properties
- **Go:** Struct fields (via Unmarshal) or `GetString()`, `GetInt()`, etc.
- **Rust:** `get::<T>("key")`
- **Java:** `getString("key")`, `getInt("key")`, etc.
- **Ruby:** `method_missing`
- **PHP:** `__get()`
- **C#:** Indexer or dynamic properties

### `get(key, default?)`

Safe access with an optional fallback value.

```
config.get("port", 3000)           → 3000 (if port is not set)
config.get("database.host")        → null/None/nil (if not set, no default)
config.get("database.host", "localhost") → "localhost" (if not set)
```

**Behavior:**
- Supports dot-notation keys: `"database.host"` navigates nested config
- Returns the default if the key doesn't exist or the value is null
- NEVER throws/panics — always returns a value

### `require(key)`

Access a required configuration key. Throws/returns an error if missing.

```
config.require("DATABASE_URL")
```

**Behavior:**
- Supports dot-notation keys: `"database.host"`
- If the key exists and is not null, return the value
- If the key is missing or null, throw `DotlyteError` with a clear message:
  ```
  DotlyteError: Required config key 'DATABASE_URL' is missing.
  Checked sources: .env, config.yaml, environment variables.
  Set it in your .env file or as an environment variable.
  ```

---

## Error Type: `DotlyteError`

All implementations must define a custom error/exception type:

| Language | Type |
|---|---|
| Python | `class DotlyteError(Exception)` |
| JavaScript | `class DotlyteError extends Error` |
| Go | `type DotlyteError struct` implementing `error` |
| Rust | `enum DotlyteError` with `thiserror` |
| Java | `class DotlyteException extends RuntimeException` |
| Ruby | `class Dotlyte::Error < StandardError` |
| PHP | `class DotlyteException extends \RuntimeException` |
| C# | `class DotlyteException : Exception` |

### Error Categories

| Error | When |
|---|---|
| `MissingRequiredKey` | `require()` called for a key that doesn't exist |
| `ParseError` | A config file exists but contains invalid syntax |
| `FileError` | A file was explicitly requested (via `files` option) but doesn't exist |

---

## Auto-Discovery

When no `files` option is provided, DOTLYTE auto-discovers config files in the current working directory:

### Files checked (in order)

1. `.env`
2. `.env.local`
3. `.env.{env}` (if `env` option is set)
4. `config.yaml` / `config.yml`
5. `config.{env}.yaml` / `config.{env}.yml` (if `env` option is set)
6. `config.json`
7. `config.{env}.json` (if `env` option is set)
8. `config.toml`
9. `config.{env}.toml` (if `env` option is set)

Missing files are silently skipped. Only explicitly requested files (via `files` option) trigger an error when missing.

---

## Language-Specific Naming

Each implementation adapts the API to its language's idioms:

| Concept | Python | JavaScript | Go | Rust | Java | Ruby | PHP | C# |
|---|---|---|---|---|---|---|---|---|
| Load | `load()` | `load()` | `Load()` | `load()` | `Dotlyte.load()` | `Dotlyte.load` | `Dotlyte::load()` | `DotlyteConfig.Load()` |
| Config access | `config.key` | `config.key` | `cfg.GetString()` | `cfg.get::<T>()` | `config.getString()` | `config.key` | `$config->key` | `config["key"]` |
| Error type | `DotlyteError` | `DotlyteError` | `DotlyteError` | `DotlyteError` | `DotlyteException` | `Dotlyte::Error` | `DotlyteException` | `DotlyteException` |
