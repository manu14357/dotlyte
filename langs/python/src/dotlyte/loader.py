"""Main loader orchestrator for DOTLYTE v2.

Discovers, parses, interpolates, merges, validates, and coerces
configuration from all sources with plugin support.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from dotlyte.coercion import coerce_dict
from dotlyte.config import Config
from dotlyte.errors import FileError
from dotlyte.interpolation import interpolate
from dotlyte.merger import deep_merge
from dotlyte.parsers.defaults import DefaultsParser
from dotlyte.parsers.dotenv import DotenvParser
from dotlyte.parsers.env import EnvVarsParser
from dotlyte.parsers.json import JsonParser
from dotlyte.parsers.toml import TomlParser
from dotlyte.parsers.yaml import YamlParser
from dotlyte.validator import DotlyteSchema, apply_schema_defaults, assert_valid
from dotlyte.watcher import ConfigWatcher

logger = logging.getLogger("dotlyte")


# ──── Source Plugin Protocol ────

@runtime_checkable
class Source(Protocol):
    """A pluggable configuration source (vault, HTTP, etc.)."""

    @property
    def name(self) -> str: ...

    def parse(self) -> dict[str, Any]: ...


def load(
    *,
    files: Sequence[str] | None = None,
    prefix: str | None = None,
    defaults: dict[str, Any] | None = None,
    sources: Sequence[str] | None = None,
    env: str | None = None,
    schema: DotlyteSchema | None = None,
    strict: bool = False,
    plugins: Sequence[Source] | None = None,
    watch: bool = False,
    debounce_ms: int = 100,
    interpolate_vars: bool = True,
    override: bool = False,
    debug: bool = False,
    find_up: bool = False,
    root_markers: Sequence[str] | None = None,
    cwd: str | Path | None = None,
) -> Config:
    """Load configuration from all available sources with layered priority.

    Args:
        files: Explicit file list. Auto-discovers if not provided.
        prefix: Environment variable prefix to strip.
        defaults: Default values (lowest priority).
        sources: Custom source order.
        env: Environment name (loads env-specific files).
        schema: Schema for validation at load time.
        strict: Reject unknown keys not in schema.
        plugins: Custom source plugins.
        watch: Enable file watching for hot-reload.
        debounce_ms: Debounce time for watcher (ms).
        interpolate_vars: Enable variable interpolation in .env (default: True).
        override: .env files override OS env vars when True.
        debug: Enable debug logging.
        find_up: Walk up parent dirs to find config files.
        root_markers: Marker files for project root detection.
        cwd: Base directory (default: cwd).

    Returns:
        A Config object with all v2 features.

    """
    if debug:
        logging.basicConfig(level=logging.DEBUG)

    base_dir = _find_base_dir(cwd, find_up, root_markers)
    logger.debug("Base directory: %s", base_dir)
    logger.debug("Environment: %s", env or "default")

    plugin_map: dict[str, Source] = {}
    if plugins:
        for plugin in plugins:
            plugin_map[plugin.name] = plugin
            logger.debug("Registered plugin: %s", plugin.name)

    layers: list[dict[str, Any]] = []
    loaded_files: list[str] = []

    # ── EXPLICIT FILES MODE ──
    if files:
        logger.debug("Explicit files mode: %s", ", ".join(files))
        for file in files:
            filepath = base_dir / file
            if not filepath.is_file():
                raise FileError(str(filepath))
            data = _parse_file_by_extension(filepath, interpolate_vars, {}, env)
            if data:
                layers.append(data)
                loaded_files.append(str(filepath))
                logger.debug("Loaded: %s (%d keys)", filepath, len(data))

        _append_if(layers, DefaultsParser(defaults or {}).parse())
        _append_if(layers, EnvVarsParser(prefix=prefix).parse())

    # ── CUSTOM SOURCE ORDER ──
    elif sources is not None:
        logger.debug("Custom source order: %s", " → ".join(sources))
        for source_name in sources:
            if source_name in plugin_map:
                data = plugin_map[source_name].parse()
                if data:
                    layers.append(data)
                continue
            data = _load_named_source(
                source_name, base_dir, prefix, defaults, env,
                loaded_files, interpolate_vars, layers,
            )
            if data:
                layers.append(data)

    # ── AUTO-DISCOVERY ──
    else:
        logger.debug("Auto-discovery mode")
        _append_if(layers, DefaultsParser(defaults or {}).parse())
        _append_if(layers, _load_toml_files(base_dir, env, loaded_files))
        _append_if(layers, _load_yaml_files(base_dir, env, loaded_files))
        _append_if(layers, _load_json_files(base_dir, env, loaded_files))

        # Dotenv with interpolation
        dotenv_raw = _load_dotenv_files_raw(base_dir, env, loaded_files)
        if interpolate_vars and dotenv_raw:
            already_merged = _merge_all(layers)
            interpolated = interpolate(dotenv_raw, already_merged)
            _append_if(layers, coerce_dict(interpolated))
        else:
            _append_if(layers, coerce_dict(dotenv_raw))

        # Encrypted dotenv
        encrypted = _load_encrypted_dotenv(base_dir, env, loaded_files)
        if interpolate_vars and encrypted:
            already_merged = _merge_all(layers)
            interpolated = interpolate(encrypted, already_merged)
            _append_if(layers, coerce_dict(interpolated))
        else:
            _append_if(layers, coerce_dict(encrypted))

        # Env vars (highest priority)
        _append_if(layers, EnvVarsParser(prefix=prefix).parse())

        # Plugins
        for plugin in plugin_map.values():
            data = plugin.parse()
            if data:
                layers.append(data)

    # ── MERGE ──
    merged: dict[str, Any] = {}
    for layer in layers:
        merged = deep_merge(merged, layer)

    logger.debug("Merged %d layers, %d top-level keys", len(layers), len(merged))

    # ── SCHEMA DEFAULTS ──
    if schema:
        merged = apply_schema_defaults(merged, schema)

    # ── SCHEMA VALIDATION ──
    if schema:
        logger.debug("Validating against schema...")
        assert_valid(merged, schema, strict)
        logger.debug("Schema validation passed ✓")

    # ── BUILD CONFIG ──
    config = Config(
        merged,
        schema=schema,
        source_files=loaded_files,
        frozen=True,
    )

    # ── FILE WATCHING ──
    if watch and loaded_files:
        logger.debug("Watching %d files for changes", len(loaded_files))
        watcher = ConfigWatcher(loaded_files, debounce_ms)
        config._set_watcher(watcher)
        watcher.start(
            reload_fn=lambda: load(
                files=files, prefix=prefix, defaults=defaults,
                sources=sources, env=env, schema=schema, strict=strict,
                plugins=plugins, watch=False, interpolate_vars=interpolate_vars,
                override=override, cwd=cwd,
            ).to_dict(),
            initial_data=merged,
        )

    return config


# ──── Helpers ────

def _append_if(layers: list[dict[str, Any]], data: dict[str, Any]) -> None:
    if data:
        layers.append(data)


def _merge_all(layers: list[dict[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for layer in layers:
        result = deep_merge(result, layer)
    return result


def _find_base_dir(
    cwd: str | Path | None,
    find_up: bool,
    root_markers: Sequence[str] | None,
) -> Path:
    base = Path(cwd) if cwd else Path.cwd()
    if not find_up:
        return base

    markers = list(root_markers or [".git", "package.json", "pyproject.toml", "go.mod", "Cargo.toml"])
    d = base
    while True:
        if any((d / c).exists() for c in [".env", "config.yaml", "config.json", "config.toml"]):
            return d
        if any((d / m).exists() for m in markers):
            return d
        parent = d.parent
        if parent == d:
            break
        d = parent
    return base


def _load_named_source(
    name: str,
    base_dir: Path,
    prefix: str | None,
    defaults: dict[str, Any] | None,
    env: str | None,
    loaded_files: list[str],
    do_interpolate: bool,
    existing_layers: list[dict[str, Any]],
) -> dict[str, Any]:
    if name == "defaults":
        return DefaultsParser(defaults or {}).parse()
    if name == "toml":
        return _load_toml_files(base_dir, env, loaded_files)
    if name == "yaml":
        return _load_yaml_files(base_dir, env, loaded_files)
    if name == "json":
        return _load_json_files(base_dir, env, loaded_files)
    if name == "dotenv":
        raw = _load_dotenv_files_raw(base_dir, env, loaded_files)
        if do_interpolate and raw:
            merged = _merge_all(existing_layers)
            interpolated = interpolate(raw, merged)
            return coerce_dict(interpolated)
        return coerce_dict(raw)
    if name == "env":
        return EnvVarsParser(prefix=prefix).parse()
    return {}


def _load_dotenv_files_raw(
    base_dir: Path,
    env: str | None,
    loaded_files: list[str],
) -> dict[str, str]:
    candidates = [".env"]
    if env:
        candidates.append(f".env.{env}")
    candidates.append(".env.local")

    merged: dict[str, str] = {}
    for filename in candidates:
        filepath = base_dir / filename
        if filepath.is_file():
            raw = DotenvParser(filepath).parse_raw()
            merged.update(raw)
            loaded_files.append(str(filepath))
    return merged


def _load_encrypted_dotenv(
    base_dir: Path,
    env: str | None,
    loaded_files: list[str],
) -> dict[str, str]:
    try:
        from dotlyte.encryption import decrypt_file, resolve_encryption_key
    except ImportError:
        return {}

    candidates = [".env.encrypted"]
    if env:
        candidates.append(f".env.{env}.encrypted")

    key = resolve_encryption_key(env, str(base_dir))
    if not key:
        return {}

    merged: dict[str, str] = {}
    for filename in candidates:
        filepath = base_dir / filename
        if filepath.is_file():
            try:
                data = decrypt_file(filepath, key, env)
                merged.update(data)
                loaded_files.append(str(filepath))
            except Exception:
                pass
    return merged


def _load_yaml_files(
    base_dir: Path,
    env: str | None,
    loaded_files: list[str],
) -> dict[str, Any]:
    candidates = ["config.yaml", "config.yml"]
    if env:
        candidates.extend([f"config.{env}.yaml", f"config.{env}.yml"])

    merged: dict[str, Any] = {}
    for filename in candidates:
        filepath = base_dir / filename
        if filepath.is_file():
            merged = deep_merge(merged, YamlParser(filepath).parse())
            loaded_files.append(str(filepath))
    return merged


def _load_json_files(
    base_dir: Path,
    env: str | None,
    loaded_files: list[str],
) -> dict[str, Any]:
    candidates = ["config.json"]
    if env:
        candidates.append(f"config.{env}.json")

    merged: dict[str, Any] = {}
    for filename in candidates:
        filepath = base_dir / filename
        if filepath.is_file():
            merged = deep_merge(merged, JsonParser(filepath).parse())
            loaded_files.append(str(filepath))
    return merged


def _load_toml_files(
    base_dir: Path,
    env: str | None,
    loaded_files: list[str],
) -> dict[str, Any]:
    candidates = ["config.toml"]
    if env:
        candidates.append(f"config.{env}.toml")

    merged: dict[str, Any] = {}
    for filename in candidates:
        filepath = base_dir / filename
        if filepath.is_file():
            merged = deep_merge(merged, TomlParser(filepath).parse())
            loaded_files.append(str(filepath))
    return merged


def _parse_file_by_extension(
    filepath: Path,
    do_interpolate: bool,
    context: dict[str, Any],
    env: str | None = None,
) -> dict[str, Any]:
    name = filepath.name.lower()
    if name.endswith(".encrypted"):
        try:
            from dotlyte.encryption import decrypt_file
            data = decrypt_file(filepath, env=env)
            if do_interpolate:
                interpolated = interpolate(data, context)
                return coerce_dict(interpolated)
            return coerce_dict(data)
        except Exception:
            return {}
    if name.endswith((".yaml", ".yml")):
        return YamlParser(filepath).parse()
    if name.endswith(".json"):
        return JsonParser(filepath).parse()
    if name.endswith(".toml"):
        return TomlParser(filepath).parse()
    if name.startswith(".env") or name.endswith(".env"):
        raw = DotenvParser(filepath).parse_raw()
        if do_interpolate:
            interpolated = interpolate(raw, context)
            return coerce_dict(interpolated)
        return coerce_dict(raw)
    # Default: try JSON
    return JsonParser(filepath).parse()
