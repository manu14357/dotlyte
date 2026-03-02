# DOTLYTE Priority Specification

**Spec Version:** 1.0.0-alpha

DOTLYTE uses **layered priority** — the same mental model as CSS specificity. Every config source is a layer. When the same key exists in multiple layers, the higher-priority layer wins.

---

## Default Priority Order

From **highest** (wins) to **lowest** (overridden):

| Priority | Source | Example |
|---|---|---|
| 1 (highest) | Environment variables | `PORT=8080` in `os.environ` / `process.env` |
| 2 | `.env.local` | Local overrides (never committed) |
| 3 | `.env.{env}` | Environment-specific: `.env.production` |
| 4 | `.env` | Base dotenv file |
| 5 | `config.{env}.yaml` / `.json` | Environment-specific config |
| 6 | `config.yaml` / `config.json` | Base config files |
| 7 | `config.{env}.toml` | Environment-specific TOML |
| 8 | `config.toml` | Base TOML config |
| 9 (lowest) | Hardcoded defaults | `defaults` option in `load()` |

---

## Merge Strategy

### Shallow Keys

For simple (non-nested) keys, higher priority wins entirely:

```
# .env:          PORT=3000
# env var:       PORT=8080
# Result:        PORT=8080  (env var wins)
```

### Nested/Deep Keys

For nested structures, DOTLYTE performs a **deep merge**:

```yaml
# config.yaml (priority 6):
database:
  host: localhost
  port: 5432
  name: mydb
```

```
# .env (priority 4):
DATABASE_HOST=production-db.example.com
```

```
# Result (merged):
database:
  host: production-db.example.com   ← from .env (higher priority)
  port: 5432                         ← from config.yaml (only source)
  name: mydb                         ← from config.yaml (only source)
```

**Rule:** Deep merge combines nested objects. Individual leaf keys are replaced (not merged) when they conflict.

---

## Prefix Mapping

When a `prefix` is specified, environment variables are mapped to nested keys by converting `_` to `.` after stripping the prefix:

| Env Var | Prefix | Resulting Key |
|---|---|---|
| `APP_PORT` | `APP` | `port` |
| `APP_DB_HOST` | `APP` | `db.host` |
| `APP_DB_PORT` | `APP` | `db.port` |
| `MYAPP_CACHE_TTL` | `MYAPP` | `cache.ttl` |

**Process:**
1. Filter environment variables that start with `{PREFIX}_`
2. Remove the `{PREFIX}_` prefix
3. Convert remaining `_` to `.` for nesting
4. Lowercase the key
5. Apply type coercion to the value

---

## Custom Source Order

The `sources` option lets users customize priority:

```python
config = load(sources=["defaults", "yaml", "dotenv", "env"])
# Now: defaults < yaml < dotenv < env (left to right, later = higher priority)
```

Valid source identifiers:
- `"env"` — Environment variables
- `"dotenv"` — `.env` files
- `"yaml"` — YAML config files
- `"json"` — JSON config files
- `"toml"` — TOML config files
- `"defaults"` — Hardcoded defaults

---

## Environment-Specific Loading

When the `env` option is set, additional files are loaded:

```python
config = load(env="production")
```

This loads (in addition to base files):
- `.env.production`
- `config.production.yaml`
- `config.production.json`
- `config.production.toml`

Environment-specific files have higher priority than their base counterparts:
- `config.production.yaml` overrides `config.yaml`
- `.env.production` overrides `.env`

---

## Conflict Resolution Examples

### Example 1: Same key in multiple sources

```
# defaults:     port = 3000
# config.yaml:  port: 5000
# .env:         PORT=4000
# env var:      PORT=8080
# Result:       port = 8080  (env var wins)
```

### Example 2: Nested override

```
# config.yaml:
#   database:
#     host: localhost
#     port: 5432
#
# env var: DATABASE_HOST=prod-db.example.com  (with prefix mapping)
#
# Result:
#   database:
#     host: prod-db.example.com  (env var wins for this key)
#     port: 5432                  (untouched — only in yaml)
```

### Example 3: Environment-specific override

```
# config.yaml:            port: 3000, debug: true
# config.production.yaml: debug: false
# env=production
#
# Result: port = 3000 (from base), debug = false (from production override)
```
