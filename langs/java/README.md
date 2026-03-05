# dotlyte — Java

The universal `.env` and configuration library for Java.

## Installation (Gradle)

```kotlin
implementation("dev.dotlyte:dotlyte:0.1.2")
```

## Quick Start

```java
import dev.dotlyte.Dotlyte;
import dev.dotlyte.Config;

Config config = Dotlyte.load();

int port = config.getInt("port", 3000);
String host = config.getString("database.host", "localhost");
boolean debug = config.getBoolean("debug", false);
```

## TypedConfig

Define a schema and load type-safe configuration from environment variables:

```java
import dev.dotlyte.TypedConfig;
import dev.dotlyte.TypedConfig.FieldDescriptor;
import java.util.*;

Map<String, FieldDescriptor> schema = new LinkedHashMap<>();
schema.put("PORT", new FieldDescriptor().type("integer").required(true).min(1024).max(65535));
schema.put("DEBUG", new FieldDescriptor().type("boolean").defaultValue(false));
schema.put("ENV", new FieldDescriptor().type("string").enumValues(List.of("dev", "staging", "prod")));

Map<String, Object> config = TypedConfig.create(schema);
int port = (int) config.get("PORT");
```

## BoundaryConfig

Partition configuration into server, client, and shared boundaries:

```java
import dev.dotlyte.BoundaryConfig;
import java.util.*;

BoundaryConfig bc = new BoundaryConfig(
    data,
    Set.of("DB_PASSWORD", "API_SECRET"),   // server-only
    Set.of("APP_NAME", "THEME"),            // client-only
    Set.of("LOG_LEVEL")                     // shared
);

Map<String, Object> clientSafe = bc.clientOnly();
```

## Workspace / Monorepo

Detect monorepo tooling and load per-package configuration:

```java
import dev.dotlyte.Workspace;
import dev.dotlyte.Workspace.MonorepoInfo;

MonorepoInfo info = Workspace.findMonorepoRoot(".");
System.out.println(info.getType());     // "pnpm", "turbo", "nx", etc.
System.out.println(info.getPackages()); // ["packages/api", "packages/web"]
```

## Encryption

Key rotation and vault-style encryption:

```java
import dev.dotlyte.Encryption;
import java.util.*;

// Rotate keys
Map<String, String> rotated = Encryption.rotateKeys(encryptedData, oldKey, newKey);

// Vault encrypt/decrypt
Map<String, String> vault = Encryption.encryptVault(data, key, Set.of("SECRET"));
Map<String, Object> decrypted = Encryption.decryptVault(vault, key);
```

## License

[MIT](../../LICENSE)
