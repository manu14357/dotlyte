"""YAML config file parser for DOTLYTE."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from dotlyte.errors import ParseError


class YamlParser:
    """Parse YAML configuration files.

    Args:
        filepath: Path to the YAML file.

    """

    def __init__(self, filepath: Path) -> None:
        """Initialize with the path to a YAML file.

        Args:
            filepath: Path to the YAML file to parse.

        """
        self.filepath = filepath

    def parse(self) -> dict[str, Any]:
        """Parse the YAML file into a dictionary.

        Values from YAML are already typed and pass through without coercion.

        Returns:
            Dictionary of config key-value pairs.

        Raises:
            ParseError: If the file contains invalid YAML syntax.

        """
        try:
            import yaml
        except ImportError:
            return {}

        try:
            content = self.filepath.read_text(encoding="utf-8")
            data = yaml.safe_load(content)
            return data if isinstance(data, dict) else {}
        except yaml.YAMLError as e:
            raise ParseError(f"Invalid YAML syntax in {self.filepath}: {e}") from e
        except OSError:
            return {}
