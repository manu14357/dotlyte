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

## TypedConfig

Schema-driven typed configuration from environment variables:

```php
use Dotlyte\TypedConfig;

$config = TypedConfig::create([
    'APP_PORT'  => ['type' => 'integer', 'required' => true, 'min' => 1, 'max' => 65535],
    'APP_DEBUG' => ['type' => 'boolean', 'default' => false],
    'APP_MODE'  => ['type' => 'string',  'enum' => ['development', 'production', 'test']],
    'APP_TAGS'  => ['type' => 'array'],
    'APP_SECRET'=> ['type' => 'string',  'sensitive' => true],
]);
```

## BoundaryConfig

Server/client key separation:

```php
use Dotlyte\BoundaryConfig;

$bc = new BoundaryConfig(
    $data,
    serverKeys: ['DB_PASSWORD', 'SECRET_KEY'],
    clientKeys: ['API_URL', 'APP_NAME'],
    sharedKeys: ['FEATURE_FLAGS'],
);

$bc->serverOnly();  // only server keys
$bc->clientOnly();  // only client keys
```

## Workspace

Monorepo workspace detection:

```php
use Dotlyte\Workspace;

$ws = Workspace::findMonorepoRoot();
// ['root' => '/path', 'type' => 'pnpm', 'packages' => ['packages/app', ...]]

$shared = Workspace::getSharedEnv($ws['root'], 'APP');
```

## Encryption

Key rotation and vault operations:

```php
use Dotlyte\Encryption;

// Rotate keys
$rotated = Encryption::rotateKeys($data, $oldKey, $newKey);

// Encrypt entire vault (selective keys)
$vault = Encryption::encryptVault($data, $key, ['password', 'db.token']);
$plain = Encryption::decryptVault($vault, $key);
```

## Masking

Pattern-based sensitive-key detection and audit proxies:

```php
use Dotlyte\Masking;

$sensitive = Masking::buildSensitiveSetWithPatterns(
    $keys,
    patterns: ['db.*', '**secret**'],
    schemaSensitive: ['auth.token'],
);

$proxy = Masking::createAuditProxy($data, $sensitive, function ($key, $value, $isSensitive) {
    echo "Accessed {$key}" . ($isSensitive ? ' (SENSITIVE)' : '') . "\n";
});
```

## CLI

```bash
vendor/bin/dotlyte dump       # Dump resolved config as JSON
vendor/bin/dotlyte get <key>  # Get a single key value
vendor/bin/dotlyte validate   # Validate current config
vendor/bin/dotlyte version    # Print version
```

## License

[MIT](../../LICENSE)
