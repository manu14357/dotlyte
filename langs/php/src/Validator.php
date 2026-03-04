<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Schema validation engine for DOTLYTE v2.
 */
final class Validator
{
    private const FORMAT_PATTERNS = [
        'email' => '/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/',
        'uuid'  => '/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/',
        'date'  => '/^\d{4}-\d{2}-\d{2}$/',
        'ipv4'  => '/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/',
    ];

    /**
     * Validate config data against a schema.
     *
     * @param array<string, mixed> $data
     * @param array<string, SchemaRule> $schema
     * @return list<SchemaViolation>
     */
    public static function validate(array $data, array $schema, bool $strict = false): array
    {
        $violations = [];

        foreach ($schema as $key => $rule) {
            $val = self::getNested($data, $key);

            if ($val === null) {
                if ($rule->required) {
                    $violations[] = new SchemaViolation(
                        $key,
                        "required key '{$key}' is missing",
                        'required'
                    );
                }
                continue;
            }

            // Type check
            if ($rule->type !== null && !self::checkType($val, $rule->type)) {
                $type = get_debug_type($val);
                $violations[] = new SchemaViolation(
                    $key,
                    "expected type '{$rule->type}', got {$type}",
                    'type'
                );
            }

            // Format check
            if ($rule->format !== null && is_string($val) && !self::checkFormat($val, $rule->format)) {
                $violations[] = new SchemaViolation(
                    $key,
                    "value '{$val}' does not match format '{$rule->format}'",
                    'format'
                );
            }

            // Pattern check
            if ($rule->pattern !== null && is_string($val)) {
                if (!preg_match($rule->pattern, $val)) {
                    $violations[] = new SchemaViolation(
                        $key,
                        "value '{$val}' does not match pattern '{$rule->pattern}'",
                        'pattern'
                    );
                }
            }

            // Enum check
            if ($rule->enumValues !== null && !in_array($val, $rule->enumValues, true)) {
                $violations[] = new SchemaViolation(
                    $key,
                    "value not in allowed values",
                    'enum'
                );
            }

            // Min/Max
            if (is_int($val) || is_float($val)) {
                if ($rule->min !== null && $val < $rule->min) {
                    $violations[] = new SchemaViolation(
                        $key,
                        "value {$val} is less than minimum {$rule->min}",
                        'min'
                    );
                }
                if ($rule->max !== null && $val > $rule->max) {
                    $violations[] = new SchemaViolation(
                        $key,
                        "value {$val} is greater than maximum {$rule->max}",
                        'max'
                    );
                }
            }
        }

        // Strict mode
        if ($strict) {
            $flatKeys = self::flattenKeys($data);
            foreach ($flatKeys as $k) {
                if (!isset($schema[$k])) {
                    $violations[] = new SchemaViolation(
                        $k,
                        "unknown key '{$k}' (strict mode)",
                        'strict'
                    );
                }
            }
        }

        return $violations;
    }

    /**
     * Apply schema defaults to data.
     *
     * @param array<string, mixed> $data
     * @param array<string, SchemaRule> $schema
     */
    public static function applyDefaults(array &$data, array $schema): void
    {
        foreach ($schema as $key => $rule) {
            if ($rule->defaultValue === null) {
                continue;
            }
            if (self::getNested($data, $key) !== null) {
                continue;
            }
            self::setNested($data, $key, $rule->defaultValue);
        }
    }

    /**
     * Get all sensitive keys from schema.
     *
     * @param array<string, SchemaRule> $schema
     * @return list<string>
     */
    public static function sensitiveKeys(array $schema): array
    {
        $keys = [];
        foreach ($schema as $key => $rule) {
            if ($rule->sensitive) {
                $keys[] = $key;
            }
        }
        return $keys;
    }

    /**
     * Assert valid — throws ValidationException on failure.
     *
     * @param array<string, mixed> $data
     * @param array<string, SchemaRule> $schema
     * @throws ValidationException
     */
    public static function assertValid(array $data, array $schema, bool $strict = false): void
    {
        $violations = self::validate($data, $schema, $strict);
        if (!empty($violations)) {
            $msg = "Schema validation failed:\n" .
                implode("\n", array_map(fn($v) => "  - {$v}", $violations));
            throw new ValidationException($msg, violations: $violations);
        }
    }

    /**
     * Get a nested value via dot-notation key.
     *
     * @param array<string, mixed> $data
     */
    public static function getNested(array $data, string $key): mixed
    {
        $parts = explode('.', $key);
        $current = $data;
        foreach ($parts as $part) {
            if (!is_array($current) || !array_key_exists($part, $current)) {
                return null;
            }
            $current = $current[$part];
        }
        return $current;
    }

    /**
     * Set a nested value via dot-notation key.
     *
     * @param array<string, mixed> $data
     */
    public static function setNested(array &$data, string $key, mixed $value): void
    {
        $parts = explode('.', $key);
        $current = &$data;
        for ($i = 0, $len = count($parts) - 1; $i < $len; $i++) {
            if (!isset($current[$parts[$i]]) || !is_array($current[$parts[$i]])) {
                $current[$parts[$i]] = [];
            }
            $current = &$current[$parts[$i]];
        }
        $current[$parts[count($parts) - 1]] = $value;
    }

    private static function checkType(mixed $val, string $expected): bool
    {
        return match ($expected) {
            'string' => is_string($val),
            'number', 'integer', 'int' => is_int($val) || is_float($val),
            'boolean', 'bool' => is_bool($val),
            'array' => is_array($val),
            default => true,
        };
    }

    private static function checkFormat(string $val, string $fmt): bool
    {
        return match ($fmt) {
            'url' => str_starts_with($val, 'http://') || str_starts_with($val, 'https://'),
            'ip', 'ipv4' => (bool)preg_match(self::FORMAT_PATTERNS['ipv4'], $val),
            'port' => is_numeric($val) && (int)$val >= 1 && (int)$val <= 65535,
            'email' => (bool)preg_match(self::FORMAT_PATTERNS['email'], $val),
            'uuid' => (bool)preg_match(self::FORMAT_PATTERNS['uuid'], $val),
            'date' => (bool)preg_match(self::FORMAT_PATTERNS['date'], $val),
            default => (bool)preg_match("/{$fmt}/", $val),
        };
    }

    /**
     * @param array<string, mixed> $data
     * @return list<string>
     */
    private static function flattenKeys(array $data, string $prefix = ''): array
    {
        $out = [];
        foreach ($data as $key => $value) {
            $fullKey = $prefix === '' ? (string)$key : "{$prefix}.{$key}";
            if (is_array($value)) {
                $out = array_merge($out, self::flattenKeys($value, $fullKey));
            } else {
                $out[] = $fullKey;
            }
        }
        return $out;
    }
}
