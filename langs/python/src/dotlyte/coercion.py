"""Type coercion engine for DOTLYTE.

Automatically converts string values from .env files and environment variables
to native Python types: bool, int, float, list, None.
"""

from __future__ import annotations

from typing import Any

# Null indicators (case-insensitive)
_NULL_VALUES = frozenset({"null", "none", "nil", ""})

# Boolean true indicators (case-insensitive)
_TRUE_VALUES = frozenset({"true", "yes", "1", "on"})

# Boolean false indicators (case-insensitive)
_FALSE_VALUES = frozenset({"false", "no", "0", "off"})


def coerce(value: Any) -> Any:
    """Auto-convert a string value to the correct Python type.

    Values that are already non-string types (e.g., from YAML/JSON) pass
    through unchanged.

    Args:
        value: The value to coerce. Only strings are processed.

    Returns:
        The coerced value with its native Python type.

    Example:
        >>> coerce("true")
        True
        >>> coerce("8080")
        8080
        >>> coerce("3.14")
        3.14
        >>> coerce("a,b,c")
        ['a', 'b', 'c']

    """
    if not isinstance(value, str):
        return value  # Already typed (from YAML/JSON) — pass through

    stripped = value.strip()
    lower = stripped.lower()

    # Null
    if lower in _NULL_VALUES:
        return None

    # Boolean
    if lower in _TRUE_VALUES:
        return True
    if lower in _FALSE_VALUES:
        return False

    # Integer
    try:
        return int(stripped)
    except ValueError:
        pass

    # Float
    try:
        float_val = float(stripped)
        # Only treat as float if it has a decimal point (not scientific notation)
        if "." in stripped:
            return float_val
    except ValueError:
        pass

    # List (comma-separated)
    if "," in stripped:
        return [coerce(item.strip()) for item in stripped.split(",")]

    # String — return as-is
    return stripped


def coerce_dict(data: dict[str, Any]) -> dict[str, Any]:
    """Recursively coerce all string values in a dictionary.

    Args:
        data: Dictionary with potentially string values from .env.

    Returns:
        A new dictionary with coerced values.

    """
    result: dict[str, Any] = {}
    for key, value in data.items():
        if isinstance(value, dict):
            result[key] = coerce_dict(value)
        elif isinstance(value, str):
            result[key] = coerce(value)
        else:
            result[key] = value
    return result
