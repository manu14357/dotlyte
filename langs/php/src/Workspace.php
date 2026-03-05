<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Monorepo workspace detection and cross-package config loading.
 */
final class Workspace
{
    /** Marker files that indicate a monorepo root, keyed by type. */
    private const MARKERS = [
        'pnpm'  => 'pnpm-workspace.yaml',
        'turbo' => 'turbo.json',
        'nx'    => 'nx.json',
        'lerna' => 'lerna.json',
    ];

    /**
     * Detect the nearest monorepo root by walking up from $cwd.
     *
     * @return array{root: string, type: string, packages: list<string>}|null
     */
    public static function findMonorepoRoot(?string $cwd = null): ?array
    {
        $dir = $cwd !== null ? realpath($cwd) : getcwd();
        if ($dir === false) {
            return null;
        }

        while (true) {
            // Check explicit marker files
            foreach (self::MARKERS as $type => $marker) {
                $path = $dir . DIRECTORY_SEPARATOR . $marker;
                if (file_exists($path)) {
                    $packages = self::discoverPackages($dir, $type, $path);
                    return ['root' => $dir, 'type' => $type, 'packages' => $packages];
                }
            }

            // Check package.json workspaces field
            $pkgJson = $dir . DIRECTORY_SEPARATOR . 'package.json';
            if (file_exists($pkgJson)) {
                $content = file_get_contents($pkgJson);
                if ($content !== false) {
                    $pkg = json_decode($content, true);
                    if (is_array($pkg) && isset($pkg['workspaces'])) {
                        $patterns = is_array($pkg['workspaces'])
                            ? (isset($pkg['workspaces']['packages']) ? $pkg['workspaces']['packages'] : $pkg['workspaces'])
                            : [];
                        $packages = self::expandGlobPatterns($dir, $patterns);
                        return ['root' => $dir, 'type' => 'npm', 'packages' => $packages];
                    }
                }
            }

            $parent = dirname($dir);
            if ($parent === $dir) {
                return null;
            }
            $dir = $parent;
        }
    }

    /**
     * Load configuration for an entire workspace.
     *
     * @param array{root?: string, packages?: list<string>, sharedEnvFile?: string, prefix?: string, env?: string} $options
     * @return array<string, mixed>
     */
    public static function loadWorkspace(array $options = []): array
    {
        $root = $options['root'] ?? null;
        $packages = $options['packages'] ?? [];

        if ($root === null) {
            $ws = self::findMonorepoRoot();
            if ($ws === null) {
                throw new DotlyteException('No monorepo root found. Specify "root" explicitly.');
            }
            $root = $ws['root'];
            if (empty($packages)) {
                $packages = $ws['packages'];
            }
        }

        $shared = self::getSharedEnv($root, $options['prefix'] ?? null);

        $result = [
            'root' => $root,
            'shared' => $shared,
            'packages' => [],
        ];

        foreach ($packages as $pkg) {
            $pkgDir = $root . DIRECTORY_SEPARATOR . $pkg;
            if (!is_dir($pkgDir)) {
                continue;
            }

            $envFile = $options['sharedEnvFile'] ?? '.env';
            $envPath = $pkgDir . DIRECTORY_SEPARATOR . $envFile;
            $pkgEnv = [];

            if (file_exists($envPath)) {
                $pkgEnv = self::parseDotenvSimple($envPath);
            }

            // Merge shared env (lower priority) with package env (higher priority)
            $merged = array_merge($shared, $pkgEnv);

            if (isset($options['prefix']) && $options['prefix'] !== '') {
                $merged = self::applyPrefix($merged, $options['prefix']);
            }

            $result['packages'][$pkg] = $merged;
        }

        return $result;
    }

    /**
     * Read shared environment variables from the monorepo root.
     *
     * @return array<string, string>
     */
    public static function getSharedEnv(string $root, ?string $prefix = null): array
    {
        $envFile = $root . DIRECTORY_SEPARATOR . '.env';
        $data = [];

        if (file_exists($envFile)) {
            $data = self::parseDotenvSimple($envFile);
        }

        if ($prefix !== null && $prefix !== '') {
            $data = self::applyPrefix($data, $prefix);
        }

        return $data;
    }

    /**
     * Discover packages in a monorepo.
     *
     * @return list<string>
     */
    private static function discoverPackages(string $root, string $type, string $markerPath): array
    {
        if ($type === 'pnpm') {
            $patterns = self::parsePnpmWorkspace($markerPath);
            return self::expandGlobPatterns($root, $patterns);
        }

        if ($type === 'lerna') {
            $content = file_get_contents($markerPath);
            if ($content !== false) {
                $lerna = json_decode($content, true);
                if (is_array($lerna) && isset($lerna['packages'])) {
                    return self::expandGlobPatterns($root, $lerna['packages']);
                }
            }
        }

        if ($type === 'nx') {
            // nx typically uses packages/ or libs/ directories
            return self::expandGlobPatterns($root, ['packages/*', 'libs/*', 'apps/*']);
        }

        if ($type === 'turbo') {
            // Turbo relies on package.json workspaces
            $pkgJson = $root . DIRECTORY_SEPARATOR . 'package.json';
            if (file_exists($pkgJson)) {
                $content = file_get_contents($pkgJson);
                if ($content !== false) {
                    $pkg = json_decode($content, true);
                    if (is_array($pkg) && isset($pkg['workspaces'])) {
                        $patterns = is_array($pkg['workspaces'])
                            ? (isset($pkg['workspaces']['packages']) ? $pkg['workspaces']['packages'] : $pkg['workspaces'])
                            : [];
                        return self::expandGlobPatterns($root, $patterns);
                    }
                }
            }
        }

        return [];
    }

    /**
     * Parse a pnpm-workspace.yaml file for package patterns.
     *
     * @return list<string>
     */
    private static function parsePnpmWorkspace(string $path): array
    {
        $content = file_get_contents($path);
        if ($content === false) {
            return [];
        }

        // Simple YAML parser for the "packages:" list
        $packages = [];
        $inPackages = false;
        foreach (explode("\n", $content) as $line) {
            $trimmed = trim($line);
            if ($trimmed === 'packages:') {
                $inPackages = true;
                continue;
            }
            if ($inPackages) {
                if (str_starts_with($trimmed, '- ')) {
                    $pattern = trim(substr($trimmed, 2), " '\"");
                    $packages[] = $pattern;
                } elseif ($trimmed !== '' && !str_starts_with($trimmed, '#')) {
                    break;
                }
            }
        }

        return $packages;
    }

    /**
     * Expand glob patterns into existing directory paths.
     *
     * @param list<string> $patterns
     * @return list<string>
     */
    private static function expandGlobPatterns(string $root, array $patterns): array
    {
        $result = [];
        foreach ($patterns as $pattern) {
            $pattern = rtrim($pattern, '/');
            $fullPattern = $root . DIRECTORY_SEPARATOR . $pattern;
            $matches = glob($fullPattern, GLOB_ONLYDIR);
            if ($matches !== false) {
                foreach ($matches as $match) {
                    // Return relative path from root
                    $relative = ltrim(str_replace($root, '', $match), DIRECTORY_SEPARATOR);
                    if ($relative !== '') {
                        $result[] = $relative;
                    }
                }
            }
        }
        return array_values(array_unique($result));
    }

    /**
     * Simple .env parser (key=value lines).
     *
     * @return array<string, string>
     */
    private static function parseDotenvSimple(string $path): array
    {
        $content = file_get_contents($path);
        if ($content === false) {
            return [];
        }

        $result = [];
        foreach (explode("\n", $content) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $eqPos = strpos($line, '=');
            if ($eqPos === false) {
                continue;
            }
            $key = trim(substr($line, 0, $eqPos));
            $value = trim(substr($line, $eqPos + 1));
            // Remove surrounding quotes
            if (
                (str_starts_with($value, '"') && str_ends_with($value, '"'))
                || (str_starts_with($value, "'") && str_ends_with($value, "'"))
            ) {
                $value = substr($value, 1, -1);
            }
            $result[$key] = $value;
        }
        return $result;
    }

    /**
     * Filter and strip prefix from keys.
     *
     * @param array<string, string> $data
     * @return array<string, string>
     */
    private static function applyPrefix(array $data, string $prefix): array
    {
        $prefix = rtrim($prefix, '_') . '_';
        $result = [];
        foreach ($data as $key => $value) {
            if (str_starts_with($key, $prefix)) {
                $stripped = substr($key, strlen($prefix));
                $result[$stripped] = $value;
            }
        }
        return $result;
    }
}
