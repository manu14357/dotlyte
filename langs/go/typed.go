package dotlyte

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// FieldDescriptor defines the schema for a single typed configuration field.
type FieldDescriptor struct {
	// Type is the expected type: "string", "integer", "number", "boolean", "url".
	Type string

	// Required indicates the field must have a value. Defaults to true.
	Required bool

	// Default is the fallback value when the field is missing.
	Default interface{}

	// Enum restricts the value to one of these allowed values.
	Enum []interface{}

	// Min is the minimum value (for numbers) or minimum length (for strings).
	Min *float64

	// Max is the maximum value (for numbers) or maximum length (for strings).
	Max *float64

	// Sensitive marks the field as containing secret data (redacted in logs).
	Sensitive bool

	// Doc is a human-readable description of the field.
	Doc string
}

// TypedConfigOptions configures the behavior of CreateTypedConfig.
type TypedConfigOptions struct {
	// SkipValidation disables validation (useful in tests).
	SkipValidation bool

	// OnSecretAccess is called when a sensitive key is accessed (audit logging).
	OnSecretAccess func(key, context string)
}

// CreateTypedConfig creates a validated, typed configuration map from environment
// variables and a field schema. Values are coerced to their declared types and
// validated against constraints. Returns (nil, error) on validation failures.
func CreateTypedConfig(schema map[string]FieldDescriptor, opts ...TypedConfigOptions) (map[string]interface{}, error) {
	var options TypedConfigOptions
	if len(opts) > 0 {
		options = opts[0]
	}

	// Load config from environment
	config, err := Load(nil)
	if err != nil {
		return nil, err
	}
	raw := config.ToMap()
	envVars := os.Environ()
	envMap := make(map[string]string, len(envVars))
	for _, e := range envVars {
		if idx := strings.IndexByte(e, '='); idx >= 0 {
			envMap[e[:idx]] = e[idx+1:]
		}
	}

	result := make(map[string]interface{}, len(schema))
	var errors []string

	for key, desc := range schema {
		rawValue := lookupRawValue(raw, envMap, key)

		validated, err := validateTypedField(key, rawValue, desc)
		if err != nil {
			if options.SkipValidation {
				result[key] = rawValue
			} else {
				errors = append(errors, err.Error())
			}
			continue
		}
		result[key] = validated
	}

	if len(errors) > 0 {
		return nil, &ValidationError{
			DotlyteError: DotlyteError{
				Message: fmt.Sprintf("typed config validation failed with %d error(s): %s",
					len(errors), strings.Join(errors, "; ")),
				Code: "TYPED_CONFIG_VALIDATION_FAILED",
			},
		}
	}

	return result, nil
}

// CreateSectionedConfig creates a typed configuration with server/client/shared
// sections for SSR framework boundary enforcement. Server keys are restricted,
// client keys must start with clientPrefix, and shared keys are available everywhere.
func CreateSectionedConfig(
	server, client, shared map[string]FieldDescriptor,
	clientPrefix string,
	opts ...TypedConfigOptions,
) (map[string]interface{}, error) {
	if clientPrefix == "" {
		clientPrefix = "NEXT_PUBLIC_"
	}

	// Validate client keys start with prefix
	for key := range client {
		if !strings.HasPrefix(key, clientPrefix) {
			return nil, &DotlyteError{
				Message: fmt.Sprintf("client environment variable '%s' must start with '%s'", key, clientPrefix),
				Key:     key,
				Code:    "VALIDATION_ERROR",
			}
		}
	}

	// Merge all schemas and validate
	allSchema := make(map[string]FieldDescriptor)
	for k, v := range server {
		allSchema[k] = v
	}
	for k, v := range client {
		allSchema[k] = v
	}
	for k, v := range shared {
		allSchema[k] = v
	}

	result, err := CreateTypedConfig(allSchema, opts...)
	if err != nil {
		return nil, err
	}

	// Build boundary key sets
	serverKeys := make(map[string]bool, len(server))
	for k := range server {
		serverKeys[k] = true
	}
	clientKeys := make(map[string]bool, len(client))
	for k := range client {
		clientKeys[k] = true
	}
	sharedKeys := make(map[string]bool, len(shared))
	for k := range shared {
		sharedKeys[k] = true
	}

	var onSecretAccess func(string, string)
	if len(opts) > 0 {
		onSecretAccess = opts[0].OnSecretAccess
	}

	// Wrap in boundary config and return the underlying data
	bc := NewBoundaryConfig(result, serverKeys, clientKeys, sharedKeys, onSecretAccess)
	return bc.data, nil
}

// lookupRawValue tries to find a value by key in the loaded config and env vars.
func lookupRawValue(raw map[string]interface{}, envMap map[string]string, key string) interface{} {
	// Try loaded config first (case-insensitive)
	if v, ok := raw[strings.ToLower(key)]; ok {
		return v
	}
	if v, ok := raw[key]; ok {
		return v
	}
	// Try environment variables directly
	if v, ok := envMap[key]; ok {
		return v
	}
	return nil
}

// validateTypedField validates and coerces a single field value against its descriptor.
func validateTypedField(key string, raw interface{}, desc FieldDescriptor) (interface{}, error) {
	isRequired := desc.Required
	hasDefault := desc.Default != nil

	// Apply default
	value := raw
	if isEmpty(value) && hasDefault {
		value = desc.Default
	}

	// Check required
	if isEmpty(value) && isRequired {
		msg := fmt.Sprintf("missing required environment variable '%s'", key)
		if desc.Doc != "" {
			msg += fmt.Sprintf(" (%s)", desc.Doc)
		}
		msg += ". Set it in your .env file, config file, or as an environment variable."
		return nil, &MissingRequiredKeyError{
			DotlyteError: DotlyteError{
				Message: msg,
				Key:     key,
				Code:    "MISSING_REQUIRED_KEY",
			},
		}
	}

	// Optional and absent
	if isEmpty(value) {
		return nil, nil
	}

	// Coerce to target type
	coerced, err := coerceToType(key, value, desc.Type)
	if err != nil {
		return nil, err
	}

	// Enum validation
	if len(desc.Enum) > 0 {
		found := false
		for _, allowed := range desc.Enum {
			if fmt.Sprintf("%v", coerced) == fmt.Sprintf("%v", allowed) {
				found = true
				break
			}
		}
		if !found {
			return nil, &DotlyteError{
				Message: fmt.Sprintf("environment variable '%s' must be one of %v, got '%v'", key, desc.Enum, coerced),
				Key:     key,
				Code:    "VALIDATION_ERROR",
			}
		}
	}

	// Min/Max for numbers
	if num := toFloat64(coerced); num != nil {
		if desc.Min != nil && *num < *desc.Min {
			return nil, &DotlyteError{
				Message: fmt.Sprintf("environment variable '%s' value %v is below minimum %v", key, coerced, *desc.Min),
				Key:     key,
				Code:    "VALIDATION_ERROR",
			}
		}
		if desc.Max != nil && *num > *desc.Max {
			return nil, &DotlyteError{
				Message: fmt.Sprintf("environment variable '%s' value %v exceeds maximum %v", key, coerced, *desc.Max),
				Key:     key,
				Code:    "VALIDATION_ERROR",
			}
		}
	}

	// Min/Max for strings (length)
	if s, ok := coerced.(string); ok {
		if desc.Min != nil && float64(len(s)) < *desc.Min {
			return nil, &DotlyteError{
				Message: fmt.Sprintf("environment variable '%s' length %d is below minimum %v", key, len(s), *desc.Min),
				Key:     key,
				Code:    "VALIDATION_ERROR",
			}
		}
		if desc.Max != nil && float64(len(s)) > *desc.Max {
			return nil, &DotlyteError{
				Message: fmt.Sprintf("environment variable '%s' length %d exceeds maximum %v", key, len(s), *desc.Max),
				Key:     key,
				Code:    "VALIDATION_ERROR",
			}
		}
	}

	return coerced, nil
}

// coerceToType converts a value to the specified type.
func coerceToType(key string, value interface{}, typeName string) (interface{}, error) {
	strValue := fmt.Sprintf("%v", value)

	switch typeName {
	case "boolean":
		if b, ok := value.(bool); ok {
			return b, nil
		}
		lower := strings.ToLower(strValue)
		switch lower {
		case "true", "yes", "1", "on":
			return true, nil
		case "false", "no", "0", "off":
			return false, nil
		}
		return nil, &DotlyteError{
			Message: fmt.Sprintf("environment variable '%s' expected boolean, got '%s'", key, strValue),
			Key:     key,
			Code:    "VALIDATION_ERROR",
		}

	case "integer":
		if i, ok := value.(int64); ok {
			return i, nil
		}
		if i, ok := value.(int); ok {
			return int64(i), nil
		}
		if f, ok := value.(float64); ok {
			if f == float64(int64(f)) {
				return int64(f), nil
			}
			return nil, &DotlyteError{
				Message: fmt.Sprintf("environment variable '%s' expected integer, got '%s'", key, strValue),
				Key:     key,
				Code:    "VALIDATION_ERROR",
			}
		}
		i, err := strconv.ParseInt(strValue, 10, 64)
		if err != nil {
			return nil, &DotlyteError{
				Message: fmt.Sprintf("environment variable '%s' expected integer, got '%s'", key, strValue),
				Key:     key,
				Code:    "VALIDATION_ERROR",
			}
		}
		return i, nil

	case "number":
		if f, ok := value.(float64); ok {
			return f, nil
		}
		if i, ok := value.(int64); ok {
			return float64(i), nil
		}
		if i, ok := value.(int); ok {
			return float64(i), nil
		}
		f, err := strconv.ParseFloat(strValue, 64)
		if err != nil {
			return nil, &DotlyteError{
				Message: fmt.Sprintf("environment variable '%s' expected number, got '%s'", key, strValue),
				Key:     key,
				Code:    "VALIDATION_ERROR",
			}
		}
		return f, nil

	case "string", "url":
		s := strValue
		if typeName == "url" {
			if !strings.Contains(s, "://") {
				return nil, &DotlyteError{
					Message: fmt.Sprintf("environment variable '%s' is not a valid URL: '%s'", key, s),
					Key:     key,
					Code:    "VALIDATION_ERROR",
				}
			}
		}
		return s, nil

	default:
		// Unknown type, return as-is
		return value, nil
	}
}

// isEmpty checks if a value is nil, empty string, or absent.
func isEmpty(v interface{}) bool {
	if v == nil {
		return true
	}
	if s, ok := v.(string); ok {
		return s == ""
	}
	return false
}
