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

## Features

- `yaml` — YAML file support via serde_yaml (enabled by default)
- `toml-support` — TOML file support via toml crate (enabled by default)

Disable defaults for minimal builds: `dotlyte = { version = "0.1.1", default-features = false }`

## License

[MIT](../../LICENSE)
