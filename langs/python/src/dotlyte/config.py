"""Config object v2 — immutable, scoped, validated, masked, watchable."""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Callable, TypeVar

from dotlyte.errors import DotlyteError, MissingRequiredKeyError
from dotlyte.masking import REDACTED, build_sensitive_set, format_redacted, redact_object
from dotlyte.validator import (
    DotlyteSchema,
    assert_valid,
    get_sensitive_keys,
    validate_schema,
)
from dotlyte.watcher import (
    ChangeCallback,
    ConfigWatcher,
    ErrorCallback,
    KeyChangeCallback,
)

T = TypeVar("T")


class Config:
    """Immutable configuration object with dot-notation access.

    Supports nested config, scoping, schema validation, sensitive value
    masking, serialization, batch require, and file watching.

    Example:
        >>> config = Config({"port": 8080, "database": {"host": "localhost"}})
        >>> config.port
        8080
        >>> config.database.host
        'localhost'
        >>> config.scope("database").get("host")
        'localhost'

    """

    def __init__(
        self,
        data: dict[str, Any],
        *,
        schema: DotlyteSchema | None = None,
        sensitive_keys: set[str] | None = None,
        source_files: list[str] | None = None,
        frozen: bool = True,
    ) -> None:
        self._data = data
        self._schema = schema
        self._source_files = source_files or []
        self._frozen = frozen
        self._watcher: ConfigWatcher | None = None

        # Build sensitive keys set
        all_keys = self._flatten_keys(data)
        schema_sensitive = get_sensitive_keys(schema) if schema else set()
        self._sensitive_keys = sensitive_keys or build_sensitive_set(all_keys, schema_sensitive)

        # Set dot-notation properties
        for key, value in data.items():
            if isinstance(value, dict):
                setattr(self, key, Config(
                    value,
                    sensitive_keys=self._scoped_sensitive_keys(key),
                    frozen=frozen,
                ))
            else:
                setattr(self, key, value)

    # ──── Core Access ────

    def get(self, key: str, default: Any = None) -> Any:
        """Safe access with optional fallback. Supports dot-notation."""
        try:
            parts = key.split(".")
            val: Any = self._data
            for part in parts:
                if isinstance(val, dict):
                    val = val[part]
                else:
                    return default
            return val if val is not None else default
        except (KeyError, TypeError):
            return default

    def require(self, key: str) -> Any:
        """Access a required key. Raises with actionable message if missing."""
        val = self.get(key)
        if val is None:
            raise MissingRequiredKeyError(key, self._source_files)
        return val

    def require_keys(self, *keys: str) -> dict[str, Any]:
        """Batch require multiple keys. Reports ALL missing at once."""
        missing: list[str] = []
        result: dict[str, Any] = {}
        for key in keys:
            val = self.get(key)
            if val is None:
                missing.append(key)
            else:
                result[key] = val
        if missing:
            raise DotlyteError(
                f"Required config keys are missing: {', '.join(repr(k) for k in missing)}. "
                f"Set them in your .env file, config file, or as environment variables.",
            )
        return result

    def has(self, key: str) -> bool:
        """Check if a key exists and is non-null."""
        val = self.get(key)
        return val is not None

    # ──── Scoping ────

    def scope(self, prefix: str) -> Config:
        """Return a sub-Config scoped to a nested key.

        Example:
            >>> config = Config({"database": {"host": "localhost", "port": 5432}})
            >>> db = config.scope("database")
            >>> db.host
            'localhost'

        """
        val = self.get(prefix)
        if isinstance(val, dict):
            return Config(
                val,
                sensitive_keys=self._scoped_sensitive_keys(prefix),
                frozen=self._frozen,
            )
        return Config({})

    # ──── Introspection ────

    def keys(self) -> list[str]:
        """Return all top-level keys."""
        return list(self._data.keys())

    def to_flat_map(self) -> dict[str, Any]:
        """Flatten nested config into dot-notation keys."""
        result: dict[str, Any] = {}
        self._flatten(self._data, result, "")
        return result

    def to_dict(self) -> dict[str, Any]:
        """Return a mutable deep copy of the underlying data."""
        return copy.deepcopy(self._data)

    def to_object_redacted(self) -> dict[str, Any]:
        """Return config data with sensitive values masked."""
        return redact_object(self._data, self._sensitive_keys)

    def to_json(self) -> str:
        """Serialize to JSON with sensitive values redacted."""
        return json.dumps(self.to_object_redacted(), indent=2)

    def __repr__(self) -> str:
        """Return string with sensitive values redacted."""
        return f"Config({self.to_object_redacted()})"

    def __str__(self) -> str:
        """Return formatted key=value pairs with redaction."""
        return format_redacted(self._data, self._sensitive_keys)

    def __contains__(self, key: str) -> bool:
        """Support 'in' operator."""
        return self.has(key)

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Config):
            return self._data == other._data
        if isinstance(other, dict):
            return self._data == other
        return NotImplemented

    # ──── Serialization ────

    def write_to(self, filepath: str | Path, fmt: str = "json") -> None:
        """Write config to a file.

        Args:
            filepath: Output path.
            fmt: Format — "json", "env", "yaml", or "toml".

        """
        path = Path(filepath)
        if fmt == "json":
            path.write_text(json.dumps(self._data, indent=2) + "\n", encoding="utf-8")
        elif fmt == "env":
            flat = self.to_flat_map()
            lines = [f"{k.upper()}={v}" for k, v in flat.items()]
            path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        elif fmt == "yaml":
            try:
                import yaml
                path.write_text(yaml.dump(self._data, default_flow_style=False), encoding="utf-8")
            except ImportError:
                raise ImportError("pyyaml is required for YAML output: pip install pyyaml")
        elif fmt == "toml":
            import sys
            if sys.version_info >= (3, 11):
                # Python 3.11+ has tomllib (read-only), need tomli-w for writing
                try:
                    import tomli_w
                    path.write_bytes(tomli_w.dumps(self._data).encode("utf-8"))
                except ImportError:
                    raise ImportError("tomli-w is required for TOML output: pip install tomli-w")
            else:
                try:
                    import tomli_w
                    path.write_bytes(tomli_w.dumps(self._data).encode("utf-8"))
                except ImportError:
                    raise ImportError("tomli-w is required for TOML output: pip install tomli-w")
        else:
            raise ValueError(f"Unsupported format: {fmt}")

    # ──── Validation ────

    def validate(self, schema: DotlyteSchema | None = None, strict: bool = False) -> list[Any]:
        """Validate against a schema. Returns list of violations."""
        s = schema or self._schema
        if not s:
            return []
        return validate_schema(self._data, s, strict)

    def assert_valid(self, schema: DotlyteSchema | None = None, strict: bool = False) -> None:
        """Validate and raise ValidationError if invalid."""
        s = schema or self._schema
        if not s:
            return
        assert_valid(self._data, s, strict)

    # ──── Watcher / Hot-Reload ────

    def _set_watcher(self, watcher: ConfigWatcher) -> None:
        """Internal: attach a watcher to this config."""
        self._watcher = watcher

    def on_change(self, callback: ChangeCallback) -> None:
        """Register a change listener."""
        if self._watcher:
            self._watcher.on_change(callback)

    def on_key_change(self, key: str, callback: KeyChangeCallback) -> None:
        """Register a key-specific change listener."""
        if self._watcher:
            self._watcher.on_key_change(key, callback)

    def on_error(self, callback: ErrorCallback) -> None:
        """Register an error listener."""
        if self._watcher:
            self._watcher.on_error(callback)

    def close(self) -> None:
        """Stop watching files."""
        if self._watcher:
            self._watcher.close()
            self._watcher = None

    # ──── Private Helpers ────

    @staticmethod
    def _flatten_keys(
        data: dict[str, Any],
        prefix: str = "",
    ) -> set[str]:
        keys: set[str] = set()
        for key, value in data.items():
            full_key = f"{prefix}.{key}" if prefix else key
            keys.add(full_key)
            if isinstance(value, dict):
                keys.update(Config._flatten_keys(value, full_key))
        return keys

    @staticmethod
    def _flatten(
        data: dict[str, Any],
        result: dict[str, Any],
        prefix: str,
    ) -> None:
        for key, value in data.items():
            full_key = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict):
                Config._flatten(value, result, full_key)
            else:
                result[full_key] = value

    def _scoped_sensitive_keys(self, prefix: str) -> set[str]:
        scoped: set[str] = set()
        prefix_dot = f"{prefix}."
        for key in self._sensitive_keys:
            if key.startswith(prefix_dot):
                scoped.add(key[len(prefix_dot):])
            elif key == prefix:
                scoped.add(key)
        return scoped
