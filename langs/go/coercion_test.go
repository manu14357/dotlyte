package dotlyte

import "testing"

func TestCoerceBoolTrue(t *testing.T) {
	for _, v := range []string{"true", "TRUE", "True", "yes", "1", "on"} {
		result := Coerce(v)
		if result != true {
			t.Errorf("Coerce(%q) = %v, want true", v, result)
		}
	}
}

func TestCoerceBoolFalse(t *testing.T) {
	for _, v := range []string{"false", "FALSE", "no", "0", "off"} {
		result := Coerce(v)
		if result != false {
			t.Errorf("Coerce(%q) = %v, want false", v, result)
		}
	}
}

func TestCoerceNull(t *testing.T) {
	for _, v := range []string{"null", "none", "nil", ""} {
		result := Coerce(v)
		if result != nil {
			t.Errorf("Coerce(%q) = %v, want nil", v, result)
		}
	}
}

func TestCoerceInt(t *testing.T) {
	result := Coerce("8080")
	if result != int64(8080) {
		t.Errorf("Coerce('8080') = %v (%T), want 8080", result, result)
	}
}

func TestCoerceFloat(t *testing.T) {
	result := Coerce("3.14")
	if result != 3.14 {
		t.Errorf("Coerce('3.14') = %v, want 3.14", result)
	}
}

func TestCoerceList(t *testing.T) {
	result := Coerce("a,b,c")
	list, ok := result.([]any)
	if !ok {
		t.Fatalf("Coerce('a,b,c') type = %T, want []any", result)
	}
	if len(list) != 3 {
		t.Fatalf("len = %d, want 3", len(list))
	}
	if list[0] != "a" || list[1] != "b" || list[2] != "c" {
		t.Errorf("got %v, want [a b c]", list)
	}
}

func TestCoercePassthrough(t *testing.T) {
	if Coerce(8080) != 8080 {
		t.Error("int passthrough failed")
	}
	if Coerce(true) != true {
		t.Error("bool passthrough failed")
	}
}

func TestCoerceString(t *testing.T) {
	if Coerce("hello world") != "hello world" {
		t.Error("plain string failed")
	}
}
