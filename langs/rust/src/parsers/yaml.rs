//! YAML config file parser.

use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::errors::{DotlyteError, Result};
use crate::merger::deep_merge;

/// Load YAML config files in priority order.
#[cfg(feature = "yaml")]
pub fn load_files(env: Option<&str>) -> Result<serde_json::Map<String, Value>> {
    let mut candidates = vec!["config.yaml".to_string(), "config.yml".to_string()];
    if let Some(e) = env {
        candidates.push(format!("config.{e}.yaml"));
        candidates.push(format!("config.{e}.yml"));
    }

    let mut merged = serde_json::Map::new();
    for filename in &candidates {
        if Path::new(filename).exists() {
            let data = parse_file(filename)?;
            merged = deep_merge(merged, data);
        }
    }
    Ok(merged)
}

#[cfg(not(feature = "yaml"))]
pub fn load_files(_env: Option<&str>) -> Result<serde_json::Map<String, Value>> {
    Ok(serde_json::Map::new())
}

#[cfg(feature = "yaml")]
fn parse_file(filepath: &str) -> Result<serde_json::Map<String, Value>> {
    let content = fs::read_to_string(filepath)?;
    let value: Value = serde_yaml::from_str(&content).map_err(|e| DotlyteError::ParseError {
        file: filepath.to_string(),
        message: e.to_string(),
    })?;

    match value {
        Value::Object(map) => Ok(map),
        _ => Ok(serde_json::Map::new()),
    }
}
