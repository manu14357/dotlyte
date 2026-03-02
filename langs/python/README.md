# dotlyte — Python

The universal `.env` and configuration library for Python.

## Installation

```bash
pip install dotlyte
```

## Quick Start

```python
from dotlyte import load

config = load()

config.port           # automatically int
config.debug          # automatically bool
config.database.host  # dot-notation access
```

## Features

- **Zero-config start** — `load()` with no arguments just works
- `.env` file loading — auto-detects `.env`, `.env.local`, `.env.{env}`
- YAML, JSON, TOML support — `config.yaml`, `config.json`, `config.toml`
- **Layered priority** — env vars > `.env` > YAML > JSON > TOML > defaults
- **Type coercion** — `"true"` → `True`, `"8080"` → `8080`, `"a,b,c"` → `["a", "b", "c"]`
- **Dot-notation access** — `config.database.host`
- **Safe access** — `config.get("key", default)`
- **Required access** — `config.require("key")` throws if missing
- **Prefix stripping** — `APP_DB_HOST` → `config.db.host`

## Advanced Usage

```python
config = load(
    files=["config.yaml", ".env.production"],
    prefix="APP",
    defaults={"port": 3000, "debug": False},
    env="production",
)
```

## API

### `load(**options) → Config`

| Option | Type | Description |
|---|---|---|
| `files` | `list[str]` | Explicit files to load |
| `prefix` | `str` | Strip env var prefix |
| `defaults` | `dict` | Default values (lowest priority) |
| `sources` | `list[str]` | Custom source order |
| `env` | `str` | Environment name |

### `Config`

| Method | Description |
|---|---|
| `config.key` | Dot-notation access |
| `config.get(key, default)` | Safe access with fallback |
| `config.require(key)` | Throws `DotlyteError` if missing |
| `config.to_dict()` | Convert to plain dict |

## License

[MIT](../../LICENSE)
