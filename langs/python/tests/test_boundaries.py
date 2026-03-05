"""Tests for dotlyte.boundaries — server/client boundary enforcement."""

from __future__ import annotations

import pytest

from dotlyte.boundaries import (
    BoundaryProxy,
    create_boundary_proxy,
    is_client_context,
    is_server_context,
)
from dotlyte.errors import DotlyteError


@pytest.fixture
def proxy() -> BoundaryProxy:
    """Return a proxy with a known set of keys."""
    return create_boundary_proxy(
        data={
            "DATABASE_URL": "postgres://localhost/db",
            "SECRET_KEY": "supersecret",
            "APP_NAME": "myapp",
            "NODE_ENV": "production",
        },
        server_keys={"DATABASE_URL", "SECRET_KEY"},
        client_keys={"APP_NAME"},
        shared_keys={"NODE_ENV"},
    )


# ──── Context detection ────


def test_is_client_context_always_false() -> None:
    assert is_client_context() is False


def test_is_server_context_always_true() -> None:
    assert is_server_context() is True


# ──── Item / attribute access ────


class TestBoundaryProxyAccess:
    def test_item_access(self, proxy: BoundaryProxy) -> None:
        assert proxy["APP_NAME"] == "myapp"
        assert proxy["DATABASE_URL"] == "postgres://localhost/db"

    def test_attr_access(self, proxy: BoundaryProxy) -> None:
        assert proxy.APP_NAME == "myapp"
        assert proxy.NODE_ENV == "production"

    def test_missing_key_raises_key_error(self, proxy: BoundaryProxy) -> None:
        with pytest.raises(KeyError):
            _ = proxy["DOES_NOT_EXIST"]

    def test_contains(self, proxy: BoundaryProxy) -> None:
        assert "DATABASE_URL" in proxy
        assert "MISSING" not in proxy

    def test_len(self, proxy: BoundaryProxy) -> None:
        assert len(proxy) == 4

    def test_iter(self, proxy: BoundaryProxy) -> None:
        keys = set(proxy)
        assert keys == {"DATABASE_URL", "SECRET_KEY", "APP_NAME", "NODE_ENV"}

    def test_repr(self, proxy: BoundaryProxy) -> None:
        r = repr(proxy)
        assert "BoundaryProxy" in r


# ──── Immutability ────


class TestBoundaryProxyImmutability:
    def test_setattr_raises(self, proxy: BoundaryProxy) -> None:
        with pytest.raises(DotlyteError, match="immutable"):
            proxy.NEW_KEY = "value"  # type: ignore[attr-defined]

    def test_setitem_raises(self, proxy: BoundaryProxy) -> None:
        with pytest.raises(DotlyteError, match="immutable"):
            proxy["NEW_KEY"] = "value"

    def test_delattr_raises(self, proxy: BoundaryProxy) -> None:
        with pytest.raises(DotlyteError, match="immutable"):
            del proxy.APP_NAME  # type: ignore[attr-defined]

    def test_delitem_raises(self, proxy: BoundaryProxy) -> None:
        with pytest.raises(DotlyteError, match="immutable"):
            del proxy["APP_NAME"]


# ──── Filtered views ────


class TestFilteredViews:
    def test_server_only(self, proxy: BoundaryProxy) -> None:
        view = proxy.server_only()
        assert "DATABASE_URL" in view
        assert "SECRET_KEY" in view
        assert "NODE_ENV" in view  # shared
        assert "APP_NAME" not in view

    def test_client_only(self, proxy: BoundaryProxy) -> None:
        view = proxy.client_only()
        assert "APP_NAME" in view
        assert "NODE_ENV" in view  # shared
        assert "DATABASE_URL" not in view
        assert "SECRET_KEY" not in view


# ──── Audit callback ────


class TestAuditCallback:
    def test_on_secret_access_fires_for_server_keys(self) -> None:
        accessed: list[tuple[str, str]] = []
        proxy = create_boundary_proxy(
            data={"SECRET": "value", "PUBLIC": "value"},
            server_keys={"SECRET"},
            client_keys={"PUBLIC"},
            shared_keys=set(),
            on_secret_access=lambda k, c: accessed.append((k, c)),
        )
        _ = proxy["SECRET"]
        _ = proxy["PUBLIC"]
        assert len(accessed) == 1
        assert accessed[0] == ("SECRET", "server")
