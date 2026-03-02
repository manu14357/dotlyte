---
applyTo: "langs/python/**"
---

# Python Implementation — Copilot Instructions

## Build System
- **Build backend:** hatchling
- **Layout:** src layout — `langs/python/src/dotlyte/`
- **Package:** `pip install dotlyte`

## Conventions
- **Python version:** >=3.9
- **Linter/formatter:** ruff (replaces black + isort + flake8)
- **Type checker:** mypy (strict mode)
- **Test framework:** pytest with pytest-cov
- **Type hints required** on all public functions and methods
- **PEP 561:** `py.typed` marker file included

## Code Style
- Use `snake_case` for functions and variables
- Use `PascalCase` for classes
- Use `UPPER_SNAKE_CASE` for constants
- Docstrings: Google style
- Max line length: 88 (ruff default)

## Architecture
- `src/dotlyte/__init__.py` — Public API: `load()`, `Config`, `DotlyteError`
- `src/dotlyte/loader.py` — Main orchestrator
- `src/dotlyte/config.py` — Config object with dot-notation, `get()`, `require()`
- `src/dotlyte/coercion.py` — Type coercion engine
- `src/dotlyte/parsers/` — One module per source type (env, yaml, json, toml)

## Commands
```bash
cd langs/python
pip install -e ".[dev]"
pytest                          # Run tests
ruff check .                    # Lint
ruff format --check .           # Format check
mypy src/                       # Type check
```

## Dependencies
- Runtime: `pyyaml>=6.0`, `tomli>=2.0` (Python <3.11 only)
- Dev: `pytest`, `pytest-cov`, `ruff`, `mypy`
