"""Custom error types for DOTLYTE."""

from __future__ import annotations


class DotlyteError(Exception):
    """Base exception for all DOTLYTE errors.

    Raised when a required config key is missing, a config file has
    invalid syntax, or a requested file doesn't exist.

    Attributes:
        message: Human-readable error description.
        key: The config key that caused the error (if applicable).

    """

    def __init__(self, message: str, *, key: str | None = None) -> None:
        """Initialize DotlyteError.

        Args:
            message: Human-readable error description.
            key: The config key that caused the error (if applicable).

        """
        super().__init__(message)
        self.key = key


class MissingRequiredKeyError(DotlyteError):
    """Raised when require() is called for a key that doesn't exist."""


class ParseError(DotlyteError):
    """Raised when a config file contains invalid syntax."""


class FileError(DotlyteError):
    """Raised when a requested file doesn't exist."""
