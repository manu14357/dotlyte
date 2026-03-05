"""Tests for v0.1.2 enhanced encryption — rotate_keys, vault, fallback."""

from __future__ import annotations

import pytest

from dotlyte.encryption import (
    decrypt_value,
    decrypt_vault,
    encrypt_value,
    encrypt_vault,
    resolve_key_with_fallback,
    rotate_keys,
    _derive_key,
)
from dotlyte.errors import DecryptionError


@pytest.fixture
def key_a() -> bytes:
    return _derive_key("passphrase-a")


@pytest.fixture
def key_b() -> bytes:
    return _derive_key("passphrase-b")


# ──── rotate_keys ────


class TestRotateKeys:
    def test_rotates_encrypted_values(self, key_a: bytes, key_b: bytes) -> None:
        original = {"API_KEY": encrypt_value("secret123", key_a), "PLAIN": "hello"}
        rotated = rotate_keys(original, old_key="passphrase-a", new_key="passphrase-b")

        # PLAIN should be unchanged
        assert rotated["PLAIN"] == "hello"

        # Encrypted value should now decrypt with key_b
        assert decrypt_value(rotated["API_KEY"], key_b) == "secret123"

        # Should NOT decrypt with key_a
        with pytest.raises(Exception):
            decrypt_value(rotated["API_KEY"], key_a)

    def test_rotate_bad_old_key_raises(self, key_a: bytes) -> None:
        original = {"K": encrypt_value("val", key_a)}
        with pytest.raises(DecryptionError, match="rotate"):
            rotate_keys(original, old_key="wrong-key", new_key="new-key")


# ──── resolve_key_with_fallback ────


class TestResolveKeyWithFallback:
    def test_returns_working_key(self, key_a: bytes) -> None:
        enc = encrypt_value("test", key_a)
        result = resolve_key_with_fallback(["wrong", "passphrase-a"], enc)
        assert result is not None
        assert decrypt_value(enc, result) == "test"

    def test_returns_none_when_no_key_works(self, key_a: bytes) -> None:
        enc = encrypt_value("test", key_a)
        result = resolve_key_with_fallback(["wrong1", "wrong2"], enc)
        assert result is None

    def test_first_matching_key_wins(self, key_a: bytes, key_b: bytes) -> None:
        enc = encrypt_value("test", key_a)
        result = resolve_key_with_fallback(
            ["passphrase-a", "passphrase-b"], enc
        )
        assert result is not None
        assert result == key_a


# ──── encrypt_vault / decrypt_vault ────


class TestVault:
    def test_encrypt_all_keys(self, key_a: bytes) -> None:
        data = {"X": "one", "Y": "two"}
        encrypted = encrypt_vault(data, key="passphrase-a")
        assert encrypted["X"].startswith("ENC[")
        assert encrypted["Y"].startswith("ENC[")

    def test_encrypt_selective_keys(self, key_a: bytes) -> None:
        data = {"SECRET": "hidden", "PUBLIC": "visible"}
        encrypted = encrypt_vault(
            data, key="passphrase-a", sensitive_keys={"SECRET"}
        )
        assert encrypted["SECRET"].startswith("ENC[")
        assert encrypted["PUBLIC"] == "visible"

    def test_roundtrip(self) -> None:
        data = {"A": "alpha", "B": "beta"}
        encrypted = encrypt_vault(data, key="my-pass")
        decrypted = decrypt_vault(encrypted, key="my-pass")
        assert decrypted == data

    def test_decrypt_vault_passes_plain_through(self, key_a: bytes) -> None:
        mixed = {
            "ENC_KEY": encrypt_value("secret", key_a),
            "PLAIN": "hello",
        }
        result = decrypt_vault(mixed, key="passphrase-a")
        assert result["ENC_KEY"] == "secret"
        assert result["PLAIN"] == "hello"

    def test_decrypt_vault_wrong_key_raises(self, key_a: bytes) -> None:
        encrypted = encrypt_vault({"K": "val"}, key="passphrase-a")
        with pytest.raises(Exception):
            decrypt_vault(encrypted, key="wrong")
