package dotlyte

import (
	"fmt"
	"strings"
)

// Config holds the merged configuration data with typed access methods.
type Config struct {
	data map[string]any
}

// NewConfig creates a Config from a data map.
func NewConfig(data map[string]any) *Config {
	return &Config{data: data}
}

// Get retrieves a config value by key with an optional default.
// Supports dot-notation for nested keys (e.g., "database.host").
func (c *Config) Get(key string, defaultVal ...any) any {
	parts := strings.Split(key, ".")
	var current any = c.data

	for _, part := range parts {
		m, ok := current.(map[string]any)
		if !ok {
			return getDefault(defaultVal)
		}
		current, ok = m[part]
		if !ok {
			return getDefault(defaultVal)
		}
	}

	return current
}

// Require retrieves a config value or returns an error if missing.
func (c *Config) Require(key string) (any, error) {
	val := c.Get(key)
	if val == nil {
		return nil, &DotlyteError{
			Message: fmt.Sprintf(
				"Required config key '%s' is missing. Set it in your .env file or as an environment variable.",
				key,
			),
			Key: key,
		}
	}
	return val, nil
}

// Has checks whether a key exists in the config.
func (c *Config) Has(key string) bool {
	return c.Get(key) != nil
}

// ToMap returns the underlying data as a plain map.
func (c *Config) ToMap() map[string]any {
	result := make(map[string]any, len(c.data))
	for k, v := range c.data {
		result[k] = v
	}
	return result
}

func getDefault(defaults []any) any {
	if len(defaults) > 0 {
		return defaults[0]
	}
	return nil
}
