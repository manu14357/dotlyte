"""Defaults parser for DOTLYTE."""

from __future__ import annotations

from typing import Any


class DefaultsParser:
    """Parse hardcoded default values (lowest priority layer).

    Args:
        defaults: Dictionary of default configuration values.

    """

    def __init__(self, defaults: dict[str, Any]) -> None:
        """Initialize with default values.

        Args:
            defaults: Dictionary of default configuration values.

        """
        self._defaults = defaults

    def parse(self) -> dict[str, Any]:
        """Return the defaults dictionary.

        Returns:
            A copy of the defaults dictionary.

        """
        return self._defaults.copy()
