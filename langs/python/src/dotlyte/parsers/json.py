"""JSON config file parser for DOTLYTE."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from dotlyte.errors import ParseError


class JsonParser:
    """Parse JSON configuration files.

    Args:
        filepath: Path to the JSON file.

    """

    def __init__(self, filepath: Path) -> None:
        """Initialize with the path to a JSON file.

        Args:
            filepath: Path to the JSON file to parse.

        """
        self.filepath = filepath

    def parse(self) -> dict[str, Any]:
        """Parse the JSON file into a dictionary.

        Values from JSON are already typed and pass through without coercion.

        Returns:
            Dictionary of config key-value pairs.

        Raises:
            ParseError: If the file contains invalid JSON syntax.

        """
        try:
            content = self.filepath.read_text(encoding="utf-8")
            data = json.loads(content)
            return data if isinstance(data, dict) else {}
        except json.JSONDecodeError as e:
            raise ParseError(f"Invalid JSON syntax in {self.filepath}: {e}") from e
        except OSError:
            return {}
