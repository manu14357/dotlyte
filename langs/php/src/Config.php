<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Immutable configuration object with dot-notation access (v2).
 */
final class Config
{
    /** @var array<string, mixed> */
    private array $data;

    /** @var array<string, SchemaRule>|null */
    private ?array $schema;

    /** @var list<string> */
    private array $sensitiveKeys;

    /**
     * @param array<string, mixed> $data
     * @param array<string, SchemaRule>|null $schema
     * @param list<string> $sensitiveKeys
     */
    public function __construct(array $data, ?array $schema = null, array $sensitiveKeys = [])
    {
        $this->data = $data;
        $this->schema = $schema;
        $this->sensitiveKeys = $sensitiveKeys;
    }

    /**
     * Get a value using dot-notation with optional default.
     */
    public function get(string $key, mixed $default = null): mixed
    {
        $parts = explode('.', $key);
        $current = $this->data;

        foreach ($parts as $part) {
            if (!is_array($current) || !array_key_exists($part, $current)) {
                return $default;
            }
            $current = $current[$part];
        }

        return $current;
    }

    /**
     * Require a config key — throws if missing.
     *
     * @throws MissingKeyException
     */
    public function require(string $key): mixed
    {
        $value = $this->get($key);

        if ($value === null) {
            throw new MissingKeyException(
                "Required config key '{$key}' is missing. " .
                "Set it in your .env file or as an environment variable.",
                key: $key
            );
        }

        return $value;
    }

    /**
     * Require multiple keys at once.
     *
     * @param string ...$keys
     * @return list<mixed>
     * @throws MissingKeyException
     */
    public function requireKeys(string ...$keys): array
    {
        return array_map(fn(string $k) => $this->require($k), $keys);
    }

    /**
     * Check whether a key exists.
     */
    public function has(string $key): bool
    {
        return $this->get($key) !== null;
    }

    /**
     * Get a scoped sub-config.
     *
     * @throws DotlyteException
     */
    public function scope(string $prefix): self
    {
        $sub = $this->get($prefix);
        if (!is_array($sub)) {
            throw new DotlyteException("No config section found for '{$prefix}'", key: $prefix);
        }

        $scopedSensitive = [];
        $pfx = $prefix . '.';
        foreach ($this->sensitiveKeys as $sk) {
            if (str_starts_with($sk, $pfx)) {
                $scopedSensitive[] = substr($sk, strlen($pfx));
            }
        }

        return new self($sub, null, $scopedSensitive);
    }

    /**
     * All top-level keys.
     *
     * @return list<string>
     */
    public function keys(): array
    {
        return array_keys($this->data);
    }

    /**
     * All keys flattened via dot-notation.
     *
     * @return list<string>
     */
    public function toFlatKeys(): array
    {
        return $this->flatKeys($this->data);
    }

    /**
     * Flatten the config to a single-level array.
     *
     * @return array<string, mixed>
     */
    public function toFlatArray(): array
    {
        return $this->flatten($this->data);
    }

    /**
     * Magic property access for dot-notation convenience.
     */
    public function __get(string $name): mixed
    {
        $value = $this->data[$name] ?? null;

        if (is_array($value)) {
            $scopedSensitive = [];
            $pfx = $name . '.';
            foreach ($this->sensitiveKeys as $sk) {
                if (str_starts_with($sk, $pfx)) {
                    $scopedSensitive[] = substr($sk, strlen($pfx));
                }
            }
            return new self($value, null, $scopedSensitive);
        }

        return $value;
    }

    public function __isset(string $name): bool
    {
        return isset($this->data[$name]);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return $this->data;
    }

    /**
     * Return a redacted array with sensitive values masked.
     *
     * @return array<string, mixed>
     */
    public function toArrayRedacted(): array
    {
        return Masking::redact($this->data, $this->sensitiveKeys);
    }

    /**
     * Serialize to JSON string.
     */
    public function toJson(int $flags = JSON_PRETTY_PRINT): string
    {
        $json = json_encode($this->data, $flags | JSON_THROW_ON_ERROR);
        return $json;
    }

    /**
     * Write config to a file (JSON).
     *
     * @throws DotlyteException
     */
    public function writeTo(string $path): void
    {
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        $content = match ($ext) {
            'json' => $this->toJson(),
            default => throw new DotlyteException("Unsupported output format: .{$ext}"),
        };

        file_put_contents($path, $content);
    }

    /**
     * Validate against schema.
     *
     * @param array<string, SchemaRule>|null $schema
     * @return list<SchemaViolation>
     */
    public function validate(?array $schema = null): array
    {
        $s = $schema ?? $this->schema;
        if ($s === null) {
            return [];
        }
        return Validator::validate($this->data, $s);
    }

    /**
     * Assert valid — throws on failure.
     *
     * @param array<string, SchemaRule>|null $schema
     * @throws ValidationException
     */
    public function assertValid(?array $schema = null): void
    {
        $s = $schema ?? $this->schema;
        if ($s === null) {
            return;
        }
        Validator::assertValid($this->data, $s);
    }

    /**
     * @param array<string, mixed> $data
     * @return list<string>
     */
    private function flatKeys(array $data, string $prefix = ''): array
    {
        $out = [];
        foreach ($data as $key => $value) {
            $full = $prefix === '' ? (string)$key : "{$prefix}.{$key}";
            if (is_array($value)) {
                $out = array_merge($out, $this->flatKeys($value, $full));
            } else {
                $out[] = $full;
            }
        }
        return $out;
    }

    /**
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function flatten(array $data, string $prefix = ''): array
    {
        $out = [];
        foreach ($data as $key => $value) {
            $full = $prefix === '' ? (string)$key : "{$prefix}.{$key}";
            if (is_array($value)) {
                $out = array_merge($out, $this->flatten($value, $full));
            } else {
                $out[$full] = $value;
            }
        }
        return $out;
    }
}
