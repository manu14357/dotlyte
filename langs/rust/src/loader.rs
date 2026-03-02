//! Main loader orchestrator.

use serde_json::Value;

use crate::config::Config;
use crate::errors::Result;
use crate::merger::deep_merge;
use crate::parsers;

/// Options for the load() function.
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
    /// Environment name.
    pub env: Option<String>,
}

/// Load configuration from all available sources with layered priority.
pub fn load(opts: Option<LoadOptions>) -> Result<Config> {
    let opts = opts.unwrap_or_default();
    let mut layers: Vec<serde_json::Map<String, Value>> = Vec::new();

    if let Some(ref sources) = opts.sources {
        for source in sources {
            if let Some(data) = load_source(source, &opts)? {
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
        append_if_non_empty(&mut layers, parsers::toml::load_files(opts.env.as_deref())?);
        append_if_non_empty(&mut layers, parsers::yaml::load_files(opts.env.as_deref())?);
        append_if_non_empty(&mut layers, parsers::json::load_files(opts.env.as_deref())?);
        append_if_non_empty(
            &mut layers,
            parsers::dotenv::load_files(opts.env.as_deref())?,
        );
        append_if_non_empty(&mut layers, parsers::env::load_vars(opts.prefix.as_deref()));
    }

    let mut merged = serde_json::Map::new();
    for layer in layers {
        merged = deep_merge(merged, layer);
    }

    Ok(Config::new(merged))
}

fn append_if_non_empty(
    layers: &mut Vec<serde_json::Map<String, Value>>,
    data: serde_json::Map<String, Value>,
) {
    if !data.is_empty() {
        layers.push(data);
    }
}

fn load_source(name: &str, opts: &LoadOptions) -> Result<Option<serde_json::Map<String, Value>>> {
    match name {
        "defaults" => Ok(opts.defaults.clone()),
        "toml" => Ok(Some(parsers::toml::load_files(opts.env.as_deref())?)),
        "yaml" => Ok(Some(parsers::yaml::load_files(opts.env.as_deref())?)),
        "json" => Ok(Some(parsers::json::load_files(opts.env.as_deref())?)),
        "dotenv" => Ok(Some(parsers::dotenv::load_files(opts.env.as_deref())?)),
        "env" => Ok(Some(parsers::env::load_vars(opts.prefix.as_deref()))),
        _ => Ok(None),
    }
}
