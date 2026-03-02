# DOTLYTE Type Coercion Specification

**Spec Version:** 1.0.0-alpha

Type coercion is DOTLYTE's hidden superpower. String values from `.env` files and environment variables are automatically converted to native types. Values from structured sources (YAML, JSON, TOML) that are already typed pass through unchanged.

---

## Rules

Coercion is applied **only to string values**. If a value is already a non-string type (e.g., an integer from YAML), it passes through unchanged.

### Null Values

| Input String | Output |
|---|---|
| `""` (empty string) | `null` / `None` / `nil` |
| `"null"` | `null` / `None` / `nil` |
| `"NULL"` | `null` / `None` / `nil` |
| `"none"` | `null` / `None` / `nil` |
| `"NONE"` | `null` / `None` / `nil` |
| `"nil"` | `null` / `None` / `nil` |
| `"NIL"` | `null` / `None` / `nil` |

**Case-insensitive matching.**

### Boolean Values

| Input String | Output |
|---|---|
| `"true"` | `true` |
| `"TRUE"` | `true` |
| `"True"` | `true` |
| `"yes"` | `true` |
| `"YES"` | `true` |
| `"1"` | `true` |
| `"on"` | `true` |
| `"ON"` | `true` |
| `"false"` | `false` |
| `"FALSE"` | `false` |
| `"False"` | `false` |
| `"no"` | `false` |
| `"NO"` | `false` |
| `"0"` | `false` |
| `"off"` | `false` |
| `"OFF"` | `false` |

**Case-insensitive matching.**

### Integer Values

| Input String | Output |
|---|---|
| `"8080"` | `8080` |
| `"-1"` | `-1` |
| `"0"` | `false` (boolean takes precedence) |
| `"1"` | `true` (boolean takes precedence) |
| `"42"` | `42` |
| `"007"` | `7` (leading zeros stripped) |

**Rule:** A string is an integer if it matches the regex `^-?\d+$` AND is not `"0"` or `"1"` (which are booleans).

### Float Values

| Input String | Output |
|---|---|
| `"3.14"` | `3.14` |
| `"-0.5"` | `-0.5` |
| `"1.0"` | `1.0` |
| `"0.0"` | `0.0` |

**Rule:** A string is a float if it matches the regex `^-?\d+\.\d+$`.

### List/Array Values

| Input String | Output |
|---|---|
| `"a,b,c"` | `["a", "b", "c"]` |
| `"1,2,3"` | `[1, 2, 3]` (each element is also coerced) |
| `"true,false"` | `[true, false]` |
| `"a, b, c"` | `["a", "b", "c"]` (whitespace trimmed) |
| `"single"` | `"single"` (no comma = not a list) |

**Rule:** A string containing at least one comma (`,`) is split into a list. Each element is trimmed of whitespace and recursively coerced.

### String Passthrough

Any string that doesn't match the above rules remains a string:

| Input | Output |
|---|---|
| `"hello world"` | `"hello world"` |
| `"localhost"` | `"localhost"` |
| `"https://example.com"` | `"https://example.com"` |
| `"/path/to/file"` | `"/path/to/file"` |

---

## Coercion Priority

When a string could match multiple rules, this priority applies:

1. **Null** — checked first (`""`, `"null"`, `"none"`, `"nil"`)
2. **Boolean** — `"true"`, `"false"`, `"yes"`, `"no"`, `"1"`, `"0"`, `"on"`, `"off"`
3. **Integer** — digits only (excluding `"0"` and `"1"` which are boolean)
4. **Float** — digits with exactly one decimal point
5. **List** — contains a comma
6. **String** — everything else (fallback)

---

## Structured Source Passthrough

Values from YAML, JSON, and TOML that are already typed are NOT coerced:

```yaml
# config.yaml
port: 8080        # Already int → stays int (not re-parsed as string)
debug: true       # Already bool → stays bool
tags:             # Already list → stays list
  - web
  - api
name: "42"        # Quoted string → stays string "42" (YAML preserves this)
```

**Rule:** Only values that arrive as strings (from `.env` files and environment variables) go through the coercion engine.

---

## Edge Cases

| Input | Output | Reason |
|---|---|---|
| `"  "` (whitespace only) | `null` | Trimmed to empty string → null |
| `"1.0.0"` | `"1.0.0"` | Multiple dots → not a float, stays string |
| `"1,2,"` | `[1, 2, ""]` → `[1, 2, null]` | Trailing comma creates empty element → null |
| `","` | `[null, null]` | Single comma splits into two empty strings → nulls |
| `"true,1,hello"` | `[true, true, "hello"]` | Each element coerced independently |
| `"  true  "` | `true` | Trimmed before coercion |
| `"TRUE"` | `true` | Case-insensitive |
| `"-0"` | `0` | Negative zero → integer 0 |
| `"1e5"` | `"1e5"` | Scientific notation stays string (not parsed as float) |
| `"Infinity"` | `"Infinity"` | Not a number — stays string |
| `"NaN"` | `"NaN"` | Not a number — stays string |
