---
applyTo: "langs/java/**"
---

# Java Implementation — Copilot Instructions

## Build System
- **Build tool:** Gradle (Kotlin DSL)
- **Java version:** >=11, tested on 11/17/21
- **Package:** `io.dotlyte:dotlyte` (Maven Central)

## Conventions
- **Test framework:** JUnit 5
- **Style:** Standard Java conventions
- **Javadoc:** Required on all public classes and methods

## Code Style
- Use `camelCase` for methods and variables
- Use `PascalCase` for classes and interfaces
- Use `UPPER_SNAKE_CASE` for constants
- Package: `io.dotlyte`
- Never return `null` from public API — use `Optional<T>` or throw `DotlyteException`
- Prefer `final` for parameters and local variables

## Architecture
- `src/main/java/io/dotlyte/Dotlyte.java` — Public API: `Dotlyte.load()`
- `src/main/java/io/dotlyte/Config.java` — Config object with `get()`, `require()`
- `src/main/java/io/dotlyte/Loader.java` — Main orchestrator
- `src/main/java/io/dotlyte/Coercion.java` — Type coercion engine
- `src/main/java/io/dotlyte/parsers/` — Parser interface + implementations
- `src/main/java/io/dotlyte/DotlyteException.java` — Runtime exception

## Commands
```bash
cd langs/java
./gradlew build
./gradlew test
./gradlew javadoc
```

## Dependencies
- `org.yaml:snakeyaml` — YAML parsing
- `com.google.code.gson:gson` — JSON parsing (or stdlib in Java 11+)
- TOML: optional dependency
