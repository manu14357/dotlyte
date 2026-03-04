"""Variable interpolation engine for DOTLYTE.

Expands ${VAR}, ${VAR:-default}, ${VAR:?error} references in .env values.
Detects circular references.
"""

from __future__ import annotations

import re
from typing import Any

from dotlyte.errors import InterpolationError

# Pattern: ${VAR}, ${VAR:-default}, ${VAR:?error}
_VAR_PATTERN = re.compile(r"\$\{([^}]+)\}")


def interpolate(
    data: dict[str, str],
    context: dict[str, Any] | None = None,
    env_vars: dict[str, str] | None = None,
) -> dict[str, str]:
    """Expand variable references in a dictionary of string values.

    Resolution order: same-file → context → os.environ.

    Args:
        data: Raw string key-value pairs from .env file.
        context: Already-loaded config values for resolution.
        env_vars: Optional env vars dict (defaults to os.environ).

    Returns:
        New dict with all variable references expanded.

    Raises:
        InterpolationError: On circular references or undefined required vars.

    """
    import os

    ctx = context or {}
    envs = env_vars if env_vars is not None else dict(os.environ)
    resolved: dict[str, str] = {}
    resolving: set[str] = set()

    def _resolve_key(key: str) -> str:
        if key in resolved:
            return resolved[key]
        if key in resolving:
            chain = " → ".join(resolving) + f" → {key}"
            raise InterpolationError(
                f"Circular variable reference detected: {chain}",
                key=key,
            )

        if key not in data:
            # Fall back to context or env
            ctx_val = _get_nested(ctx, key)
            if ctx_val is not None:
                return str(ctx_val)
            env_key = key.upper()
            if env_key in envs:
                return envs[env_key]
            return ""

        resolving.add(key)
        val = _expand(data[key])
        resolving.discard(key)
        resolved[key] = val
        return val

    def _expand(value: str) -> str:
        # Handle $$ escape
        value = value.replace("$$", "\x00DOLLAR\x00")

        def _replacer(match: re.Match[str]) -> str:
            expr = match.group(1)

            # ${VAR:?error}
            if ":?" in expr:
                var_name, error_msg = expr.split(":?", 1)
                val = _lookup(var_name.strip())
                if not val:
                    raise InterpolationError(
                        error_msg.strip() or f"Required variable '{var_name.strip()}' is not set",
                        key=var_name.strip(),
                    )
                return val

            # ${VAR:-default}
            if ":-" in expr:
                var_name, default = expr.split(":-", 1)
                val = _lookup(var_name.strip())
                return val if val else default

            # ${VAR}
            return _lookup(expr.strip())

        result = _VAR_PATTERN.sub(_replacer, value)
        return result.replace("\x00DOLLAR\x00", "$")

    def _lookup(var_name: str) -> str:
        # Check same-file data first
        lower = var_name.lower()
        if lower in data:
            return _resolve_key(lower)
        # Check context
        ctx_val = _get_nested(ctx, lower)
        if ctx_val is not None:
            return str(ctx_val)
        # Check env vars
        upper = var_name.upper()
        if upper in envs:
            return envs[upper]
        return ""

    for key in data:
        if key not in resolved:
            _resolve_key(key)

    return resolved


def _get_nested(data: dict[str, Any], key: str) -> Any:
    """Get a value from a nested dict using dot-notation or flat key."""
    # Try flat key first
    if key in data:
        return data[key]
    # Try dot-notation
    parts = key.split(".")
    current: Any = data
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current
