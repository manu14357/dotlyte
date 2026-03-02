---
applyTo: "langs/ruby/**"
---

# Ruby Implementation — Copilot Instructions

## Build System
- **Gem:** `dotlyte` (RubyGems)
- **Ruby version:** >=3.0
- **Layout:** Standard gem layout with `lib/dotlyte/`

## Conventions
- **Test framework:** RSpec
- **Linter:** RuboCop
- **Documentation:** YARD-style doc comments

## Code Style
- Use `snake_case` for methods and variables
- Use `PascalCase` for classes and modules
- Use `UPPER_SNAKE_CASE` for constants
- Module namespace: `Dotlyte`
- Prefer keyword arguments for options
- Raise `Dotlyte::Error` for spec-defined errors

## Architecture
- `lib/dotlyte.rb` — Main require entry point
- `lib/dotlyte/version.rb` — Version constant
- `lib/dotlyte/loader.rb` — Main orchestrator
- `lib/dotlyte/config.rb` — Config object with dot-notation, `get`, `require!`
- `lib/dotlyte/coercion.rb` — Type coercion engine
- `lib/dotlyte/parsers/` — One file per source type

## Commands
```bash
cd langs/ruby
bundle install
bundle exec rspec
bundle exec rubocop
bundle exec rake build
```

## Dependencies
- Runtime: zero required (YAML is stdlib in Ruby)
- Dev: `rspec`, `rubocop`, `rake`
