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

## License

[MIT](../../LICENSE)
