package dotlyte

import (
	"regexp"
	"strings"
)

// REDACTED is the replacement string for sensitive values.
const REDACTED = "[REDACTED]"

// sensitivePatterns matches common secret key names.
var sensitivePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)password`),
	regexp.MustCompile(`(?i)secret`),
	regexp.MustCompile(`(?i)token`),
	regexp.MustCompile(`(?i)api[_\-]?key`),
	regexp.MustCompile(`(?i)private[_\-]?key`),
	regexp.MustCompile(`(?i)access[_\-]?key`),
	regexp.MustCompile(`(?i)auth`),
	regexp.MustCompile(`(?i)credential`),
	regexp.MustCompile(`(?i)connection[_\-]?string`),
	regexp.MustCompile(`(?i)dsn`),
	regexp.MustCompile(`(?i)encryption[_\-]?key`),
	regexp.MustCompile(`(?i)signing[_\-]?key`),
	regexp.MustCompile(`(?i)certificate`),
}

// BuildSensitiveSet returns a set of keys that should be redacted,
// combining auto-detected keys with schema-declared sensitive keys.
func BuildSensitiveSet(data map[string]any, schemaKeys []string) map[string]bool {
	set := make(map[string]bool)

	// Add schema-declared keys
	for _, k := range schemaKeys {
		set[k] = true
	}

	// Auto-detect from key names
	keys := flattenKeys(data, "")
	for _, key := range keys {
		for _, pat := range sensitivePatterns {
			if pat.MatchString(key) {
				set[key] = true
				break
			}
		}
	}

	return set
}

// RedactMap returns a deep copy of the data map with sensitive values replaced by REDACTED.
func RedactMap(data map[string]any, sensitiveKeys map[string]bool) map[string]any {
	return redactMapInner(data, sensitiveKeys, "")
}

func redactMapInner(data map[string]any, sensitiveKeys map[string]bool, prefix string) map[string]any {
	result := make(map[string]any, len(data))
	for k, v := range data {
		fullKey := k
		if prefix != "" {
			fullKey = prefix + "." + k
		}

		if sensitiveKeys[fullKey] {
			result[k] = REDACTED
			continue
		}

		if m, ok := v.(map[string]any); ok {
			result[k] = redactMapInner(m, sensitiveKeys, fullKey)
		} else {
			result[k] = v
		}
	}
	return result
}

// FormatRedacted formats a value as a partially visible redacted string.
// Shows first 2 chars and masks the rest: "ab****"
func FormatRedacted(value string) string {
	if len(value) <= 4 {
		return strings.Repeat("*", len(value))
	}
	return value[:2] + strings.Repeat("*", len(value)-2)
}
