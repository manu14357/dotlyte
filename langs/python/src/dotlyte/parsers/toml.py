"""TOML config file parser for DOTLYTE."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from dotlyte.errors import ParseError


class TomlParser:
    """Parse TOML configuration files.

    Uses tomllib (Python 3.11+) or tomli (Python <3.11).

    Args:
        filepath: Path to the TOML file.

    """

    def __init__(self, filepath: Path) -> None:
        """Initialize with the path to a TOML file.

        Args:
            filepath: Path to the TOML file to parse.

        """
        self.filepath = filepath

    def parse(self) -> dict[str, Any]:
        """Parse the TOML file into a dictionary.

        Values from TOML are already typed and pass through without coercion.

        Returns:
            Dictionary of config key-value pairs.

        Raises:
            ParseError: If the file contains invalid TOML syntax.

        """
        try:
            if sys.version_info >= (3, 11):
                import tomllib
            else:
                try:
                    import tomli as tomllib  # type: ignore[no-redef]
                except ImportError:
                    return {}

            content = self.filepath.read_bytes()
            return tomllib.loads(content.decode("utf-8"))
        except Exception as e:
            if "tomllib" in str(type(e).__module__) or "tomli" in str(
                type(e).__module__
            ):
                raise ParseError(f"Invalid TOML syntax in {self.filepath}: {e}") from e
            if isinstance(e, OSError):
                return {}
            raise
