"""``dotlyte encrypt`` — Encrypt sensitive values in .env files."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from dotlyte.encryption import (
    encrypt_value,
    generate_key,
    resolve_encryption_key,
    _derive_key,
)
from dotlyte.masking import _SENSITIVE_PATTERNS


def run_encrypt(
    *,
    file: str,
    keys: str | None = None,
    output: str | None = None,
) -> None:
    """Encrypt values for specified keys (or auto-detect sensitive keys).

    Args:
        file: Path to the .env file.
        keys: Comma-separated list of keys to encrypt (optional).
        output: Output file path (optional).

    """
    input_path = Path(file).resolve()
    if not input_path.is_file():
        print(f"❌ File not found: {file}", file=sys.stderr)
        sys.exit(1)

    # Resolve or generate encryption key
    enc_key = resolve_encryption_key(base_dir=str(input_path.parent))
    if enc_key is None:
        print("⚠️  No encryption key found. Generating a new one...\n")
        passphrase = generate_key()
        print(f"  🔑 New key: {passphrase}")
        print(f"  Set DOTLYTE_KEY={passphrase} in your environment")
        print(f"  Or add it to .dotlyte-keys: {passphrase}\n")
        enc_key = _derive_key(passphrase)

    target_keys = {k.strip() for k in keys.split(",")} if keys else None

    content = input_path.read_text(encoding="utf-8")
    lines = content.splitlines()
    encrypted_lines: list[str] = []
    encrypted_count = 0

    print(f"\n🔒 dotlyte encrypt\n")
    print(f"  File: {file}")

    enc_pattern = re.compile(r"^ENC\[")

    for line in lines:
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            encrypted_lines.append(line)
            continue

        stripped = trimmed[7:].strip() if trimmed.startswith("export ") else trimmed
        eq_idx = stripped.find("=")
        if eq_idx <= 0:
            encrypted_lines.append(line)
            continue

        key_part = stripped[:eq_idx].strip()
        value_part = stripped[eq_idx + 1 :].strip()

        # Remove quotes
        if (
            len(value_part) >= 2
            and value_part[0] == value_part[-1]
            and value_part[0] in ('"', "'")
        ):
            value_part = value_part[1:-1]

        # Skip already encrypted
        if enc_pattern.match(value_part):
            encrypted_lines.append(line)
            continue

        should_encrypt = (
            key_part in target_keys
            if target_keys
            else _is_auto_sensitive(key_part)
        )

        if should_encrypt:
            encrypted_val = encrypt_value(value_part, enc_key)
            encrypted_lines.append(f"{key_part}={encrypted_val}")
            encrypted_count += 1
            print(f"  🔐 {key_part} — encrypted")
        else:
            encrypted_lines.append(line)

    out_path = (
        Path(output).resolve()
        if output
        else input_path.with_suffix(".encrypted")
    )
    out_path.write_text("\n".join(encrypted_lines) + "\n", encoding="utf-8")

    print(f"\n  ✅ Encrypted {encrypted_count} value(s) → {out_path}\n")


def _is_auto_sensitive(key: str) -> bool:
    """Return True if *key* matches a built-in sensitive pattern."""
    for pattern in _SENSITIVE_PATTERNS:
        if pattern.search(key):
            return True
    return False
