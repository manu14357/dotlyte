//! Main loader orchestrator — DOTLYTE v2.

use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::config::Config;
use crate::errors::{DotlyteError, Result};
use crate::merger::deep_merge;
use crate::parsers;
use crate::validator::{self, DotlyteSchema};

/// A pluggable configuration source.
pub trait Source: Send + Sync {
    /// Human-readable name.
    fn name(&self) -> &str;
    /// Load data from this source.
    fn load(&self) -> Result<serde_json::Map<String, Value>>;
}

/// Options for the `load()` function.
#[derive(Debug, Default, Clone)]
pub struct LoadOptions {
    /// Explicit list of files to load.
    pub files: Option<Vec<String>>,
    /// Environment variable prefix to strip.
    pub prefix: Option<String>,
    /// Default values (lowest priority).
    pub defaults: Option<serde_json::Map<String, Value>>,
    /// Custom source order.
    pub sources: Option<Vec<String>>,
    /// Environment name (loads `config.{env}.yaml`, `.env.{env}`).
    pub env: Option<String>,
    /// Schema for validation.
    pub schema: Option<DotlyteSchema>,
    /// Strict mode (reject unknown keys).
    pub strict: bool,
    /// Whether to interpolate `${VAR}` references.
    pub interpolate_vars: bool,
    /// Override values (highest priority, above env vars).
    pub overrides: Option<serde_json::Map<String, Value>>,
    /// Enable debug logging.
    pub debug: bool,
    /// Walk up directories looking for config files.
    pub find_up: bool,
    /// Root markers to stop upward walking (e.g., ".git", "package.json").
    pub root_markers: Option<Vec<String>>,
    /// Working directory (defaults to ".").
    pub cwd: Option<String>,
    /// Include all env vars (skip blocklist).
    pub allow_all_env_vars: bool,
    /// Enable file watching.
    pub watch: bool,
    /// Debounce interval in ms for file watcher.
    pub debounce_ms: Option<u64>,
}

/// Load configuration from all available sources with layered priority.
pub fn load(opts: Option<LoadOptions>) -> Result<Config> {
    let opts = opts.unwrap_or_default();
    let base_dir = if opts.find_up {
        let markers = opts
            .root_markers
            .as_deref()
            .unwrap_or(&[]);
        let cwd = opts.cwd.as_deref().unwrap_or(".");
        find_base_dir(cwd, markers)
    } else {
        opts.cwd.clone().unwrap_or_else(|| ".".to_string())
    };

    if opts.debug {
        eprintln!("[dotlyte] base_dir={base_dir}");
    }

    // ── Explicit files mode ─────────────────────────────────────
    if let Some(ref files) = opts.files {
        let mut merged = serde_json::Map::new();
        if let Some(ref defaults) = opts.defaults {
            merged = deep_merge(merged, defaults.clone());
        }
        for filepath in files {
            let full = if Path::new(filepath).is_absolute() {
                PathBuf::from(filepath)
            } else {
                PathBuf::from(&base_dir).join(filepath)
            };
            if !full.exists() {
                return Err(DotlyteError::FileError {
                    file: filepath.clone(),
                    message: "file not found".to_string(),
                });
            }
            let data = parse_file_by_extension(full.to_str().unwrap_or(filepath))?;
            merged = deep_merge(merged, data);
        }
        append_env_and_overrides(&mut merged, &opts);
        return finish(merged, &opts);
    }

    // ── Auto-discovery mode ─────────────────────────────────────
    let mut layers: Vec<serde_json::Map<String, Value>> = Vec::new();

    if let Some(ref sources) = opts.sources {
        for source in sources {
            if let Some(data) = load_source(source, &opts, &base_dir)? {
                if !data.is_empty() {
                    layers.push(data);
                }
            }
        }
    } else {
        // Default priority stack (lowest to highest)
        if let Some(ref defaults) = opts.defaults {
            if !defaults.is_empty() {
                layers.push(defaults.clone());
            }
        }
        append_if_non_empty(&mut layers, load_toml(&opts, &base_dir)?);
        append_if_non_empty(&mut layers, load_yaml(&opts, &base_dir)?);
        append_if_non_empty(&mut layers, load_json(&opts, &base_dir)?);
        append_if_non_empty(&mut layers, load_dotenv(&opts, &base_dir)?);
        append_if_non_empty(
            &mut layers,
            parsers::env::load_vars_v2(opts.prefix.as_deref(), opts.allow_all_env_vars),
        );
    }

    let mut merged = serde_json::Map::new();
    for layer in layers {
        merged = deep_merge(merged, layer);
    }

    // Overrides
    if let Some(ref overrides) = opts.overrides {
        merged = deep_merge(merged, overrides.clone());
    }

    finish(merged, &opts)
}

// ── Post-processing ─────────────────────────────────────────────

fn finish(mut data: serde_json::Map<String, Value>, opts: &LoadOptions) -> Result<Config> {
    // Schema defaults
    if let Some(ref schema) = opts.schema {
        validator::apply_schema_defaults(&mut data, schema);
    }

    // Validation
    if let Some(ref schema) = opts.schema {
        let violations = validator::validate_schema(&data, schema, opts.strict);
        if !violations.is_empty() {
            return Err(DotlyteError::ValidationError { violations });
        }
    }

    let mut config = Config::new(data);
    if let Some(schema) = opts.schema.clone() {
        config = config.with_schema(schema);
    }
    Ok(config)
}

fn append_env_and_overrides(
    merged: &mut serde_json::Map<String, Value>,
    opts: &LoadOptions,
) {
    let env_data = parsers::env::load_vars_v2(opts.prefix.as_deref(), opts.allow_all_env_vars);
    if !env_data.is_empty() {
        *merged = deep_merge(merged.clone(), env_data);
    }
    if let Some(ref overrides) = opts.overrides {
        *merged = deep_merge(merged.clone(), overrides.clone());
    }
}

// ── Directory walking ───────────────────────────────────────────

fn find_base_dir(start: &str, markers: &[String]) -> String {
    let default_markers = [".git", "package.json", "Cargo.toml", "go.mod", "pyproject.toml"];
    let effective: Vec<&str> = if markers.is_empty() {
        default_markers.to_vec()
    } else {
        markers.iter().map(|s| s.as_str()).collect()
    };

    let mut dir = std::fs::canonicalize(start)
        .unwrap_or_else(|_| PathBuf::from(start));

    loop {
        for marker in &effective {
            if dir.join(marker).exists() {
                return dir.to_string_lossy().to_string();
            }
        }
        if !dir.pop() {
            break;
        }
    }

    start.to_string()
}

// ── File loading wrappers ───────────────────────────────────────

fn load_toml(opts: &LoadOptions, _base_dir: &str) -> Result<serde_json::Map<String, Value>> {
    parsers::toml::load_files(opts.env.as_deref())
}

fn load_yaml(opts: &LoadOptions, _base_dir: &str) -> Result<serde_json::Map<String, Value>> {
    parsers::yaml::load_files(opts.env.as_deref())
}

fn load_json(opts: &LoadOptions, _base_dir: &str) -> Result<serde_json::Map<String, Value>> {
    parsers::json::load_files(opts.env.as_deref())
}

fn load_dotenv(opts: &LoadOptions, _base_dir: &str) -> Result<serde_json::Map<String, Value>> {
    parsers::dotenv::load_files(opts.env.as_deref())
}

fn parse_file_by_extension(filepath: &str) -> Result<serde_json::Map<String, Value>> {
    let ext = Path::new(filepath)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    let content = std::fs::read_to_string(filepath)?;

    match ext {
        "json" => {
            let val: Value = serde_json::from_str(&content).map_err(|e| DotlyteError::ParseError {
                file: filepath.to_string(),
                message: e.to_string(),
            })?;
            match val {
                Value::Object(map) => Ok(map),
                _ => Err(DotlyteError::ParseError {
                    file: filepath.to_string(),
                    message: "expected JSON object at top level".to_string(),
                }),
            }
        }
        #[cfg(feature = "yaml")]
        "yaml" | "yml" => {
            let val: Value = serde_yaml::from_str(&content).map_err(|e| DotlyteError::ParseError {
                file: filepath.to_string(),
                message: e.to_string(),
            })?;
            match val {
                Value::Object(map) => Ok(map),
                _ => Err(DotlyteError::ParseError {
                    file: filepath.to_string(),
                    message: "expected YAML mapping at top level".to_string(),
                }),
            }
        }
        #[cfg(feature = "toml-support")]
        "toml" => {
            let table: toml::Table = toml::from_str(&content).map_err(|e| DotlyteError::ParseError {
                file: filepath.to_string(),
                message: e.to_string(),
            })?;
            let json_val = serde_json::to_value(table).map_err(|e| DotlyteError::ParseError {
                file: filepath.to_string(),
                message: e.to_string(),
            })?;
            match json_val {
                Value::Object(map) => Ok(map),
                _ => Err(DotlyteError::ParseError {
                    file: filepath.to_string(),
                    message: "expected TOML table at top level".to_string(),
                }),
            }
        }
        "env" | _ if filepath.contains(".env") => {
            // Treat as dotenv
            parsers::dotenv::parse_file_pub(filepath)
        }
        _ => Err(DotlyteError::FileError {
            file: filepath.to_string(),
            message: format!("unsupported file extension: {ext}"),
        }),
    }
}

fn append_if_non_empty(
    layers: &mut Vec<serde_json::Map<String, Value>>,
    data: serde_json::Map<String, Value>,
) {
    if !data.is_empty() {
        layers.push(data);
    }
}

fn load_source(
    name: &str,
    opts: &LoadOptions,
    base_dir: &str,
) -> Result<Option<serde_json::Map<String, Value>>> {
    match name {
        "defaults" => Ok(opts.defaults.clone()),
        "toml" => Ok(Some(load_toml(opts, base_dir)?)),
        "yaml" => Ok(Some(load_yaml(opts, base_dir)?)),
        "json" => Ok(Some(load_json(opts, base_dir)?)),
        "dotenv" => Ok(Some(load_dotenv(opts, base_dir)?)),
        "env" => Ok(Some(parsers::env::load_vars_v2(
            opts.prefix.as_deref(),
            opts.allow_all_env_vars,
        ))),
        _ => Ok(None),
    }
}
