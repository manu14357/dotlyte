//! Environment variables parser — DOTLYTE v2.
//!
//! Includes a system env var blocklist to avoid pulling in
//! potentially harmful system variables.

use std::collections::HashSet;

use serde_json::Value;

use crate::coercion::coerce_str;

/// System environment variables to skip by default.
fn system_env_blocklist() -> HashSet<&'static str> {
    [
        "PATH", "HOME", "USER", "SHELL", "LANG", "TERM",
        "TMPDIR", "TEMP", "TMP", "EDITOR", "VISUAL",
        "LOGNAME", "HOSTNAME", "HOSTTYPE", "OSTYPE",
        "MACHTYPE", "SHLVL", "PWD", "OLDPWD", "LS_COLORS",
        "COLORTERM", "DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS",
        "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
        "XDG_RUNTIME_DIR", "XDG_SESSION_TYPE",
        "SSH_AUTH_SOCK", "SSH_AGENT_PID", "GPG_AGENT_INFO",
        "WINDOWID", "DESKTOP_SESSION", "SESSION_MANAGER",
        "GNOME_DESKTOP_SESSION_ID",
        "_", "__CF_USER_TEXT_ENCODING", "Apple_PubSub_Socket_Render",
        "COMMAND_MODE", "SECURITYSESSIONID", "LaunchInstanceID",
    ].iter().copied().collect()
}

/// Prefixes that indicate system/tool variables.
const SYSTEM_PREFIXES: &[&str] = &[
    "npm_", "VSCODE_", "GIT_", "DOCKER_", "KUBERNETES_",
    "AWS_DEFAULT_", "CI", "GITHUB_", "GITLAB_",
    "JENKINS_", "TRAVIS_", "BUILDKITE_",
    "HOMEBREW_", "NVM_", "PYENV_", "RBENV_", "GOPATH",
    "CARGO_", "RUSTUP_", "JAVA_", "ANDROID_",
    "LESS", "PAGER", "MANPATH",
    "LC_", "LSCOLORS",
];

fn is_likely_system_var(key: &str) -> bool {
    let upper = key.to_uppercase();
    let blocklist = system_env_blocklist();
    if blocklist.contains(upper.as_str()) {
        return true;
    }
    for prefix in SYSTEM_PREFIXES {
        if upper.starts_with(&prefix.to_uppercase()) {
            return true;
        }
    }
    false
}

/// Load environment variables into a config map (v2: respects blocklist).
pub fn load_vars_v2(prefix: Option<&str>, allow_all: bool) -> serde_json::Map<String, Value> {
    let mut result = serde_json::Map::new();
    let pfx = prefix.map(|p| format!("{}_", p.to_uppercase()));

    for (key, value) in std::env::vars() {
        if let Some(ref pfx) = pfx {
            if !key.starts_with(pfx.as_str()) {
                continue;
            }
            let clean_key = key[pfx.len()..].to_lowercase();
            set_nested(&mut result, &clean_key, coerce_str(&value));
        } else {
            if !allow_all && is_likely_system_var(&key) {
                continue;
            }
            result.insert(key.to_lowercase(), coerce_str(&value));
        }
    }

    result
}

/// Load environment variables into a config map (v1 compat: loads all).
pub fn load_vars(prefix: Option<&str>) -> serde_json::Map<String, Value> {
    load_vars_v2(prefix, true)
}

fn set_nested(data: &mut serde_json::Map<String, Value>, key: &str, value: Value) {
    let parts: Vec<&str> = key.split('_').collect();

    if parts.len() == 1 {
        data.insert(parts[0].to_string(), value);
        return;
    }

    let first = parts[0];
    let rest = parts[1..].join("_");

    let entry = data
        .entry(first.to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));

    if let Value::Object(ref mut map) = entry {
        set_nested(map, &rest, value);
    }
}
