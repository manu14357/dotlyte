# dotlyte — Go

The universal `.env` and configuration library for Go.

## Installation

```bash
go get github.com/dotlyte-io/dotlyte/langs/go
```

## Quick Start

```go
package main

import (
    "fmt"
    dotlyte "github.com/dotlyte-io/dotlyte/langs/go"
)

func main() {
    config, err := dotlyte.Load(nil)
    if err != nil {
        panic(err)
    }

    fmt.Println(config.Get("port", 3000))
    fmt.Println(config.Get("database.host", "localhost"))
}
```

## API

### `Load(opts *LoadOptions) (*Config, error)`

Loads configuration from all sources with layered priority merging.

### `Config.Get(key string, default ...any) any`

### `Config.Require(key string) (any, error)`

### `Config.Has(key string) bool`

### `Config.ToMap() map[string]any`

---

## Typed Config

Runtime-validated configuration with schema-driven field descriptors.

```go
schema := map[string]dotlyte.FieldDescriptor{
    "PORT": {Type: "number", Default: 3000, Doc: "Server port"},
    "DEBUG": {Type: "boolean", Default: false},
    "LOG_LEVEL": {Type: "string", Enum: []string{"debug", "info", "warn", "error"}},
}

config, err := dotlyte.CreateTypedConfig(schema, nil)
// config["PORT"] → 3000 (int), config["DEBUG"] → false (bool)
```

### Sectioned Config

Split configuration into server, client, and shared sections with boundary enforcement:

```go
server := map[string]dotlyte.FieldDescriptor{
    "DB_URL": {Type: "string", Required: true, Sensitive: true},
}
client := map[string]dotlyte.FieldDescriptor{
    "API_URL": {Type: "string", Required: true},
}
shared := map[string]dotlyte.FieldDescriptor{
    "NODE_ENV": {Type: "string", Default: "development"},
}

bc, err := dotlyte.CreateSectionedConfig(server, client, shared, "NEXT_PUBLIC_", nil)
// bc.ServerOnly() → only server + shared keys
// bc.ClientOnly() → only client + shared keys
```

---

## Boundary Enforcement

Restrict access to server-only, client-only, or shared configuration keys:

```go
bc := dotlyte.NewBoundaryConfig(data, serverKeys, clientKeys, sharedKeys, func(key, ctx string) {
    log.Printf("audit: %s accessed in %s context", key, ctx)
})

val, err := bc.Get("DB_URL")      // triggers audit callback for server keys
serverView := bc.ServerOnly()      // server + shared keys only
clientView := bc.ClientOnly()      // client + shared keys only
```

---

## Enhanced Encryption

### Key Rotation

```go
rotated, err := dotlyte.RotateKeys(encryptedData, oldKey, newKey)
```

### Multi-Key Fallback

```go
plaintext, err := dotlyte.ResolveKeyWithFallback([][]byte{newKey, oldKey}, encrypted)
```

### Vault Encryption

Encrypt only sensitive keys in a map:

```go
vault, err := dotlyte.EncryptVault(data, key, map[string]bool{"SECRET": true})
decrypted, err := dotlyte.DecryptVault(vault, key)
```

---

## Enhanced Masking

### Pattern-Based Sensitive Detection

```go
patterns, err := dotlyte.CompilePatterns([]string{"*_SECRET", "DB_*"})
sensitive, err := dotlyte.BuildSensitiveSetWithPatterns(keys, []string{"*_KEY"}, schemaSensitive)
```

### Audit Wrapper

```go
wrapper := dotlyte.CreateAuditWrapper(data, sensitiveKeys, func(key, ctx string) {
    log.Printf("accessed: %s (%s)", key, ctx)
})
val := wrapper.Get("SECRET_KEY") // triggers audit callback
```

---

## Workspace / Monorepo

### Auto-Detect Monorepo Root

```go
info, err := dotlyte.FindMonorepoRoot(".")
// info.Root = "/path/to/repo", info.Type = "pnpm", info.Packages = [...]
```

### Load Workspace Config

```go
config, err := dotlyte.LoadWorkspace(&dotlyte.WorkspaceOptions{
    Root:     "/path/to/monorepo",
    Packages: []string{"packages/api"},
    Prefix:   "APP_",
})
```

### Get Shared Env

```go
shared, err := dotlyte.GetSharedEnv("/path/to/root", "APP_")
// "APP_DB_HOST" → shared["db.host"]
```

---

## CLI

Install: `go install github.com/dotlyte-io/dotlyte/langs/go/cmd/dotlyte@latest`

```bash
dotlyte check                         # Validate config against schema
dotlyte diff .env .env.production     # Compare two env files
dotlyte generate-types                # Generate Go struct from config
dotlyte encrypt -key mykey .env       # Encrypt values in .env
dotlyte encrypt -key mykey -decrypt .env  # Decrypt values
dotlyte doctor                        # Diagnose config issues
dotlyte init                          # Create starter .env.example and .gitignore
```

## License

[MIT](../../LICENSE)
