package dotlyte

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
)

// Config holds the merged configuration data with typed access methods.
type Config struct {
	data          map[string]any
	sensitiveKeys map[string]bool
	schema        DotlyteSchema
	watcher       *ConfigWatcher
	mu            sync.RWMutex

	onChangeCbs    []ChangeCallback
	onKeyChangeCbs map[string][]KeyChangeCallback
	onErrorCbs     []ErrorCallback
}

// NewConfig creates a Config from a data map.
func NewConfig(data map[string]any) *Config {
	return &Config{
		data:           data,
		sensitiveKeys:  make(map[string]bool),
		onKeyChangeCbs: make(map[string][]KeyChangeCallback),
	}
}

// Get retrieves a config value by key with an optional default.
// Supports dot-notation for nested keys (e.g., "database.host").
func (c *Config) Get(key string, defaultVal ...any) any {
	c.mu.RLock()
	defer c.mu.RUnlock()

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

// Require retrieves a config value or returns a MissingRequiredKeyError if missing.
func (c *Config) Require(key string) (any, error) {
	val := c.Get(key)
	if val == nil {
		return nil, &MissingRequiredKeyError{
			DotlyteError: DotlyteError{
				Message: fmt.Sprintf("required config key '%s' is missing", key),
				Key:     key,
				Code:    "MISSING_REQUIRED_KEY",
			},
		}
	}
	return val, nil
}

// RequireKeys validates that all specified keys exist, returning the first missing key error.
func (c *Config) RequireKeys(keys ...string) error {
	for _, key := range keys {
		if _, err := c.Require(key); err != nil {
			return err
		}
	}
	return nil
}

// Has checks whether a key exists in the config.
func (c *Config) Has(key string) bool {
	return c.Get(key) != nil
}

// Keys returns all top-level keys.
func (c *Config) Keys() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	keys := make([]string, 0, len(c.data))
	for k := range c.data {
		keys = append(keys, k)
	}
	return keys
}

// Scope returns a new Config scoped to a nested key.
func (c *Config) Scope(prefix string) *Config {
	val := c.Get(prefix)
	if m, ok := val.(map[string]any); ok {
		scoped := NewConfig(m)
		// Build scoped sensitive keys
		scoped.sensitiveKeys = make(map[string]bool)
		pfx := prefix + "."
		for k := range c.sensitiveKeys {
			if strings.HasPrefix(k, pfx) {
				scoped.sensitiveKeys[strings.TrimPrefix(k, pfx)] = true
			}
		}
		return scoped
	}
	return NewConfig(make(map[string]any))
}

// ToMap returns a deep copy of the underlying data.
func (c *Config) ToMap() map[string]any {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return deepCopyMap(c.data)
}

// ToFlatMap returns the config as a flat key→string map.
func (c *Config) ToFlatMap() map[string]string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	result := make(map[string]string)
	flattenToStringMap(c.data, "", result)
	return result
}

// ToMapRedacted returns all values with sensitive ones replaced by REDACTED.
func (c *Config) ToMapRedacted() map[string]any {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return RedactMap(c.data, c.sensitiveKeys)
}

// ToJSON serializes the config to JSON. Sensitive values are redacted.
func (c *Config) ToJSON() (string, error) {
	redacted := c.ToMapRedacted()
	b, err := json.MarshalIndent(redacted, "", "  ")
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// WriteTo writes the config to a file in the specified format.
// Supported formats: "json", "env".
func (c *Config) WriteTo(filepath string, format string) error {
	switch format {
	case "json":
		b, err := json.MarshalIndent(c.ToMap(), "", "  ")
		if err != nil {
			return err
		}
		return os.WriteFile(filepath, b, 0644)
	case "env":
		flat := c.ToFlatMap()
		var lines []string
		for k, v := range flat {
			lines = append(lines, fmt.Sprintf("%s=%s", strings.ToUpper(strings.ReplaceAll(k, ".", "_")), v))
		}
		return os.WriteFile(filepath, []byte(strings.Join(lines, "\n")+"\n"), 0644)
	default:
		return fmt.Errorf("dotlyte: unsupported write format: %s", format)
	}
}

// Validate checks the config against a schema (if set), returning violations.
func (c *Config) Validate() []SchemaViolation {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if c.schema == nil {
		return nil
	}
	return ValidateSchema(c.data, c.schema, false)
}

// AssertValid validates and returns a ValidationError if there are violations.
func (c *Config) AssertValid() error {
	violations := c.Validate()
	if len(violations) > 0 {
		return &ValidationError{
			DotlyteError: DotlyteError{
				Message: "schema validation failed",
				Code:    "VALIDATION_FAILED",
			},
			Violations: violations,
		}
	}
	return nil
}

// OnChange registers a callback for config changes (requires watch mode).
func (c *Config) OnChange(cb ChangeCallback) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onChangeCbs = append(c.onChangeCbs, cb)
	if c.watcher != nil {
		c.watcher.OnChange(cb)
	}
}

// OnKeyChange registers a callback for changes to a specific key.
func (c *Config) OnKeyChange(key string, cb KeyChangeCallback) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onKeyChangeCbs[key] = append(c.onKeyChangeCbs[key], cb)
	if c.watcher != nil {
		c.watcher.OnKeyChange(key, cb)
	}
}

// OnError registers a callback for watch/reload errors.
func (c *Config) OnError(cb ErrorCallback) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.onErrorCbs = append(c.onErrorCbs, cb)
	if c.watcher != nil {
		c.watcher.OnError(cb)
	}
}

// Close stops the file watcher and releases resources.
func (c *Config) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.watcher != nil {
		c.watcher.Close()
		c.watcher = nil
	}
}

// SetWatcher attaches a ConfigWatcher.
func (c *Config) SetWatcher(w *ConfigWatcher) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.watcher = w
	// Forward existing callbacks
	for _, cb := range c.onChangeCbs {
		w.OnChange(cb)
	}
	for key, cbs := range c.onKeyChangeCbs {
		for _, cb := range cbs {
			w.OnKeyChange(key, cb)
		}
	}
	for _, cb := range c.onErrorCbs {
		w.OnError(cb)
	}
}

// SetSchema attaches a schema for validation.
func (c *Config) SetSchema(schema DotlyteSchema) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.schema = schema
}

// SetSensitiveKeys sets the keys to be redacted.
func (c *Config) SetSensitiveKeys(keys map[string]bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.sensitiveKeys = keys
}

func getDefault(defaults []any) any {
	if len(defaults) > 0 {
		return defaults[0]
	}
	return nil
}

func deepCopyMap(m map[string]any) map[string]any {
	result := make(map[string]any, len(m))
	for k, v := range m {
		if sub, ok := v.(map[string]any); ok {
			result[k] = deepCopyMap(sub)
		} else {
			result[k] = v
		}
	}
	return result
}

func flattenToStringMap(data map[string]any, prefix string, result map[string]string) {
	for k, v := range data {
		fullKey := k
		if prefix != "" {
			fullKey = prefix + "." + k
		}
		if m, ok := v.(map[string]any); ok {
			flattenToStringMap(m, fullKey, result)
		} else {
			result[fullKey] = fmt.Sprintf("%v", v)
		}
	}
}
