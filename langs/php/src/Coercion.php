<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Type coercion engine.
 */
final class Coercion
{
    private const NULL_VALUES = ['null', 'none', 'nil', ''];
    private const TRUE_VALUES = ['true', 'yes', '1', 'on'];
    private const FALSE_VALUES = ['false', 'no', '0', 'off'];

    /**
     * Coerce a string value to its proper PHP type.
     */
    public static function coerce(mixed $value): mixed
    {
        if (!is_string($value)) {
            return $value;
        }

        $trimmed = trim($value);
        $lower = strtolower($trimmed);

        // Null
        if (in_array($lower, self::NULL_VALUES, true)) {
            return null;
        }

        // Boolean true
        if (in_array($lower, self::TRUE_VALUES, true)) {
            return true;
        }

        // Boolean false
        if (in_array($lower, self::FALSE_VALUES, true)) {
            return false;
        }

        // Integer
        if (preg_match('/^-?\d+$/', $trimmed)) {
            return (int) $trimmed;
        }

        // Float
        if (str_contains($trimmed, '.') && preg_match('/^-?\d+\.\d+$/', $trimmed)) {
            return (float) $trimmed;
        }

        // List (comma-separated)
        if (str_contains($trimmed, ',')) {
            return array_map(
                fn (string $item) => self::coerce(trim($item)),
                explode(',', $trimmed)
            );
        }

        return $trimmed;
    }

    /**
     * Recursively coerce all string values in an array.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public static function coerceArray(array $data): array
    {
        $result = [];
        foreach ($data as $key => $value) {
            if (is_array($value)) {
                $result[$key] = self::coerceArray($value);
            } elseif (is_string($value)) {
                $result[$key] = self::coerce($value);
            } else {
                $result[$key] = $value;
            }
        }
        return $result;
    }
}
