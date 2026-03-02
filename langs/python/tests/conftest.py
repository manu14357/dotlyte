"""Shared test fixtures and configuration for DOTLYTE tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# Path to the shared spec fixtures
SPEC_FIXTURES_DIR = Path(__file__).parent.parent.parent.parent / "spec" / "fixtures"


@pytest.fixture
def spec_fixtures_dir() -> Path:
    """Return the path to the shared spec fixtures directory."""
    return SPEC_FIXTURES_DIR


@pytest.fixture
def basic_fixture_dir() -> Path:
    """Return the path to the basic test fixture."""
    return SPEC_FIXTURES_DIR / "basic"


@pytest.fixture
def type_coercion_fixture_dir() -> Path:
    """Return the path to the type coercion test fixture."""
    return SPEC_FIXTURES_DIR / "type-coercion"


@pytest.fixture
def priority_fixture_dir() -> Path:
    """Return the path to the priority test fixture."""
    return SPEC_FIXTURES_DIR / "priority"


def load_expected(fixture_dir: Path) -> dict:
    """Load the expected.json from a fixture directory."""
    expected_file = fixture_dir / "expected.json"
    return json.loads(expected_file.read_text(encoding="utf-8"))
