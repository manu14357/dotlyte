"""Dotenv (.env file) parser for DOTLYTE."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dotlyte.coercion import coerce
from dotlyte.errors import ParseError


class DotenvParser:
    """Parse .env files into configuration dictionaries.

    Handles standard .env file format:
    - KEY=value
    - KEY="quoted value"
    - KEY='quoted value'
    - # comments
    - Empty lines ignored
    - export KEY=value (optional export prefix)

    Args:
        filepath: Path to the .env file.

    """

    def __init__(self, filepath: Path) -> None:
        """Initialize with the path to a .env file.

        Args:
            filepath: Path to the .env file to parse.

        """
        self.filepath = filepath

    def parse(self) -> dict[str, Any]:
        """Parse the .env file into a dictionary with coerced values.

        Returns:
            Dictionary of config key-value pairs.

        Raises:
            ParseError: If the file contains invalid syntax.

        """
        result: dict[str, Any] = {}

        try:
            content = self.filepath.read_text(encoding="utf-8")
        except OSError:
            return result

        for line_num, line in enumerate(content.splitlines(), start=1):
            line = line.strip()

            # Skip empty lines and comments
            if not line or line.startswith("#"):
                continue

            # Strip optional "export " prefix
            if line.startswith("export "):
                line = line[7:].strip()

            # Parse KEY=VALUE
            if "=" not in line:
                raise ParseError(
                    f"Invalid syntax in {self.filepath}:{line_num}: "
                    f"expected KEY=VALUE, got: {line!r}"
                )

            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()

            # Remove surrounding quotes
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                value = value[1:-1]

            result[key.lower()] = coerce(value)

        return result
