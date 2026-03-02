package dotlyte

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// loadYAMLFiles loads YAML config files in priority order.
func loadYAMLFiles(env string) (map[string]any, error) {
	candidates := []string{"config.yaml", "config.yml"}
	if env != "" {
		candidates = append(candidates,
			fmt.Sprintf("config.%s.yaml", env),
			fmt.Sprintf("config.%s.yml", env),
		)
	}

	merged := make(map[string]any)
	for _, filename := range candidates {
		if _, err := os.Stat(filename); os.IsNotExist(err) {
			continue
		}
		data, err := parseYAMLFile(filename)
		if err != nil {
			return nil, err
		}
		merged = DeepMerge(merged, data)
	}
	return merged, nil
}

func parseYAMLFile(filepath string) (map[string]any, error) {
	content, err := os.ReadFile(filepath)
	if err != nil {
		return nil, err
	}

	var data map[string]any
	if err := yaml.Unmarshal(content, &data); err != nil {
		return nil, &ParseError{
			DotlyteError: DotlyteError{Message: err.Error()},
			File:         filepath,
		}
	}

	return data, nil
}
