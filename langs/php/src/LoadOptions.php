<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Load options for Dotlyte::load().
 */
final class LoadOptions
{
    /**
     * @param string[]|null $files    Explicit files to load
     * @param string|null   $prefix   Env var prefix to strip
     * @param array<string, mixed> $defaults Default values
     * @param string[]|null $sources  Custom source order
     * @param string|null   $env      Environment name
     */
    public function __construct(
        public readonly ?array $files = null,
        public readonly ?string $prefix = null,
        public readonly array $defaults = [],
        public readonly ?array $sources = null,
        public readonly ?string $env = null,
    ) {}
}
