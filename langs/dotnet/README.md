# dotlyte — .NET

The universal `.env` and configuration library for .NET.

## Installation

```bash
dotnet add package Dotlyte
```

## Quick Start

```csharp
using Dotlyte;

var config = DotlyteLoader.Load();
config.Get<int>("port");          // automatically typed
config.Get<bool>("debug");        // automatically typed
config.Get("database.host");      // dot-notation access
```

## Typed Config

Define a schema and create a typed configuration dictionary from environment variables:

```csharp
var schema = new Dictionary<string, FieldDescriptor>
{
    ["PORT"] = new() { Type = "integer", Required = true, Min = 1, Max = 65535 },
    ["DEBUG"] = new() { Type = "boolean", Default = false },
    ["LOG_LEVEL"] = new() { Type = "string", Enum = ["debug", "info", "warn", "error"] },
    ["DB_PASSWORD"] = new() { Type = "string", Required = true, Sensitive = true },
};

var config = TypedConfig.Create(schema, onSecretAccess: key =>
    Console.WriteLine($"Sensitive key accessed: {key}"));
```

## Boundary Config

Enforce server/client key isolation:

```csharp
var boundary = new BoundaryConfig(
    data,
    serverKeys: new HashSet<string> { "DB_PASSWORD", "SECRET_KEY" },
    clientKeys: new HashSet<string> { "API_URL", "APP_NAME" },
    sharedKeys: new HashSet<string> { "LOG_LEVEL" });

var serverData = boundary.ServerOnly();
var clientData = boundary.ClientOnly();
```

## Encryption

```csharp
var key = Encryption.GenerateKey();
var encrypted = Encryption.EncryptValue("secret", key);
var decrypted = Encryption.DecryptValue(encrypted, key);

// Vault operations
var vault = Encryption.EncryptVault(data, key);
var plain = Encryption.DecryptVault(vault, key);

// Key rotation
var rotated = Encryption.RotateKeys(vault, oldKey, newKey);
```

## Workspace / Monorepo

```csharp
var info = Workspace.FindMonorepoRoot();
// info.Root, info.Type, info.Packages

var shared = Workspace.GetSharedEnv(info.Root, prefix: "MYAPP_");
```

## License

[MIT](../../LICENSE)
