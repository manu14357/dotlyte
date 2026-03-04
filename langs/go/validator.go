package dotlyte

import (
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// SchemaRule defines validation constraints for a single config key.
type SchemaRule struct {
	Type      string         // "string", "number", "boolean", "array", "object"
	Required  bool           // key must exist
	Format    string         // built-in format: url, email, ip, ipv4, ipv6, hostname, port, uuid, date
	Pattern   string         // regex pattern for string values
	Enum      []any          // allowed values
	Min       *float64       // minimum (for numbers)
	Max       *float64       // maximum (for numbers)
	Default   any            // default value if missing
	Sensitive bool           // marks key as containing secrets
	Doc       string         // documentation string
	Validator func(any) bool // custom validation function
}

// DotlyteSchema maps config keys to their SchemaRules.
type DotlyteSchema map[string]*SchemaRule

// SchemaViolation describes a single schema validation failure.
type SchemaViolation struct {
	Key     string
	Message string
	Rule    string // which rule failed: "required", "type", "format", "enum", "min", "max", "pattern", "validator"
}

func (v *SchemaViolation) String() string {
	return fmt.Sprintf("%s: %s (%s)", v.Key, v.Message, v.Rule)
}

// ValidateSchema checks config data against a schema, returning all violations.
func ValidateSchema(data map[string]any, schema DotlyteSchema, strict bool) []SchemaViolation {
	var violations []SchemaViolation

	for key, rule := range schema {
		val := getNestedValue(data, key)

		if val == nil {
			if rule.Required {
				violations = append(violations, SchemaViolation{
					Key:     key,
					Message: fmt.Sprintf("required key '%s' is missing", key),
					Rule:    "required",
				})
			}
			continue
		}

		// Type check
		if rule.Type != "" && !checkType(val, rule.Type) {
			violations = append(violations, SchemaViolation{
				Key:     key,
				Message: fmt.Sprintf("expected type '%s', got %T", rule.Type, val),
				Rule:    "type",
			})
		}

		// Format check
		if rule.Format != "" {
			if s, ok := val.(string); ok {
				if !checkFormat(s, rule.Format) {
					violations = append(violations, SchemaViolation{
						Key:     key,
						Message: fmt.Sprintf("value '%s' does not match format '%s'", s, rule.Format),
						Rule:    "format",
					})
				}
			}
		}

		// Pattern check
		if rule.Pattern != "" {
			if s, ok := val.(string); ok {
				if matched, _ := regexp.MatchString(rule.Pattern, s); !matched {
					violations = append(violations, SchemaViolation{
						Key:     key,
						Message: fmt.Sprintf("value '%s' does not match pattern '%s'", s, rule.Pattern),
						Rule:    "pattern",
					})
				}
			}
		}

		// Enum check
		if len(rule.Enum) > 0 {
			found := false
			for _, allowed := range rule.Enum {
				if fmt.Sprintf("%v", val) == fmt.Sprintf("%v", allowed) {
					found = true
					break
				}
			}
			if !found {
				violations = append(violations, SchemaViolation{
					Key:     key,
					Message: fmt.Sprintf("value '%v' is not one of allowed values: %v", val, rule.Enum),
					Rule:    "enum",
				})
			}
		}

		// Min/Max checks
		if rule.Min != nil || rule.Max != nil {
			num := toFloat64(val)
			if num != nil {
				if rule.Min != nil && *num < *rule.Min {
					violations = append(violations, SchemaViolation{
						Key:     key,
						Message: fmt.Sprintf("value %v is less than minimum %v", val, *rule.Min),
						Rule:    "min",
					})
				}
				if rule.Max != nil && *num > *rule.Max {
					violations = append(violations, SchemaViolation{
						Key:     key,
						Message: fmt.Sprintf("value %v is greater than maximum %v", val, *rule.Max),
						Rule:    "max",
					})
				}
			}
		}

		// Custom validator
		if rule.Validator != nil && !rule.Validator(val) {
			violations = append(violations, SchemaViolation{
				Key:     key,
				Message: fmt.Sprintf("custom validation failed for key '%s'", key),
				Rule:    "validator",
			})
		}
	}

	// Strict mode: reject keys not in schema
	if strict {
		flatKeys := flattenKeys(data, "")
		for _, k := range flatKeys {
			if _, exists := schema[k]; !exists {
				violations = append(violations, SchemaViolation{
					Key:     k,
					Message: fmt.Sprintf("unknown key '%s' (strict mode)", k),
					Rule:    "strict",
				})
			}
		}
	}

	return violations
}

// ApplySchemaDefaults fills in missing keys with schema default values.
func ApplySchemaDefaults(data map[string]any, schema DotlyteSchema) map[string]any {
	result := make(map[string]any)
	for k, v := range data {
		result[k] = v
	}

	for key, rule := range schema {
		if rule.Default != nil && getNestedValue(result, key) == nil {
			setNestedValue(result, key, rule.Default)
		}
	}

	return result
}

// GetSensitiveKeys returns all keys marked as sensitive in the schema.
func GetSensitiveKeys(schema DotlyteSchema) []string {
	var keys []string
	for key, rule := range schema {
		if rule.Sensitive {
			keys = append(keys, key)
		}
	}
	return keys
}

func getNestedValue(data map[string]any, key string) any {
	parts := strings.Split(key, ".")
	var current any = data
	for _, part := range parts {
		m, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current, ok = m[part]
		if !ok {
			return nil
		}
	}
	return current
}

func setNestedValue(data map[string]any, key string, value any) {
	parts := strings.Split(key, ".")
	current := data
	for _, part := range parts[:len(parts)-1] {
		if _, ok := current[part]; !ok {
			current[part] = make(map[string]any)
		}
		if m, ok := current[part].(map[string]any); ok {
			current = m
		} else {
			m := make(map[string]any)
			current[part] = m
			current = m
		}
	}
	current[parts[len(parts)-1]] = value
}

func flattenKeys(data map[string]any, prefix string) []string {
	var keys []string
	for k, v := range data {
		fullKey := k
		if prefix != "" {
			fullKey = prefix + "." + k
		}
		if m, ok := v.(map[string]any); ok {
			keys = append(keys, flattenKeys(m, fullKey)...)
		} else {
			keys = append(keys, fullKey)
		}
	}
	return keys
}

func checkType(val any, expected string) bool {
	switch expected {
	case "string":
		_, ok := val.(string)
		return ok
	case "number":
		return toFloat64(val) != nil
	case "boolean":
		_, ok := val.(bool)
		return ok
	case "array":
		_, ok := val.([]any)
		return ok
	case "object":
		_, ok := val.(map[string]any)
		return ok
	}
	return true
}

var (
	emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	uuidRegex  = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	dateRegex  = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

func checkFormat(val, format string) bool {
	switch format {
	case "url":
		u, err := url.ParseRequestURI(val)
		return err == nil && u.Scheme != "" && u.Host != ""
	case "email":
		return emailRegex.MatchString(val)
	case "ip":
		return net.ParseIP(val) != nil
	case "ipv4":
		ip := net.ParseIP(val)
		return ip != nil && ip.To4() != nil
	case "ipv6":
		ip := net.ParseIP(val)
		return ip != nil && ip.To4() == nil
	case "hostname":
		matched, _ := regexp.MatchString(`^[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]*[a-zA-Z0-9])?)*$`, val)
		return matched
	case "port":
		p, err := strconv.Atoi(val)
		return err == nil && p >= 1 && p <= 65535
	case "uuid":
		return uuidRegex.MatchString(val)
	case "date":
		return dateRegex.MatchString(val)
	default:
		// Treat format as regex pattern
		matched, err := regexp.MatchString(format, val)
		return err == nil && matched
	}
}

func toFloat64(val any) *float64 {
	var f float64
	switch v := val.(type) {
	case int:
		f = float64(v)
	case int64:
		f = float64(v)
	case float64:
		f = v
	case float32:
		f = float64(v)
	default:
		return nil
	}
	return &f
}
