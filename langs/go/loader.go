package dotlyte

// LoadOptions configures the behavior of Load().
type LoadOptions struct {
	// Files is an explicit list of files to load.
	// Auto-discovers if empty.
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
}

// Load loads configuration from all available sources with layered priority.
//
// Returns a Config object with Get(), Require(), and map-based access.
func Load(opts *LoadOptions) (*Config, error) {
	if opts == nil {
		opts = &LoadOptions{}
	}

	var layers []map[string]any

	if len(opts.Sources) > 0 {
		for _, source := range opts.Sources {
			data, err := loadSource(source, opts)
			if err != nil {
				return nil, err
			}
			if len(data) > 0 {
				layers = append(layers, data)
			}
		}
	} else {
		// Default priority stack (lowest to highest)
		appendIfNonEmpty(&layers, opts.Defaults)

		if data, err := loadTomlFiles(opts.Env); err != nil {
			return nil, err
		} else {
			appendIfNonEmpty(&layers, data)
		}

		if data, err := loadYAMLFiles(opts.Env); err != nil {
			return nil, err
		} else {
			appendIfNonEmpty(&layers, data)
		}

		if data, err := loadJSONFiles(opts.Env); err != nil {
			return nil, err
		} else {
			appendIfNonEmpty(&layers, data)
		}

		if data, err := loadDotenvFiles(opts.Env); err != nil {
			return nil, err
		} else {
			appendIfNonEmpty(&layers, data)
		}

		appendIfNonEmpty(&layers, loadEnvVars(opts.Prefix))
	}

	merged := make(map[string]any)
	for _, layer := range layers {
		merged = DeepMerge(merged, layer)
	}

	return NewConfig(merged), nil
}

func appendIfNonEmpty(layers *[]map[string]any, data map[string]any) {
	if len(data) > 0 {
		*layers = append(*layers, data)
	}
}

func loadSource(name string, opts *LoadOptions) (map[string]any, error) {
	switch name {
	case "defaults":
		return opts.Defaults, nil
	case "toml":
		return loadTomlFiles(opts.Env)
	case "yaml":
		return loadYAMLFiles(opts.Env)
	case "json":
		return loadJSONFiles(opts.Env)
	case "dotenv":
		return loadDotenvFiles(opts.Env)
	case "env":
		return loadEnvVars(opts.Prefix), nil
	default:
		return nil, nil
	}
}
