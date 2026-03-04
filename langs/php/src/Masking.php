<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Sensitive value masking for DOTLYTE v2.
 */
final class Masking
{
    public const REDACTED = '[REDACTED]';

    private const SENSITIVE_PATTERNS = [
        '/password/i', '/secret/i', '/token/i', '/api[_\-]?key/i',
        '/private[_\-]?key/i', '/access[_\-]?key/i', '/auth/i',
        '/credential/i', '/connection[_\-]?string/i', '/dsn/i',
        '/encryption[_\-]?key/i', '/signing[_\-]?key/i', '/certificate/i',
    ];

    /**
     * Build the set of sensitive keys (auto-detected + schema).
     *
     * @param array<string, mixed> $data
     * @param list<string> $schemaKeys
     * @return list<string>
     */
    public static function buildSensitiveSet(array $data, array $schemaKeys = []): array
    {
        $set = array_flip($schemaKeys);
        $flatKeys = self::flattenKeys($data);

        foreach ($flatKeys as $key) {
            foreach (self::SENSITIVE_PATTERNS as $pattern) {
                if (preg_match($pattern, $key)) {
                    $set[$key] = true;
                    break;
                }
            }
        }

        return array_keys($set);
    }

    /**
     * Redact sensitive values in a deep array.
     *
     * @param array<string, mixed> $data
     * @param list<string> $sensitiveKeys
     * @return array<string, mixed>
     */
    public static function redact(array $data, array $sensitiveKeys, string $prefix = ''): array
    {
        $result = [];
        foreach ($data as $key => $value) {
            $fullKey = $prefix === '' ? (string)$key : "{$prefix}.{$key}";

            if (in_array($fullKey, $sensitiveKeys, true)) {
                $result[$key] = self::REDACTED;
            } elseif (is_array($value)) {
                $result[$key] = self::redact($value, $sensitiveKeys, $fullKey);
            } else {
                $result[$key] = $value;
            }
        }

        return $result;
    }

    /**
     * Partially show a value: first 2 chars, rest masked.
     */
    public static function formatRedacted(?string $value): string
    {
        if ($value === null) {
            return self::REDACTED;
        }
        if (strlen($value) <= 4) {
            return str_repeat('*', strlen($value));
        }
        return substr($value, 0, 2) . str_repeat('*', strlen($value) - 2);
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
