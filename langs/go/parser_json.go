package dotlyte

import (
	"encoding/json"
	"fmt"
	"os"
)

// loadJSONFiles loads JSON config files in priority order.
func loadJSONFiles(env string) (map[string]any, error) {
	candidates := []string{"config.json"}
	if env != "" {
		candidates = append(candidates, fmt.Sprintf("config.%s.json", env))
	}

	merged := make(map[string]any)
	for _, filename := range candidates {
		if _, err := os.Stat(filename); os.IsNotExist(err) {
			continue
		}
		data, err := parseJSONFile(filename)
		if err != nil {
			return nil, err
		}
		merged = DeepMerge(merged, data)
	}
	return merged, nil
}

func parseJSONFile(filepath string) (map[string]any, error) {
	content, err := os.ReadFile(filepath)
	if err != nil {
		return nil, err
	}

	var data map[string]any
	if err := json.Unmarshal(content, &data); err != nil {
		return nil, &ParseError{
			DotlyteError: DotlyteError{Message: err.Error()},
			File:         filepath,
		}
	}

	return data, nil
}
