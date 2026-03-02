---
applyTo: "langs/dotnet/**"
---

# .NET/C# Implementation — Copilot Instructions

## Build System
- **SDK:** .NET 6.0 / 8.0 (multi-target)
- **Package:** `Dotlyte` (NuGet)
- **Solution:** `Dotlyte.sln` at `langs/dotnet/`

## Conventions
- **Test framework:** xUnit
- **Nullable:** enabled (`<Nullable>enable</Nullable>`)
- **Implicit usings:** enabled
- **XML documentation:** required on all public members

## Code Style
- Use `PascalCase` for public members, methods, properties, classes
- Use `camelCase` for parameters and local variables
- Use `_camelCase` for private fields
- Namespace: `Dotlyte`
- Return `T` or throw `DotlyteException` — never return `null` without `T?`
- Use `record` types where appropriate

## Architecture
- `src/Dotlyte/DotlyteConfig.cs` — Public API: `DotlyteConfig.Load()`
- `src/Dotlyte/Config.cs` — Config object with `Get<T>()`, `Require<T>()`
- `src/Dotlyte/Loader.cs` — Main orchestrator
- `src/Dotlyte/Coercion.cs` — Type coercion engine
- `src/Dotlyte/Parsers/` — IParser interface + implementations
- `src/Dotlyte/DotlyteException.cs` — Exception class
- `tests/Dotlyte.Tests/` — xUnit test project

## Commands
```bash
cd langs/dotnet
dotnet build
dotnet test
dotnet format --verify-no-changes
dotnet pack -c Release
```

## Dependencies
- Runtime: `YamlDotNet` (YAML parsing), `Tomlyn` (TOML parsing)
- JSON: `System.Text.Json` (built-in)
- Dev: `xunit`, `Microsoft.NET.Test.Sdk`, `xunit.runner.visualstudio`
