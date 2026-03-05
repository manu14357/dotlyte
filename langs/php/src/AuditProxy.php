<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * ArrayAccess wrapper that triggers a callback on every access.
 *
 * Used by {@see Masking::createAuditProxy()} for secret-access auditing.
 *
 * @implements \ArrayAccess<string, mixed>
 */
final class AuditProxy implements \ArrayAccess
{
    /** @var array<string, mixed> */
    private array $data;

    /** @var list<string> */
    private array $sensitiveKeys;

    /** @var callable(string, mixed, bool): void */
    private $onAccess;

    /**
     * @param array<string, mixed> $data
     * @param list<string>         $sensitiveKeys
     * @param callable             $onAccess fn(string $key, mixed $value, bool $isSensitive): void
     */
    public function __construct(array $data, array $sensitiveKeys, callable $onAccess)
    {
        $this->data = $data;
        $this->sensitiveKeys = $sensitiveKeys;
        $this->onAccess = $onAccess;
    }

    public function offsetExists(mixed $offset): bool
    {
        return array_key_exists((string) $offset, $this->data);
    }

    public function offsetGet(mixed $offset): mixed
    {
        $key = (string) $offset;
        $value = $this->data[$key] ?? null;
        $isSensitive = in_array($key, $this->sensitiveKeys, true);

        ($this->onAccess)($key, $value, $isSensitive);

        return $value;
    }

    public function offsetSet(mixed $offset, mixed $value): void
    {
        // Immutable — silently ignore writes
    }

    public function offsetUnset(mixed $offset): void
    {
        // Immutable — silently ignore deletes
    }
}
