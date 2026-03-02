"""Deep merge utility for DOTLYTE configuration layers."""

from __future__ import annotations

from typing import Any


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Deep merge two dictionaries. Values in `override` take precedence.

    Nested dictionaries are merged recursively. Non-dict values in override
    replace the corresponding values in base entirely.

    Args:
        base: The base dictionary (lower priority).
        override: The override dictionary (higher priority).

    Returns:
        A new merged dictionary.

    Example:
        >>> deep_merge({"a": 1, "b": {"c": 2}}, {"b": {"d": 3}})
        {'a': 1, 'b': {'c': 2, 'd': 3}}

    """
    result = base.copy()

    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value

    return result
