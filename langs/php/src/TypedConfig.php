<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Schema-driven typed configuration from environment variables.
 *
 * Reads values from $_ENV and getenv(), coerces to declared types,
 * validates constraints, and returns a flat associative array.
 */
final class TypedConfig
{
    private const TRUE_VALUES = ['true', 'yes', '1', 'on'];
    private const FALSE_VALUES = ['false', 'no', '0', 'off'];

    /**
     * Create a typed configuration array from environment variables.
     *
     * Each schema entry maps a key to its rules:
     *   - type: 'string'|'integer'|'float'|'boolean'|'array'
     *   - required: bool (default false)
     *   - default: mixed fallback value
     *   - enum: list of allowed values
     *   - min: numeric minimum
     *   - max: numeric maximum
     *   - sensitive: bool (triggers onSecretAccess callback)
     *   - doc: string description
     *
     * @param array<string, array{type?: string, required?: bool, default?: mixed, enum?: array<mixed>, min?: int|float, max?: int|float, sensitive?: bool, doc?: string}> $schema
     * @param bool $skipValidation Skip constraint checks
     * @param callable|null $onSecretAccess Called with (key, value) for sensitive keys
     * @return array<string, mixed>
     *
     * @throws DotlyteException On validation failures
     */
    public static function create(array $schema, bool $skipValidation = false, ?callable $onSecretAccess = null): array
    {
        $result = [];
        $errors = [];

        foreach ($schema as $key => $rules) {
            $raw = self::readEnvValue($key);

            // Apply default if missing
            if ($raw === null) {
                if (array_key_exists('default', $rules)) {
                    $result[$key] = $rules['default'];
                    continue;
                }

                // Check required
                if (!$skipValidation && ($rules['required'] ?? false)) {
                    $errors[] = "Required config key '{$key}' is missing. Set it as an environment variable.";
                    continue;
                }

                $result[$key] = null;
                continue;
            }

            // Type coercion
            $type = $rules['type'] ?? 'string';
            $value = self::coerceToType($raw, $type);

            if (!$skipValidation) {
                // Validate enum
                if (isset($rules['enum']) && !in_array($value, $rules['enum'], true)) {
                    $allowed = implode(', ', array_map(fn($v) => var_export($v, true), $rules['enum']));
                    $errors[] = "Key '{$key}': value not in allowed values [{$allowed}].";
                }

                // Validate min
                if (isset($rules['min']) && is_numeric($value) && $value < $rules['min']) {
                    $errors[] = "Key '{$key}': value {$value} is less than minimum {$rules['min']}.";
                }

                // Validate max
                if (isset($rules['max']) && is_numeric($value) && $value > $rules['max']) {
                    $errors[] = "Key '{$key}': value {$value} is greater than maximum {$rules['max']}.";
                }
            }

            // Trigger sensitive callback
            if ($onSecretAccess !== null && ($rules['sensitive'] ?? false)) {
                $onSecretAccess($key, $value);
            }

            $result[$key] = $value;
        }

        if (!empty($errors)) {
            throw new DotlyteException(
                "TypedConfig validation failed:\n  - " . implode("\n  - ", $errors)
            );
        }

        return $result;
    }

    /**
     * Read a value from environment variables.
     *
     * Checks $_ENV first, then falls back to getenv().
     */
    private static function readEnvValue(string $key): ?string
    {
        if (isset($_ENV[$key])) {
            return (string) $_ENV[$key];
        }

        $val = getenv($key);
        if ($val !== false) {
            return $val;
        }

        return null;
    }

    /**
     * Coerce a raw string value to the declared type.
     *
     * @throws DotlyteException On unrecognised type
     */
    private static function coerceToType(string $raw, string $type): mixed
    {
        return match ($type) {
            'string'  => $raw,
            'integer', 'int' => self::coerceInteger($raw),
            'float', 'double' => self::coerceFloat($raw),
            'boolean', 'bool' => self::coerceBoolean($raw),
            'array'   => self::coerceArray($raw),
            default   => throw new DotlyteException("Unknown type '{$type}' in TypedConfig schema."),
        };
    }

    private static function coerceInteger(string $raw): int
    {
        if (is_numeric($raw)) {
            return (int) $raw;
        }
        return 0;
    }

    private static function coerceFloat(string $raw): float
    {
        if (is_numeric($raw)) {
            return (float) $raw;
        }
        return 0.0;
    }

    private static function coerceBoolean(string $raw): bool
    {
        $lower = strtolower(trim($raw));
        if (in_array($lower, self::TRUE_VALUES, true)) {
            return true;
        }
        if (in_array($lower, self::FALSE_VALUES, true)) {
            return false;
        }
        return $raw !== '';
    }

    /**
     * Coerce a comma-separated string into an array.
     *
     * @return list<string>
     */
    private static function coerceArray(string $raw): array
    {
        if ($raw === '') {
            return [];
        }
        return array_map('trim', explode(',', $raw));
    }
}
