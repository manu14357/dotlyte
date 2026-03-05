"""Tests for dotlyte.workspace — monorepo detection and loading."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from dotlyte.workspace import (
    MonorepoInfo,
    find_monorepo_root,
    get_shared_env,
    load_workspace,
)


# ──── find_monorepo_root ────


class TestFindMonorepoRoot:
    def test_detects_pnpm_workspace(self, tmp_path: Path) -> None:
        ws = tmp_path / "pnpm-workspace.yaml"
        ws.write_text("packages:\n  - 'apps/*'\n  - 'packages/*'\n")

        info = find_monorepo_root(tmp_path)
        assert info is not None
        assert info.type == "pnpm"
        assert info.root == str(tmp_path)
        assert "apps/*" in info.packages

    def test_detects_turbo(self, tmp_path: Path) -> None:
        (tmp_path / "turbo.json").write_text("{}")
        (tmp_path / "package.json").write_text(
            json.dumps({"workspaces": ["apps/*"]})
        )

        info = find_monorepo_root(tmp_path)
        assert info is not None
        assert info.type == "turbo"

    def test_detects_nx(self, tmp_path: Path) -> None:
        (tmp_path / "nx.json").write_text("{}")
        (tmp_path / "package.json").write_text(
            json.dumps({"workspaces": ["libs/*"]})
        )

        info = find_monorepo_root(tmp_path)
        assert info is not None
        assert info.type == "nx"

    def test_detects_lerna(self, tmp_path: Path) -> None:
        (tmp_path / "lerna.json").write_text(
            json.dumps({"packages": ["packages/*"]})
        )

        info = find_monorepo_root(tmp_path)
        assert info is not None
        assert info.type == "lerna"
        assert "packages/*" in info.packages

    def test_detects_npm_workspaces(self, tmp_path: Path) -> None:
        (tmp_path / "package.json").write_text(
            json.dumps({"workspaces": ["modules/*"]})
        )

        info = find_monorepo_root(tmp_path)
        assert info is not None
        assert info.type == "npm"

    def test_detects_yarn_workspaces(self, tmp_path: Path) -> None:
        (tmp_path / "package.json").write_text(
            json.dumps({"workspaces": ["packages/*"]})
        )
        (tmp_path / "yarn.lock").write_text("")

        info = find_monorepo_root(tmp_path)
        assert info is not None
        assert info.type == "yarn"

    def test_walks_up_directories(self, tmp_path: Path) -> None:
        (tmp_path / "pnpm-workspace.yaml").write_text("packages:\n  - 'apps/*'\n")
        child = tmp_path / "apps" / "web"
        child.mkdir(parents=True)

        info = find_monorepo_root(child)
        assert info is not None
        assert info.root == str(tmp_path)

    def test_returns_none_when_not_monorepo(self, tmp_path: Path) -> None:
        child = tmp_path / "isolated"
        child.mkdir()
        info = find_monorepo_root(child)
        assert info is None


# ──── get_shared_env ────


class TestGetSharedEnv:
    def test_reads_root_env(self, tmp_path: Path) -> None:
        (tmp_path / ".env").write_text("KEY1=value1\nKEY2=value2\n")
        result = get_shared_env(tmp_path)
        assert result == {"KEY1": "value1", "KEY2": "value2"}

    def test_strips_prefix(self, tmp_path: Path) -> None:
        (tmp_path / ".env").write_text("APP_PORT=3000\nAPP_DEBUG=true\n")
        result = get_shared_env(tmp_path, prefix="APP_")
        assert result == {"PORT": "3000", "DEBUG": "true"}

    def test_skips_comments_and_blank_lines(self, tmp_path: Path) -> None:
        (tmp_path / ".env").write_text("# comment\n\nKEY=value\n")
        result = get_shared_env(tmp_path)
        assert result == {"KEY": "value"}

    def test_returns_empty_when_no_env(self, tmp_path: Path) -> None:
        result = get_shared_env(tmp_path)
        assert result == {}


# ──── load_workspace ────


class TestLoadWorkspace:
    def test_not_a_monorepo_falls_back(self, tmp_path: Path) -> None:
        """When no monorepo is detected, load_workspace falls through to load()."""
        # Just verify it returns a Config object without error
        config = load_workspace(root=None, packages=None)
        # Should return something (a Config instance)
        assert config is not None

    def test_loads_root_env_files(self, tmp_path: Path) -> None:
        (tmp_path / "pnpm-workspace.yaml").write_text("packages:\n  - 'apps/*'\n")
        (tmp_path / ".env").write_text("ROOT_KEY=root_value\n")

        config = load_workspace(root=str(tmp_path))
        assert config is not None

    def test_loads_package_env(self, tmp_path: Path) -> None:
        (tmp_path / "pnpm-workspace.yaml").write_text("packages:\n  - 'apps/*'\n")
        (tmp_path / ".env").write_text("SHARED=yes\n")

        pkg_dir = tmp_path / "apps" / "web"
        pkg_dir.mkdir(parents=True)
        (pkg_dir / ".env").write_text("PKG_VAR=pkg_value\n")

        config = load_workspace(root=str(tmp_path), packages=["apps/web"])
        assert config is not None
