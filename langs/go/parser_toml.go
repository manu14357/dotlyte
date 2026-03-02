package dotlyte

import (
	"fmt"
	"os"

	"github.com/BurntSushi/toml"
)

// loadTomlFiles loads TOML config files in priority order.
func loadTomlFiles(env string) (map[string]any, error) {
	candidates := []string{"config.toml"}
	if env != "" {
		candidates = append(candidates, fmt.Sprintf("config.%s.toml", env))
	}

	merged := make(map[string]any)
	for _, filename := range candidates {
		if _, err := os.Stat(filename); os.IsNotExist(err) {
			continue
		}
		data, err := parseTOMLFile(filename)
		if err != nil {
			return nil, err
		}
		merged = DeepMerge(merged, data)
	}
	return merged, nil
}

func parseTOMLFile(filepath string) (map[string]any, error) {
	content, err := os.ReadFile(filepath)
	if err != nil {
		return nil, err
	}

	var data map[string]any
	if err := toml.Unmarshal(content, &data); err != nil {
		return nil, &ParseError{
			DotlyteError: DotlyteError{Message: err.Error()},
			File:         filepath,
		}
	}

	return data, nil
}
