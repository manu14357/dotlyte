"""DOTLYTE — The universal configuration library v2.

One import. One function call. Everything loaded, merged, typed, and accessible
with dot-notation.

Usage:
    from dotlyte import load

    config = load()
    config.port           # automatically int
    config.debug          # automatically bool
    config.database.host  # dot-notation access
"""

from dotlyte.config import Config
from dotlyte.encryption import (
    decrypt_file,
    decrypt_value,
    encrypt_file,
    encrypt_value,
    generate_key,
)
from dotlyte.errors import (
    DecryptionError,
    DotlyteError,
    FileError,
    InterpolationError,
    MissingRequiredKeyError,
    ParseError,
    ValidationError,
)
from dotlyte.interpolation import interpolate
from dotlyte.loader import load
from dotlyte.masking import (
    REDACTED,
    build_sensitive_set,
    format_redacted,
    redact_object,
)
from dotlyte.validator import (
    SchemaRule,
    SchemaViolation,
    apply_schema_defaults,
    assert_valid,
    get_sensitive_keys,
    validate_schema,
)
from dotlyte.watcher import ConfigWatcher

__all__ = [
    # Core
    "Config",
    "load",
    # Errors
    "DotlyteError",
    "MissingRequiredKeyError",
    "ParseError",
    "FileError",
    "ValidationError",
    "InterpolationError",
    "DecryptionError",
    # Schema
    "SchemaRule",
    "SchemaViolation",
    "validate_schema",
    "assert_valid",
    "apply_schema_defaults",
    "get_sensitive_keys",
    # Interpolation
    "interpolate",
    # Encryption
    "encrypt_value",
    "decrypt_value",
    "encrypt_file",
    "decrypt_file",
    "generate_key",
    # Masking
    "REDACTED",
    "build_sensitive_set",
    "redact_object",
    "format_redacted",
    # Watcher
    "ConfigWatcher",
]
__version__ = "2.0.0"
