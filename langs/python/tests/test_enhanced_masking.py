"""Tests for v0.1.2 enhanced masking — patterns, AuditProxy."""

from __future__ import annotations

import re

import pytest

from dotlyte.masking import (
    AuditProxy,
    build_sensitive_set_with_patterns,
    compile_patterns,
    create_audit_proxy,
)


# ──── compile_patterns ────


class TestCompilePatterns:
    def test_compiles_glob_star(self) -> None:
        compiled = compile_patterns(["*_KEY", "SECRET_*"])
        assert len(compiled) == 2
        assert all(isinstance(p, re.Pattern) for p in compiled)

    def test_star_matches_any(self) -> None:
        compiled = compile_patterns(["*_KEY"])
        assert compiled[0].match("API_KEY")
        assert compiled[0].match("my_secret_KEY")
        assert not compiled[0].match("API_KEY_EXTRA")

    def test_case_insensitive(self) -> None:
        compiled = compile_patterns(["secret_*"])
        assert compiled[0].match("SECRET_VALUE")
        assert compiled[0].match("secret_value")

    def test_empty_list(self) -> None:
        assert compile_patterns([]) == []


# ──── build_sensitive_set_with_patterns ────


class TestBuildSensitiveSetWithPatterns:
    def test_custom_patterns(self) -> None:
        keys = {"MY_TOKEN", "APP_NAME", "DB_PASSWORD", "PORT"}
        result = build_sensitive_set_with_patterns(keys, ["*_TOKEN"])
        assert "MY_TOKEN" in result

    def test_builtin_patterns_detect_password(self) -> None:
        keys = {"DB_PASSWORD", "APP_NAME"}
        result = build_sensitive_set_with_patterns(keys, [])
        assert "DB_PASSWORD" in result
        assert "APP_NAME" not in result

    def test_schema_sensitive_merged(self) -> None:
        keys = {"X", "Y"}
        result = build_sensitive_set_with_patterns(
            keys, [], schema_sensitive={"X"}
        )
        assert "X" in result

    def test_dotted_keys_match_leaf(self) -> None:
        keys = {"app.db.password"}
        result = build_sensitive_set_with_patterns(keys, ["*password*"])
        assert "app.db.password" in result


# ──── AuditProxy ────


class TestAuditProxy:
    def test_fires_callback_on_sensitive_access(self) -> None:
        accessed: list[tuple[str, str]] = []
        proxy = create_audit_proxy(
            data={"SECRET": "hidden", "NAME": "public"},
            sensitive_keys={"SECRET"},
            on_access=lambda k, c: accessed.append((k, c)),
        )
        _ = proxy["SECRET"]
        _ = proxy["NAME"]

        assert len(accessed) == 1
        assert accessed[0] == ("SECRET", "server")

    def test_attr_access(self) -> None:
        proxy = create_audit_proxy(
            data={"KEY": "val"},
            sensitive_keys=set(),
            on_access=lambda k, c: None,
        )
        assert proxy.KEY == "val"

    def test_attr_missing_raises(self) -> None:
        proxy = create_audit_proxy(
            data={},
            sensitive_keys=set(),
            on_access=lambda k, c: None,
        )
        with pytest.raises(AttributeError):
            _ = proxy.MISSING

    def test_contains(self) -> None:
        proxy = create_audit_proxy(
            data={"A": 1},
            sensitive_keys=set(),
            on_access=lambda k, c: None,
        )
        assert "A" in proxy
        assert "B" not in proxy

    def test_get_with_default(self) -> None:
        proxy = create_audit_proxy(
            data={"A": 1},
            sensitive_keys=set(),
            on_access=lambda k, c: None,
        )
        assert proxy.get("A") == 1
        assert proxy.get("MISSING", 42) == 42

    def test_repr(self) -> None:
        proxy = create_audit_proxy(
            data={"X": 1, "Y": 2},
            sensitive_keys=set(),
            on_access=lambda k, c: None,
        )
        assert "AuditProxy" in repr(proxy)
