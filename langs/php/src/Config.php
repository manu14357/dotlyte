<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Configuration object with dot-notation access.
 */
final class Config
{
    /** @var array<string, mixed> */
    private array $data;

    /**
     * @param array<string, mixed> $data
     */
    public function __construct(array $data)
    {
        $this->data = $data;
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
     * @throws DotlyteException
     */
    public function require(string $key): mixed
    {
        $value = $this->get($key);

        if ($value === null) {
            throw new DotlyteException(
                "Required config key '{$key}' is missing. " .
                "Set it in your .env file or as an environment variable.",
                key: $key
            );
        }

        return $value;
    }

    /**
     * Check whether a key exists.
     */
    public function has(string $key): bool
    {
        return $this->get($key) !== null;
    }

    /**
     * Magic property access for dot-notation convenience.
     */
    public function __get(string $name): mixed
    {
        $value = $this->data[$name] ?? null;

        if (is_array($value)) {
            return new self($value);
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
}
