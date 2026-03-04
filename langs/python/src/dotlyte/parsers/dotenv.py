"""Dotenv (.env file) parser for DOTLYTE v2.

Supports KEY=VALUE, KEY="VALUE", KEY='VALUE', export prefix,
multiline double-quoted values, inline comments, and parse_raw()
for interpolation-before-coercion workflow.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dotlyte.coercion import coerce
from dotlyte.errors import ParseError


class DotenvParser:
    """Parse .env files into configuration dictionaries.

    Args:
        filepath: Path to the .env file.

    """

    def __init__(self, filepath: Path) -> None:
        self.filepath = filepath

    def parse(self) -> dict[str, Any]:
        """Parse with type coercion. For interpolation, use parse_raw() instead."""
        raw = self.parse_raw()
        return {k: coerce(v) for k, v in raw.items()}

    def parse_raw(self) -> dict[str, str]:
        """Parse .env file returning raw string values (no coercion).

        Returns:
            Dictionary of lowercase keys → raw string values.

        Raises:
            ParseError: If the file has invalid syntax.

        """
        result: dict[str, str] = {}

        try:
            content = self.filepath.read_text(encoding="utf-8")
        except OSError:
            return result

        lines = content.splitlines()
        i = 0

        while i < len(lines):
            line = lines[i].strip()
            i += 1

            # Skip empty lines and comments
            if not line or line.startswith("#"):
                continue

            # Strip optional "export " prefix
            if line.startswith("export "):
                line = line[7:].strip()

            # Parse KEY=VALUE
            if "=" not in line:
                raise ParseError(
                    f"Invalid syntax in {self.filepath}:{i}: "
                    f"expected KEY=VALUE, got: {line!r}",
                    file_path=str(self.filepath),
                )

            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()

            # Handle double-quoted multiline values
            if value.startswith('"') and not value.endswith('"'):
                parts = [value[1:]]
                while i < len(lines):
                    next_line = lines[i]
                    i += 1
                    if next_line.rstrip().endswith('"'):
                        parts.append(next_line.rstrip()[:-1])
                        break
                    parts.append(next_line)
                value = "\n".join(parts)
            else:
                # Remove surrounding quotes
                if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
                    value = value[1:-1]
                elif value and value[0] not in ('"', "'"):
                    # Strip inline comments for unquoted values
                    hash_idx = value.find(" #")
                    if hash_idx != -1:
                        value = value[:hash_idx].rstrip()

            # Process escape sequences
            value = value.replace("\\n", "\n").replace("\\t", "\t").replace("\\\\", "\\")

            result[key.lower()] = value

        return result
