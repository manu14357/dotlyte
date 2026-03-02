package dotlyte

import (
	"os"
	"strings"
)

// loadEnvVars parses environment variables into a config map.
func loadEnvVars(prefix string) map[string]any {
	result := make(map[string]any)
	pfx := ""
	if prefix != "" {
		pfx = strings.ToUpper(prefix) + "_"
	}

	for _, e := range os.Environ() {
		parts := strings.SplitN(e, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key, value := parts[0], parts[1]

		if pfx != "" {
			if !strings.HasPrefix(key, pfx) {
				continue
			}
			cleanKey := strings.ToLower(key[len(pfx):])
			setNested(result, cleanKey, Coerce(value))
		} else {
			result[strings.ToLower(key)] = Coerce(value)
		}
	}

	return result
}

func setNested(data map[string]any, key string, value any) {
	parts := strings.Split(key, "_")
	current := data

	for _, part := range parts[:len(parts)-1] {
		if _, ok := current[part]; !ok {
			current[part] = make(map[string]any)
		}
		if m, ok := current[part].(map[string]any); ok {
			current = m
		} else {
			current[part] = make(map[string]any)
			current = current[part].(map[string]any)
		}
	}

	current[parts[len(parts)-1]] = value
}
