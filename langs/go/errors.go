package dotlyte

import "fmt"

// DotlyteError is the base error type for all DOTLYTE errors.
type DotlyteError struct {
	Message string
	Key     string
}

func (e *DotlyteError) Error() string {
	if e.Key != "" {
		return fmt.Sprintf("dotlyte: %s (key: %s)", e.Message, e.Key)
	}
	return fmt.Sprintf("dotlyte: %s", e.Message)
}

// ParseError indicates invalid config file syntax.
type ParseError struct {
	DotlyteError
	File string
}

func (e *ParseError) Error() string {
	return fmt.Sprintf("dotlyte: parse error in %s: %s", e.File, e.Message)
}
