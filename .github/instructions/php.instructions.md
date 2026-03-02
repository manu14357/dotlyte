---
applyTo: "langs/php/**"
---

# PHP Implementation — Copilot Instructions

## Build System
- **Package manager:** Composer
- **PHP version:** >=8.1
- **Autoloading:** PSR-4 (`Dotlyte\` → `src/`)
- **Package:** `dotlyte/dotlyte` (Packagist)

## Conventions
- **Test framework:** PHPUnit 11
- **Static analysis:** PHPStan (level max)
- **Code style:** PHP-CS-Fixer (PSR-12)
- **Documentation:** PHPDoc blocks on all public methods

## Code Style
- Use `camelCase` for methods and variables
- Use `PascalCase` for classes
- Use `UPPER_SNAKE_CASE` for constants
- Namespace: `Dotlyte`
- Use typed properties and return types everywhere
- Throw `Dotlyte\DotlyteException` for spec-defined errors

## Architecture
- `src/Dotlyte.php` — Public API: `Dotlyte::load()`
- `src/Config.php` — Config object with `get()`, `require()`
- `src/Loader.php` — Main orchestrator
- `src/Coercion.php` — Type coercion engine
- `src/Parsers/` — Parser interface + implementations (EnvParser, YamlParser, etc.)
- `src/DotlyteException.php` — Exception class

## Commands
```bash
cd langs/php
composer install
vendor/bin/phpunit
vendor/bin/phpstan analyse
vendor/bin/php-cs-fixer fix --dry-run --diff
```

## Dependencies
- Runtime: zero (parse .env and JSON natively; YAML via `symfony/yaml` optional)
- Dev: `phpunit/phpunit`, `phpstan/phpstan`, `friendsofphp/php-cs-fixer`
