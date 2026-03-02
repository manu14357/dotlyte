# dotlyte — PHP

The universal `.env` and configuration library for PHP.

## Installation

```bash
composer require dotlyte/dotlyte
```

## Quick Start

```php
use Dotlyte\Dotlyte;

$config = Dotlyte::load();
$config->port;              // automatically int
$config->debug;             // automatically bool
$config->database->host;    // dot-notation via __get
```

## License

[MIT](../../LICENSE)
