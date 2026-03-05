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

## Typed Config

Validate environment variables at import time with full type coercion:

```python
from dotlyte import create_typed_config

env = create_typed_config({
    "DATABASE_URL": {"type": "url", "required": True},
    "PORT": {"type": "integer", "default": 3000},
    "DEBUG": {"type": "boolean", "default": False},
    "LOG_LEVEL": {
        "type": "string",
        "enum": ["debug", "info", "warn", "error"],
        "default": "info",
    },
})

env["PORT"]       # 3000 (int)
env["DEBUG"]      # False (bool)
```

### Sectioned Schemas

Separate server/client variables for safety:

```python
env = create_typed_config({
    "server": {
        "DATABASE_URL": {"type": "string", "required": True, "sensitive": True},
    },
    "client": {
        "NEXT_PUBLIC_APP_URL": {"type": "url"},
    },
    "shared": {
        "NODE_ENV": {"type": "string", "enum": ["development", "test", "production"]},
    },
    "client_prefix": "NEXT_PUBLIC_",
})
```

## Boundary Enforcement

Prevent server-only variables from leaking to client contexts:

```python
from dotlyte import create_boundary_proxy

proxy = create_boundary_proxy(
    data=config.to_dict(),
    server_keys={"DATABASE_URL", "SECRET_KEY"},
    client_keys={"APP_NAME"},
    shared_keys={"NODE_ENV"},
)

proxy.server_only()  # {"DATABASE_URL": ..., "SECRET_KEY": ..., "NODE_ENV": ...}
proxy.client_only()  # {"APP_NAME": ..., "NODE_ENV": ...}
```

## Enhanced Encryption

Key rotation and vault support:

```python
from dotlyte import rotate_keys, encrypt_vault, decrypt_vault

# Rotate encryption keys
rotated = rotate_keys(encrypted_data, old_key="old-pass", new_key="new-pass")

# Encrypt/decrypt entire dictionaries
encrypted = encrypt_vault({"API_KEY": "secret123"}, key="my-passphrase")
decrypted = decrypt_vault(encrypted, key="my-passphrase")
```

## Workspace / Monorepo Support

Load config across monorepo packages:

```python
from dotlyte import load_workspace, find_monorepo_root

info = find_monorepo_root()  # Detects pnpm, turbo, nx, lerna, npm/yarn workspaces
config = load_workspace(packages=["apps/web"], prefix="APP")
```

## CLI

```bash
pip install dotlyte

dotlyte check              # Validate .env against schema
dotlyte diff .env .env.prod  # Compare two env files
dotlyte generate-types     # Generate Python TypedDict from .env
dotlyte encrypt .env       # Encrypt sensitive values
dotlyte doctor             # Diagnose config issues
dotlyte init               # Create starter files
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
