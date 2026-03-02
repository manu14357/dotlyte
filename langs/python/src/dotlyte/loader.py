"""Main loader orchestrator for DOTLYTE.

Implements the universal load() function that discovers, parses, merges,
and coerces configuration from all available sources.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Any, Optional

from dotlyte.config import Config
from dotlyte.merger import deep_merge
from dotlyte.parsers.defaults import DefaultsParser
from dotlyte.parsers.dotenv import DotenvParser
from dotlyte.parsers.env import EnvVarsParser
from dotlyte.parsers.json import JsonParser
from dotlyte.parsers.toml import TomlParser
from dotlyte.parsers.yaml import YamlParser


def load(
    *,
    files: Optional[Sequence[str]] = None,
    prefix: Optional[str] = None,
    defaults: Optional[dict[str, Any]] = None,
    sources: Optional[Sequence[str]] = None,
    env: Optional[str] = None,
) -> Config:
    """Load configuration from all available sources with layered priority.

    Higher layers override lower layers. Sources are merged in order, with
    later sources taking precedence.

    Args:
        files: Explicit list of files to load. Auto-discovers if not provided.
        prefix: Environment variable prefix to strip (e.g., "APP").
        defaults: Default values (lowest priority).
        sources: Custom source order. Valid: "env", "dotenv", "yaml", "json",
                 "toml", "defaults".
        env: Environment name (e.g., "production"). Loads env-specific files.

    Returns:
        A Config object with dot-notation access, get(), and require().

    Example:
        >>> config = load()
        >>> config.port
        8080
        >>> config.get("database.host", "localhost")
        'localhost'

    """
    base_dir = Path.cwd()

    # Build the source stack (lowest to highest priority)
    layers: list[dict[str, Any]] = []

    if sources is not None:
        # Custom source order: left = lowest, right = highest
        for source_name in sources:
            data = _load_source(source_name, base_dir, files, prefix, defaults, env)
            if data:
                layers.append(data)
    else:
        # Default priority stack (lowest to highest)
        _append_if(layers, DefaultsParser(defaults or {}).parse())
        _append_if(layers, _load_toml_files(base_dir, env))
        _append_if(layers, _load_yaml_files(base_dir, env))
        _append_if(layers, _load_json_files(base_dir, env))
        _append_if(layers, _load_dotenv_files(base_dir, env))
        _append_if(layers, EnvVarsParser(prefix=prefix).parse())

    # Merge all layers — later layers win
    merged: dict[str, Any] = {}
    for layer in layers:
        merged = deep_merge(merged, layer)

    return Config(merged)


def _append_if(layers: list[dict[str, Any]], data: dict[str, Any]) -> None:
    """Append data to layers if it's non-empty."""
    if data:
        layers.append(data)


def _load_source(
    name: str,
    base_dir: Path,
    files: Optional[Sequence[str]],
    prefix: Optional[str],
    defaults: Optional[dict[str, Any]],
    env: Optional[str],
) -> dict[str, Any]:
    """Load a single named source."""
    if name == "defaults":
        return DefaultsParser(defaults or {}).parse()
    elif name == "toml":
        return _load_toml_files(base_dir, env)
    elif name == "yaml":
        return _load_yaml_files(base_dir, env)
    elif name == "json":
        return _load_json_files(base_dir, env)
    elif name == "dotenv":
        return _load_dotenv_files(base_dir, env)
    elif name == "env":
        return EnvVarsParser(prefix=prefix).parse()
    return {}


def _load_dotenv_files(base_dir: Path, env: Optional[str]) -> dict[str, Any]:
    """Load .env files in priority order."""
    candidates = [".env"]
    if env:
        candidates.append(f".env.{env}")
    candidates.append(".env.local")

    merged: dict[str, Any] = {}
    for filename in candidates:
        filepath = base_dir / filename
        if filepath.is_file():
            data = DotenvParser(filepath).parse()
            merged = deep_merge(merged, data)
    return merged


def _load_yaml_files(base_dir: Path, env: Optional[str]) -> dict[str, Any]:
    """Load YAML config files in priority order."""
    candidates = ["config.yaml", "config.yml"]
    if env:
        candidates.extend([f"config.{env}.yaml", f"config.{env}.yml"])

    merged: dict[str, Any] = {}
    for filename in candidates:
        filepath = base_dir / filename
        if filepath.is_file():
            data = YamlParser(filepath).parse()
            merged = deep_merge(merged, data)
    return merged


def _load_json_files(base_dir: Path, env: Optional[str]) -> dict[str, Any]:
    """Load JSON config files in priority order."""
    candidates = ["config.json"]
    if env:
        candidates.append(f"config.{env}.json")

    merged: dict[str, Any] = {}
    for filename in candidates:
        filepath = base_dir / filename
        if filepath.is_file():
            data = JsonParser(filepath).parse()
            merged = deep_merge(merged, data)
    return merged


def _load_toml_files(base_dir: Path, env: Optional[str]) -> dict[str, Any]:
    """Load TOML config files in priority order."""
    candidates = ["config.toml"]
    if env:
        candidates.append(f"config.{env}.toml")

    merged: dict[str, Any] = {}
    for filename in candidates:
        filepath = base_dir / filename
        if filepath.is_file():
            data = TomlParser(filepath).parse()
            merged = deep_merge(merged, data)
    return merged
