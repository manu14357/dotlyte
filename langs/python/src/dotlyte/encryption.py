"""AES-256-GCM encryption/decryption for DOTLYTE .env files.

Supports SOPS-style format where keys are plaintext and values are
encrypted with the pattern: ENC[aes-256-gcm,iv:...,data:...,tag:...]
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
from pathlib import Path
from typing import Any

from dotlyte.errors import DecryptionError, ParseError

_IV_LENGTH = 16
_KEY_LENGTH = 32
_ENCRYPTED_PATTERN_STR = r"^ENC\[aes-256-gcm,iv:([A-Za-z0-9+/=]+),data:([A-Za-z0-9+/=]+),tag:([A-Za-z0-9+/=]+)\]$"


def _derive_key(passphrase: str | bytes) -> bytes:
    """Derive a 256-bit key from a passphrase using scrypt."""
    if isinstance(passphrase, str):
        passphrase = passphrase.encode("utf-8")
    return hashlib.scrypt(passphrase, salt=b"dotlyte-v2", n=2**14, r=8, p=1, dklen=_KEY_LENGTH)


def generate_key() -> str:
    """Generate a random 256-bit key (hex-encoded).

    Returns:
        64-character hex string suitable for DOTLYTE_KEY env var.

    """
    return secrets.token_hex(32)


def resolve_encryption_key(
    env: str | None = None,
    base_dir: str | Path | None = None,
) -> bytes | None:
    """Find the encryption key from env vars or keyfile.

    Checks in order:
        1. DOTLYTE_KEY_{ENV} env var
        2. DOTLYTE_KEY env var
        3. .dotlyte-keys file in base_dir

    Args:
        env: Environment name for env-specific key lookup.
        base_dir: Directory to search for .dotlyte-keys file.

    Returns:
        Derived key bytes, or None if no key is found.

    """
    # Check env-specific key
    if env:
        key = os.environ.get(f"DOTLYTE_KEY_{env.upper()}")
        if key:
            return _derive_key(key)

    # Check generic key
    key = os.environ.get("DOTLYTE_KEY")
    if key:
        return _derive_key(key)

    # Check keyfile
    if base_dir:
        keyfile = Path(base_dir) / ".dotlyte-keys"
        if keyfile.is_file():
            content = keyfile.read_text(encoding="utf-8").strip()
            if content:
                return _derive_key(content)

    return None


def encrypt_value(plaintext: str, key: bytes) -> str:
    """Encrypt a single value with AES-256-GCM.

    Args:
        plaintext: The value to encrypt.
        key: 32-byte encryption key.

    Returns:
        Encrypted string in format: ENC[aes-256-gcm,iv:...,data:...,tag:...]

    """
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        raise ImportError(
            "The 'cryptography' package is required for encryption. "
            "Install it with: pip install cryptography"
        )

    iv = secrets.token_bytes(_IV_LENGTH)
    aesgcm = AESGCM(key[:_KEY_LENGTH])
    ciphertext_and_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)

    # AESGCM appends 16-byte tag to ciphertext
    ciphertext = ciphertext_and_tag[:-16]
    tag = ciphertext_and_tag[-16:]

    iv_b64 = base64.b64encode(iv).decode()
    data_b64 = base64.b64encode(ciphertext).decode()
    tag_b64 = base64.b64encode(tag).decode()

    return f"ENC[aes-256-gcm,iv:{iv_b64},data:{data_b64},tag:{tag_b64}]"


def decrypt_value(encrypted: str, key: bytes) -> str:
    """Decrypt a single ENC[...] value.

    Args:
        encrypted: The encrypted value string.
        key: 32-byte encryption key.

    Returns:
        Decrypted plaintext string.

    Raises:
        DecryptionError: If the value can't be decrypted.

    """
    import re

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        raise ImportError(
            "The 'cryptography' package is required for decryption. "
            "Install it with: pip install cryptography"
        )

    match = re.match(_ENCRYPTED_PATTERN_STR, encrypted)
    if not match:
        raise DecryptionError("Invalid encrypted value format", file_path="<value>")

    iv = base64.b64decode(match.group(1))
    ciphertext = base64.b64decode(match.group(2))
    tag = base64.b64decode(match.group(3))

    aesgcm = AESGCM(key[:_KEY_LENGTH])
    try:
        plaintext = aesgcm.decrypt(iv, ciphertext + tag, None)
        return plaintext.decode("utf-8")
    except Exception as e:
        raise DecryptionError(f"Decryption failed: {e}", file_path="<value>") from e


def encrypt_file(filepath: str | Path, key: bytes, env: str | None = None) -> None:
    """Encrypt all values in a .env file in-place (SOPS-style).

    Keys remain plaintext; values become ENC[...] format.

    Args:
        filepath: Path to the .env file.
        key: 32-byte encryption key.
        env: Unused, reserved for future use.

    """
    path = Path(filepath)
    content = path.read_text(encoding="utf-8")
    lines: list[str] = []

    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            lines.append(line)
            continue

        clean = stripped[7:].strip() if stripped.startswith("export ") else stripped
        eq_idx = clean.find("=")
        if eq_idx == -1:
            lines.append(line)
            continue

        key_part = clean[:eq_idx].strip()
        value_part = clean[eq_idx + 1:].strip()

        # Skip already encrypted values
        if value_part.startswith("ENC["):
            lines.append(line)
            continue

        # Remove quotes
        if len(value_part) >= 2 and value_part[0] == value_part[-1] and value_part[0] in ('"', "'"):
            value_part = value_part[1:-1]

        encrypted = encrypt_value(value_part, key)
        lines.append(f"{key_part}={encrypted}")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def decrypt_file(
    filepath: str | Path,
    key: bytes | None = None,
    env: str | None = None,
) -> dict[str, str]:
    """Decrypt all encrypted values in a .env file.

    Args:
        filepath: Path to the encrypted .env file.
        key: 32-byte key. Auto-resolved if not provided.
        env: Environment name for key resolution.

    Returns:
        Dictionary of decrypted key-value pairs.

    Raises:
        DecryptionError: If key is missing or decryption fails.

    """
    import re

    path = Path(filepath)
    enc_key = key or resolve_encryption_key(env, path.parent)
    if not enc_key:
        raise DecryptionError(
            "No decryption key found. Set DOTLYTE_KEY env var or create a .dotlyte-keys file.",
            file_path=str(filepath),
        )

    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        raise DecryptionError(f"Cannot read encrypted file: {filepath}", file_path=str(filepath))

    result: dict[str, str] = {}

    for line in content.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        clean = stripped[7:].strip() if stripped.startswith("export ") else stripped
        eq_idx = clean.find("=")
        if eq_idx == -1:
            continue

        k = clean[:eq_idx].strip().lower()
        v = clean[eq_idx + 1:].strip()

        if re.match(_ENCRYPTED_PATTERN_STR, v):
            try:
                result[k] = decrypt_value(v, enc_key)
            except Exception as e:
                raise DecryptionError(
                    f"Failed to decrypt key '{k}': {e}",
                    file_path=str(filepath),
                ) from e
        else:
            # Unencrypted value — remove quotes and pass through
            if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
                v = v[1:-1]
            result[k] = v

    return result


# ──── Enhanced encryption (v0.1.2) ────


def rotate_keys(
    data: dict[str, str],
    old_key: str | bytes,
    new_key: str | bytes,
) -> dict[str, str]:
    """Re-encrypt all encrypted values with a new key.

    Decrypts each ``ENC[...]`` value using *old_key* and re-encrypts it
    with *new_key*.  Non-encrypted values pass through unchanged.

    Args:
        data: Dictionary of key-value pairs (values may be ``ENC[...]``).
        old_key: The current passphrase or derived key.
        new_key: The new passphrase or derived key.

    Returns:
        A new dict with re-encrypted values.

    Raises:
        DecryptionError: If an encrypted value cannot be decrypted with *old_key*.

    """
    import re

    old_derived = _ensure_key(old_key)
    new_derived = _ensure_key(new_key)

    result: dict[str, str] = {}
    for k, v in data.items():
        if re.match(_ENCRYPTED_PATTERN_STR, v):
            try:
                plaintext = decrypt_value(v, old_derived)
                result[k] = encrypt_value(plaintext, new_derived)
            except Exception as exc:
                raise DecryptionError(
                    f"Failed to rotate key for '{k}'. "
                    f"Check that the old key is correct.",
                    file_path="<rotate>",
                ) from exc
        else:
            result[k] = v

    return result


def resolve_key_with_fallback(
    keys: list[str],
    encrypted_value: str,
) -> bytes | None:
    """Try multiple passphrases and return the first one that decrypts.

    Useful during key rotation periods when both old and new keys may be
    in use.

    Args:
        keys: Passphrases to try, in priority order.
        encrypted_value: An ``ENC[...]`` value to test against.

    Returns:
        The derived key bytes for the first successful passphrase,
        or ``None`` if none work.

    """
    for passphrase in keys:
        derived = _derive_key(passphrase)
        try:
            decrypt_value(encrypted_value, derived)
            return derived
        except Exception:
            continue
    return None


def encrypt_vault(
    data: dict[str, str],
    key: str | bytes,
    sensitive_keys: set[str] | None = None,
) -> dict[str, str]:
    """Encrypt values in a dictionary.

    If *sensitive_keys* is provided, only those keys are encrypted;
    otherwise **all** values are encrypted.

    Args:
        data: Plain key-value pairs.
        key: Passphrase or derived key.
        sensitive_keys: Optional subset of keys to encrypt.

    Returns:
        A new dict with encrypted values.

    """
    derived = _ensure_key(key)
    result: dict[str, str] = {}
    for k, v in data.items():
        if sensitive_keys is not None and k not in sensitive_keys:
            result[k] = v
        else:
            result[k] = encrypt_value(v, derived)
    return result


def decrypt_vault(
    data: dict[str, str],
    key: str | bytes,
) -> dict[str, str]:
    """Decrypt all ``ENC[...]`` values in a dictionary.

    Non-encrypted values pass through unchanged.

    Args:
        data: Dictionary that may contain ``ENC[...]`` values.
        key: Passphrase or derived key.

    Returns:
        A new dict with decrypted values.

    Raises:
        DecryptionError: If any encrypted value cannot be decrypted.

    """
    import re

    derived = _ensure_key(key)
    result: dict[str, str] = {}
    for k, v in data.items():
        if re.match(_ENCRYPTED_PATTERN_STR, v):
            result[k] = decrypt_value(v, derived)
        else:
            result[k] = v
    return result


def _ensure_key(key: str | bytes) -> bytes:
    """Return derived key bytes from a passphrase or pass through raw bytes."""
    if isinstance(key, bytes) and len(key) == _KEY_LENGTH:
        return key
    return _derive_key(key)
