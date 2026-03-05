"""``dotlyte init`` — Scaffold starter configuration files."""

from __future__ import annotations

from pathlib import Path
from typing import Any


_FRAMEWORKS: dict[str, dict[str, Any]] = {
    "django": {
        "name": "Django",
        "env_file": ".env",
        "example_vars": {
            "DEBUG": "True",
            "SECRET_KEY": "your-secret-key-here",
            "DATABASE_URL": "postgresql://user:password@localhost:5432/db",
            "ALLOWED_HOSTS": "localhost,127.0.0.1",
            "DJANGO_SETTINGS_MODULE": "myproject.settings",
        },
    },
    "flask": {
        "name": "Flask",
        "env_file": ".env",
        "example_vars": {
            "FLASK_APP": "app",
            "FLASK_ENV": "development",
            "SECRET_KEY": "your-secret-key-here",
            "DATABASE_URL": "postgresql://user:password@localhost:5432/db",
            "PORT": "5000",
        },
    },
    "fastapi": {
        "name": "FastAPI",
        "env_file": ".env",
        "example_vars": {
            "APP_NAME": "MyApp",
            "DEBUG": "True",
            "DATABASE_URL": "postgresql://user:password@localhost:5432/db",
            "SECRET_KEY": "your-secret-key-here",
            "PORT": "8000",
            "LOG_LEVEL": "debug",
        },
    },
    "generic": {
        "name": "Python",
        "env_file": ".env",
        "example_vars": {
            "APP_NAME": "myapp",
            "DEBUG": "True",
            "DATABASE_URL": "postgresql://user:password@localhost:5432/db",
            "SECRET_KEY": "your-secret-key-here",
            "PORT": "8000",
            "LOG_LEVEL": "debug",
        },
    },
}


def run_init(framework: str | None = None) -> None:
    """Create starter .env, .env.example, and .gitignore entries.

    Args:
        framework: Framework preset name. Auto-detected if ``None``.

    """
    print("\n🚀 dotlyte init\n")

    if framework is None:
        framework = _detect_framework()
        if framework:
            print(f"  Detected framework: {_FRAMEWORKS[framework]['name']}")
        else:
            framework = "generic"
            print("  No specific framework detected, using generic defaults")

    fw = _FRAMEWORKS.get(framework)
    if fw is None:
        print(f"  Unknown framework: {framework}")
        print(f"  Supported: {', '.join(_FRAMEWORKS)}")
        return

    print(f"  Setting up for {fw['name']}...\n")

    example_vars: dict[str, str] = fw["example_vars"]

    # Step 1: Create .env.example
    example_path = Path(".env.example")
    if example_path.is_file():
        print("  ⏭️  .env.example already exists, skipping")
    else:
        lines = [f"{k}={v}" for k, v in example_vars.items()]
        example_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print("  ✓ Created .env.example")

    # Step 2: Create .env
    env_path = Path(fw["env_file"])
    if env_path.is_file():
        print(f"  ⏭️  {fw['env_file']} already exists, skipping")
    else:
        lines = [f"{k}={v}" for k, v in example_vars.items()]
        env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"  ✓ Created {fw['env_file']}")

    # Step 3: Create basic dotlyte config snippet
    config_path = Path("dotlyte_config.py")
    if config_path.is_file():
        print("  ⏭️  dotlyte_config.py already exists, skipping")
    else:
        config_content = _generate_config(example_vars)
        config_path.write_text(config_content, encoding="utf-8")
        print("  ✓ Created dotlyte_config.py")

    # Step 4: Update .gitignore
    gitignore = Path(".gitignore")
    entries_to_add = [".env", ".env.local", ".env.*.local", ".dotlyte-keys"]
    if gitignore.is_file():
        existing = gitignore.read_text(encoding="utf-8")
        new_entries = [e for e in entries_to_add if e not in existing]
        if new_entries:
            with gitignore.open("a", encoding="utf-8") as f:
                f.write("\n# dotlyte\n")
                for entry in new_entries:
                    f.write(f"{entry}\n")
            print(f"  ✓ Updated .gitignore (+{len(new_entries)} entries)")
        else:
            print("  ⏭️  .gitignore already has env entries")
    else:
        gitignore.write_text(
            "# dotlyte\n" + "\n".join(entries_to_add) + "\n",
            encoding="utf-8",
        )
        print("  ✓ Created .gitignore")

    print("\n  ✅ Setup complete!\n")
    print("  Next steps:")
    print("    1. Edit .env with your real values")
    print("    2. Review dotlyte_config.py")
    print("    3. Use `from dotlyte import load; config = load()` in your app\n")


def _detect_framework() -> str | None:
    """Auto-detect the Python framework from project files."""
    # Check for Django
    if _has_dependency("django"):
        return "django"

    # Check for FastAPI
    if _has_dependency("fastapi"):
        return "fastapi"

    # Check for Flask
    if _has_dependency("flask"):
        return "flask"

    return None


def _has_dependency(name: str) -> bool:
    """Check if a dependency is listed in pyproject.toml or requirements.txt."""
    pyproject = Path("pyproject.toml")
    if pyproject.is_file():
        content = pyproject.read_text(encoding="utf-8").lower()
        if name.lower() in content:
            return True

    for req_file in ("requirements.txt", "requirements/base.txt"):
        path = Path(req_file)
        if path.is_file():
            content = path.read_text(encoding="utf-8").lower()
            if name.lower() in content:
                return True

    return False


def _generate_config(example_vars: dict[str, str]) -> str:
    """Generate a simple dotlyte_config.py file."""
    lines = [
        '"""Application configuration powered by DOTLYTE."""',
        "",
        "from dotlyte import load",
        "",
        "config = load()",
        "",
        "# Access your variables:",
    ]
    for key in example_vars:
        attr = key.lower()
        lines.append(f"# config.{attr}")

    lines.append("")
    return "\n".join(lines)
