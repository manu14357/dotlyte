package dotlyte

import (
	"fmt"
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

// CompilePatterns converts glob-like patterns (e.g., "*_KEY", "DATABASE_*")
// to compiled regular expressions. Supports * as a wildcard for any characters.
// Returns an error if any pattern is invalid.
func CompilePatterns(patterns []string) ([]*regexp.Regexp, error) {
	compiled := make([]*regexp.Regexp, 0, len(patterns))
	for _, p := range patterns {
		// Escape regex special chars, then convert \* back to .*
		escaped := regexp.QuoteMeta(p)
		escaped = strings.ReplaceAll(escaped, `\*`, ".*")
		re, err := regexp.Compile("(?i)^" + escaped + "$")
		if err != nil {
			return nil, fmt.Errorf("dotlyte: invalid pattern '%s': %w", p, err)
		}
		compiled = append(compiled, re)
	}
	return compiled, nil
}

// BuildSensitiveSetWithPatterns builds a sensitive key set using custom glob
// patterns in addition to schema-declared sensitive keys and auto-detection.
// Patterns like "*_KEY", "*_SECRET", "DATABASE_*" match against key names.
func BuildSensitiveSetWithPatterns(keys []string, patterns []string, schemaSensitive map[string]bool) (map[string]bool, error) {
	result := make(map[string]bool)

	// Add schema-declared keys
	for k := range schemaSensitive {
		result[k] = true
	}

	// Compile custom patterns
	compiled, err := CompilePatterns(patterns)
	if err != nil {
		return nil, err
	}

	for _, key := range keys {
		// Check against custom patterns
		leaf := key
		if idx := strings.LastIndex(key, "."); idx >= 0 {
			leaf = key[idx+1:]
		}
		for _, re := range compiled {
			if re.MatchString(leaf) || re.MatchString(key) {
				result[key] = true
				break
			}
		}
		// Also check built-in patterns
		for _, pat := range sensitivePatterns {
			if pat.MatchString(leaf) {
				result[key] = true
				break
			}
		}
	}

	return result, nil
}

// AuditAccessFunc is a callback invoked when a sensitive key is accessed.
// The key parameter is the config key name, and context indicates the
// access context (always "server" in Go).
type AuditAccessFunc func(key, context string)

// AuditWrapper wraps a data map and fires an audit callback whenever a
// key in the sensitive set is accessed via Get.
type AuditWrapper struct {
	data          map[string]interface{}
	sensitiveKeys map[string]bool
	onAccess      AuditAccessFunc
}

// CreateAuditWrapper creates an AuditWrapper that triggers onAccess whenever
// a sensitive key is read. This is useful for SOC2/HIPAA compliance audit logging.
func CreateAuditWrapper(data map[string]interface{}, sensitiveKeys map[string]bool, onAccess AuditAccessFunc) *AuditWrapper {
	return &AuditWrapper{
		data:          data,
		sensitiveKeys: sensitiveKeys,
		onAccess:      onAccess,
	}
}

// Get retrieves a value by key. If the key is in the sensitive set,
// the audit callback is triggered before the value is returned.
func (aw *AuditWrapper) Get(key string) interface{} {
	if aw.sensitiveKeys[key] && aw.onAccess != nil {
		aw.onAccess(key, "server")
	}
	return aw.data[key]
}
