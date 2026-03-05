"""``dotlyte check`` — Validate .env files against schema."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from dotlyte.errors import DotlyteError


def run_check(
    *,
    schema_path: str | None = None,
    env_file: str | None = None,
    strict: bool = False,
) -> None:
    """Validate .env / config files, optionally against a JSON schema.

    Args:
        schema_path: Path to a JSON schema file. Auto-detected if ``None``.
        env_file: Explicit .env file to validate.
        strict: Reject keys not present in the schema.

    """
    print("🔍 dotlyte check\n")

    if schema_path is None:
        schema_path = _find_schema_file()

    if schema_path is None:
        print("⚠️  No schema file found. Performing basic validation...\n")
        _basic_check(env_file)
        return

    print(f"Schema: {schema_path}")

    # Load schema
    try:
        content = Path(schema_path).read_text(encoding="utf-8")
        schema_data: dict[str, Any] = json.loads(content)
    except (OSError, json.JSONDecodeError) as exc:
        raise DotlyteError(f"Failed to read schema file: {schema_path}: {exc}") from exc

    from dotlyte.loader import load
    from dotlyte.validator import validate_schema

    config = load(files=[env_file] if env_file else None)
    data = config.to_dict()
    violations = validate_schema(data, schema_data, strict)

    if not violations:
        print("\n✅ All checks passed!\n")
        return

    print(f"\n❌ {len(violations)} issue(s) found:\n")
    for v in violations:
        print(f"  ✗ {v.key}: {v.message}")
    print()
    sys.exit(1)


def _basic_check(env_file: str | None = None) -> None:
    """Perform basic validation when no schema is available."""
    files = [".env", ".env.local", ".env.example"]
    if env_file:
        files.insert(0, env_file)

    found = False
    for file in files:
        path = Path(file).resolve()
        if path.is_file():
            found = True
            print(f"  ✓ {file} exists")

            content = path.read_text(encoding="utf-8")
            keys: dict[str, int] = {}
            for line in content.splitlines():
                trimmed = line.strip()
                if not trimmed or trimmed.startswith("#"):
                    continue
                eq_idx = trimmed.find("=")
                if eq_idx > 0:
                    key = trimmed[:eq_idx].strip()
                    keys[key] = keys.get(key, 0) + 1

            dupes = [k for k, count in keys.items() if count > 1]
            if dupes:
                print(f"    ⚠️  Duplicate keys: {', '.join(dupes)}")

    if not found:
        print("  ⚠️  No .env files found in current directory")

    print("\n✅ Basic check complete\n")


def _find_schema_file() -> str | None:
    """Search for common schema file names."""
    candidates = [
        "env-schema.json",
        ".env.schema.json",
        "dotlyte.schema.json",
    ]
    for c in candidates:
        if Path(c).resolve().is_file():
            return c
    return None
