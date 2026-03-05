# dotlyte — Rust

The universal `.env` and configuration library for Rust.

## Installation

```bash
cargo add dotlyte
```

## Quick Start

```rust
use dotlyte::load;

fn main() {
    let config = load(None).unwrap();
    let port: i64 = config.get("port").unwrap_or(3000);
    let host = config.get_str("database.host").unwrap_or("localhost");
    println!("{}:{}", host, port);
}
```

## v0.1.2 Features

### Typed Config

Define field schemas with types, constraints, and defaults:

```rust
use std::collections::HashMap;
use dotlyte::typed::{create_typed_config, FieldDescriptor, FieldType};
use serde_json::Value;

let mut schema = HashMap::new();
schema.insert("PORT".to_string(), FieldDescriptor {
    field_type: FieldType::Integer,
    required: true,
    default_value: Some(Value::Number(3000.into())),
    min: Some(1.0),
    max: Some(65535.0),
    ..Default::default()
});

let config = create_typed_config(&schema, None).unwrap();
```

### Boundary Config

Enforce server/client boundaries on configuration access:

```rust
use dotlyte::boundaries::BoundaryConfig;

let bc = BoundaryConfig::new(data, server_keys, client_keys, shared_keys);
let server_config = bc.server_only();
let client_config = bc.client_only();
```

### Workspace / Monorepo Support

Load configuration for all packages in a monorepo:

```rust
use dotlyte::workspace::{find_monorepo_root, load_workspace, WorkspaceOptions};

let info = find_monorepo_root(None).unwrap();
println!("Root: {}, Type: {}", info.root, info.monorepo_type);

let configs = load_workspace(WorkspaceOptions::default()).unwrap();
```

### Enhanced Encryption

Key rotation and vault-style encrypt/decrypt (requires `encryption` feature):

```rust
use dotlyte::encryption::{rotate_keys, encrypt_vault, decrypt_vault};
```

### Enhanced Masking

Pattern-based sensitive key detection:

```rust
use dotlyte::masking::{compile_patterns, build_sensitive_set_with_patterns, check_sensitive_access};
```

## Features

- `yaml` — YAML file support via serde_yaml (enabled by default)
- `toml-support` — TOML file support via toml crate (enabled by default)
- `encryption` — AES-256-GCM encryption support

Disable defaults for minimal builds: `dotlyte = { version = "0.1.2", default-features = false }`

## License

[MIT](../../LICENSE)
