package dotlyte

import (
	"testing"
)

func TestBoundaryConfigGet(t *testing.T) {
	data := map[string]interface{}{
		"DB_URL":    "postgres://localhost/db",
		"APP_URL":   "http://localhost:3000",
		"NODE_ENV":  "development",
	}
	serverKeys := map[string]bool{"DB_URL": true}
	clientKeys := map[string]bool{"APP_URL": true}
	sharedKeys := map[string]bool{"NODE_ENV": true}

	bc := NewBoundaryConfig(data, serverKeys, clientKeys, sharedKeys, nil)

	tests := []struct {
		key     string
		wantVal interface{}
		wantErr bool
	}{
		{"DB_URL", "postgres://localhost/db", false},
		{"APP_URL", "http://localhost:3000", false},
		{"NODE_ENV", "development", false},
		{"UNKNOWN", nil, true},
	}

	for _, tt := range tests {
		t.Run(tt.key, func(t *testing.T) {
			val, err := bc.Get(tt.key)
			if (err != nil) != tt.wantErr {
				t.Errorf("Get(%q) error = %v, wantErr %v", tt.key, err, tt.wantErr)
				return
			}
			if val != tt.wantVal {
				t.Errorf("Get(%q) = %v, want %v", tt.key, val, tt.wantVal)
			}
		})
	}
}

func TestBoundaryConfigServerOnly(t *testing.T) {
	data := map[string]interface{}{
		"DB_URL":    "postgres://localhost/db",
		"APP_URL":   "http://localhost:3000",
		"NODE_ENV":  "development",
	}
	serverKeys := map[string]bool{"DB_URL": true}
	clientKeys := map[string]bool{"APP_URL": true}
	sharedKeys := map[string]bool{"NODE_ENV": true}

	bc := NewBoundaryConfig(data, serverKeys, clientKeys, sharedKeys, nil)

	serverOnly := bc.ServerOnly()
	if serverOnly["DB_URL"] != "postgres://localhost/db" {
		t.Errorf("expected DB_URL in server-only view")
	}
	if serverOnly["NODE_ENV"] != "development" {
		t.Errorf("expected NODE_ENV (shared) in server-only view")
	}
	if _, ok := serverOnly["APP_URL"]; ok {
		t.Errorf("did not expect APP_URL in server-only view")
	}
}

func TestBoundaryConfigClientOnly(t *testing.T) {
	data := map[string]interface{}{
		"DB_URL":    "postgres://localhost/db",
		"APP_URL":   "http://localhost:3000",
		"NODE_ENV":  "development",
	}
	serverKeys := map[string]bool{"DB_URL": true}
	clientKeys := map[string]bool{"APP_URL": true}
	sharedKeys := map[string]bool{"NODE_ENV": true}

	bc := NewBoundaryConfig(data, serverKeys, clientKeys, sharedKeys, nil)

	clientOnly := bc.ClientOnly()
	if clientOnly["APP_URL"] != "http://localhost:3000" {
		t.Errorf("expected APP_URL in client-only view")
	}
	if clientOnly["NODE_ENV"] != "development" {
		t.Errorf("expected NODE_ENV (shared) in client-only view")
	}
	if _, ok := clientOnly["DB_URL"]; ok {
		t.Errorf("did not expect DB_URL in client-only view")
	}
}

func TestBoundaryConfigContext(t *testing.T) {
	bc := NewBoundaryConfig(nil, nil, nil, nil, nil)

	if !bc.IsServerContext() {
		t.Error("IsServerContext() should always return true in Go")
	}
	if bc.IsClientContext() {
		t.Error("IsClientContext() should always return false in Go")
	}
}

func TestBoundaryConfigAuditCallback(t *testing.T) {
	data := map[string]interface{}{
		"SECRET_KEY": "super-secret",
	}
	serverKeys := map[string]bool{"SECRET_KEY": true}

	var auditedKey, auditedContext string
	onAccess := func(key, context string) {
		auditedKey = key
		auditedContext = context
	}

	bc := NewBoundaryConfig(data, serverKeys, nil, nil, onAccess)

	val, err := bc.Get("SECRET_KEY")
	if err != nil {
		t.Fatalf("Get() error: %v", err)
	}
	if val != "super-secret" {
		t.Errorf("Get() = %v, want 'super-secret'", val)
	}
	if auditedKey != "SECRET_KEY" {
		t.Errorf("audit key = %q, want 'SECRET_KEY'", auditedKey)
	}
	if auditedContext != "server" {
		t.Errorf("audit context = %q, want 'server'", auditedContext)
	}
}

func TestBoundaryConfigAllKeys(t *testing.T) {
	data := map[string]interface{}{
		"A": 1, "B": 2, "C": 3,
	}
	bc := NewBoundaryConfig(data,
		map[string]bool{"A": true},
		map[string]bool{"B": true},
		map[string]bool{"C": true},
		nil,
	)

	keys := bc.AllKeys()
	if len(keys) != 3 {
		t.Errorf("AllKeys() returned %d keys, want 3", len(keys))
	}
}

func TestBoundaryConfigNilSets(t *testing.T) {
	data := map[string]interface{}{"key": "value"}
	bc := NewBoundaryConfig(data, nil, nil, nil, nil)

	_, err := bc.Get("key")
	if err == nil {
		t.Error("expected error for key not in any boundary set")
	}
}
