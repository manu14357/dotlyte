//! TOML config file parser.

use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::errors::{DotlyteError, Result};
use crate::merger::deep_merge;

/// Load TOML config files in priority order.
#[cfg(feature = "toml-support")]
pub fn load_files(env: Option<&str>) -> Result<serde_json::Map<String, Value>> {
    let mut candidates = vec!["config.toml".to_string()];
    if let Some(e) = env {
        candidates.push(format!("config.{e}.toml"));
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

#[cfg(not(feature = "toml-support"))]
pub fn load_files(_env: Option<&str>) -> Result<serde_json::Map<String, Value>> {
    Ok(serde_json::Map::new())
}

#[cfg(feature = "toml-support")]
fn parse_file(filepath: &str) -> Result<serde_json::Map<String, Value>> {
    let content = fs::read_to_string(filepath)?;
    let toml_value: toml::Value =
        content
            .parse()
            .map_err(|e: toml::de::Error| DotlyteError::ParseError {
                file: filepath.to_string(),
                message: e.to_string(),
            })?;

    // Convert TOML value to serde_json value
    let json_str = serde_json::to_string(&toml_value).map_err(|e| DotlyteError::ParseError {
        file: filepath.to_string(),
        message: e.to_string(),
    })?;

    let value: Value = serde_json::from_str(&json_str).map_err(|e| DotlyteError::ParseError {
        file: filepath.to_string(),
        message: e.to_string(),
    })?;

    match value {
        Value::Object(map) => Ok(map),
        _ => Ok(serde_json::Map::new()),
    }
}
