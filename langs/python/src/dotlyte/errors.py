"""Custom error types for DOTLYTE v2."""

from __future__ import annotations

from typing import Any


class DotlyteError(Exception):
    """Base exception for all DOTLYTE errors.

    Attributes:
        message: Human-readable error description.
        key: The config key that caused the error (if applicable).
        code: Machine-readable error code.

    """

    def __init__(
        self,
        message: str,
        *,
        key: str | None = None,
        code: str = "DOTLYTE_ERROR",
    ) -> None:
        super().__init__(message)
        self.key = key
        self.code = code


class MissingRequiredKeyError(DotlyteError):
    """Raised when require() is called for a key that doesn't exist."""

    def __init__(
        self,
        key: str,
        sources_checked: list[str] | None = None,
    ) -> None:
        sources_msg = ""
        if sources_checked:
            sources_msg = f" Sources checked: {', '.join(sources_checked)}."
        super().__init__(
            f"Required config key '{key}' is missing.{sources_msg} "
            f"Set it in your .env file, config file, or as an environment variable.",
            key=key,
            code="MISSING_REQUIRED_KEY",
        )
        self.sources_checked = sources_checked or []


class ParseError(DotlyteError):
    """Raised when a config file contains invalid syntax."""

    def __init__(self, message: str, *, file_path: str | None = None) -> None:
        super().__init__(message, code="PARSE_ERROR")
        self.file_path = file_path


class FileError(DotlyteError):
    """Raised when a requested file doesn't exist."""

    def __init__(self, file_path: str) -> None:
        super().__init__(
            f"Requested config file '{file_path}' does not exist. "
            f"Check the path or remove it from the files option.",
            code="FILE_NOT_FOUND",
        )
        self.file_path = file_path


class ValidationError(DotlyteError):
    """Raised when config data fails schema validation."""

    def __init__(self, violations: list[Any]) -> None:
        messages = [v.message for v in violations]
        super().__init__(
            f"Config validation failed ({len(violations)} error(s)):\n"
            + "\n".join(f"  • {m}" for m in messages),
            code="VALIDATION_ERROR",
        )
        self.violations = violations


class InterpolationError(DotlyteError):
    """Raised on circular or unresolvable variable references."""

    def __init__(self, message: str, *, key: str | None = None) -> None:
        super().__init__(message, key=key, code="INTERPOLATION_ERROR")


class DecryptionError(DotlyteError):
    """Raised when encrypted value decryption fails."""

    def __init__(self, message: str, *, file_path: str | None = None) -> None:
        super().__init__(message, code="DECRYPTION_ERROR")
        self.file_path = file_path
