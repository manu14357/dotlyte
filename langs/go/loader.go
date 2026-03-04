package dotlyte

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// Source is the plugin interface for custom config sources.
type Source interface {
	Name() string
	Load() (map[string]any, error)
}

// LoadOptions configures the behavior of Load().
type LoadOptions struct {
	// Files is an explicit list of files to load.
	// Auto-discovers if empty. Returns FileError for missing explicit files.
	Files []string

	// Prefix strips environment variable prefixes.
	// e.g., "APP" makes APP_DB_HOST available as "db.host".
	Prefix string

	// Defaults provides fallback values (lowest priority).
	Defaults map[string]any

	// Sources specifies a custom source loading order.
	// Valid: "env", "dotenv", "yaml", "json", "toml", "defaults".
	Sources []string

	// Env is the environment name (e.g., "production").
	// Loads env-specific files like config.production.yaml.
	Env string

	// Schema defines validation rules for config keys.
	Schema DotlyteSchema

	// Strict enables strict schema validation (reject unknown keys).
	Strict bool

	// Plugins are custom Source implementations added to the pipeline.
	Plugins []Source

	// Watch enables file watching for hot-reload.
	Watch bool

	// DebounceMs is the debounce interval for file watching (default: 100).
	DebounceMs int

	// InterpolateVars enables ${VAR} interpolation in .env files.
	InterpolateVars *bool // nil = true (default enabled)

	// Override provides values that override everything (highest priority).
	Override map[string]any

	// Debug enables debug logging.
	Debug bool

	// FindUp walks up directories to find config files.
	FindUp bool

	// RootMarkers are filenames that indicate a project root (for FindUp).
	RootMarkers []string

	// Cwd overrides the working directory for file resolution.
	Cwd string

	// AllowAllEnvVars disables env var blocklist (v1 behavior).
	AllowAllEnvVars bool
}

// Load loads configuration from all available sources with layered priority.
func Load(opts *LoadOptions) (*Config, error) {
	if opts == nil {
		opts = &LoadOptions{}
	}

	debugLog := func(format string, args ...any) {
		if opts.Debug {
			log.Printf("[dotlyte] "+format, args...)
		}
	}

	// Resolve working directory
	cwd := opts.Cwd
	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			cwd = "."
		}
	}

	// FindUp: walk up to project root
	if opts.FindUp {
		cwd = findBaseDir(cwd, opts.RootMarkers)
		debugLog("resolved base dir: %s", cwd)
	}

	// Resolve env from DOTLYTE_ENV / NODE_ENV
	env := opts.Env
	if env == "" {
		if e := os.Getenv("DOTLYTE_ENV"); e != "" {
			env = e
		} else if e := os.Getenv("NODE_ENV"); e != "" {
			env = e
		}
	}

	shouldInterpolate := opts.InterpolateVars == nil || *opts.InterpolateVars

	var layers []map[string]any
	var filesLoaded []string

	// Explicit files mode
	if len(opts.Files) > 0 {
		for _, file := range opts.Files {
			absPath := resolvePath(cwd, file)
			if _, err := os.Stat(absPath); os.IsNotExist(err) {
				return nil, &FileError{
					DotlyteError: DotlyteError{
						Message: fmt.Sprintf("file not found: %s", absPath),
						Code:    "FILE_NOT_FOUND",
					},
					File: absPath,
				}
			}

			data, err := parseFileByExtension(absPath, shouldInterpolate)
			if err != nil {
				return nil, err
			}
			if len(data) > 0 {
				layers = append(layers, data)
				filesLoaded = append(filesLoaded, absPath)
				debugLog("loaded explicit file: %s (%d keys)", absPath, len(data))
			}
		}
	} else if len(opts.Sources) > 0 {
		// Custom source order
		for _, source := range opts.Sources {
			data, loaded, err := loadSourceV2(source, opts, cwd, env, shouldInterpolate)
			if err != nil {
				return nil, err
			}
			if len(data) > 0 {
				layers = append(layers, data)
				debugLog("loaded source '%s' (%d keys)", source, len(data))
			}
			filesLoaded = append(filesLoaded, loaded...)
		}
	} else {
		// Default priority stack (lowest to highest)
		debugLog("auto-discovering config sources")

		appendIfNonEmpty(&layers, opts.Defaults)

		if data, err := loadTomlFilesInDir(cwd, env); err != nil {
			return nil, err
		} else if len(data) > 0 {
			layers = append(layers, data)
		}

		if data, err := loadYAMLFilesInDir(cwd, env); err != nil {
			return nil, err
		} else if len(data) > 0 {
			layers = append(layers, data)
		}

		if data, err := loadJSONFilesInDir(cwd, env); err != nil {
			return nil, err
		} else if len(data) > 0 {
			layers = append(layers, data)
		}

		dotenvData, dotenvFiles, err := loadDotenvFilesV2(cwd, env, shouldInterpolate)
		if err != nil {
			return nil, err
		}
		appendIfNonEmpty(&layers, dotenvData)
		filesLoaded = append(filesLoaded, dotenvFiles...)

		envData := loadEnvVarsV2(opts.Prefix, opts.AllowAllEnvVars)
		appendIfNonEmpty(&layers, envData)
	}

	// Load plugins
	for _, plugin := range opts.Plugins {
		data, err := plugin.Load()
		if err != nil {
			return nil, fmt.Errorf("dotlyte: plugin '%s' failed: %w", plugin.Name(), err)
		}
		if len(data) > 0 {
			layers = append(layers, data)
			debugLog("loaded plugin '%s' (%d keys)", plugin.Name(), len(data))
		}
	}

	// Apply override (highest priority)
	if len(opts.Override) > 0 {
		layers = append(layers, opts.Override)
	}

	// Merge all layers
	merged := make(map[string]any)
	for _, layer := range layers {
		merged = DeepMerge(merged, layer)
	}

	// Decrypt encrypted values
	encKey := ResolveEncryptionKey(env)
	if encKey != "" {
		var err error
		merged, err = DecryptMap(merged, encKey)
		if err != nil {
			return nil, err
		}
		debugLog("decrypted encrypted values")
	}

	// Apply schema defaults
	if opts.Schema != nil {
		merged = ApplySchemaDefaults(merged, opts.Schema)
	}

	// Build config
	config := NewConfig(merged)

	// Schema
	if opts.Schema != nil {
		config.SetSchema(opts.Schema)

		// Build sensitive keys from schema + auto-detect
		schemaKeys := GetSensitiveKeys(opts.Schema)
		config.SetSensitiveKeys(BuildSensitiveSet(merged, schemaKeys))

		// Validate
		violations := ValidateSchema(merged, opts.Schema, opts.Strict)
		if len(violations) > 0 {
			return config, &ValidationError{
				DotlyteError: DotlyteError{
					Message: "schema validation failed",
					Code:    "VALIDATION_FAILED",
				},
				Violations: violations,
			}
		}
	} else {
		config.SetSensitiveKeys(BuildSensitiveSet(merged, nil))
	}

	// File watching
	if opts.Watch && len(filesLoaded) > 0 {
		debounce := opts.DebounceMs
		if debounce <= 0 {
			debounce = 100
		}
		watcher := NewConfigWatcher(filesLoaded, debounce)
		config.SetWatcher(watcher)

		watcher.Start(func() (map[string]any, error) {
			reloadOpts := *opts
			reloadOpts.Watch = false // don't recurse
			reloadConfig, err := Load(&reloadOpts)
			if err != nil {
				return nil, err
			}
			return reloadConfig.ToMap(), nil
		})

		debugLog("watching %d files", len(filesLoaded))
	}

	debugLog("config loaded: %d total keys", len(merged))
	return config, nil
}

func appendIfNonEmpty(layers *[]map[string]any, data map[string]any) {
	if len(data) > 0 {
		*layers = append(*layers, data)
	}
}

func loadSourceV2(name string, opts *LoadOptions, cwd, env string, interpolate bool) (map[string]any, []string, error) {
	switch name {
	case "defaults":
		return opts.Defaults, nil, nil
	case "toml":
		data, err := loadTomlFilesInDir(cwd, env)
		return data, nil, err
	case "yaml":
		data, err := loadYAMLFilesInDir(cwd, env)
		return data, nil, err
	case "json":
		data, err := loadJSONFilesInDir(cwd, env)
		return data, nil, err
	case "dotenv":
		return loadDotenvFilesV2(cwd, env, interpolate)
	case "env":
		return loadEnvVarsV2(opts.Prefix, opts.AllowAllEnvVars), nil, nil
	default:
		return nil, nil, nil
	}
}

func resolvePath(cwd, file string) string {
	if filepath.IsAbs(file) {
		return file
	}
	return filepath.Join(cwd, file)
}

func parseFileByExtension(absPath string, interpolate bool) (map[string]any, error) {
	ext := strings.ToLower(filepath.Ext(absPath))
	base := strings.ToLower(filepath.Base(absPath))

	switch {
	case ext == ".json":
		return parseJSONFile(absPath)
	case ext == ".yaml" || ext == ".yml":
		return parseYAMLFile(absPath)
	case ext == ".toml":
		return parseTOMLFile(absPath)
	case strings.HasPrefix(base, ".env") || ext == ".env":
		return parseDotenvFileV2(absPath, interpolate)
	default:
		// Try as dotenv
		return parseDotenvFileV2(absPath, interpolate)
	}
}

// findBaseDir walks up directories looking for project root markers.
func findBaseDir(startDir string, rootMarkers []string) string {
	if len(rootMarkers) == 0 {
		rootMarkers = []string{".git", "package.json", "go.mod", "Cargo.toml", "pyproject.toml"}
	}
	dir := startDir
	for {
		for _, marker := range rootMarkers {
			if _, err := os.Stat(filepath.Join(dir, marker)); err == nil {
				return dir
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return startDir
}

// loadTomlFilesInDir loads TOML files from a specific directory.
func loadTomlFilesInDir(dir, env string) (map[string]any, error) {
	candidates := []string{"config.toml"}
	if env != "" {
		candidates = append(candidates, fmt.Sprintf("config.%s.toml", env))
	}
	merged := make(map[string]any)
	for _, filename := range candidates {
		absPath := filepath.Join(dir, filename)
		if _, err := os.Stat(absPath); os.IsNotExist(err) {
			continue
		}
		data, err := parseTOMLFile(absPath)
		if err != nil {
			return nil, err
		}
		merged = DeepMerge(merged, data)
	}
	return merged, nil
}

// loadYAMLFilesInDir loads YAML files from a specific directory.
func loadYAMLFilesInDir(dir, env string) (map[string]any, error) {
	candidates := []string{"config.yaml", "config.yml"}
	if env != "" {
		candidates = append(candidates,
			fmt.Sprintf("config.%s.yaml", env),
			fmt.Sprintf("config.%s.yml", env),
		)
	}
	merged := make(map[string]any)
	for _, filename := range candidates {
		absPath := filepath.Join(dir, filename)
		if _, err := os.Stat(absPath); os.IsNotExist(err) {
			continue
		}
		data, err := parseYAMLFile(absPath)
		if err != nil {
			return nil, err
		}
		merged = DeepMerge(merged, data)
	}
	return merged, nil
}

// loadJSONFilesInDir loads JSON files from a specific directory.
func loadJSONFilesInDir(dir, env string) (map[string]any, error) {
	candidates := []string{"config.json"}
	if env != "" {
		candidates = append(candidates, fmt.Sprintf("config.%s.json", env))
	}
	merged := make(map[string]any)
	for _, filename := range candidates {
		absPath := filepath.Join(dir, filename)
		if _, err := os.Stat(absPath); os.IsNotExist(err) {
			continue
		}
		data, err := parseJSONFile(absPath)
		if err != nil {
			return nil, err
		}
		merged = DeepMerge(merged, data)
	}
	return merged, nil
}
