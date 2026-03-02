"""Tests for the DOTLYTE loader."""

from __future__ import annotations

import pytest

from dotlyte import Config, DotlyteError, load


class TestLoad:
    """Tests for the load() function."""

    def test_load_returns_config(self) -> None:
        """load() should return a Config object."""
        config = load(defaults={"port": 3000})
        assert isinstance(config, Config)

    def test_load_with_defaults(self) -> None:
        """load() should use defaults when no other sources exist."""
        config = load(defaults={"port": 3000, "debug": False})
        assert config.get("port") == 3000
        assert config.get("debug") is False

    def test_load_empty(self) -> None:
        """load() with no sources should return empty config."""
        config = load(defaults={})
        assert isinstance(config, Config)

    def test_config_get_with_default(self) -> None:
        """Config.get() should return default when key is missing."""
        config = Config({"existing": "value"})
        assert config.get("missing", "fallback") == "fallback"

    def test_config_get_nested(self) -> None:
        """Config.get() should support dot-notation for nested keys."""
        config = Config({"database": {"host": "localhost", "port": 5432}})
        assert config.get("database.host") == "localhost"
        assert config.get("database.port") == 5432

    def test_config_dot_notation(self) -> None:
        """Config should support dot-notation attribute access."""
        config = Config({"port": 8080, "database": {"host": "localhost"}})
        assert config.port == 8080
        assert config.database.host == "localhost"

    def test_config_require_existing(self) -> None:
        """Config.require() should return value for existing keys."""
        config = Config({"database_url": "postgres://localhost"})
        assert config.require("database_url") == "postgres://localhost"

    def test_config_require_missing(self) -> None:
        """Config.require() should raise DotlyteError for missing keys."""
        config = Config({})
        with pytest.raises(DotlyteError):
            config.require("MISSING_KEY")

    def test_config_contains(self) -> None:
        """Config should support 'in' operator."""
        config = Config({"port": 8080})
        assert "port" in config
        assert "missing" not in config

    def test_config_to_dict(self) -> None:
        """Config.to_dict() should return the raw dictionary."""
        data = {"port": 8080, "debug": True}
        config = Config(data)
        assert config.to_dict() == data
