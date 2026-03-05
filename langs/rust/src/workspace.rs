//! Monorepo workspace support for DOTLYTE v0.1.2.
//!
//! Detects monorepo roots (pnpm, npm, yarn, turbo, nx, lerna, Go workspaces),
//! loads shared `.env` files, and merges per-package overrides.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::coercion::coerce_str;
use crate::errors::DotlyteError;
use crate::merger::deep_merge;

/// Options for workspace loading.
#[derive(Debug, Clone, Default)]
pub struct WorkspaceOptions {
    /// Monorepo root directory. Auto-detected when `None`.
    pub root: Option<String>,
    /// Explicit list of sub-package paths relative to the root.
    pub packages: Option<Vec<String>>,
    /// Path to the shared `.env` file (defaults to root `.env`).
    pub shared_env_file: Option<String>,
    /// Environment variable prefix to strip.
    pub prefix: Option<String>,
    /// Environment name (e.g. `"production"`).
    pub env: Option<String>,
}

/// Describes a detected monorepo workspace.
#[derive(Debug, Clone)]
pub struct MonorepoInfo {
    /// Absolute path to the monorepo root.
    pub root: String,
    /// Monorepo tool type (e.g. `"pnpm"`, `"npm"`, `"turbo"`, `"go"`, `"unknown"`).
    pub monorepo_type: String,
    /// Detected workspace package paths.
    pub packages: Vec<String>,
}

/// Load configuration for every package in a monorepo workspace.
///
/// Returns a map of `package_path → config_data`. The root shared `.env` is
/// loaded first (lowest priority), then each package's `.env` files override.
///
/// # Errors
///
/// Returns a [`DotlyteError`] when the monorepo root cannot be found or a
/// package `.env` file fails to parse.
pub fn load_workspace(
    opts: WorkspaceOptions,
) -> crate::Result<HashMap<String, HashMap<String, Value>>> {
    let root = match opts.root {
        Some(ref r) => r.clone(),
        None => {
            let cwd = std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| ".".to_string());
            let info = find_monorepo_root(Some(&cwd))?;
            info.root
        }
    };

    // Load shared env
    let shared_data = get_shared_env(&root, opts.prefix.as_deref())?;

    // Determine packages
    let packages = match opts.packages {
        Some(ref p) if !p.is_empty() => p.clone(),
        _ => {
            let info = detect_monorepo_at(&root);
            info.map(|i| i.packages).unwrap_or_default()
        }
    };

    let mut result = HashMap::with_capacity(packages.len());

    for pkg in &packages {
        let pkg_dir = PathBuf::from(&root).join(pkg);
        let mut pkg_data = serde_json::Map::new();

        // Start with shared data
        for (k, v) in &shared_data {
            pkg_data.insert(k.clone(), v.clone());
        }

        // Load package-specific env files
        let env_files = resolve_env_files(&pkg_dir, opts.env.as_deref());
        for env_file in &env_files {
            if !Path::new(env_file).exists() {
                continue;
            }
            let data = parse_dotenv_file_coerced(env_file)?;
            pkg_data = deep_merge(pkg_data, data);
        }

        // Convert to HashMap
        let mut map = HashMap::new();
        for (k, v) in pkg_data {
            map.insert(k, v);
        }
        result.insert(pkg.clone(), map);
    }

    Ok(result)
}

/// Walk up directories from `cwd` looking for monorepo markers.
///
/// Recognised markers: `pnpm-workspace.yaml`, `turbo.json`, `nx.json`,
/// `lerna.json`, `go.work`, `package.json` with `workspaces` field.
///
/// # Errors
///
/// Returns a [`DotlyteError`] when no monorepo root is found.
pub fn find_monorepo_root(cwd: Option<&str>) -> crate::Result<MonorepoInfo> {
    let start = cwd.unwrap_or(".");
    let mut dir = fs::canonicalize(start).unwrap_or_else(|_| PathBuf::from(start));

    loop {
        let dir_str = dir.to_string_lossy().to_string();
        if let Some(info) = detect_monorepo_at(&dir_str) {
            return Ok(info);
        }
        if !dir.pop() {
            break;
        }
    }

    Err(DotlyteError::FileError {
        file: start.to_string(),
        message: format!(
            "no monorepo root found from '{}'. Looked for: pnpm-workspace.yaml, turbo.json, \
             nx.json, lerna.json, go.work, package.json with workspaces",
            start
        ),
    })
}

/// Read the root-level `.env` file and return its key-value pairs.
///
/// If `prefix` is provided, only keys matching that prefix are returned with
/// the prefix stripped and `UPPER_SNAKE` converted to `dot.notation`.
pub fn get_shared_env(
    root: &str,
    prefix: Option<&str>,
) -> crate::Result<HashMap<String, Value>> {
    let env_path = PathBuf::from(root).join(".env");
    if !env_path.exists() {
        return Ok(HashMap::new());
    }

    let data = parse_dotenv_file_coerced(env_path.to_str().unwrap_or(".env"))?;

    if prefix.is_none() || prefix == Some("") {
        return Ok(data.into_iter().collect());
    }

    let upper_prefix = prefix.unwrap().to_uppercase();
    let prefix_with_underscore = if upper_prefix.ends_with('_') {
        upper_prefix
    } else {
        format!("{upper_prefix}_")
    };

    let mut result = HashMap::new();
    for (k, v) in &data {
        let upper_key = k.to_uppercase();
        if upper_key.starts_with(&prefix_with_underscore) {
            let stripped = &k[prefix_with_underscore.len()..];
            let dot_key = stripped.to_lowercase().replace('_', ".");
            result.insert(dot_key, v.clone());
        }
    }

    Ok(result)
}

// ── Internal helpers ────────────────────────────────────────────

/// Detect monorepo type at the given directory.
fn detect_monorepo_at(dir: &str) -> Option<MonorepoInfo> {
    let dir_path = Path::new(dir);

    // pnpm workspaces
    let pnpm_path = dir_path.join("pnpm-workspace.yaml");
    if pnpm_path.exists() {
        return Some(MonorepoInfo {
            root: dir.to_string(),
            monorepo_type: "pnpm".to_string(),
            packages: extract_pnpm_workspaces(&pnpm_path),
        });
    }

    // Turbo
    if dir_path.join("turbo.json").exists() {
        return Some(MonorepoInfo {
            root: dir.to_string(),
            monorepo_type: "turbo".to_string(),
            packages: extract_package_json_workspaces(dir),
        });
    }

    // Nx
    if dir_path.join("nx.json").exists() {
        return Some(MonorepoInfo {
            root: dir.to_string(),
            monorepo_type: "nx".to_string(),
            packages: extract_package_json_workspaces(dir),
        });
    }

    // Lerna
    let lerna_path = dir_path.join("lerna.json");
    if lerna_path.exists() {
        return Some(MonorepoInfo {
            root: dir.to_string(),
            monorepo_type: "lerna".to_string(),
            packages: extract_lerna_packages(&lerna_path),
        });
    }

    // Go workspace
    let go_work_path = dir_path.join("go.work");
    if go_work_path.exists() {
        return Some(MonorepoInfo {
            root: dir.to_string(),
            monorepo_type: "go".to_string(),
            packages: extract_go_workspaces(&go_work_path),
        });
    }

    // npm/yarn workspaces (package.json with "workspaces")
    let pkg_path = dir_path.join("package.json");
    if pkg_path.exists() {
        if let Ok(content) = fs::read_to_string(&pkg_path) {
            if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                if pkg.get("workspaces").is_some() {
                    let ws_type = if dir_path.join("yarn.lock").exists() {
                        "yarn"
                    } else {
                        "npm"
                    };
                    return Some(MonorepoInfo {
                        root: dir.to_string(),
                        monorepo_type: ws_type.to_string(),
                        packages: extract_package_json_workspaces(dir),
                    });
                }
            }
        }
    }

    None
}

/// Resolve candidate `.env` file paths in a directory.
fn resolve_env_files(dir: &Path, env: Option<&str>) -> Vec<String> {
    let mut files = vec![
        dir.join(".env").to_string_lossy().to_string(),
        dir.join(".env.local").to_string_lossy().to_string(),
    ];
    if let Some(e) = env {
        files.push(dir.join(format!(".env.{e}")).to_string_lossy().to_string());
        files.push(
            dir.join(format!(".env.{e}.local"))
                .to_string_lossy()
                .to_string(),
        );
    }
    files
}

/// Parse a dotenv file into a coerced `serde_json::Map`.
fn parse_dotenv_file_coerced(filepath: &str) -> crate::Result<serde_json::Map<String, Value>> {
    let content = fs::read_to_string(filepath).map_err(|e| DotlyteError::FileError {
        file: filepath.to_string(),
        message: e.to_string(),
    })?;

    let mut result = serde_json::Map::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let line = line.strip_prefix("export ").unwrap_or(line).trim();
        if let Some(eq) = line.find('=') {
            let key = line[..eq].trim().to_string();
            let mut value = line[eq + 1..].trim().to_string();
            // Remove surrounding quotes
            if (value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\''))
            {
                value = value[1..value.len() - 1].to_string();
            }
            result.insert(key, coerce_str(&value));
        }
    }
    Ok(result)
}

/// Extract package paths from `pnpm-workspace.yaml`.
fn extract_pnpm_workspaces(path: &Path) -> Vec<String> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let mut packages = Vec::new();
    let mut in_packages = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "packages:" {
            in_packages = true;
            continue;
        }
        if in_packages {
            if let Some(rest) = trimmed.strip_prefix("- ") {
                let pkg = rest.trim().trim_matches(|c| c == '\'' || c == '"');
                packages.extend(expand_glob_dir(path.parent().unwrap_or(Path::new(".")), pkg));
            } else if !trimmed.is_empty() && !trimmed.starts_with('#') {
                break;
            }
        }
    }
    packages
}

/// Extract workspace paths from `package.json`.
fn extract_package_json_workspaces(dir: &str) -> Vec<String> {
    let pkg_path = Path::new(dir).join("package.json");
    let content = match fs::read_to_string(pkg_path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let pkg: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let ws = match pkg.get("workspaces") {
        Some(v) => v,
        None => return Vec::new(),
    };

    let patterns: Vec<String> = match ws {
        Value::Array(arr) => arr
            .iter()
            .filter_map(|v| v.as_str().map(String::from))
            .collect(),
        Value::Object(obj) => {
            // yarn format: { packages: [...] }
            if let Some(Value::Array(pkgs)) = obj.get("packages") {
                pkgs.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            } else {
                Vec::new()
            }
        }
        _ => Vec::new(),
    };

    let mut packages = Vec::new();
    for pattern in &patterns {
        packages.extend(expand_glob_dir(Path::new(dir), pattern));
    }
    packages
}

/// Extract package paths from `lerna.json`.
fn extract_lerna_packages(path: &Path) -> Vec<String> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let lerna: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let arr = match lerna.get("packages") {
        Some(Value::Array(a)) => a,
        _ => return Vec::new(),
    };

    let dir = path.parent().unwrap_or(Path::new("."));
    let mut packages = Vec::new();
    for v in arr {
        if let Some(s) = v.as_str() {
            packages.extend(expand_glob_dir(dir, s));
        }
    }
    packages
}

/// Extract workspace paths from `go.work`.
fn extract_go_workspaces(path: &Path) -> Vec<String> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let mut packages = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("use ") || trimmed.starts_with("./") {
            let pkg = trimmed.strip_prefix("use ").unwrap_or(trimmed).trim();
            if !pkg.is_empty() && pkg != "(" && pkg != ")" {
                packages.push(pkg.to_string());
            }
        }
    }
    packages
}

/// Expand a simple glob pattern within a base directory.
///
/// For patterns like `"packages/*"` or `"apps/*"`, lists matching
/// subdirectories. Non-glob patterns are returned as-is.
fn expand_glob_dir(base: &Path, pattern: &str) -> Vec<String> {
    let cleaned = pattern
        .trim_end_matches("/**")
        .trim_end_matches("/*");

    if !cleaned.contains('*') {
        return vec![cleaned.to_string()];
    }

    // Manual directory listing for simple `parent/*` patterns
    let parent_dir = base.join(
        cleaned
            .strip_suffix('*')
            .unwrap_or(cleaned)
            .trim_end_matches('/'),
    );

    let entries = match fs::read_dir(&parent_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut results = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Ok(rel) = path.strip_prefix(base) {
                results.push(rel.to_string_lossy().to_string());
            }
        }
    }
    results
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_env_files_no_env() {
        let dir = Path::new("/tmp/pkg");
        let files = resolve_env_files(dir, None);
        assert_eq!(files.len(), 2);
        assert!(files[0].ends_with(".env"));
        assert!(files[1].ends_with(".env.local"));
    }

    #[test]
    fn test_resolve_env_files_with_env() {
        let dir = Path::new("/tmp/pkg");
        let files = resolve_env_files(dir, Some("production"));
        assert_eq!(files.len(), 4);
        assert!(files[2].contains(".env.production"));
        assert!(files[3].contains(".env.production.local"));
    }

    #[test]
    fn test_expand_glob_dir_no_glob() {
        let result = expand_glob_dir(Path::new("/tmp"), "packages/core");
        assert_eq!(result, vec!["packages/core"]);
    }
}
