package dotlyte

import (
	"fmt"
)

// BoundaryConfig enforces server/client boundaries on configuration access.
// In Go (always server-side), server keys are always accessible.
// This type provides structured access control and audit logging for
// sensitive configuration values.
type BoundaryConfig struct {
	data           map[string]interface{}
	serverKeys     map[string]bool
	clientKeys     map[string]bool
	sharedKeys     map[string]bool
	onSecretAccess func(string, string)
}

// NewBoundaryConfig creates a BoundaryConfig with server/client/shared key
// boundaries and an optional audit callback for secret access.
func NewBoundaryConfig(
	data map[string]interface{},
	serverKeys, clientKeys, sharedKeys map[string]bool,
	onSecretAccess func(string, string),
) *BoundaryConfig {
	if serverKeys == nil {
		serverKeys = make(map[string]bool)
	}
	if clientKeys == nil {
		clientKeys = make(map[string]bool)
	}
	if sharedKeys == nil {
		sharedKeys = make(map[string]bool)
	}
	return &BoundaryConfig{
		data:           data,
		serverKeys:     serverKeys,
		clientKeys:     clientKeys,
		sharedKeys:     sharedKeys,
		onSecretAccess: onSecretAccess,
	}
}

// Get retrieves a configuration value by key, enforcing boundary checks.
// Returns an error if the key is not part of any boundary set.
// Triggers the onSecretAccess callback for server-only keys.
func (bc *BoundaryConfig) Get(key string) (interface{}, error) {
	if !bc.serverKeys[key] && !bc.clientKeys[key] && !bc.sharedKeys[key] {
		return nil, &DotlyteError{
			Message: fmt.Sprintf("key '%s' is not defined in any boundary section (server/client/shared)", key),
			Key:     key,
			Code:    "BOUNDARY_UNKNOWN_KEY",
		}
	}

	// Audit logging for server-only keys
	if bc.onSecretAccess != nil && bc.serverKeys[key] {
		bc.onSecretAccess(key, "server")
	}

	val, ok := bc.data[key]
	if !ok {
		return nil, nil
	}
	return val, nil
}

// ServerOnly returns a map containing only server-designated and shared keys.
func (bc *BoundaryConfig) ServerOnly() map[string]interface{} {
	result := make(map[string]interface{})
	for k := range bc.serverKeys {
		if v, ok := bc.data[k]; ok {
			result[k] = v
		}
	}
	for k := range bc.sharedKeys {
		if v, ok := bc.data[k]; ok {
			result[k] = v
		}
	}
	return result
}

// ClientOnly returns a map containing only client-designated and shared keys.
func (bc *BoundaryConfig) ClientOnly() map[string]interface{} {
	result := make(map[string]interface{})
	for k := range bc.clientKeys {
		if v, ok := bc.data[k]; ok {
			result[k] = v
		}
	}
	for k := range bc.sharedKeys {
		if v, ok := bc.data[k]; ok {
			result[k] = v
		}
	}
	return result
}

// IsServerContext returns true because Go always runs on the server.
func (bc *BoundaryConfig) IsServerContext() bool {
	return true
}

// IsClientContext returns false because Go never runs in the browser.
func (bc *BoundaryConfig) IsClientContext() bool {
	return false
}

// AllKeys returns all keys across all boundary sections.
func (bc *BoundaryConfig) AllKeys() []string {
	seen := make(map[string]bool)
	var keys []string
	for k := range bc.serverKeys {
		if !seen[k] {
			keys = append(keys, k)
			seen[k] = true
		}
	}
	for k := range bc.clientKeys {
		if !seen[k] {
			keys = append(keys, k)
			seen[k] = true
		}
	}
	for k := range bc.sharedKeys {
		if !seen[k] {
			keys = append(keys, k)
			seen[k] = true
		}
	}
	return keys
}
