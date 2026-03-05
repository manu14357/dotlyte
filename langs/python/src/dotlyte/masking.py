"""Sensitive value detection and redaction for DOTLYTE.

Automatically detects keys that contain sensitive values (passwords, tokens,
API keys, etc.) and provides redaction utilities.
"""

from __future__ import annotations

import re
from typing import Any, Callable

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


# ──── Enhanced masking (v0.1.2) ────


def compile_patterns(patterns: list[str]) -> list[re.Pattern[str]]:
    """Compile glob-like patterns into regular expressions.

    Supported wildcards:

    * ``*`` — matches any sequence of characters.
    * Literal strings are matched case-insensitively.

    Args:
        patterns: Glob-like patterns (e.g. ``["*_KEY", "*_SECRET"]``).

    Returns:
        A list of compiled ``re.Pattern`` objects.

    Example:
        >>> compile_patterns(["*_KEY", "DATABASE_*"])
        [re.compile('^.*_KEY$', re.IGNORECASE), ...]

    """
    compiled: list[re.Pattern[str]] = []
    for p in patterns:
        escaped = re.escape(p).replace(r"\*", ".*")
        compiled.append(re.compile(f"^{escaped}$", re.I))
    return compiled


def build_sensitive_set_with_patterns(
    all_keys: set[str],
    patterns: list[str],
    schema_sensitive: set[str] | None = None,
) -> set[str]:
    """Build a sensitive key set using custom glob patterns.

    Checks each key (and its leaf component for dotted keys) against the
    compiled patterns **and** the built-in auto-detection patterns.

    Args:
        all_keys: All configuration key names.
        patterns: Glob-like patterns (e.g. ``["*_KEY", "SECRET_*"]``).
        schema_sensitive: Keys explicitly marked sensitive in the schema.

    Returns:
        Combined set of sensitive keys.

    """
    result = set(schema_sensitive or set())
    compiled = compile_patterns(patterns)

    for key in all_keys:
        leaf = key.rsplit(".", 1)[-1] if "." in key else key

        # Custom patterns
        if any(rx.search(leaf) or rx.search(key) for rx in compiled):
            result.add(key)

        # Built-in auto-detection
        for pat in _SENSITIVE_PATTERNS:
            if pat.search(leaf):
                result.add(key)
                break

    return result


class AuditProxy:
    """Read-only wrapper that fires a callback on sensitive key access.

    Args:
        data: The underlying config dict.
        sensitive_keys: Set of keys that trigger the callback.
        on_access: Called with ``(key, context)`` when a sensitive key is read.

    """

    def __init__(
        self,
        data: dict[str, Any],
        sensitive_keys: set[str],
        on_access: Callable[[str, str], None],
    ) -> None:
        object.__setattr__(self, "_data", dict(data))
        object.__setattr__(self, "_sensitive_keys", set(sensitive_keys))
        object.__setattr__(self, "_on_access", on_access)

    def __getitem__(self, key: str) -> Any:
        sensitive_keys: set[str] = object.__getattribute__(self, "_sensitive_keys")
        if key in sensitive_keys:
            on_access: Callable[[str, str], None] = object.__getattribute__(
                self, "_on_access"
            )
            on_access(key, "server")

        data: dict[str, Any] = object.__getattribute__(self, "_data")
        return data[key]

    def __getattr__(self, key: str) -> Any:
        try:
            return self[key]
        except KeyError:
            raise AttributeError(
                f"'{type(self).__name__}' has no attribute '{key}'"
            ) from None

    def __contains__(self, key: object) -> bool:
        data: dict[str, Any] = object.__getattribute__(self, "_data")
        return key in data

    def __repr__(self) -> str:
        data: dict[str, Any] = object.__getattribute__(self, "_data")
        return f"AuditProxy(keys={sorted(data.keys())})"

    def get(self, key: str, default: Any = None) -> Any:
        """Get a value with an optional default.

        Args:
            key: The config key.
            default: Returned if *key* is missing.

        Returns:
            The value or *default*.

        """
        data: dict[str, Any] = object.__getattribute__(self, "_data")
        if key in data:
            return self[key]
        return default


def create_audit_proxy(
    data: dict[str, Any],
    sensitive_keys: set[str],
    on_access: Callable[[str, str], None],
) -> AuditProxy:
    """Create a proxy that fires *on_access* when sensitive keys are read.

    Args:
        data: The config data.
        sensitive_keys: Set of sensitive keys.
        on_access: Callback fired as ``on_access(key, context)``.

    Returns:
        An ``AuditProxy`` wrapping the data.

    """
    return AuditProxy(data, sensitive_keys, on_access)

