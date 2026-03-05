"""Server/client boundary enforcement for DOTLYTE.

Prevents server-only environment variables (API keys, database URLs, secrets)
from being accidentally accessed in client-side code. In Python this is mainly
useful for isomorphic patterns and enforcing clean separation in monorepos.

Example::

    from dotlyte.boundaries import create_boundary_proxy

    proxy = create_boundary_proxy(
        data={"DATABASE_URL": "postgres://...", "APP_NAME": "myapp"},
        server_keys={"DATABASE_URL"},
        client_keys={"APP_NAME"},
        shared_keys=set(),
    )
    proxy["APP_NAME"]      # 'myapp'
    proxy["DATABASE_URL"]  # works on server (Python is always server)
"""

from __future__ import annotations

from typing import Any, Callable, Iterator


def is_client_context() -> bool:
    """Detect whether the current code is running in a client (browser) context.

    In CPython this is always ``False`` — Python does not run in browsers.
    Provided for API parity with the JavaScript implementation.

    Returns:
        Always ``False``.

    """
    return False


def is_server_context() -> bool:
    """Detect whether the current code is running in a server context.

    In CPython this is always ``True``.

    Returns:
        Always ``True``.

    """
    return True


class BoundaryProxy:
    """Immutable proxy that enforces server/client access rules.

    Supports both attribute access (``proxy.KEY``) and item access
    (``proxy["KEY"]``).

    Args:
        data: The validated config data.
        server_keys: Keys restricted to server context.
        client_keys: Keys safe for client context.
        shared_keys: Keys available in both contexts.
        on_secret_access: Optional audit callback for sensitive key access.

    """

    def __init__(
        self,
        data: dict[str, Any],
        server_keys: set[str],
        client_keys: set[str],
        shared_keys: set[str],
        on_secret_access: Callable[[str, str], None] | None = None,
    ) -> None:
        # Use object.__setattr__ to bypass our __setattr__ guard
        object.__setattr__(self, "_data", dict(data))
        object.__setattr__(self, "_server_keys", set(server_keys))
        object.__setattr__(self, "_client_keys", set(client_keys))
        object.__setattr__(self, "_shared_keys", set(shared_keys))
        object.__setattr__(self, "_all_keys", server_keys | client_keys | shared_keys)
        object.__setattr__(self, "_on_secret_access", on_secret_access)

    # ──── Access ────

    def _check_access(self, key: str) -> Any:
        """Resolve *key* with boundary enforcement."""
        from dotlyte.errors import DotlyteError

        all_keys: set[str] = object.__getattribute__(self, "_all_keys")
        if key not in all_keys:
            return None

        server_keys: set[str] = object.__getattribute__(self, "_server_keys")

        # In Python (always server) server keys are always accessible.
        # But if we ever detect a client context, enforce the boundary.
        if key in server_keys and is_client_context():
            raise DotlyteError(
                f"Server-only env var '{key}' accessed in client context. "
                f"This variable contains sensitive data and must not be exposed "
                f"to the browser. Move it to the 'server' section and only access "
                f"it in server-side code.",
                key=key,
                code="BOUNDARY_VIOLATION",
            )

        # Audit logging
        on_secret_access = object.__getattribute__(self, "_on_secret_access")
        if on_secret_access and key in server_keys:
            context = "client" if is_client_context() else "server"
            on_secret_access(key, context)

        data: dict[str, Any] = object.__getattribute__(self, "_data")
        return data.get(key)

    def __getattr__(self, key: str) -> Any:
        """Support ``proxy.KEY`` access."""
        return self._check_access(key)

    def __getitem__(self, key: str) -> Any:
        """Support ``proxy["KEY"]`` access."""
        value = self._check_access(key)
        if value is None:
            all_keys: set[str] = object.__getattribute__(self, "_all_keys")
            if key not in all_keys:
                raise KeyError(key)
        return value

    # ──── Immutability ────

    def __setattr__(self, key: str, value: Any) -> None:
        from dotlyte.errors import DotlyteError

        raise DotlyteError(
            f"Cannot set property '{key}' on typed config. Config is immutable.",
            key=key,
            code="IMMUTABLE_CONFIG",
        )

    def __setitem__(self, key: str, value: Any) -> None:
        from dotlyte.errors import DotlyteError

        raise DotlyteError(
            f"Cannot set property '{key}' on typed config. Config is immutable.",
            key=key,
            code="IMMUTABLE_CONFIG",
        )

    def __delattr__(self, key: str) -> None:
        from dotlyte.errors import DotlyteError

        raise DotlyteError(
            f"Cannot delete property '{key}' from typed config. Config is immutable.",
            key=key,
            code="IMMUTABLE_CONFIG",
        )

    def __delitem__(self, key: str) -> None:
        from dotlyte.errors import DotlyteError

        raise DotlyteError(
            f"Cannot delete property '{key}' from typed config. Config is immutable.",
            key=key,
            code="IMMUTABLE_CONFIG",
        )

    # ──── Container protocol ────

    def __contains__(self, key: object) -> bool:
        all_keys: set[str] = object.__getattribute__(self, "_all_keys")
        return key in all_keys

    def __iter__(self) -> Iterator[str]:
        all_keys: set[str] = object.__getattribute__(self, "_all_keys")
        return iter(all_keys)

    def __len__(self) -> int:
        all_keys: set[str] = object.__getattribute__(self, "_all_keys")
        return len(all_keys)

    def __repr__(self) -> str:
        all_keys: set[str] = object.__getattribute__(self, "_all_keys")
        return f"BoundaryProxy(keys={sorted(all_keys)})"

    # ──── Filtered Views ────

    def server_only(self) -> dict[str, Any]:
        """Return a dict containing only server + shared keys.

        Returns:
            Dict with server-only and shared values.

        """
        data: dict[str, Any] = object.__getattribute__(self, "_data")
        server_keys: set[str] = object.__getattribute__(self, "_server_keys")
        shared_keys: set[str] = object.__getattribute__(self, "_shared_keys")
        return {k: data[k] for k in (server_keys | shared_keys) if k in data}

    def client_only(self) -> dict[str, Any]:
        """Return a dict containing only client + shared keys.

        Returns:
            Dict with client-only and shared values.

        """
        data: dict[str, Any] = object.__getattribute__(self, "_data")
        client_keys: set[str] = object.__getattribute__(self, "_client_keys")
        shared_keys: set[str] = object.__getattribute__(self, "_shared_keys")
        return {k: data[k] for k in (client_keys | shared_keys) if k in data}


def create_boundary_proxy(
    data: dict[str, Any],
    server_keys: set[str],
    client_keys: set[str],
    shared_keys: set[str],
    on_secret_access: Callable[[str, str], None] | None = None,
) -> BoundaryProxy:
    """Create a proxy that enforces server/client boundaries on config access.

    - **Server keys**: accessible only on the server; would throw in client context.
    - **Client keys**: accessible everywhere.
    - **Shared keys**: accessible everywhere.

    In Python (always server-side) all keys are accessible, but the proxy
    still provides ``server_only()`` and ``client_only()`` filtered views
    and enforces immutability.

    Args:
        data: The validated config object.
        server_keys: Keys restricted to server context.
        client_keys: Keys safe for client context.
        shared_keys: Keys available in both contexts.
        on_secret_access: Optional audit callback for sensitive value access.

    Returns:
        A ``BoundaryProxy`` wrapping the data.

    """
    return BoundaryProxy(
        data,
        server_keys=server_keys,
        client_keys=client_keys,
        shared_keys=shared_keys,
        on_secret_access=on_secret_access,
    )
