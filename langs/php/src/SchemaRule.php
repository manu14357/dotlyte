<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Schema rule for a single configuration key.
 */
final class SchemaRule
{
    public function __construct(
        public readonly ?string $type = null,
        public readonly bool $required = false,
        public readonly ?string $format = null,
        public readonly ?string $pattern = null,
        /** @var list<string|int|float|bool>|null */
        public readonly ?array $enumValues = null,
        public readonly int|float|null $min = null,
        public readonly int|float|null $max = null,
        public readonly mixed $defaultValue = null,
        public readonly bool $sensitive = false,
        public readonly ?string $doc = null,
    ) {}
}
