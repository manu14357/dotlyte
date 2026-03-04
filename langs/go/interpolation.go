package dotlyte

import (
	"fmt"
	"os"
	"regexp"
	"strings"
)

var interpolationPattern = regexp.MustCompile(`\$\{([^}]+)\}`)

// Interpolate resolves ${VAR}, ${VAR:-default}, and ${VAR:?error} references
// within a flat string map. Resolution order: same-file values → context → os.Environ.
// Circular references are detected and cause an InterpolationError.
func Interpolate(data map[string]string, context map[string]string) (map[string]string, error) {
	result := make(map[string]string, len(data))
	resolving := make(map[string]bool)
	resolved := make(map[string]string)

	var resolve func(key string) (string, error)
	resolve = func(key string) (string, error) {
		if val, ok := resolved[key]; ok {
			return val, nil
		}
		if resolving[key] {
			return "", &InterpolationError{
				DotlyteError: DotlyteError{
					Message: fmt.Sprintf("circular reference detected: %s", key),
					Code:    "INTERPOLATION_CIRCULAR",
				},
				Variable: key,
			}
		}

		raw, exists := data[key]
		if !exists {
			// Try context then env
			if val, ok := context[key]; ok {
				return val, nil
			}
			return os.Getenv(strings.ToUpper(key)), nil
		}

		resolving[key] = true
		val, err := resolveString(raw, data, context, resolve)
		if err != nil {
			return "", err
		}
		delete(resolving, key)
		resolved[key] = val
		return val, nil
	}

	for key := range data {
		val, err := resolve(key)
		if err != nil {
			return nil, err
		}
		result[key] = val
	}

	return result, nil
}

func resolveString(
	s string,
	data map[string]string,
	context map[string]string,
	resolve func(string) (string, error),
) (string, error) {
	// Handle escaped $$
	s = strings.ReplaceAll(s, "$$", "\x00DOLLAR\x00")

	var lastErr error
	result := interpolationPattern.ReplaceAllStringFunc(s, func(match string) string {
		if lastErr != nil {
			return match
		}

		inner := match[2 : len(match)-1] // strip ${ and }

		var varName, fallback, errMsg string
		var hasFallback, hasError bool

		if idx := strings.Index(inner, ":?"); idx != -1 {
			varName = inner[:idx]
			errMsg = inner[idx+2:]
			hasError = true
		} else if idx := strings.Index(inner, ":-"); idx != -1 {
			varName = inner[:idx]
			fallback = inner[idx+2:]
			hasFallback = true
		} else {
			varName = inner
		}

		varName = strings.TrimSpace(varName)

		// Try resolving from same-file data
		if _, exists := data[strings.ToLower(varName)]; exists {
			val, err := resolve(strings.ToLower(varName))
			if err != nil {
				lastErr = err
				return match
			}
			if val != "" {
				return val
			}
		}

		// Try context
		if val, ok := context[strings.ToLower(varName)]; ok && val != "" {
			return val
		}

		// Try environment
		if val := os.Getenv(varName); val != "" {
			return val
		}
		// Also try uppercase
		if val := os.Getenv(strings.ToUpper(varName)); val != "" {
			return val
		}

		if hasError {
			lastErr = &InterpolationError{
				DotlyteError: DotlyteError{
					Message: fmt.Sprintf("required variable '%s': %s", varName, errMsg),
					Code:    "INTERPOLATION_REQUIRED",
				},
				Variable: varName,
			}
			return match
		}

		if hasFallback {
			return fallback
		}

		return ""
	})

	if lastErr != nil {
		return "", lastErr
	}

	result = strings.ReplaceAll(result, "\x00DOLLAR\x00", "$")
	return result, nil
}
