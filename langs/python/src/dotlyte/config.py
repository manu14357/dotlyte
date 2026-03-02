"""Config object with dot-notation access, get(), and require()."""

from __future__ import annotations

from typing import Any

from dotlyte.errors import DotlyteError


class Config:
    """Configuration object with dot-notation access.

    Supports nested config: config.database.host
    Safe access: config.get("database.host", "localhost")
    Required access: config.require("DATABASE_URL")

    Example:
        >>> config = Config({"port": 8080, "database": {"host": "localhost"}})
        >>> config.port
        8080
        >>> config.database.host
        'localhost'

    """

    def __init__(self, data: dict[str, Any]) -> None:
        """Initialize Config with a dictionary of values.

        Args:
            data: Configuration dictionary. Nested dicts become nested Config objects.

        """
        self._data = data
        for key, value in data.items():
            if isinstance(value, dict):
                setattr(self, key, Config(value))
            else:
                setattr(self, key, value)

    def get(self, key: str, default: Any = None) -> Any:
        """Safe access with an optional fallback value.

        Supports dot-notation keys for nested access.

        Args:
            key: Configuration key, supports dot-notation (e.g., "database.host").
            default: Fallback value if key doesn't exist. Defaults to None.

        Returns:
            The configuration value, or the default if not found.

        """
        try:
            parts = key.split(".")
            val: Any = self._data
            for part in parts:
                if isinstance(val, dict):
                    val = val[part]
                else:
                    return default
            return val
        except (KeyError, TypeError):
            return default

    def require(self, key: str) -> Any:
        """Access a required configuration key.

        Args:
            key: Configuration key, supports dot-notation (e.g., "database.host").

        Returns:
            The configuration value.

        Raises:
            DotlyteError: If the key is missing or None.

        """
        val = self.get(key)
        if val is None:
            raise DotlyteError(
                f"Required config key '{key}' is missing. "
                f"Set it in your .env file or as an environment variable."
            )
        return val

    def to_dict(self) -> dict[str, Any]:
        """Convert the Config back to a plain dictionary.

        Returns:
            A dictionary representation of the configuration.

        """
        return self._data.copy()

    def __contains__(self, key: str) -> bool:
        """Check if a key exists in the config."""
        return self.get(key) is not None

    def __repr__(self) -> str:
        """Return a string representation of the Config."""
        return f"Config({self._data})"

    def __eq__(self, other: object) -> bool:
        """Check equality with another Config or dict."""
        if isinstance(other, Config):
            return self._data == other._data
        if isinstance(other, dict):
            return self._data == other
        return NotImplemented
