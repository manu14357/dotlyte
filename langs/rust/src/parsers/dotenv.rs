//! .env file parser.

use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::coercion::coerce_str;
use crate::errors::{DotlyteError, Result};
use crate::merger::deep_merge;

/// Load .env files in priority order.
pub fn load_files(env: Option<&str>) -> Result<serde_json::Map<String, Value>> {
    let mut candidates = vec![".env".to_string()];
    if let Some(e) = env {
        candidates.push(format!(".env.{e}"));
    }
    candidates.push(".env.local".to_string());

    let mut merged = serde_json::Map::new();
    for filename in &candidates {
        if Path::new(filename).exists() {
            let data = parse_file(filename)?;
            merged = deep_merge(merged, data);
        }
    }
    Ok(merged)
}

fn parse_file(filepath: &str) -> Result<serde_json::Map<String, Value>> {
    let content = fs::read_to_string(filepath)?;
    let mut result = serde_json::Map::new();

    for (line_num, line) in content.lines().enumerate() {
        let line = line.trim();

        // Skip empty lines and comments
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // Strip optional "export " prefix
        let line = if let Some(rest) = line.strip_prefix("export ") {
            rest.trim()
        } else {
            line
        };

        // Parse KEY=VALUE
        let eq_idx = line.find('=').ok_or_else(|| DotlyteError::ParseError {
            file: filepath.to_string(),
            message: format!(
                "expected KEY=VALUE at line {}, got: {:?}",
                line_num + 1,
                line
            ),
        })?;

        let key = line[..eq_idx].trim();
        let mut value = line[eq_idx + 1..].trim().to_string();

        // Remove surrounding quotes
        if value.len() >= 2 {
            let first = value.as_bytes()[0];
            let last = value.as_bytes()[value.len() - 1];
            if (first == b'"' || first == b'\'') && first == last {
                value = value[1..value.len() - 1].to_string();
            }
        }

        result.insert(key.to_lowercase(), coerce_str(&value));
    }

    Ok(result)
}
