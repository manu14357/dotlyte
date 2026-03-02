package dotlyte

import (
	"strconv"
	"strings"
)

// Coerce auto-converts a string value to the appropriate Go type.
// Non-string values pass through unchanged.
func Coerce(value any) any {
	s, ok := value.(string)
	if !ok {
		return value
	}

	stripped := strings.TrimSpace(s)
	lower := strings.ToLower(stripped)

	// Null
	switch lower {
	case "null", "none", "nil", "":
		return nil
	}

	// Boolean true
	switch lower {
	case "true", "yes", "1", "on":
		return true
	}

	// Boolean false
	switch lower {
	case "false", "no", "0", "off":
		return false
	}

	// Integer
	if i, err := strconv.ParseInt(stripped, 10, 64); err == nil {
		return i
	}

	// Float (only if contains a dot)
	if strings.Contains(stripped, ".") {
		if f, err := strconv.ParseFloat(stripped, 64); err == nil {
			return f
		}
	}

	// List (comma-separated)
	if strings.Contains(stripped, ",") {
		parts := strings.Split(stripped, ",")
		result := make([]any, len(parts))
		for i, part := range parts {
			result[i] = Coerce(strings.TrimSpace(part))
		}
		return result
	}

	return stripped
}

// CoerceMap recursively coerces all string values in a map.
func CoerceMap(data map[string]any) map[string]any {
	result := make(map[string]any, len(data))
	for k, v := range data {
		switch val := v.(type) {
		case map[string]any:
			result[k] = CoerceMap(val)
		case string:
			result[k] = Coerce(val)
		default:
			result[k] = val
		}
	}
	return result
}
