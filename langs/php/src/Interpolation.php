<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Variable interpolation engine for DOTLYTE v2.
 *
 * Supports ${VAR}, ${VAR:-default}, ${VAR:?error}, and $$ escape.
 */
final class Interpolation
{
    /**
     * Interpolate ${VAR} references in a flat string map.
     *
     * @param array<string, string> $data
     * @param array<string, string> $context
     * @return array<string, string>
     */
    public static function interpolate(array $data, array $context = []): array
    {
        $resolved = [];
        $resolving = [];

        foreach (array_keys($data) as $key) {
            self::resolve($key, $data, $context, $resolved, $resolving);
        }

        return $resolved;
    }

    /**
     * Interpolate a deep (nested) array.
     *
     * Only string values containing ${...} are interpolated.
     * Non-string values and plain strings pass through unchanged.
     *
     * @param array<string, mixed> $data
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    public static function interpolateDeep(array $data, array $context = []): array
    {
        // Build a flat string map of ALL values for reference lookup
        $flat = self::flattenToStrings($data);
        $ctxFlat = self::flattenToStrings($context);

        // Only interpolate strings that contain ${
        $needsInterpolation = array_filter($flat, fn(string $v) => str_contains($v, '${'));
        if (empty($needsInterpolation)) {
            return $data;
        }

        $resolved = self::interpolate($flat, $ctxFlat);

        $result = self::deepCopy($data);
        // Only set back values that actually had interpolation syntax
        foreach ($needsInterpolation as $key => $_) {
            if (isset($resolved[$key])) {
                self::setNested($result, $key, Coercion::coerce($resolved[$key]));
            }
        }

        return $result;
    }

    /**
     * @param array<string, string> $data
     * @param array<string, string> $context
     * @param array<string, string> $resolved
     * @param array<string, bool> $resolving
     */
    private static function resolve(
        string $key,
        array $data,
        array $context,
        array &$resolved,
        array &$resolving
    ): string {
        if (isset($resolved[$key])) {
            return $resolved[$key];
        }

        if (isset($resolving[$key])) {
            throw new InterpolationException(
                "Circular reference detected for variable: {$key}",
                key: $key
            );
        }

        if (!isset($data[$key])) {
            if (isset($context[$key])) {
                return $context[$key];
            }
            $env = getenv(strtoupper($key));
            return $env !== false ? $env : '';
        }

        $resolving[$key] = true;
        $val = self::resolveString((string)$data[$key], $data, $context, $resolved, $resolving);
        unset($resolving[$key]);
        $resolved[$key] = $val;

        return $val;
    }

    /**
     * @param array<string, string> $data
     * @param array<string, string> $context
     * @param array<string, string> $resolved
     * @param array<string, bool> $resolving
     */
    private static function resolveString(
        string $s,
        array $data,
        array $context,
        array &$resolved,
        array &$resolving
    ): string {
        $s = str_replace('$$', "\x00DOLLAR\x00", $s);
        $result = '';
        $i = 0;
        $len = strlen($s);

        while ($i < $len) {
            if ($i + 1 < $len && $s[$i] === '$' && $s[$i + 1] === '{') {
                $i += 2;
                $depth = 1;
                $inner = '';
                while ($i < $len && $depth > 0) {
                    if ($s[$i] === '{') {
                        $depth++;
                    } elseif ($s[$i] === '}') {
                        $depth--;
                        if ($depth === 0) {
                            $i++;
                            break;
                        }
                    }
                    $inner .= $s[$i];
                    $i++;
                }
                $result .= self::resolveReference($inner, $data, $context, $resolved, $resolving);
            } else {
                $result .= $s[$i];
                $i++;
            }
        }

        return str_replace("\x00DOLLAR\x00", '$', $result);
    }

    /**
     * @param array<string, string> $data
     * @param array<string, string> $context
     * @param array<string, string> $resolved
     * @param array<string, bool> $resolving
     */
    private static function resolveReference(
        string $inner,
        array $data,
        array $context,
        array &$resolved,
        array &$resolving
    ): string {
        $errIdx = strpos($inner, ':?');
        $defIdx = strpos($inner, ':-');
        $errorMsg = null;
        $fallback = null;

        if ($errIdx !== false) {
            $varName = trim(substr($inner, 0, $errIdx));
            $errorMsg = substr($inner, $errIdx + 2);
        } elseif ($defIdx !== false) {
            $varName = trim(substr($inner, 0, $defIdx));
            $fallback = substr($inner, $defIdx + 2);
        } else {
            $varName = trim($inner);
        }

        $lower = strtolower($varName);

        // Same-file
        if (isset($data[$lower])) {
            $val = self::resolve($lower, $data, $context, $resolved, $resolving);
            if ($val !== '') {
                return $val;
            }
        }

        // Context
        if (isset($context[$lower]) && $context[$lower] !== '') {
            return $context[$lower];
        }

        // Env
        $env = getenv($varName) ?: getenv(strtoupper($varName));
        if ($env !== false && $env !== '') {
            return $env;
        }

        // Not found
        if ($errorMsg !== null) {
            throw new InterpolationException(
                "Required variable '{$varName}': {$errorMsg}",
                key: $varName
            );
        }

        return $fallback ?? '';
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, string>
     */
    private static function flattenToStrings(array $data, string $prefix = ''): array
    {
        $out = [];
        foreach ($data as $key => $value) {
            $fullKey = $prefix === '' ? (string)$key : "{$prefix}.{$key}";
            if (is_array($value)) {
                $out = array_merge($out, self::flattenToStrings($value, $fullKey));
            } elseif ($value !== null) {
                $out[$fullKey] = (string)$value;
            }
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private static function deepCopy(array $data): array
    {
        $result = [];
        foreach ($data as $k => $v) {
            $result[$k] = is_array($v) ? self::deepCopy($v) : $v;
        }
        return $result;
    }

    /**
     * @param array<string, mixed> $data
     */
    private static function setNested(array &$data, string $key, mixed $value): void
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
}
