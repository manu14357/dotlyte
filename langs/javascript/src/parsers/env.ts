/**
 * Environment variables parser for DOTLYTE v2.
 *
 * Loads environment variables with optional prefix stripping,
 * nested key expansion (APP_DB_HOST → db.host), and pollution prevention.
 *
 * Without a prefix, only loads env vars whose keys match the DOTLYTE-recognized
 * naming patterns rather than dumping all system env vars into config.
 */

import { coerce } from "../coercion.js";

/**
 * Common system env vars that should NEVER leak into user config.
 * These are filtered out when no prefix is specified.
 */
const SYSTEM_ENV_BLOCKLIST = new Set([
  "PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LOGNAME", "PWD", "OLDPWD",
  "HOSTNAME", "SHLVL", "_", "COLORTERM", "DISPLAY", "EDITOR", "VISUAL",
  "TMPDIR", "TMP", "TEMP", "XDG_RUNTIME_DIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  "XDG_CACHE_HOME", "XDG_STATE_HOME", "LC_ALL", "LC_CTYPE", "MAIL",
  "MANPATH", "PAGER", "LESS", "LS_COLORS", "SSH_AUTH_SOCK", "SSH_AGENT_PID",
  "GPG_AGENT_INFO", "GNUPGHOME", "DBUS_SESSION_BUS_ADDRESS",
  "COMP_WORDBREAKS", "PS1", "PS2", "PS4", "PROMPT_COMMAND",
  "HISTFILE", "HISTSIZE", "HISTCONTROL", "HISTFILESIZE",
  // macOS specific
  "__CF_USER_TEXT_ENCODING", "COMMAND_MODE", "Apple_PubSub_Socket_Render",
  // Common build tool vars
  "npm_config_registry", "npm_lifecycle_event", "npm_package_name",
]);

export type EnvMode = "default" | "override";

export class EnvVarsParser {
  private readonly prefix: string | undefined;
  /** @internal Reserved for future priority-mode support. */
  readonly mode: EnvMode;
  private readonly allowAllEnvVars: boolean;

  /**
   * @param prefix — Strip this prefix from env vars (e.g., "APP" matches APP_DB_HOST → db.host)
   * @param mode   — "default" or "override". Affects priority in the loader layer stack.
   * @param allowAllEnvVars — When true and no prefix, load ALL env vars (v1 behavior). Default: false.
   */
  constructor(prefix?: string, mode: EnvMode = "default", allowAllEnvVars = false) {
    this.prefix = prefix ? `${prefix.toUpperCase()}_` : undefined;
    this.mode = mode;
    this.allowAllEnvVars = allowAllEnvVars;
  }

  parse(): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined) continue;

      if (this.prefix) {
        if (!key.startsWith(this.prefix)) continue;

        const cleanKey = key.slice(this.prefix.length).toLowerCase();
        setNested(result, cleanKey, coerce(value));
      } else {
        // Without prefix: filter out system env vars to prevent pollution
        if (!this.allowAllEnvVars && SYSTEM_ENV_BLOCKLIST.has(key)) continue;
        // Also skip vars that look like internal system vars (all caps with known prefixes)
        if (!this.allowAllEnvVars && isLikelySystemVar(key)) continue;

        result[key.toLowerCase()] = coerce(value);
      }
    }

    return result;
  }
}

/**
 * Heuristic to detect common system/tool env vars.
 * Vars starting with these prefixes are typically not user config.
 */
function isLikelySystemVar(key: string): boolean {
  const systemPrefixes = [
    "npm_", "YARN_", "PNPM_", "NVM_", "VOLTA_", "FNM_",
    "GOPATH", "GOROOT", "CARGO_", "RUSTUP_",
    "JAVA_HOME", "GRADLE_", "MAVEN_",
    "PYTHON", "VIRTUAL_ENV", "CONDA_",
    "RUBY", "GEM_", "BUNDLE_",
    "DOCKER_", "KUBERNETES_", "K8S_",
    "CI", "GITHUB_", "GITLAB_", "JENKINS_", "TRAVIS_", "CIRCLECI",
    "AWS_EXECUTION_ENV", "LAMBDA_",
    "VSCODE_", "TERM_PROGRAM",
    // Window manager / desktop
    "DESKTOP_SESSION", "WINDOWID", "WAYLAND_",
  ];
  return systemPrefixes.some((p) => key.startsWith(p));
}

function setNested(
  data: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  const parts = key.split("_");
  let current = data;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]!] = value;
}
