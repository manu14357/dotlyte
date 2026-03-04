<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Represents a single schema violation.
 */
final class SchemaViolation
{
    public function __construct(
        public readonly string $key,
        public readonly string $message,
        public readonly string $rule,
    ) {}

    public function __toString(): string
    {
        return "[{$this->rule}] {$this->key}: {$this->message}";
    }
}
