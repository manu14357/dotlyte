"""``dotlyte diff`` — Compare two .env files."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from dotlyte.masking import REDACTED, _SENSITIVE_PATTERNS


def run_diff(file1: str, file2: str) -> None:
    """Show added, removed, and changed keys between two .env files.

    Args:
        file1: Path to the first .env file.
        file2: Path to the second .env file.

    """
    path1 = Path(file1).resolve()
    path2 = Path(file2).resolve()

    if not path1.is_file():
        print(f"❌ File not found: {file1}", file=sys.stderr)
        sys.exit(1)
    if not path2.is_file():
        print(f"❌ File not found: {file2}", file=sys.stderr)
        sys.exit(1)

    env1 = _parse_env_file(path1.read_text(encoding="utf-8"))
    env2 = _parse_env_file(path2.read_text(encoding="utf-8"))

    all_keys = sorted(set(env1) | set(env2))

    added: list[str] = []
    removed: list[str] = []
    changed: list[tuple[str, str, str]] = []
    unchanged: list[str] = []

    for key in all_keys:
        in1 = key in env1
        in2 = key in env2
        if not in1 and in2:
            added.append(key)
        elif in1 and not in2:
            removed.append(key)
        elif env1[key] != env2[key]:
            changed.append((key, _mask(key, env1[key]), _mask(key, env2[key])))
        else:
            unchanged.append(key)

    print(f"\n📊 dotlyte diff\n")
    print(f"  {file1} ↔ {file2}\n")

    if added:
        print(f"  ➕ Added ({len(added)}):")
        for k in added:
            print(f"     + {k}={_mask(k, env2[k])}")

    if removed:
        print(f"  ➖ Removed ({len(removed)}):")
        for k in removed:
            print(f"     - {k}={_mask(k, env1[k])}")

    if changed:
        print(f"  ✏️  Changed ({len(changed)}):")
        for k, old, new in changed:
            print(f"     ~ {k}: {old} → {new}")

    print(
        f"\n  Summary: {len(added)} added, {len(removed)} removed, "
        f"{len(changed)} changed, {len(unchanged)} unchanged\n"
    )


# ──── Internal helpers ────


def _parse_env_file(content: str) -> dict[str, str]:
    """Parse a .env file into a key-value dict."""
    result: dict[str, str] = {}
    for line in content.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        stripped = trimmed[7:].strip() if trimmed.startswith("export ") else trimmed
        eq_idx = stripped.find("=")
        if eq_idx > 0:
            key = stripped[:eq_idx].strip()
            value = stripped[eq_idx + 1 :].strip()
            if (
                len(value) >= 2
                and value[0] == value[-1]
                and value[0] in ('"', "'")
            ):
                value = value[1:-1]
            result[key] = value
    return result


def _is_sensitive(key: str) -> bool:
    """Return True if *key* matches a built-in sensitive pattern."""
    for pattern in _SENSITIVE_PATTERNS:
        if pattern.search(key):
            return True
    return False


def _mask(key: str, value: str) -> str:
    """Mask value if the key looks sensitive or the value looks like a secret."""
    if _is_sensitive(key):
        return REDACTED
    if len(value) > 40 and re.match(r"^[A-Za-z0-9+/=_-]+$", value):
        return value[:8] + "..." + value[-4:]
    return value
