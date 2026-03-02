"""Environment variables parser for DOTLYTE."""

from __future__ import annotations

import os
from typing import Any, Optional

from dotlyte.coercion import coerce


class EnvVarsParser:
    """Parse configuration from environment variables (os.environ).

    Optionally strips a prefix and converts underscore-separated keys
    to dot-notation nesting.

    Args:
        prefix: Optional prefix to filter and strip from env var names.

    """

    def __init__(self, prefix: Optional[str] = None) -> None:
        """Initialize with an optional prefix.

        Args:
            prefix: If set, only env vars starting with "{PREFIX}_" are loaded,
                    and the prefix is stripped from the key names.

        """
        self.prefix = prefix.upper() + "_" if prefix else None

    def parse(self) -> dict[str, Any]:
        """Parse environment variables into a config dictionary.

        Returns:
            Dictionary of coerced config values from the environment.

        """
        result: dict[str, Any] = {}

        for key, value in os.environ.items():
            if self.prefix:
                if not key.startswith(self.prefix):
                    continue
                # Strip prefix and convert to lowercase dot-notation
                clean_key = key[len(self.prefix) :].lower()
                self._set_nested(result, clean_key, coerce(value))
            else:
                result[key.lower()] = coerce(value)

        return result

    @staticmethod
    def _set_nested(data: dict[str, Any], key: str, value: Any) -> None:
        """Set a nested key using underscore as separator.

        Args:
            data: The dictionary to set the value in.
            key: The underscore-separated key (e.g., "db_host").
            value: The value to set.

        """
        parts = key.split("_")
        current = data
        for part in parts[:-1]:
            if part not in current or not isinstance(current[part], dict):
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value
