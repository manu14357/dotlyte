"""Monorepo / workspace support for DOTLYTE.

Detects monorepo root (pnpm-workspace.yaml, turbo.json, nx.json, lerna.json),
loads root-level .env first, then package-level .env on top.

Example::

    from dotlyte.workspace import load_workspace

    config = load_workspace(packages=["apps/web"])
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from dotlyte.loader import load


@dataclass
class MonorepoInfo:
    """Information about a detected monorepo."""

    root: str
    type: Literal["pnpm", "npm", "yarn", "nx", "turbo", "lerna", "unknown"]
    packages: list[str] = field(default_factory=list)


def find_monorepo_root(cwd: str | Path | None = None) -> MonorepoInfo | None:
    """Auto-detect the monorepo root by walking up from *cwd*.

    Checks for ``pnpm-workspace.yaml``, ``turbo.json``, ``nx.json``,
    ``lerna.json``, or ``package.json`` with a ``workspaces`` field.

    Args:
        cwd: Starting directory. Defaults to the current working directory.

    Returns:
        A ``MonorepoInfo`` if found, else ``None``.

    """
    directory = Path(cwd).resolve() if cwd else Path.cwd()
    root = Path(directory.anchor)

    while directory != root:
        info = _detect_monorepo_at(directory)
        if info is not None:
            return info
        parent = directory.parent
        if parent == directory:
            break
        directory = parent

    return None


def _detect_monorepo_at(directory: Path) -> MonorepoInfo | None:
    """Check *directory* for monorepo markers."""
    # pnpm workspaces
    pnpm_ws = directory / "pnpm-workspace.yaml"
    if pnpm_ws.is_file():
        return MonorepoInfo(
            root=str(directory),
            type="pnpm",
            packages=_extract_pnpm_workspaces(pnpm_ws),
        )

    # Turbo
    turbo_json = directory / "turbo.json"
    if turbo_json.is_file():
        return MonorepoInfo(
            root=str(directory),
            type="turbo",
            packages=_extract_package_json_workspaces(directory),
        )

    # Nx
    nx_json = directory / "nx.json"
    if nx_json.is_file():
        return MonorepoInfo(
            root=str(directory),
            type="nx",
            packages=_extract_package_json_workspaces(directory),
        )

    # Lerna
    lerna_json = directory / "lerna.json"
    if lerna_json.is_file():
        return MonorepoInfo(
            root=str(directory),
            type="lerna",
            packages=_extract_lerna_packages(lerna_json),
        )

    # npm / yarn workspaces
    pkg_path = directory / "package.json"
    if pkg_path.is_file():
        try:
            pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
            if "workspaces" in pkg:
                is_yarn = (directory / "yarn.lock").is_file()
                return MonorepoInfo(
                    root=str(directory),
                    type="yarn" if is_yarn else "npm",
                    packages=_extract_from_workspaces_field(pkg["workspaces"]),
                )
        except (json.JSONDecodeError, OSError):
            pass

    return None


def get_shared_env(
    root: str | Path,
    prefix: str | None = None,
) -> dict[str, str]:
    """Load shared env keys from the monorepo root ``.env``.

    Args:
        root: Monorepo root directory.
        prefix: Optional prefix to strip from keys.

    Returns:
        Dictionary of shared key-value pairs.

    """
    env_path = Path(root) / ".env"
    if not env_path.is_file():
        return {}

    result: dict[str, str] = {}
    content = env_path.read_text(encoding="utf-8")

    for line in content.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        eq_idx = trimmed.find("=")
        if eq_idx < 0:
            continue

        key = trimmed[:eq_idx].strip()
        value = trimmed[eq_idx + 1 :].strip()

        if prefix and key.startswith(prefix):
            key = key[len(prefix) :]

        result[key] = value

    return result


def load_workspace(
    root: str | Path | None = None,
    packages: list[str] | None = None,
    shared_env_file: str | None = None,
    prefix: str | None = None,
    **load_options: Any,
) -> Any:
    """Load configuration with monorepo-aware env inheritance.

    Priority (highest wins):
        1. Environment variables
        2. Package ``.env`` files
        3. Root ``.env`` files
        4. Defaults

    Args:
        root: Monorepo root (auto-detected if omitted).
        packages: Sub-package paths relative to root (e.g. ``["apps/web"]``).
        shared_env_file: Explicit shared env file path at root.
        prefix: Env var prefix to strip.
        **load_options: Forwarded to ``load()``.

    Returns:
        A ``Config`` object.

    """
    mono_root = Path(root) if root else None

    if mono_root is None:
        info = find_monorepo_root()
        if info is not None:
            mono_root = Path(info.root)

    if mono_root is None:
        # Not a monorepo — fall back to regular load
        return load(prefix=prefix, **load_options)

    # Collect files: root .env first (lower priority), then package .env
    env_name = load_options.get("env")
    root_files = _resolve_env_files(mono_root, env_name)

    if shared_env_file:
        shared_path = mono_root / shared_env_file
        if shared_path.is_file():
            root_files.insert(0, str(shared_path))

    package_files: list[str] = []
    if packages:
        for pkg in packages:
            pkg_dir = mono_root / pkg
            package_files.extend(_resolve_env_files(pkg_dir, env_name))

    all_files = root_files + package_files
    existing_files = [f for f in all_files if Path(f).is_file()]

    return load(
        files=existing_files if existing_files else None,
        prefix=prefix,
        **load_options,
    )


# ──── Internal helpers ────


def _resolve_env_files(directory: Path, env: str | None = None) -> list[str]:
    """Return a list of potential .env file paths in *directory*."""
    files = [
        str(directory / ".env"),
        str(directory / ".env.local"),
    ]
    if env:
        files.append(str(directory / f".env.{env}"))
        files.append(str(directory / f".env.{env}.local"))
    return files


def _extract_pnpm_workspaces(filepath: Path) -> list[str]:
    """Parse ``pnpm-workspace.yaml`` for package globs."""
    try:
        content = filepath.read_text(encoding="utf-8")
        packages: list[str] = []
        in_packages = False

        for line in content.splitlines():
            trimmed = line.strip()
            if trimmed == "packages:":
                in_packages = True
                continue
            if in_packages and trimmed.startswith("- "):
                packages.append(trimmed[2:].strip("'\" "))
            elif in_packages and not trimmed.startswith("-") and trimmed:
                break

        return packages
    except OSError:
        return []


def _extract_package_json_workspaces(directory: Path) -> list[str]:
    """Read ``workspaces`` from ``package.json``."""
    pkg_path = directory / "package.json"
    if not pkg_path.is_file():
        return []
    try:
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
        return _extract_from_workspaces_field(pkg.get("workspaces"))
    except (json.JSONDecodeError, OSError):
        return []


def _extract_from_workspaces_field(workspaces: Any) -> list[str]:
    """Normalise a ``workspaces`` field to a list of strings."""
    if isinstance(workspaces, list):
        return [w for w in workspaces if isinstance(w, str)]
    if isinstance(workspaces, dict) and "packages" in workspaces:
        pkgs = workspaces["packages"]
        if isinstance(pkgs, list):
            return [w for w in pkgs if isinstance(w, str)]
    return []


def _extract_lerna_packages(filepath: Path) -> list[str]:
    """Parse ``lerna.json`` for packages."""
    try:
        content = json.loads(filepath.read_text(encoding="utf-8"))
        pkgs = content.get("packages")
        if isinstance(pkgs, list):
            return [w for w in pkgs if isinstance(w, str)]
        return ["packages/*"]
    except (json.JSONDecodeError, OSError):
        return []
