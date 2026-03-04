<?php

declare(strict_types=1);

namespace Dotlyte;

/**
 * Main loader orchestrator (v2).
 */
final class Loader
{
    private const SYSTEM_ENV_BLOCKLIST = [
        'PATH', 'HOME', 'USER', 'SHELL', 'TERM', 'LANG', 'LC_ALL',
        'LOGNAME', 'HOSTNAME', 'PWD', 'OLDPWD', 'SHLVL', 'TMPDIR',
        'EDITOR', 'VISUAL', 'PAGER', 'DISPLAY',
        'SSH_AUTH_SOCK', 'SSH_AGENT_PID', 'GPG_AGENT_INFO',
        'COLORTERM', 'TERM_PROGRAM', 'TERM_PROGRAM_VERSION',
        'XPC_FLAGS', 'XPC_SERVICE_NAME', 'COMMAND_MODE',
        'LS_COLORS', 'LSCOLORS', 'CLICOLOR', 'GREP_OPTIONS',
        'COMP_WORDBREAKS', 'HISTSIZE', 'HISTFILESIZE', 'HISTCONTROL',
    ];

    private const SYSTEM_PREFIXES = [
        'npm_', 'VSCODE_', 'ELECTRON_', 'CHROME_', 'GITHUB_', 'CI_',
        'GITLAB_', 'JENKINS_', 'TRAVIS_', 'CIRCLECI_', 'HOMEBREW_',
        'JAVA_HOME', 'GOPATH', 'NVM_', 'RVM_', 'RBENV_', 'PYENV_',
        'CONDA_', 'VIRTUAL_ENV', 'CARGO_HOME',
    ];

    public function __construct(
        private readonly LoadOptions $options,
    ) {}

    public function load(): Config
    {
        $baseDir = $this->options->findUp ? $this->findBaseDir() : ($this->options->cwd ?? getcwd());
        $layers = [];

        if ($this->options->files !== null && !empty($this->options->files)) {
            // Explicit file mode
            foreach ($this->options->files as $f) {
                $full = $this->resolvePath($f, $baseDir);
                if (!file_exists($full)) {
                    throw new FileException(
                        "Config file not found: {$full}",
                        filePath: $full
                    );
                }
                $data = $this->parseFileByExtension($full);
                $this->appendIf($layers, $data);
            }
        } elseif ($this->options->sources !== null) {
            foreach ($this->options->sources as $source) {
                $data = $this->loadSource($source, $baseDir);
                $this->appendIf($layers, $data);
            }
        } else {
            $this->appendIf($layers, $this->options->defaults);
            $this->appendIf($layers, $this->loadYamlFiles($baseDir));
            $this->appendIf($layers, $this->loadJsonFiles($baseDir));
            $this->appendIf($layers, $this->loadDotenvFiles($baseDir));
            $this->appendIf($layers, $this->loadEnvVars());
        }

        // Overrides (highest priority)
        $this->appendIf($layers, $this->options->overrides);

        $merged = [];
        foreach ($layers as $layer) {
            $merged = Merger::deepMerge($merged, $layer);
        }

        // Interpolation
        if ($this->options->interpolateVars) {
            $merged = Interpolation::interpolateDeep($merged);
        }

        // Schema defaults
        if ($this->options->schema !== null) {
            Validator::applyDefaults($merged, $this->options->schema);
        }

        // Decryption
        $encKey = Encryption::resolveEncryptionKey($this->options->env);
        if ($encKey !== null) {
            $this->decryptRecursive($merged, $encKey);
        }

        // Schema validation
        if ($this->options->schema !== null && $this->options->strict) {
            Validator::assertValid($merged, $this->options->schema, $this->options->strict);
        }

        // Sensitive keys
        $sensitive = [];
        if ($this->options->schema !== null) {
            $sensitive = Validator::sensitiveKeys($this->options->schema);
        }
        $sensitive = array_merge($sensitive, Masking::buildSensitiveSet($merged));
        $sensitive = array_values(array_unique($sensitive));

        return new Config($merged, $this->options->schema, $sensitive);
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

    private function findBaseDir(): string
    {
        $dir = realpath($this->options->cwd ?? getcwd()) ?: getcwd();

        while (true) {
            foreach ($this->options->rootMarkers as $marker) {
                if (file_exists($dir . DIRECTORY_SEPARATOR . $marker)) {
                    return $dir;
                }
            }
            $parent = dirname($dir);
            if ($parent === $dir) {
                return $this->options->cwd ?? getcwd();
            }
            $dir = $parent;
        }
    }

    private function resolvePath(string $file, string $baseDir): string
    {
        if (str_starts_with($file, '/') || str_starts_with($file, DIRECTORY_SEPARATOR)) {
            return $file;
        }
        return $baseDir . DIRECTORY_SEPARATOR . $file;
    }

    /**
     * @return array<string, mixed>
     */
    private function loadSource(string $name, string $baseDir): array
    {
        return match ($name) {
            'defaults' => $this->options->defaults,
            'yaml' => $this->loadYamlFiles($baseDir),
            'json' => $this->loadJsonFiles($baseDir),
            'dotenv' => $this->loadDotenvFiles($baseDir),
            'env' => $this->loadEnvVars(),
            default => [],
        };
    }

    /**
     * @return array<string, mixed>
     */
    private function loadDotenvFiles(string $baseDir): array
    {
        $candidates = ['.env'];
        if ($this->options->env !== null) {
            $candidates[] = '.env.' . $this->options->env;
        }
        $candidates[] = '.env.local';

        $merged = [];
        foreach ($candidates as $filename) {
            $full = $baseDir . DIRECTORY_SEPARATOR . $filename;
            if (!file_exists($full)) {
                continue;
            }

            $data = $this->parseDotenv($full);
            $merged = Merger::deepMerge($merged, $data);
        }

        return $merged;
    }

    /**
     * @return array<string, mixed>
     */
    private function parseDotenv(string $filepath): array
    {
        $content = file_get_contents($filepath);
        if ($content === false) {
            return [];
        }

        $lines = explode("\n", $content);
        $result = [];
        $i = 0;
        $count = count($lines);

        while ($i < $count) {
            $line = trim($lines[$i]);
            $i++;

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

            // Quoted values
            if (strlen($value) >= 1 && in_array($value[0], ['"', "'", '`'], true)) {
                $quote = $value[0];
                if ($quote === "'" || $quote === '`') {
                    // Single-quoted: find closing
                    $endIdx = strpos($value, $quote, 1);
                    $value = $endIdx !== false ? substr($value, 1, $endIdx - 1) : substr($value, 1);
                } else {
                    // Double-quoted: may be multiline
                    $stripped = substr($value, 1);
                    $closingIdx = strpos($stripped, '"');
                    if ($closingIdx !== false) {
                        $value = $this->processEscapes(substr($stripped, 0, $closingIdx));
                    } else {
                        // Multiline
                        $buf = $stripped;
                        while ($i < $count) {
                            $buf .= "\n" . $lines[$i];
                            $i++;
                            $closingIdx = strrpos($buf, '"');
                            if ($closingIdx !== false) {
                                $value = $this->processEscapes(substr($buf, 0, $closingIdx));
                                break;
                            }
                        }
                    }
                }
            } else {
                // Unquoted — strip inline comment
                $commentIdx = strpos($value, ' #');
                if ($commentIdx !== false) {
                    $value = rtrim(substr($value, 0, $commentIdx));
                }
            }

            $result[strtolower($key)] = Coercion::coerce($value);
        }

        return $result;
    }

    private function processEscapes(string $s): string
    {
        return str_replace(
            ['\\n', '\\t', '\\r', '\\"', '\\\\'],
            ["\n", "\t", "\r", '"', '\\'],
            $s
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function loadYamlFiles(string $baseDir): array
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
            $full = $baseDir . DIRECTORY_SEPARATOR . $filename;
            if (!file_exists($full)) {
                continue;
            }
            /** @var array<string, mixed>|false $data */
            $data = yaml_parse_file($full);
            if (is_array($data)) {
                $merged = Merger::deepMerge($merged, $data);
            }
        }

        return $merged;
    }

    /**
     * @return array<string, mixed>
     */
    private function loadJsonFiles(string $baseDir): array
    {
        $candidates = ['config.json'];
        if ($this->options->env !== null) {
            $candidates[] = 'config.' . $this->options->env . '.json';
        }

        $merged = [];
        foreach ($candidates as $filename) {
            $full = $baseDir . DIRECTORY_SEPARATOR . $filename;
            if (!file_exists($full)) {
                continue;
            }

            $content = file_get_contents($full);
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
                $coerced = Coercion::coerce($value);
                if ($coerced !== null) {
                    $this->setNested($result, $cleanKey, $coerced);
                }
            } elseif ($this->options->allowAllEnvVars) {
                $coerced = Coercion::coerce($value);
                if ($coerced !== null) {
                    $result[strtolower($key)] = $coerced;
                }
            } else {
                // Filter out system env vars
                if (in_array($key, self::SYSTEM_ENV_BLOCKLIST, true)) {
                    continue;
                }
                $skip = false;
                foreach (self::SYSTEM_PREFIXES as $pfx) {
                    if (str_starts_with($key, $pfx)) {
                        $skip = true;
                        break;
                    }
                }
                if (!$skip) {
                    $coerced = Coercion::coerce($value);
                    if ($coerced !== null) {
                        $result[strtolower($key)] = $coerced;
                    }
                }
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

    /**
     * @return array<string, mixed>
     */
    private function parseFileByExtension(string $fullPath): array
    {
        $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));

        return match ($ext) {
            'env' => $this->parseDotenv($fullPath),
            'yaml', 'yml' => function_exists('yaml_parse_file')
                ? (is_array($d = yaml_parse_file($fullPath)) ? $d : [])
                : [],
            'json' => is_array($d = json_decode(file_get_contents($fullPath) ?: '', true)) ? $d : [],
            default => $this->parseDotenv($fullPath), // fallback to dotenv
        };
    }

    /**
     * @param array<string, mixed> $data
     */
    private function decryptRecursive(array &$data, string $keyHex): void
    {
        foreach ($data as $k => &$v) {
            if (is_array($v)) {
                $this->decryptRecursive($v, $keyHex);
            } elseif (Encryption::isEncrypted($v)) {
                $v = Coercion::coerce(Encryption::decryptValue($v, $keyHex));
            }
        }
    }
}
