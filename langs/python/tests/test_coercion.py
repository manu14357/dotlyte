"""Tests for the DOTLYTE type coercion engine."""

from __future__ import annotations

from dotlyte.coercion import coerce, coerce_dict


class TestCoercion:
    """Tests for the coerce() function."""

    # --- Null values ---

    def test_empty_string(self) -> None:
        assert coerce("") is None

    def test_null_string(self) -> None:
        assert coerce("null") is None

    def test_none_string(self) -> None:
        assert coerce("none") is None

    def test_nil_string(self) -> None:
        assert coerce("nil") is None

    def test_null_uppercase(self) -> None:
        assert coerce("NULL") is None

    # --- Boolean true values ---

    def test_true_lower(self) -> None:
        assert coerce("true") is True

    def test_true_upper(self) -> None:
        assert coerce("TRUE") is True

    def test_true_mixed(self) -> None:
        assert coerce("True") is True

    def test_yes(self) -> None:
        assert coerce("yes") is True

    def test_one(self) -> None:
        assert coerce("1") is True

    def test_on(self) -> None:
        assert coerce("on") is True

    # --- Boolean false values ---

    def test_false_lower(self) -> None:
        assert coerce("false") is False

    def test_false_upper(self) -> None:
        assert coerce("FALSE") is False

    def test_no(self) -> None:
        assert coerce("no") is False

    def test_zero(self) -> None:
        assert coerce("0") is False

    def test_off(self) -> None:
        assert coerce("off") is False

    # --- Integer values ---

    def test_integer(self) -> None:
        assert coerce("8080") == 8080

    def test_negative_integer(self) -> None:
        assert coerce("-42") == -42

    def test_large_integer(self) -> None:
        assert coerce("999999") == 999999

    # --- Float values ---

    def test_float(self) -> None:
        assert coerce("3.14") == 3.14

    def test_negative_float(self) -> None:
        assert coerce("-0.5") == -0.5

    def test_float_one(self) -> None:
        assert coerce("1.0") == 1.0

    # --- List values ---

    def test_list_simple(self) -> None:
        assert coerce("a,b,c") == ["a", "b", "c"]

    def test_list_numbers(self) -> None:
        assert coerce("1,2,3") == [True, 2, 3]  # "1" is boolean true

    def test_list_with_spaces(self) -> None:
        assert coerce("a, b, c") == ["a", "b", "c"]

    # --- String passthrough ---

    def test_plain_string(self) -> None:
        assert coerce("hello world") == "hello world"

    def test_url_string(self) -> None:
        assert coerce("https://example.com") == "https://example.com"

    def test_path_string(self) -> None:
        assert coerce("/usr/local/bin") == "/usr/local/bin"

    def test_version_string(self) -> None:
        assert coerce("1.0.0") == "1.0.0"

    # --- Already typed passthrough ---

    def test_int_passthrough(self) -> None:
        assert coerce(8080) == 8080

    def test_bool_passthrough(self) -> None:
        assert coerce(True) is True

    def test_list_passthrough(self) -> None:
        assert coerce(["a", "b"]) == ["a", "b"]

    def test_none_passthrough(self) -> None:
        assert coerce(None) is None

    # --- Edge cases ---

    def test_whitespace_trimmed(self) -> None:
        assert coerce("  true  ") is True

    def test_scientific_notation_stays_string(self) -> None:
        assert coerce("1e5") == "1e5"


class TestCoerceDict:
    """Tests for the coerce_dict() function."""

    def test_coerce_dict(self) -> None:
        data = {"port": "8080", "debug": "true", "host": "localhost"}
        expected = {"port": 8080, "debug": True, "host": "localhost"}
        assert coerce_dict(data) == expected

    def test_coerce_dict_nested(self) -> None:
        data = {"db": {"port": "5432", "ssl": "true"}}
        expected = {"db": {"port": 5432, "ssl": True}}
        assert coerce_dict(data) == expected
