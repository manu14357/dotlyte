package dotlyte

import (
	"os"
	"testing"
)

func TestCreateTypedConfigWithDefaults(t *testing.T) {
	schema := map[string]FieldDescriptor{
		"PORT": {
			Type:     "integer",
			Required: false,
			Default:  int64(3000),
		},
		"DEBUG": {
			Type:     "boolean",
			Required: false,
			Default:  false,
		},
	}

	result, err := CreateTypedConfig(schema)
	if err != nil {
		t.Fatalf("CreateTypedConfig() error: %v", err)
	}

	if result["PORT"] != int64(3000) {
		t.Errorf("PORT = %v (%T), want 3000", result["PORT"], result["PORT"])
	}
	if result["DEBUG"] != false {
		t.Errorf("DEBUG = %v, want false", result["DEBUG"])
	}
}

func TestCreateTypedConfigRequiredMissing(t *testing.T) {
	schema := map[string]FieldDescriptor{
		"MISSING_REQUIRED_VAR": {
			Type:     "string",
			Required: true,
			Doc:      "A required variable that does not exist",
		},
	}

	_, err := CreateTypedConfig(schema)
	if err == nil {
		t.Fatal("expected error for missing required variable")
	}
}

func TestCreateTypedConfigFromEnv(t *testing.T) {
	os.Setenv("TYPED_TEST_PORT", "8080")
	defer os.Unsetenv("TYPED_TEST_PORT")

	schema := map[string]FieldDescriptor{
		"TYPED_TEST_PORT": {
			Type:     "integer",
			Required: true,
		},
	}

	result, err := CreateTypedConfig(schema)
	if err != nil {
		t.Fatalf("CreateTypedConfig() error: %v", err)
	}

	if result["TYPED_TEST_PORT"] != int64(8080) {
		t.Errorf("TYPED_TEST_PORT = %v (%T), want 8080", result["TYPED_TEST_PORT"], result["TYPED_TEST_PORT"])
	}
}

func TestCreateTypedConfigBooleanCoercion(t *testing.T) {
	tests := []struct {
		envVal string
		want   bool
	}{
		{"true", true},
		{"yes", true},
		{"1", true},
		{"on", true},
		{"false", false},
		{"no", false},
		{"0", false},
		{"off", false},
	}

	for _, tt := range tests {
		t.Run(tt.envVal, func(t *testing.T) {
			os.Setenv("TYPED_BOOL_TEST", tt.envVal)
			defer os.Unsetenv("TYPED_BOOL_TEST")

			schema := map[string]FieldDescriptor{
				"TYPED_BOOL_TEST": {
					Type:     "boolean",
					Required: true,
				},
			}

			result, err := CreateTypedConfig(schema)
			if err != nil {
				t.Fatalf("CreateTypedConfig() error: %v", err)
			}
			if result["TYPED_BOOL_TEST"] != tt.want {
				t.Errorf("got %v, want %v", result["TYPED_BOOL_TEST"], tt.want)
			}
		})
	}
}

func TestCreateTypedConfigEnumValidation(t *testing.T) {
	os.Setenv("TYPED_ENUM_TEST", "debug")
	defer os.Unsetenv("TYPED_ENUM_TEST")

	schema := map[string]FieldDescriptor{
		"TYPED_ENUM_TEST": {
			Type:     "string",
			Required: true,
			Enum:     []interface{}{"debug", "info", "warn", "error"},
		},
	}

	result, err := CreateTypedConfig(schema)
	if err != nil {
		t.Fatalf("CreateTypedConfig() error: %v", err)
	}
	if result["TYPED_ENUM_TEST"] != "debug" {
		t.Errorf("got %v, want 'debug'", result["TYPED_ENUM_TEST"])
	}
}

func TestCreateTypedConfigEnumValidationFail(t *testing.T) {
	os.Setenv("TYPED_ENUM_FAIL", "invalid")
	defer os.Unsetenv("TYPED_ENUM_FAIL")

	schema := map[string]FieldDescriptor{
		"TYPED_ENUM_FAIL": {
			Type:     "string",
			Required: true,
			Enum:     []interface{}{"debug", "info", "warn", "error"},
		},
	}

	_, err := CreateTypedConfig(schema)
	if err == nil {
		t.Fatal("expected error for invalid enum value")
	}
}

func TestCreateTypedConfigMinMax(t *testing.T) {
	os.Setenv("TYPED_PORT_TEST", "80")
	defer os.Unsetenv("TYPED_PORT_TEST")

	min := float64(1)
	max := float64(65535)

	schema := map[string]FieldDescriptor{
		"TYPED_PORT_TEST": {
			Type:     "integer",
			Required: true,
			Min:      &min,
			Max:      &max,
		},
	}

	result, err := CreateTypedConfig(schema)
	if err != nil {
		t.Fatalf("CreateTypedConfig() error: %v", err)
	}
	if result["TYPED_PORT_TEST"] != int64(80) {
		t.Errorf("got %v, want 80", result["TYPED_PORT_TEST"])
	}
}

func TestCreateTypedConfigMinMaxFail(t *testing.T) {
	os.Setenv("TYPED_PORT_FAIL", "0")
	defer os.Unsetenv("TYPED_PORT_FAIL")

	min := float64(1)

	schema := map[string]FieldDescriptor{
		"TYPED_PORT_FAIL": {
			Type:     "integer",
			Required: true,
			Min:      &min,
		},
	}

	_, err := CreateTypedConfig(schema)
	if err == nil {
		t.Fatal("expected error for value below minimum")
	}
}

func TestCreateTypedConfigSkipValidation(t *testing.T) {
	schema := map[string]FieldDescriptor{
		"SKIP_MISSING_VAR": {
			Type:     "string",
			Required: true,
		},
	}

	result, err := CreateTypedConfig(schema, TypedConfigOptions{SkipValidation: true})
	if err != nil {
		t.Fatalf("CreateTypedConfig() with SkipValidation should not error: %v", err)
	}
	// Value should be nil since it doesn't exist
	if result["SKIP_MISSING_VAR"] != nil {
		t.Errorf("expected nil, got %v", result["SKIP_MISSING_VAR"])
	}
}

func TestCreateSectionedConfig(t *testing.T) {
	os.Setenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
	os.Setenv("DATABASE_URL", "postgres://localhost/db")
	defer os.Unsetenv("NEXT_PUBLIC_APP_URL")
	defer os.Unsetenv("DATABASE_URL")

	server := map[string]FieldDescriptor{
		"DATABASE_URL": {Type: "string", Required: true},
	}
	client := map[string]FieldDescriptor{
		"NEXT_PUBLIC_APP_URL": {Type: "string", Required: true},
	}
	shared := map[string]FieldDescriptor{}

	result, err := CreateSectionedConfig(server, client, shared, "NEXT_PUBLIC_", TypedConfigOptions{})
	if err != nil {
		t.Fatalf("CreateSectionedConfig() error: %v", err)
	}

	if result["DATABASE_URL"] == nil {
		t.Error("expected DATABASE_URL to be present")
	}
	if result["NEXT_PUBLIC_APP_URL"] == nil {
		t.Error("expected NEXT_PUBLIC_APP_URL to be present")
	}
}

func TestCreateSectionedConfigInvalidPrefix(t *testing.T) {
	client := map[string]FieldDescriptor{
		"NO_PREFIX_VAR": {Type: "string", Required: false, Default: "test"},
	}

	_, err := CreateSectionedConfig(nil, client, nil, "NEXT_PUBLIC_")
	if err == nil {
		t.Fatal("expected error for client key without required prefix")
	}
}

func TestValidateTypedFieldTypes(t *testing.T) {
	tests := []struct {
		name     string
		value    interface{}
		typeName string
		wantErr  bool
	}{
		{"string valid", "hello", "string", false},
		{"integer valid", "42", "integer", false},
		{"integer invalid", "not-a-number", "integer", true},
		{"number valid", "3.14", "number", false},
		{"number invalid", "abc", "number", true},
		{"boolean valid true", "true", "boolean", false},
		{"boolean valid false", "no", "boolean", false},
		{"boolean invalid", "maybe", "boolean", true},
		{"url valid", "https://example.com", "url", false},
		{"url invalid", "not-a-url", "url", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			desc := FieldDescriptor{Type: tt.typeName, Required: false}
			_, err := validateTypedField("test_key", tt.value, desc)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateTypedField() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
