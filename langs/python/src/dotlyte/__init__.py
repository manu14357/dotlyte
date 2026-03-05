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

from dotlyte.boundaries import (
    BoundaryProxy,
    create_boundary_proxy,
    is_client_context,
    is_server_context,
)
from dotlyte.config import Config
from dotlyte.encryption import (
    decrypt_file,
    decrypt_value,
    decrypt_vault,
    encrypt_file,
    encrypt_value,
    encrypt_vault,
    generate_key,
    resolve_key_with_fallback,
    rotate_keys,
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
    AuditProxy,
    build_sensitive_set,
    build_sensitive_set_with_patterns,
    compile_patterns,
    create_audit_proxy,
    format_redacted,
    redact_object,
)
from dotlyte.typed import FieldDescriptor, create_typed_config
from dotlyte.validator import (
    SchemaRule,
    SchemaViolation,
    apply_schema_defaults,
    assert_valid,
    get_sensitive_keys,
    validate_schema,
)
from dotlyte.watcher import ConfigWatcher
from dotlyte.workspace import (
    MonorepoInfo,
    find_monorepo_root,
    get_shared_env,
    load_workspace,
)

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
    "rotate_keys",
    "resolve_key_with_fallback",
    "encrypt_vault",
    "decrypt_vault",
    # Masking
    "REDACTED",
    "build_sensitive_set",
    "build_sensitive_set_with_patterns",
    "compile_patterns",
    "create_audit_proxy",
    "AuditProxy",
    "redact_object",
    "format_redacted",
    # Typed config
    "FieldDescriptor",
    "create_typed_config",
    # Boundaries
    "BoundaryProxy",
    "create_boundary_proxy",
    "is_client_context",
    "is_server_context",
    # Workspace
    "MonorepoInfo",
    "find_monorepo_root",
    "get_shared_env",
    "load_workspace",
    # Watcher
    "ConfigWatcher",
]
__version__ = "0.1.2"
