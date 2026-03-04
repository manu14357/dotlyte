package dotlyte

import (
	"testing"
)

func TestLoadWithDefaults(t *testing.T) {
	config, err := Load(&LoadOptions{
		Defaults: map[string]any{"port": 3000, "debug": false},
	})
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}

	if config.Get("port") != 3000 {
		t.Errorf("expected port=3000, got %v", config.Get("port"))
	}
	if config.Get("debug") != false {
		t.Errorf("expected debug=false, got %v", config.Get("debug"))
	}
}

func TestLoadEmpty(t *testing.T) {
	config, err := Load(nil)
	if err != nil {
		t.Fatalf("Load() error: %v", err)
	}
	if config == nil {
		t.Fatal("expected non-nil Config")
	}
}

func TestConfigGetNested(t *testing.T) {
	config := NewConfig(map[string]any{
		"database": map[string]any{
			"host": "localhost",
			"port": 5432,
		},
	})

	if config.Get("database.host") != "localhost" {
		t.Errorf("expected database.host=localhost, got %v", config.Get("database.host"))
	}
}

func TestConfigGetDefault(t *testing.T) {
	config := NewConfig(map[string]any{"existing": "value"})

	if config.Get("missing", "fallback") != "fallback" {
		t.Errorf("expected fallback, got %v", config.Get("missing", "fallback"))
	}
}

func TestConfigRequireMissing(t *testing.T) {
	config := NewConfig(map[string]any{})

	_, err := config.Require("MISSING_KEY")
	if err == nil {
		t.Fatal("expected error for missing key")
	}

	if _, ok := err.(*MissingRequiredKeyError); !ok {
		t.Errorf("expected MissingRequiredKeyError, got %T", err)
	}
}

func TestConfigHas(t *testing.T) {
	config := NewConfig(map[string]any{"port": 8080})

	if !config.Has("port") {
		t.Error("expected Has('port') to be true")
	}
	if config.Has("missing") {
		t.Error("expected Has('missing') to be false")
	}
}
