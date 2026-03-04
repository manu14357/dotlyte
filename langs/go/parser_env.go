package dotlyte

import (
	"os"
	"strings"
)

// systemEnvBlocklist contains common system/runtime env vars that are NOT user config.
var systemEnvBlocklist = map[string]bool{
	"PATH": true, "HOME": true, "USER": true, "SHELL": true, "TERM": true,
	"LANG": true, "LANGUAGE": true, "LC_ALL": true, "LC_CTYPE": true,
	"LC_MESSAGES": true, "LC_COLLATE": true, "LC_NUMERIC": true,
	"LOGNAME": true, "HOSTNAME": true, "HOSTTYPE": true, "OSTYPE": true,
	"MACHTYPE": true, "DISPLAY": true, "EDITOR": true, "VISUAL": true,
	"PAGER": true, "TMPDIR": true, "TMP": true, "TEMP": true,
	"XDG_CONFIG_HOME": true, "XDG_DATA_HOME": true, "XDG_CACHE_HOME": true,
	"XDG_RUNTIME_DIR": true, "XDG_SESSION_TYPE": true, "XDG_CURRENT_DESKTOP": true,
	"SHLVL": true, "PWD": true, "OLDPWD": true, "_": true, "COLORTERM": true,
	"LESS": true, "LESSOPEN": true, "LESSCLOSE": true, "MAIL": true, "MANPATH": true,
	"SSH_AUTH_SOCK": true, "SSH_AGENT_PID": true, "SSH_CONNECTION": true,
	"SSH_CLIENT": true, "SSH_TTY": true, "GPG_AGENT_INFO": true, "GPG_TTY": true,
	"VIRTUAL_ENV": true, "CONDA_DEFAULT_ENV": true, "CONDA_PREFIX": true,
	"GOPATH": true, "GOROOT": true, "GOBIN": true,
	"JAVA_HOME": true, "CLASSPATH": true,
	"NVM_DIR": true, "NVM_CD_FLAGS": true, "NVM_BIN": true, "NVM_INC": true,
	"SDKMAN_DIR": true, "PYENV_ROOT": true, "RBENV_ROOT": true,
	"RUSTUP_HOME": true, "CARGO_HOME": true,
	"DBUS_SESSION_BUS_ADDRESS": true, "WAYLAND_DISPLAY": true,
	"WINDOWID": true, "DESKTOP_SESSION": true, "SESSION_MANAGER": true,
	"GNOME_DESKTOP_SESSION_ID": true, "LS_COLORS": true, "LSCOLORS": true,
	"PS1": true, "PS2": true, "PS4": true, "PROMPT_COMMAND": true,
	"HISTFILE": true, "HISTSIZE": true, "HISTCONTROL": true, "HISTFILESIZE": true,
	"SAVEHIST": true, "ZDOTDIR": true, "FPATH": true,
	"SECURITYSESSIONID": true,
	"__CF_USER_TEXT_ENCODING": true, "__CFBundleIdentifier": true,
	"COMMAND_MODE": true, "MallocNanoZone": true,
}

var systemEnvPrefixes = []string{
	"npm_", "NPM_", "HOMEBREW_", "VSCODE_", "TERM_", "GIT_",
	"DOCKER_", "KUBERNETES_", "GITHUB_", "CI_",
	"COLORTERM_", "ITERM_", "LC_",
}

func isLikelySystemVar(key string) bool {
	if systemEnvBlocklist[key] {
		return true
	}
	for _, prefix := range systemEnvPrefixes {
		if strings.HasPrefix(key, prefix) {
			return true
		}
	}
	if key == "CI" {
		return true
	}
	return false
}

// loadEnvVars loads env vars (v1 compat — no blocklist).
func loadEnvVars(prefix string) map[string]any {
	return loadEnvVarsV2(prefix, true)
}

// loadEnvVarsV2 loads env vars with optional blocklist filtering.
func loadEnvVarsV2(prefix string, allowAll bool) map[string]any {
	result := make(map[string]any)
	pfx := ""
	if prefix != "" {
		pfx = strings.ToUpper(prefix) + "_"
	}

	for _, e := range os.Environ() {
		parts := strings.SplitN(e, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key, value := parts[0], parts[1]

		if pfx != "" {
			if !strings.HasPrefix(key, pfx) {
				continue
			}
			cleanKey := strings.ToLower(key[len(pfx):])
			setNested(result, cleanKey, Coerce(value))
		} else {
			if !allowAll && isLikelySystemVar(key) {
				continue
			}
			result[strings.ToLower(key)] = Coerce(value)
		}
	}

	return result
}

func setNested(data map[string]any, key string, value any) {
	parts := strings.Split(key, "_")
	current := data

	for _, part := range parts[:len(parts)-1] {
		if _, ok := current[part]; !ok {
			current[part] = make(map[string]any)
		}
		if m, ok := current[part].(map[string]any); ok {
			current = m
		} else {
			current[part] = make(map[string]any)
			current = current[part].(map[string]any)
		}
	}

	current[parts[len(parts)-1]] = value
}
