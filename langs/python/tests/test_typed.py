"""Tests for dotlyte.typed — schema-driven typed config."""

from __future__ import annotations

import os
import types
from unittest.mock import patch

import pytest

from dotlyte.errors import DotlyteError
from dotlyte.typed import (
    FieldDescriptor,
    _validate_field,
    create_typed_config,
)


# ──── _validate_field unit tests ────


class TestValidateField:
    """Low-level validation / coercion of a single field."""

    def test_boolean_true_strings(self) -> None:
        for val in ("true", "yes", "1", "on", "True", "YES"):
            assert _validate_field("K", val, {"type": "boolean"}) is True

    def test_boolean_false_strings(self) -> None:
        for val in ("false", "no", "0", "off", "False", "NO"):
            assert _validate_field("K", val, {"type": "boolean"}) is False

    def test_boolean_already_bool(self) -> None:
        assert _validate_field("K", True, {"type": "boolean"}) is True
        assert _validate_field("K", False, {"type": "boolean"}) is False

    def test_boolean_invalid_raises(self) -> None:
        with pytest.raises(DotlyteError, match="expected boolean"):
            _validate_field("K", "nope", {"type": "boolean"})

    def test_integer_coercion(self) -> None:
        assert _validate_field("PORT", "8080", {"type": "integer"}) == 8080

    def test_integer_already_int(self) -> None:
        assert _validate_field("PORT", 3000, {"type": "integer"}) == 3000

    def test_integer_float_string_raises(self) -> None:
        with pytest.raises(DotlyteError, match="expected integer"):
            _validate_field("PORT", "3.14", {"type": "integer"})

    def test_number_coercion(self) -> None:
        assert _validate_field("RATE", "3.14", {"type": "number"}) == pytest.approx(
            3.14
        )

    def test_string_passthrough(self) -> None:
        assert _validate_field("NAME", "hello", {"type": "string"}) == "hello"

    def test_url_valid(self) -> None:
        url = "https://example.com/path"
        assert _validate_field("URL", url, {"type": "url"}) == url

    def test_url_invalid_raises(self) -> None:
        with pytest.raises(DotlyteError, match="not a valid URL"):
            _validate_field("URL", "not-a-url", {"type": "url"})

    def test_enum_valid(self) -> None:
        desc: FieldDescriptor = {"type": "string", "enum": ["a", "b", "c"]}
        assert _validate_field("K", "b", desc) == "b"

    def test_enum_invalid_raises(self) -> None:
        desc: FieldDescriptor = {"type": "string", "enum": ["a", "b"]}
        with pytest.raises(DotlyteError, match="must be one of"):
            _validate_field("K", "z", desc)

    def test_min_max_number(self) -> None:
        desc: FieldDescriptor = {"type": "integer", "min": 1, "max": 100}
        assert _validate_field("K", "50", desc) == 50

    def test_min_number_violation(self) -> None:
        desc: FieldDescriptor = {"type": "integer", "min": 10}
        with pytest.raises(DotlyteError, match="below minimum"):
            _validate_field("K", "5", desc)

    def test_max_number_violation(self) -> None:
        desc: FieldDescriptor = {"type": "integer", "max": 10}
        with pytest.raises(DotlyteError, match="exceeds maximum"):
            _validate_field("K", "20", desc)

    def test_min_max_string_length(self) -> None:
        desc: FieldDescriptor = {"type": "string", "min": 3, "max": 5}
        assert _validate_field("K", "abcd", desc) == "abcd"

    def test_string_too_short(self) -> None:
        desc: FieldDescriptor = {"type": "string", "min": 5}
        with pytest.raises(DotlyteError, match="below minimum"):
            _validate_field("K", "ab", desc)

    def test_required_missing_raises(self) -> None:
        desc: FieldDescriptor = {"type": "string", "required": True}
        with pytest.raises(DotlyteError, match="Missing required"):
            _validate_field("K", None, desc)

    def test_required_empty_string_raises(self) -> None:
        desc: FieldDescriptor = {"type": "string", "required": True}
        with pytest.raises(DotlyteError, match="Missing required"):
            _validate_field("K", "", desc)

    def test_default_applied_when_missing(self) -> None:
        desc: FieldDescriptor = {"type": "integer", "default": 42, "required": False}
        assert _validate_field("K", None, desc) == 42

    def test_optional_missing_returns_none(self) -> None:
        desc: FieldDescriptor = {"type": "string", "required": False}
        assert _validate_field("K", None, desc) is None


# ──── create_typed_config integration tests ────


class TestCreateTypedConfigFlat:
    """Flat schema tests — relies on env vars instead of .env files."""

    @patch.dict(os.environ, {"PORT": "8080", "DEBUG": "true", "APP_NAME": "test"})
    def test_flat_schema_coerces_and_validates(self) -> None:
        schema = {
            "PORT": {"type": "integer", "required": True},
            "DEBUG": {"type": "boolean", "default": False},
            "APP_NAME": {"type": "string", "required": True},
        }
        result = create_typed_config(schema)
        assert isinstance(result, types.MappingProxyType)
        assert result["PORT"] == 8080
        assert result["DEBUG"] is True
        assert result["APP_NAME"] == "test"

    def test_flat_schema_immutable(self) -> None:
        schema = {
            "NOTHING": {"type": "string", "default": "val", "required": False},
        }
        result = create_typed_config(schema)
        with pytest.raises(TypeError):
            result["NOTHING"] = "other"  # type: ignore[index]

    @patch.dict(os.environ, {}, clear=True)
    def test_flat_missing_required_raises(self) -> None:
        schema = {
            "MUST_EXIST": {"type": "string", "required": True},
        }
        with pytest.raises(DotlyteError, match="validation failed"):
            create_typed_config(schema)

    @patch.dict(os.environ, {}, clear=True)
    def test_skip_validation(self) -> None:
        schema = {
            "OPTIONAL_KEY": {"type": "string", "required": True},
        }
        result = create_typed_config(schema, skip_validation=True)
        assert "OPTIONAL_KEY" in result


class TestCreateTypedConfigSectioned:
    """Sectioned schema tests (server/client/shared)."""

    @patch.dict(
        os.environ,
        {
            "DATABASE_URL": "postgres://localhost/db",
            "NEXT_PUBLIC_APP_URL": "https://example.com",
            "NODE_ENV": "production",
        },
    )
    def test_sectioned_schema(self) -> None:
        schema = {
            "server": {
                "DATABASE_URL": {"type": "string", "required": True},
            },
            "client": {
                "NEXT_PUBLIC_APP_URL": {"type": "url"},
            },
            "shared": {
                "NODE_ENV": {
                    "type": "string",
                    "enum": ["development", "test", "production"],
                },
            },
            "client_prefix": "NEXT_PUBLIC_",
        }
        result = create_typed_config(schema)
        assert isinstance(result, types.MappingProxyType)

    def test_client_prefix_violation(self) -> None:
        schema = {
            "server": {},
            "client": {
                "BAD_KEY": {"type": "string"},
            },
            "shared": {},
            "client_prefix": "NEXT_PUBLIC_",
        }
        with pytest.raises(DotlyteError, match="must start with"):
            create_typed_config(schema)
