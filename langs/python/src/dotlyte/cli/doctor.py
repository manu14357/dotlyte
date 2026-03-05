"""``dotlyte doctor`` — Diagnose common environment configuration issues."""

from __future__ import annotations

import re
import sys
from pathlib import Path

_PLACEHOLDER_PATTERNS = [
    re.compile(r"^your[-_]?.*[-_]?here$", re.I),
    re.compile(r"^changeme$", re.I),
    re.compile(r"^todo$", re.I),
    re.compile(r"^fixme$", re.I),
    re.compile(r"^replace[-_]?me$", re.I),
    re.compile(r"^xxx+$", re.I),
    re.compile(r"^placeholder$", re.I),
    re.compile(r"^<.*>$"),
    re.compile(r"^\[.*\]$"),
    re.compile(r"^\{.*\}$"),
]


def run_doctor() -> None:
    """Check for common env configuration issues and report findings."""
    print("\n🩺 dotlyte doctor\n")

    issues = 0
    warnings = 0

    # Check 1: .env exists but .env.example doesn't
    if Path(".env").is_file() and not Path(".env.example").is_file():
        print("  ⚠️  .env exists but .env.example is missing")
        print(
            "     Create .env.example to help team members set up their environment\n"
        )
        warnings += 1

    # Check 2: .env in .gitignore
    gitignore = Path(".gitignore")
    if gitignore.is_file():
        gi_content = gitignore.read_text(encoding="utf-8")
        has_env_ignore = any(
            line.strip() in (".env", ".env*", ".env.*")
            for line in gi_content.splitlines()
        )
        if not has_env_ignore and Path(".env").is_file():
            print("  ❌ .env is NOT in .gitignore — secrets may be committed!")
            print("     Add '.env' to your .gitignore file\n")
            issues += 1
        elif has_env_ignore:
            print("  ✓ .env is properly gitignored")

    # Check 3: Keys in .env.example missing from .env
    if Path(".env.example").is_file() and Path(".env").is_file():
        example_keys = _get_keys(Path(".env.example").read_text(encoding="utf-8"))
        env_keys = _get_keys(Path(".env").read_text(encoding="utf-8"))

        missing = [k for k in example_keys if k not in env_keys]
        if missing:
            print(
                f"  ⚠️  Keys in .env.example missing from .env: {', '.join(missing)}"
            )
            warnings += 1
        else:
            print("  ✓ All .env.example keys are present in .env")

        extra = [k for k in env_keys if k not in example_keys]
        if extra:
            print(f"  ℹ️  Keys in .env not in .env.example: {', '.join(extra)}")

    # Check 4: Duplicate keys
    for file in (".env", ".env.local", ".env.example"):
        path = Path(file)
        if not path.is_file():
            continue

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
            print(f"  ⚠️  Duplicate keys in {file}: {', '.join(dupes)}")
            warnings += 1

    # Check 5: Placeholder values
    if Path(".env").is_file():
        content = Path(".env").read_text(encoding="utf-8")
        placeholders: list[str] = []

        for line in content.splitlines():
            trimmed = line.strip()
            if not trimmed or trimmed.startswith("#"):
                continue
            eq_idx = trimmed.find("=")
            if eq_idx > 0:
                key = trimmed[:eq_idx].strip()
                value = trimmed[eq_idx + 1 :].strip()
                if (
                    len(value) >= 2
                    and value[0] == value[-1]
                    and value[0] in ('"', "'")
                ):
                    value = value[1:-1]
                if any(p.match(value) for p in _PLACEHOLDER_PATTERNS):
                    placeholders.append(key)

        if placeholders:
            print(
                f"  ⚠️  Placeholder values detected: {', '.join(placeholders)}"
            )
            print("     Replace these with real values before deploying")
            warnings += 1

    # Check 6: .dotlyte-keys in git
    if Path(".dotlyte-keys").is_file() and gitignore.is_file():
        gi_content = gitignore.read_text(encoding="utf-8")
        if ".dotlyte-keys" not in gi_content:
            print(
                "  ❌ .dotlyte-keys is NOT in .gitignore — encryption keys may leak!"
            )
            issues += 1

    # Check 7: Encrypted .env without key
    import os

    if Path(".env.encrypted").is_file():
        has_key = bool(os.environ.get("DOTLYTE_KEY")) or Path(".dotlyte-keys").is_file()
        if not has_key:
            print("  ⚠️  .env.encrypted exists but no DOTLYTE_KEY found")
            print(
                "     Set DOTLYTE_KEY environment variable or create .dotlyte-keys"
            )
            warnings += 1

    # Check 8: File parsability
    for file in (".env", ".env.local"):
        path = Path(file)
        if not path.is_file():
            continue
        try:
            content = path.read_text(encoding="utf-8")
            for i, line in enumerate(content.splitlines(), 1):
                trimmed = line.strip()
                if not trimmed or trimmed.startswith("#"):
                    continue
                stripped = (
                    trimmed[7:].strip()
                    if trimmed.startswith("export ")
                    else trimmed
                )
                if "=" not in stripped:
                    print(f"  ⚠️  {file}:{i} — line has no '=' separator: {trimmed[:60]}")
                    warnings += 1
        except OSError:
            print(f"  ❌ Cannot read {file}")
            issues += 1

    # Summary
    print()
    if issues == 0 and warnings == 0:
        print("  ✅ No issues found! Your config setup looks great.\n")
    else:
        print(
            f"  Found {issues} error(s) and {warnings} warning(s).\n"
        )
        if issues > 0:
            sys.exit(1)


def _get_keys(content: str) -> list[str]:
    """Extract key names from .env content."""
    keys: list[str] = []
    for line in content.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        eq_idx = trimmed.find("=")
        if eq_idx > 0:
            keys.append(trimmed[:eq_idx].strip())
    return keys
