"""Sensitive value detection and redaction for DOTLYTE.

Automatically detects keys that contain sensitive values (passwords, tokens,
API keys, etc.) and provides redaction utilities.
"""

from __future__ import annotations

import re
from typing import Any

REDACTED = "***REDACTED***"

# Patterns that indicate a key holds sensitive data
_SENSITIVE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"secret", re.I),
    re.compile(r"password", re.I),
    re.compile(r"passwd", re.I),
    re.compile(r"token", re.I),
    re.compile(r"api[_-]?key", re.I),
    re.compile(r"private[_-]?key", re.I),
    re.compile(r"credential", re.I),
    re.compile(r"auth", re.I),
    re.compile(r"cert", re.I),
    re.compile(r"dsn", re.I),
    re.compile(r"connection[_-]?string", re.I),
    re.compile(r"salt", re.I),
    re.compile(r"hash", re.I),
    re.compile(r"signing", re.I),
    re.compile(r"encrypt", re.I),
]


def build_sensitive_set(
    all_keys: set[str],
    schema_sensitive: set[str] | None = None,
) -> set[str]:
    """Build the set of sensitive keys by combining schema hints + auto-detection.

    Args:
        all_keys: All configuration key names.
        schema_sensitive: Keys explicitly marked sensitive in schema.

    Returns:
        Set of keys that should be redacted.

    """
    result = set(schema_sensitive or set())

    for key in all_keys:
        for pattern in _SENSITIVE_PATTERNS:
            if pattern.search(key):
                result.add(key)
                break

    return result


def redact_object(
    data: dict[str, Any],
    sensitive_keys: set[str],
    prefix: str = "",
) -> dict[str, Any]:
    """Recursively redact sensitive values in a dictionary.

    Args:
        data: Config data to redact.
        sensitive_keys: Set of key names to redact.
        prefix: Key prefix for nested objects.

    Returns:
        New dict with sensitive values replaced by REDACTED.

    """
    result: dict[str, Any] = {}
    for key, value in data.items():
        full_key = f"{prefix}{key}" if not prefix else f"{prefix}.{key}"
        if full_key in sensitive_keys or key in sensitive_keys:
            result[key] = REDACTED
        elif isinstance(value, dict):
            result[key] = redact_object(value, sensitive_keys, full_key)
        else:
            result[key] = value
    return result


def format_redacted(data: dict[str, Any], sensitive_keys: set[str]) -> str:
    """Format config data as a string with sensitive values redacted.

    Args:
        data: Config data.
        sensitive_keys: Keys to redact.

    Returns:
        Multi-line string of KEY=VALUE with sensitive values redacted.

    """
    redacted = redact_object(data, sensitive_keys)
    lines: list[str] = []
    _format_lines(redacted, lines, "")
    return "\n".join(lines)


def _format_lines(
    data: dict[str, Any],
    lines: list[str],
    prefix: str,
) -> None:
    """Recursively format dict entries as flat key=value lines."""
    for key, value in sorted(data.items()):
        full_key = f"{prefix}{key}" if not prefix else f"{prefix}.{key}"
        if isinstance(value, dict):
            _format_lines(value, lines, full_key)
        else:
            lines.append(f"{full_key}={value}")
