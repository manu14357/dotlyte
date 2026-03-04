# dotlyte — Java

The universal `.env` and configuration library for Java.

## Installation (Gradle)

```kotlin
implementation("dev.dotlyte:dotlyte:0.1.1")
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

## License

[MIT](../../LICENSE)
