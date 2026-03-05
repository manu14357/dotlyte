"""Typed configuration API for DOTLYTE.

Provides ``create_typed_config()`` with schema-driven validation, type
coercion, server/client boundary enforcement, and an immutable result.

Example::

    from dotlyte.typed import create_typed_config

    env = create_typed_config({
        "DATABASE_URL": {"type": "string", "format": "url", "required": True},
        "PORT": {"type": "integer", "default": 3000},
        "DEBUG": {"type": "boolean", "default": False},
        "LOG_LEVEL": {
            "type": "string",
            "enum": ["debug", "info", "warn", "error"],
            "default": "info",
        },
    })

    env["PORT"]       # 3000  (int)
    env["DEBUG"]      # False (bool)
"""

from __future__ import annotations

import os
import re
import types
from typing import Any, Callable, Literal, TypedDict

from dotlyte.boundaries import create_boundary_proxy
from dotlyte.errors import DotlyteError
from dotlyte.loader import load

# ──── Schema Descriptor Types ────

TypeName = Literal["string", "integer", "number", "boolean", "url"]


class FieldDescriptor(TypedDict, total=False):
    """A single field descriptor in the typed config schema."""

    type: TypeName
    required: bool
    default: Any
    enum: list[Any]
    min: float | int
    max: float | int
    sensitive: bool
    doc: str


# ──── Type-coercion helpers ────

_TRUE_VALUES = frozenset({"true", "yes", "1", "on"})
_FALSE_VALUES = frozenset({"false", "no", "0", "off"})
_URL_PATTERN = re.compile(r"^https?://\S+")


def _validate_field(key: str, raw: Any, descriptor: FieldDescriptor) -> Any:
    """Validate and coerce a single value against its field descriptor.

    Args:
        key: The environment variable / config key name.
        raw: The raw value from the merged config.
        descriptor: Schema descriptor for this field.

    Returns:
        The validated and coerced value.

    Raises:
        DotlyteError: On validation failures.

    """
    is_required = descriptor.get("required", True)
    has_default = "default" in descriptor
    field_type: TypeName = descriptor.get("type", "string")

    # Apply default
    value = raw
    if (value is None or value == "") and has_default:
        value = descriptor["default"]

    # Check required
    if (value is None or value == "") and is_required:
        doc_hint = f" ({descriptor['doc']})" if descriptor.get("doc") else ""
        raise DotlyteError(
            f"Missing required environment variable '{key}'.{doc_hint} "
            f"Set it in your .env file, config file, or as an environment variable.",
            key=key,
            code="MISSING_REQUIRED_KEY",
        )

    # Optional and absent
    if value is None or value == "":
        return None

    # ── Type coercion ──
    str_value = str(value)

    if field_type == "boolean":
        if isinstance(value, bool):
            pass  # already correct
        else:
            lower = str_value.lower()
            if lower in _TRUE_VALUES:
                value = True
            elif lower in _FALSE_VALUES:
                value = False
            else:
                raise DotlyteError(
                    f"Environment variable '{key}' expected boolean, got '{str_value}'.",
                    key=key,
                    code="VALIDATION_ERROR",
                )

    elif field_type in ("integer", "number"):
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            if field_type == "integer" and not isinstance(value, int):
                raise DotlyteError(
                    f"Environment variable '{key}' expected integer, got '{str_value}'.",
                    key=key,
                    code="VALIDATION_ERROR",
                )
        else:
            try:
                num = float(str_value)
            except ValueError:
                raise DotlyteError(
                    f"Environment variable '{key}' expected number, got '{str_value}'.",
                    key=key,
                    code="VALIDATION_ERROR",
                )
            if field_type == "integer":
                if not num.is_integer():
                    raise DotlyteError(
                        f"Environment variable '{key}' expected integer, got '{str_value}'.",
                        key=key,
                        code="VALIDATION_ERROR",
                    )
                value = int(num)
            else:
                value = num

    elif field_type in ("string", "url"):
        value = str_value

    # ── Format validation ──
    fmt = descriptor.get("format") or ("url" if field_type == "url" else None)
    if fmt == "url":
        if not _URL_PATTERN.match(str(value)):
            raise DotlyteError(
                f"Environment variable '{key}' is not a valid URL: '{value}'.",
                key=key,
                code="VALIDATION_ERROR",
            )

    # ── Enum validation ──
    enum_vals = descriptor.get("enum")
    if enum_vals is not None and value not in enum_vals:
        joined = ", ".join(str(e) for e in enum_vals)
        raise DotlyteError(
            f"Environment variable '{key}' must be one of [{joined}], got '{value}'.",
            key=key,
            code="VALIDATION_ERROR",
        )

    # ── Min / Max validation ──
    min_val = descriptor.get("min")
    max_val = descriptor.get("max")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if min_val is not None and value < min_val:
            raise DotlyteError(
                f"Environment variable '{key}' value {value} is below minimum {min_val}.",
                key=key,
                code="VALIDATION_ERROR",
            )
        if max_val is not None and value > max_val:
            raise DotlyteError(
                f"Environment variable '{key}' value {value} exceeds maximum {max_val}.",
                key=key,
                code="VALIDATION_ERROR",
            )

    if isinstance(value, str):
        if min_val is not None and len(value) < min_val:
            raise DotlyteError(
                f"Environment variable '{key}' length {len(value)} "
                f"is below minimum {min_val}.",
                key=key,
                code="VALIDATION_ERROR",
            )
        if max_val is not None and len(value) > max_val:
            raise DotlyteError(
                f"Environment variable '{key}' length {len(value)} "
                f"exceeds maximum {max_val}.",
                key=key,
                code="VALIDATION_ERROR",
            )

    return value


# ──── Sectioned Schema Support ────


class SectionedSchema(TypedDict, total=False):
    """Schema with server/client/shared sections."""

    server: dict[str, FieldDescriptor]
    client: dict[str, FieldDescriptor]
    shared: dict[str, FieldDescriptor]
    client_prefix: str


def _is_sectioned(schema: dict[str, Any]) -> bool:
    """Return True if schema uses server/client sections."""
    return "server" in schema and "client" in schema


# ──── Main API ────


def create_typed_config(
    schema: dict[str, Any],
    *,
    skip_validation: bool = False,
    on_secret_access: Callable[[str, str], None] | None = None,
    **load_options: Any,
) -> types.MappingProxyType[str, Any]:
    """Create a validated, typed, immutable configuration object.

    Validates at import-time (fail fast on app startup). Returns a frozen
    ``MappingProxyType`` so the config cannot be mutated.

    Supports two schema formats:

    * **Flat schema** — ``{"PORT": {"type": "integer", "default": 3000}}``
    * **Sectioned schema** — ``{"server": {...}, "client": {...}, "shared": {...}}``

    Args:
        schema: A flat or sectioned ``FieldDescriptor`` schema.
        skip_validation: Skip validation (useful in tests).
        on_secret_access: Audit callback when a sensitive key is read.
        **load_options: Forwarded to ``load()``.

    Returns:
        An immutable mapping of validated config values.

    Raises:
        DotlyteError: On validation failures.

    Example::

        env = create_typed_config({
            "PORT": {"type": "integer", "default": 3000},
            "DEBUG": {"type": "boolean", "default": False},
        })
        env["PORT"]  # 3000

    """
    if _is_sectioned(schema):
        return _create_sectioned_config(
            schema,
            skip_validation=skip_validation,
            on_secret_access=on_secret_access,
            **load_options,
        )
    return _create_flat_config(
        schema,
        skip_validation=skip_validation,
        **load_options,
    )


def _create_flat_config(
    schema: dict[str, FieldDescriptor],
    *,
    skip_validation: bool = False,
    **load_options: Any,
) -> types.MappingProxyType[str, Any]:
    """Handle flat (non-sectioned) schemas."""
    config = load(**load_options)
    raw = config.to_dict()
    env_vars = dict(os.environ)

    result: dict[str, Any] = {}
    errors: list[str] = []

    for key, descriptor in schema.items():
        try:
            raw_value = raw.get(key.lower()) or raw.get(key) or env_vars.get(key)
            result[key] = _validate_field(key, raw_value, descriptor)
        except DotlyteError as exc:
            if skip_validation:
                result[key] = (
                    raw.get(key.lower()) or raw.get(key) or env_vars.get(key)
                )
            else:
                errors.append(str(exc))

    if errors:
        raise DotlyteError(
            f"Typed config validation failed ({len(errors)} error(s)):\n"
            + "\n".join(f"  • {m}" for m in errors),
            code="VALIDATION_ERROR",
        )

    return types.MappingProxyType(result)


def _create_sectioned_config(
    schema: dict[str, Any],
    *,
    skip_validation: bool = False,
    on_secret_access: Callable[[str, str], None] | None = None,
    **load_options: Any,
) -> types.MappingProxyType[str, Any]:
    """Handle sectioned (server/client/shared) schemas."""
    server_schema: dict[str, FieldDescriptor] = schema.get("server", {})
    client_schema: dict[str, FieldDescriptor] = schema.get("client", {})
    shared_schema: dict[str, FieldDescriptor] = schema.get("shared", {})
    client_prefix: str = schema.get("client_prefix", "NEXT_PUBLIC_")

    # Validate that client keys start with the prefix
    for key in client_schema:
        if not key.startswith(client_prefix):
            raise DotlyteError(
                f"Client environment variable '{key}' must start with "
                f"'{client_prefix}'. Move it to the 'server' section or rename it.",
                key=key,
                code="VALIDATION_ERROR",
            )

    # Merge all into one flat schema for validation
    all_schema = {**server_schema, **client_schema, **shared_schema}
    flat = _create_flat_config(all_schema, skip_validation=skip_validation, **load_options)

    # Build key sets
    server_keys = set(server_schema.keys())
    client_keys = set(client_schema.keys())
    shared_keys = set(shared_schema.keys())

    proxy = create_boundary_proxy(
        dict(flat),
        server_keys=server_keys,
        client_keys=client_keys,
        shared_keys=shared_keys,
        on_secret_access=on_secret_access,
    )

    # Build dict from proxy (iter yields keys, getitem yields values)
    result_dict = {k: proxy[k] for k in proxy}
    return types.MappingProxyType(result_dict)
