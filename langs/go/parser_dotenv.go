package dotlyte

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// loadDotenvFiles loads .env files in priority order.
func loadDotenvFiles(env string) (map[string]any, error) {
	candidates := []string{".env"}
	if env != "" {
		candidates = append(candidates, fmt.Sprintf(".env.%s", env))
	}
	candidates = append(candidates, ".env.local")

	merged := make(map[string]any)
	for _, filename := range candidates {
		if _, err := os.Stat(filename); os.IsNotExist(err) {
			continue
		}
		data, err := parseDotenvFile(filename)
		if err != nil {
			return nil, err
		}
		merged = DeepMerge(merged, data)
	}
	return merged, nil
}

func parseDotenvFile(filepath string) (map[string]any, error) {
	file, err := os.Open(filepath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	result := make(map[string]any)
	scanner := bufio.NewScanner(file)
	lineNum := 0

	for scanner.Scan() {
		lineNum++
		line := strings.TrimSpace(scanner.Text())

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Strip optional "export " prefix
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(line[7:])
		}

		// Parse KEY=VALUE
		eqIdx := strings.Index(line, "=")
		if eqIdx == -1 {
			return nil, &ParseError{
				DotlyteError: DotlyteError{
					Message: fmt.Sprintf("expected KEY=VALUE at line %d, got: %q", lineNum, line),
				},
				File: filepath,
			}
		}

		key := strings.TrimSpace(line[:eqIdx])
		value := strings.TrimSpace(line[eqIdx+1:])

		// Remove surrounding quotes
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[0] == value[len(value)-1] {
			value = value[1 : len(value)-1]
		}

		result[strings.ToLower(key)] = Coerce(value)
	}

	return result, scanner.Err()
}
