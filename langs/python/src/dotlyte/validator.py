"""Schema validation system for DOTLYTE.

Validates configuration against a user-defined schema with type checking,
required fields, format validation, enums, min/max, and custom validators.
"""

from __future__ import annotations

import re
from typing import Any, Callable, Literal

from dotlyte.errors import ValidationError

# ──── Schema Types ────

SchemaType = Literal["string", "number", "boolean", "array", "object"]

SchemaFormat = Literal[
    "url", "email", "ip", "ipv4", "ipv6",
    "hostname", "port", "uuid", "date", "iso-date",
]


class SchemaRule:
    """A single field's validation rule."""

    def __init__(
        self,
        *,
        type: SchemaType | None = None,
        required: bool = False,
        format: SchemaFormat | str | None = None,
        enum: list[Any] | None = None,
        min: float | int | None = None,
        max: float | int | None = None,
        default: Any = None,
        sensitive: bool = False,
        doc: str | None = None,
        validator: Callable[[Any], bool] | None = None,
    ) -> None:
        self.type = type
        self.required = required
        self.format = format
        self.enum = enum
        self.min = min
        self.max = max
        self.default = default
        self.sensitive = sensitive
        self.doc = doc
        self.validator = validator


DotlyteSchema = dict[str, SchemaRule]


class SchemaViolation:
    """A single validation failure."""

    def __init__(
        self,
        key: str,
        rule: str,
        message: str,
        expected: Any = None,
        actual: Any = None,
    ) -> None:
        self.key = key
        self.rule = rule
        self.message = message
        self.expected = expected
        self.actual = actual

    def __repr__(self) -> str:
        return f"SchemaViolation(key={self.key!r}, rule={self.rule!r}, message={self.message!r})"


# ──── Built-in Format Validators ────

_FORMAT_VALIDATORS: dict[str, Callable[[str], bool]] = {
    "url": lambda v: bool(re.match(r"^https?://\S+", v)),
    "email": lambda v: bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v)),
    "ip": lambda v: _is_ipv4(v) or _is_ipv6(v),
    "ipv4": _is_ipv4 if False else lambda v: _is_ipv4(v),
    "ipv6": lambda v: _is_ipv6(v),
    "hostname": lambda v: bool(re.match(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$", v)) or v == "localhost",
    "port": lambda v: v.isdigit() and 1 <= int(v) <= 65535,
    "uuid": lambda v: bool(re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", v, re.I)),
    "date": lambda v: bool(re.match(r"^\d{4}-\d{2}-\d{2}$", v)),
    "iso-date": lambda v: bool(re.match(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$", v)),
}


def _is_ipv4(v: str) -> bool:
    parts = v.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(p) <= 255 for p in parts)
    except ValueError:
        return False


def _is_ipv6(v: str) -> bool:
    try:
        import ipaddress
        ipaddress.IPv6Address(v)
        return True
    except (ValueError, AttributeError):
        return False


# ──── Validation Functions ────

def apply_schema_defaults(
    data: dict[str, Any],
    schema: DotlyteSchema,
) -> dict[str, Any]:
    """Apply schema default values to missing keys.

    Args:
        data: The current configuration data.
        schema: The schema definition.

    Returns:
        A new dict with defaults filled in.

    """
    result = data.copy()
    for key, rule in schema.items():
        if key not in result and rule.default is not None:
            result[key] = rule.default
    return result


def validate_schema(
    data: dict[str, Any],
    schema: DotlyteSchema,
    strict: bool = False,
) -> list[SchemaViolation]:
    """Validate data against a schema. Returns list of violations.

    Args:
        data: Configuration data to validate.
        schema: Schema to validate against.
        strict: If True, unknown keys are rejected.

    Returns:
        List of SchemaViolation objects (empty = valid).

    """
    violations: list[SchemaViolation] = []

    for key, rule in schema.items():
        value = data.get(key)

        # Required check
        if rule.required and (value is None or key not in data):
            violations.append(SchemaViolation(
                key=key,
                rule="required",
                message=f"Required key '{key}' is missing",
            ))
            continue

        if value is None or key not in data:
            continue

        # Type check
        if rule.type and not _check_type(value, rule.type):
            violations.append(SchemaViolation(
                key=key,
                rule="type",
                message=f"Key '{key}' must be of type {rule.type}, got {type(value).__name__}",
                expected=rule.type,
                actual=type(value).__name__,
            ))

        # Enum check
        if rule.enum is not None and value not in rule.enum:
            violations.append(SchemaViolation(
                key=key,
                rule="enum",
                message=f"Key '{key}' must be one of {rule.enum}, got {value!r}",
                expected=rule.enum,
                actual=value,
            ))

        # Min/max checks
        if rule.min is not None and isinstance(value, (int, float)):
            if value < rule.min:
                violations.append(SchemaViolation(
                    key=key,
                    rule="min",
                    message=f"Key '{key}' must be >= {rule.min}, got {value}",
                    expected=rule.min,
                    actual=value,
                ))

        if rule.max is not None and isinstance(value, (int, float)):
            if value > rule.max:
                violations.append(SchemaViolation(
                    key=key,
                    rule="max",
                    message=f"Key '{key}' must be <= {rule.max}, got {value}",
                    expected=rule.max,
                    actual=value,
                ))

        # Format check
        if rule.format and isinstance(value, str):
            fmt = rule.format
            if fmt in _FORMAT_VALIDATORS:
                if not _FORMAT_VALIDATORS[fmt](value):
                    violations.append(SchemaViolation(
                        key=key,
                        rule="format",
                        message=f"Key '{key}' doesn't match format '{fmt}'",
                        expected=fmt,
                        actual=value,
                    ))
            else:
                # Treat as regex
                if not re.search(fmt, value):
                    violations.append(SchemaViolation(
                        key=key,
                        rule="format",
                        message=f"Key '{key}' doesn't match pattern '{fmt}'",
                        expected=fmt,
                        actual=value,
                    ))

        # Custom validator
        if rule.validator is not None:
            try:
                if not rule.validator(value):
                    violations.append(SchemaViolation(
                        key=key,
                        rule="validator",
                        message=f"Key '{key}' failed custom validation",
                        actual=value,
                    ))
            except Exception as e:
                violations.append(SchemaViolation(
                    key=key,
                    rule="validator",
                    message=f"Key '{key}' custom validator threw: {e}",
                    actual=value,
                ))

    # Strict mode: reject unknown keys
    if strict:
        schema_keys = set(schema.keys())
        for key in data:
            if key not in schema_keys:
                violations.append(SchemaViolation(
                    key=key,
                    rule="strict",
                    message=f"Unknown key '{key}' not in schema (strict mode)",
                ))

    return violations


def assert_valid(
    data: dict[str, Any],
    schema: DotlyteSchema,
    strict: bool = False,
) -> None:
    """Validate data against schema, raising ValidationError if invalid.

    Args:
        data: Configuration data to validate.
        schema: Schema to validate against.
        strict: If True, unknown keys are rejected.

    Raises:
        ValidationError: If validation fails.

    """
    violations = validate_schema(data, schema, strict)
    if violations:
        raise ValidationError(violations)


def get_sensitive_keys(schema: DotlyteSchema) -> set[str]:
    """Extract keys marked as sensitive in the schema.

    Args:
        schema: Schema definition.

    Returns:
        Set of key names marked as sensitive.

    """
    return {key for key, rule in schema.items() if rule.sensitive}


def _check_type(value: Any, expected: SchemaType) -> bool:
    """Check if a value matches the expected schema type."""
    if expected == "string":
        return isinstance(value, str)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    return True
