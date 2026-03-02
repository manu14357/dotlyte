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

### `Config.Get(key string, default ...any) any`

### `Config.Require(key string) (any, error)`

### `Config.Has(key string) bool`

### `Config.ToMap() map[string]any`

## License

[MIT](../../LICENSE)
