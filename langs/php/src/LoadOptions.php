<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Load options for Dotlyte::load() (v2).
 */
final class LoadOptions
{
    /**
     * @param string[]|null $files           Explicit files to load
     * @param string|null   $prefix          Env var prefix to strip
     * @param array<string, mixed> $defaults Default values
     * @param string[]|null $sources         Custom source order
     * @param string|null   $env             Environment name
     * @param array<string, SchemaRule>|null $schema  Validation schema
     * @param bool          $strict          Reject unknown keys
     * @param bool          $interpolateVars Enable ${VAR} interpolation
     * @param array<string, mixed> $overrides Override values (highest priority)
     * @param bool          $debug           Enable debug output
     * @param bool          $findUp          Walk up dirs to find config files
     * @param string[]      $rootMarkers     Root directory markers
     * @param string|null   $cwd             Working directory override
     * @param bool          $allowAllEnvVars Import all env vars without filtering
     */
    public function __construct(
        public readonly ?array $files = null,
        public readonly ?string $prefix = null,
        public readonly array $defaults = [],
        public readonly ?array $sources = null,
        public readonly ?string $env = null,
        public readonly ?array $schema = null,
        public readonly bool $strict = false,
        public readonly bool $interpolateVars = true,
        public readonly array $overrides = [],
        public readonly bool $debug = false,
        public readonly bool $findUp = false,
        public readonly array $rootMarkers = [
            '.git', '.hg', 'package.json', 'composer.json',
            'go.mod', 'Cargo.toml', 'pyproject.toml', '.dotlyte',
        ],
        public readonly ?string $cwd = null,
        public readonly bool $allowAllEnvVars = false,
    ) {}
}
