package dotlyte

import (
	"fmt"
	"strings"
)

// DotlyteError is the base error type for all DOTLYTE errors.
type DotlyteError struct {
	Message string
	Key     string
	Code    string // machine-readable error code
}

func (e *DotlyteError) Error() string {
	if e.Key != "" {
		return fmt.Sprintf("dotlyte: %s (key: %s)", e.Message, e.Key)
	}
	return fmt.Sprintf("dotlyte: %s", e.Message)
}

// MissingRequiredKeyError is returned when a required config key is missing.
type MissingRequiredKeyError struct {
	DotlyteError
	SourcesChecked []string
}

func (e *MissingRequiredKeyError) Error() string {
	msg := fmt.Sprintf("dotlyte: required config key '%s' is missing", e.Key)
	if len(e.SourcesChecked) > 0 {
		msg += fmt.Sprintf(". Sources checked: %s", strings.Join(e.SourcesChecked, ", "))
	}
	msg += ". Set it in your .env file, config file, or as an environment variable."
	return msg
}

// ParseError indicates invalid config file syntax.
type ParseError struct {
	DotlyteError
	File string
}

func (e *ParseError) Error() string {
	return fmt.Sprintf("dotlyte: parse error in %s: %s", e.File, e.Message)
}

// FileError indicates a problem with an explicitly specified file.
type FileError struct {
	DotlyteError
	File string
}

func (e *FileError) Error() string {
	return fmt.Sprintf("dotlyte: file error for '%s': %s", e.File, e.Message)
}

// ValidationError indicates schema validation failure.
type ValidationError struct {
	DotlyteError
	Violations []SchemaViolation
}

func (e *ValidationError) Error() string {
	parts := make([]string, len(e.Violations))
	for i, v := range e.Violations {
		parts[i] = v.String()
	}
	return fmt.Sprintf("dotlyte: schema validation failed with %d violation(s): %s",
		len(e.Violations), strings.Join(parts, "; "))
}

// InterpolationError indicates a problem with variable interpolation.
type InterpolationError struct {
	DotlyteError
	Variable string
}

func (e *InterpolationError) Error() string {
	return fmt.Sprintf("dotlyte: interpolation error for '${%s}': %s", e.Variable, e.Message)
}

// DecryptionError indicates a problem with encrypted value decryption.
type DecryptionError struct {
	DotlyteError
}

func (e *DecryptionError) Error() string {
	return fmt.Sprintf("dotlyte: decryption error: %s", e.Message)
}
