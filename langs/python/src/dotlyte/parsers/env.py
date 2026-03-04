"""Environment variables parser for DOTLYTE v2.

Includes system env var blocklist to prevent pollution when no prefix is set.
"""

from __future__ import annotations

import os
from typing import Any, Optional

from dotlyte.coercion import coerce


# Common system / runtime env vars that are NOT user configuration
SYSTEM_ENV_BLOCKLIST: frozenset[str] = frozenset({
    "PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LANGUAGE",
    "LC_ALL", "LC_CTYPE", "LC_MESSAGES", "LC_COLLATE", "LC_NUMERIC",
    "LOGNAME", "HOSTNAME", "HOSTTYPE", "OSTYPE", "MACHTYPE",
    "DISPLAY", "EDITOR", "VISUAL", "PAGER", "TMPDIR", "TMP", "TEMP",
    "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
    "XDG_RUNTIME_DIR", "XDG_SESSION_TYPE", "XDG_CURRENT_DESKTOP",
    "SHLVL", "PWD", "OLDPWD", "_", "COLORTERM",
    "LESS", "LESSOPEN", "LESSCLOSE", "MAIL", "MANPATH",
    "SSH_AUTH_SOCK", "SSH_AGENT_PID", "SSH_CONNECTION", "SSH_CLIENT", "SSH_TTY",
    "GPG_AGENT_INFO", "GPG_TTY",
    "VIRTUAL_ENV", "CONDA_DEFAULT_ENV", "CONDA_PREFIX",
    "GOPATH", "GOROOT", "GOBIN",
    "JAVA_HOME", "CLASSPATH",
    "NVM_DIR", "NVM_CD_FLAGS", "NVM_BIN", "NVM_INC",
    "SDKMAN_DIR", "PYENV_ROOT", "RBENV_ROOT", "RUSTUP_HOME", "CARGO_HOME",
    "DBUS_SESSION_BUS_ADDRESS", "WAYLAND_DISPLAY",
    "WINDOWID", "DESKTOP_SESSION", "SESSION_MANAGER",
    "GNOME_DESKTOP_SESSION_ID",
    "LS_COLORS", "LSCOLORS",
    "PS1", "PS2", "PS4", "PROMPT_COMMAND",
    "HISTFILE", "HISTSIZE", "HISTCONTROL", "HISTFILESIZE", "SAVEHIST",
    "ZDOTDIR", "FPATH",
    "SECURITYSESSIONID", "Apple_PubSub_Socket_Render",
    "__CF_USER_TEXT_ENCODING", "__CFBundleIdentifier",
    "COMMAND_MODE", "MallocNanoZone",
})

# Prefix patterns that indicate system/runtime vars
SYSTEM_PREFIXES: tuple[str, ...] = (
    "npm_", "NPM_", "HOMEBREW_", "VSCODE_", "TERM_", "GIT_",
    "DOCKER_", "KUBERNETES_", "GITHUB_", "CI_", "CI",
    "COLORTERM_", "ITERM_", "LC_",
)


def _is_likely_system_var(key: str) -> bool:
    """Heuristic: is this env var likely a system/runtime variable?"""
    if key in SYSTEM_ENV_BLOCKLIST:
        return True
    return any(key.startswith(p) for p in SYSTEM_PREFIXES)


class EnvVarsParser:
    """Parse configuration from environment variables (os.environ).

    Optionally strips a prefix and converts underscore-separated keys
    to dot-notation nesting.

    Args:
        prefix: Optional prefix to filter and strip from env var names.
        allow_all_env_vars: If True, skip the system vars blocklist (v1 behavior).

    """

    def __init__(
        self,
        prefix: Optional[str] = None,
        allow_all_env_vars: bool = False,
    ) -> None:
        self.prefix = prefix.upper() + "_" if prefix else None
        self.allow_all_env_vars = allow_all_env_vars

    def parse(self) -> dict[str, Any]:
        """Parse environment variables into a config dictionary.

        Returns:
            Dictionary of coerced config values from the environment.

        """
        result: dict[str, Any] = {}

        for key, value in os.environ.items():
            if self.prefix:
                if not key.startswith(self.prefix):
                    continue
                # Strip prefix and convert to lowercase dot-notation
                clean_key = key[len(self.prefix) :].lower()
                self._set_nested(result, clean_key, coerce(value))
            else:
                # No prefix: filter out system vars to prevent pollution
                if not self.allow_all_env_vars and _is_likely_system_var(key):
                    continue
                result[key.lower()] = coerce(value)

        return result

    @staticmethod
    def _set_nested(data: dict[str, Any], key: str, value: Any) -> None:
        """Set a nested key using underscore as separator."""
        parts = key.split("_")
        current = data
        for part in parts[:-1]:
            if part not in current or not isinstance(current[part], dict):
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value
