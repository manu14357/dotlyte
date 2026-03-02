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

## License

[MIT](../../LICENSE)
