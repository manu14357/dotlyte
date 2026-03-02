<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Deep merge utility.
 */
final class Merger
{
    /**
     * Deep merge two associative arrays. Override values win.
     *
     * @param array<string, mixed> $base
     * @param array<string, mixed> $override
     * @return array<string, mixed>
     */
    public static function deepMerge(array $base, array $override): array
    {
        $result = $base;

        foreach ($override as $key => $value) {
            if (
                isset($result[$key])
                && is_array($result[$key])
                && is_array($value)
            ) {
                $result[$key] = self::deepMerge($result[$key], $value);
            } else {
                $result[$key] = $value;
            }
        }

        return $result;
    }
}
