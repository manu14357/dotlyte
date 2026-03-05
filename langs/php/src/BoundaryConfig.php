<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Boundary-aware configuration for server/client key separation.
 *
 * Enforces access controls so that server-only keys are never
 * accidentally leaked to client contexts.
 */
final class BoundaryConfig
{
    /** @var array<string, mixed> */
    private array $data;

    /** @var list<string> */
    private array $serverKeys;

    /** @var list<string> */
    private array $clientKeys;

    /** @var list<string> */
    private array $sharedKeys;

    /** @var callable|null */
    private $onSecretAccess;

    /**
     * @param array<string, mixed> $data        All config data
     * @param list<string>         $serverKeys  Keys restricted to server context
     * @param list<string>         $clientKeys  Keys allowed in client context
     * @param list<string>         $sharedKeys  Keys available in both contexts
     * @param callable|null        $onSecretAccess Called with (key, value) on access
     */
    public function __construct(
        array $data,
        array $serverKeys,
        array $clientKeys,
        array $sharedKeys = [],
        ?callable $onSecretAccess = null,
    ) {
        $this->data = $data;
        $this->serverKeys = array_values($serverKeys);
        $this->clientKeys = array_values($clientKeys);
        $this->sharedKeys = array_values($sharedKeys);
        $this->onSecretAccess = $onSecretAccess;
    }

    /**
     * Get a config value with boundary checking.
     *
     * In PHP (always server context) all keys are accessible, but a
     * callback is triggered for sensitive access tracking.
     *
     * @throws DotlyteException If the key is not declared in any boundary list
     */
    public function get(string $key): mixed
    {
        $allDeclared = array_merge($this->serverKeys, $this->clientKeys, $this->sharedKeys);

        if (!empty($allDeclared) && !in_array($key, $allDeclared, true)) {
            throw new DotlyteException(
                "Key '{$key}' is not declared in any boundary (server, client, shared). "
                . 'Add it to the appropriate boundary list.',
                key: $key,
            );
        }

        $value = $this->resolveKey($key);

        if ($this->onSecretAccess !== null && in_array($key, $this->serverKeys, true)) {
            ($this->onSecretAccess)($key, $value);
        }

        return $value;
    }

    /**
     * Return only keys designated as server-only, filtered from data.
     *
     * @return array<string, mixed>
     */
    public function serverOnly(): array
    {
        return $this->filterKeys($this->serverKeys);
    }

    /**
     * Return only keys designated as client-safe, filtered from data.
     *
     * @return array<string, mixed>
     */
    public function clientOnly(): array
    {
        return $this->filterKeys($this->clientKeys);
    }

    /**
     * PHP always runs on the server.
     */
    public function isServerContext(): bool
    {
        return true;
    }

    /**
     * Resolve a dot-notation key from the data array.
     */
    private function resolveKey(string $key): mixed
    {
        if (array_key_exists($key, $this->data)) {
            return $this->data[$key];
        }

        // Try dot-notation traversal
        $parts = explode('.', $key);
        $current = $this->data;

        foreach ($parts as $part) {
            if (!is_array($current) || !array_key_exists($part, $current)) {
                return null;
            }
            $current = $current[$part];
        }

        return $current;
    }

    /**
     * Filter the data array to only include the specified keys.
     *
     * @param list<string> $keys
     * @return array<string, mixed>
     */
    private function filterKeys(array $keys): array
    {
        $result = [];
        foreach ($keys as $key) {
            $value = $this->resolveKey($key);
            if ($value !== null) {
                $result[$key] = $value;
            }
        }
        return $result;
    }
}
