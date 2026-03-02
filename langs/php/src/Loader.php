<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Main loader orchestrator.
 */
final class Loader
{
    public function __construct(
        private readonly LoadOptions $options,
    ) {}

    public function load(): Config
    {
        $layers = [];

        if ($this->options->sources !== null) {
            foreach ($this->options->sources as $source) {
                $data = $this->loadSource($source);
                if (!empty($data)) {
                    $layers[] = $data;
                }
            }
        } else {
            $this->appendIf($layers, $this->options->defaults);
            $this->appendIf($layers, $this->loadYamlFiles());
            $this->appendIf($layers, $this->loadJsonFiles());
            $this->appendIf($layers, $this->loadDotenvFiles());
            $this->appendIf($layers, $this->loadEnvVars());
        }

        $merged = [];
        foreach ($layers as $layer) {
            $merged = Merger::deepMerge($merged, $layer);
        }

        return new Config($merged);
    }

    /**
     * @param array<int, array<string, mixed>> $layers
     * @param array<string, mixed> $data
     */
    private function appendIf(array &$layers, array $data): void
    {
        if (!empty($data)) {
            $layers[] = $data;
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function loadSource(string $name): array
    {
        return match ($name) {
            'defaults' => $this->options->defaults,
            'yaml' => $this->loadYamlFiles(),
            'json' => $this->loadJsonFiles(),
            'dotenv' => $this->loadDotenvFiles(),
            'env' => $this->loadEnvVars(),
            default => [],
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function loadDotenvFiles(): array
    {
        $candidates = ['.env'];
        if ($this->options->env !== null) {
            $candidates[] = '.env.' . $this->options->env;
        }
        $candidates[] = '.env.local';

        $merged = [];
        foreach ($candidates as $filename) {
            if (!file_exists($filename)) {
                continue;
            }

            $data = $this->parseDotenv($filename);
            $merged = Merger::deepMerge($merged, $data);
        }

        return $merged;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseDotenv(string $filepath): array
    {
        $lines = file($filepath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if ($lines === false) {
            return [];
        }

        $result = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }

            // Strip optional export prefix
            if (str_starts_with($line, 'export ')) {
                $line = substr($line, 7);
            }

            $eqPos = strpos($line, '=');
            if ($eqPos === false) {
                continue;
            }

            $key = trim(substr($line, 0, $eqPos));
            $value = trim(substr($line, $eqPos + 1));

            // Remove surrounding quotes
            if (strlen($value) >= 2) {
                $first = $value[0];
                $last = $value[strlen($value) - 1];
                if ($first === $last && ($first === '"' || $first === "'")) {
                    $value = substr($value, 1, -1);
                }
            }

            $result[strtolower($key)] = Coercion::coerce($value);
        }

        return $result;
    }

    /**
     * @return array<string, mixed>
     */
    private function loadYamlFiles(): array
    {
        if (!function_exists('yaml_parse_file')) {
            return [];
        }

        $candidates = ['config.yaml', 'config.yml'];
        if ($this->options->env !== null) {
            $candidates[] = 'config.' . $this->options->env . '.yaml';
            $candidates[] = 'config.' . $this->options->env . '.yml';
        }

        $merged = [];
        foreach ($candidates as $filename) {
            if (!file_exists($filename)) {
                continue;
            }
            /** @var array<string, mixed>|false $data */
            $data = yaml_parse_file($filename);
            if (is_array($data)) {
                $merged = Merger::deepMerge($merged, $data);
            }
        }

        return $merged;
    }

    /**
     * @return array<string, mixed>
     */
    private function loadJsonFiles(): array
    {
        $candidates = ['config.json'];
        if ($this->options->env !== null) {
            $candidates[] = 'config.' . $this->options->env . '.json';
        }

        $merged = [];
        foreach ($candidates as $filename) {
            if (!file_exists($filename)) {
                continue;
            }

            $content = file_get_contents($filename);
            if ($content === false) {
                continue;
            }

            /** @var array<string, mixed>|null $data */
            $data = json_decode($content, true);
            if (is_array($data)) {
                $merged = Merger::deepMerge($merged, $data);
            }
        }

        return $merged;
    }

    /**
     * @return array<string, mixed>
     */
    private function loadEnvVars(): array
    {
        $result = [];
        $prefix = $this->options->prefix !== null
            ? strtoupper($this->options->prefix) . '_'
            : null;

        foreach (getenv() as $key => $value) {
            if (!is_string($value)) {
                continue;
            }

            if ($prefix !== null) {
                if (!str_starts_with($key, $prefix)) {
                    continue;
                }
                $cleanKey = strtolower(substr($key, strlen($prefix)));
                $this->setNested($result, $cleanKey, Coercion::coerce($value));
            } else {
                $result[strtolower($key)] = Coercion::coerce($value);
            }
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $data
     */
    private function setNested(array &$data, string $key, mixed $value): void
    {
        $parts = explode('_', $key);
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
