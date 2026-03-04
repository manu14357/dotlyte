package dotlyte

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// loadDotenvFiles loads .env files in priority order (v1 compat).
func loadDotenvFiles(env string) (map[string]any, error) {
	data, _, err := loadDotenvFilesV2(".", env, false)
	return data, err
}

// loadDotenvFilesV2 loads .env files with interpolation support.
func loadDotenvFilesV2(dir, env string, interpolate bool) (map[string]any, []string, error) {
	candidates := []string{".env"}
	if env != "" {
		candidates = append(candidates, fmt.Sprintf(".env.%s", env))
	}
	candidates = append(candidates, ".env.local")

	merged := make(map[string]any)
	var filesLoaded []string
	rawMerged := make(map[string]string)

	for _, filename := range candidates {
		absPath := dir + "/" + filename
		if _, err := os.Stat(absPath); os.IsNotExist(err) {
			continue
		}

		if interpolate {
			raw, err := parseDotenvRaw(absPath)
			if err != nil {
				return nil, nil, err
			}
			for k, v := range raw {
				rawMerged[k] = v
			}
		} else {
			data, err := parseDotenvFile(absPath)
			if err != nil {
				return nil, nil, err
			}
			merged = DeepMerge(merged, data)
		}
		filesLoaded = append(filesLoaded, absPath)
	}

	if interpolate && len(rawMerged) > 0 {
		resolved, err := Interpolate(rawMerged, nil)
		if err != nil {
			return nil, filesLoaded, err
		}
		for k, v := range resolved {
			merged[k] = Coerce(v)
		}
	}

	return merged, filesLoaded, nil
}

// parseDotenvFileV2 parses a .env file with optional interpolation.
func parseDotenvFileV2(filepath string, interpolate bool) (map[string]any, error) {
	if interpolate {
		raw, err := parseDotenvRaw(filepath)
		if err != nil {
			return nil, err
		}
		resolved, err := Interpolate(raw, nil)
		if err != nil {
			return nil, err
		}
		result := make(map[string]any, len(resolved))
		for k, v := range resolved {
			result[k] = Coerce(v)
		}
		return result, nil
	}
	return parseDotenvFile(filepath)
}

// parseDotenvRaw returns raw string values (no coercion) for interpolation.
func parseDotenvRaw(filepath string) (map[string]string, error) {
	file, err := os.Open(filepath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	result := make(map[string]string)
	scanner := bufio.NewScanner(file)
	lineNum := 0
	var lines []string

	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	i := 0
	for i < len(lines) {
		lineNum++
		line := strings.TrimSpace(lines[i])
		i++

		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(line[7:])
		}

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

		// Handle double-quoted multiline
		if strings.HasPrefix(value, "\"") && !strings.HasSuffix(value, "\"") {
			parts := []string{value[1:]}
			for i < len(lines) {
				nextLine := lines[i]
				i++
				lineNum++
				if strings.HasSuffix(strings.TrimRight(nextLine, " \t"), "\"") {
					parts = append(parts, strings.TrimRight(nextLine, " \t\""))
					break
				}
				parts = append(parts, nextLine)
			}
			value = strings.Join(parts, "\n")
		} else if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[0] == value[len(value)-1] {
			value = value[1 : len(value)-1]
		} else if value != "" && value[0] != '"' && value[0] != '\'' {
			// Strip inline comments for unquoted values
			if hashIdx := strings.Index(value, " #"); hashIdx != -1 {
				value = strings.TrimSpace(value[:hashIdx])
			}
		}

		// Process escape sequences
		value = strings.ReplaceAll(value, "\\n", "\n")
		value = strings.ReplaceAll(value, "\\t", "\t")
		value = strings.ReplaceAll(value, "\\\\", "\\")

		result[strings.ToLower(key)] = value
	}

	return result, nil
}

func parseDotenvFile(filepath string) (map[string]any, error) {
	raw, err := parseDotenvRaw(filepath)
	if err != nil {
		return nil, err
	}
	result := make(map[string]any, len(raw))
	for k, v := range raw {
		result[k] = Coerce(v)
	}
	return result, nil
}
