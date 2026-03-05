# dotlyte — Ruby

The universal `.env` and configuration library for Ruby.

## Installation

```bash
gem install dotlyte
```

Or in your Gemfile:

```ruby
gem "dotlyte"
```

## Quick Start

```ruby
require "dotlyte"

config = Dotlyte.load
config.port           # automatically Integer
config.debug          # automatically Boolean
config.database.host  # dot-notation via method_missing
```

## TypedConfig

Schema-driven typed configuration from environment variables:

```ruby
config = Dotlyte::TypedConfig.create(
  "PORT"      => { type: "integer", required: true, min: 1, max: 65535 },
  "DEBUG"     => { type: "boolean", default: false },
  "LOG_LEVEL" => { type: "string", enum: %w[debug info warn error], default: "info" }
)
config["PORT"]  #=> 8080
```

## BoundaryConfig

Separate server-only, client-only, and shared configuration:

```ruby
boundary = Dotlyte::BoundaryConfig.new(
  data,
  server_keys: %w[DB_PASSWORD API_SECRET],
  client_keys: %w[APP_NAME THEME],
  shared_keys: %w[LOG_LEVEL]
)
boundary.server_only  #=> { "DB_PASSWORD" => "...", ... }
boundary.client_only  #=> { "APP_NAME" => "...", ... }
```

## Encryption

AES-256-GCM encryption with SOPS-style format, key rotation, and vault operations:

```ruby
key = Dotlyte::Encryption.generate_key
encrypted = Dotlyte::Encryption.encrypt_value("secret", key)

# Vault-style bulk encryption
vault = Dotlyte::Encryption.encrypt_vault(data, key: key, sensitive_keys: ["password"])
plain = Dotlyte::Encryption.decrypt_vault(vault, key: key)

# Key rotation
rotated = Dotlyte::Encryption.rotate_keys(vault, old_key: old_key, new_key: new_key)
```

## Workspace / Monorepo Support

Auto-detect monorepo roots and load per-package configuration:

```ruby
info = Dotlyte::Workspace.find_monorepo_root
configs = Dotlyte::Workspace.load_workspace(
  root: info.root,
  packages: %w[packages/api packages/web]
)
```

## CLI

```bash
dotlyte check             # Validate configuration
dotlyte diff --env1 dev --env2 prod  # Compare environments
dotlyte encrypt --value "secret"     # Encrypt a value
dotlyte doctor            # Diagnose issues
dotlyte init              # Create starter .env
```

## License

[MIT](../../LICENSE)
