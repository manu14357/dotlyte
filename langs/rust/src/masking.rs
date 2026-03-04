//! Sensitive value masking for DOTLYTE v2.

use std::collections::HashSet;

use regex::Regex;
use serde_json::Value;

/// The redaction replacement string.
pub const REDACTED: &str = "[REDACTED]";

/// Patterns that match common secret key names.
fn sensitive_patterns() -> Vec<Regex> {
    [
        r"(?i)password",
        r"(?i)secret",
        r"(?i)token",
        r"(?i)api[_\-]?key",
        r"(?i)private[_\-]?key",
        r"(?i)access[_\-]?key",
        r"(?i)auth",
        r"(?i)credential",
        r"(?i)connection[_\-]?string",
        r"(?i)dsn",
        r"(?i)encryption[_\-]?key",
        r"(?i)signing[_\-]?key",
        r"(?i)certificate",
    ]
    .iter()
    .filter_map(|p| Regex::new(p).ok())
    .collect()
}

/// Build the set of sensitive keys from auto-detection + schema declarations.
pub fn build_sensitive_set(
    data: &serde_json::Map<String, Value>,
    schema_keys: &[String],
) -> HashSet<String> {
    let mut set: HashSet<String> = schema_keys.iter().cloned().collect();
    let patterns = sensitive_patterns();
    let flat = flatten_keys(data, "");

    for key in flat {
        for pat in &patterns {
            if pat.is_match(&key) {
                set.insert(key.clone());
                break;
            }
        }
    }

    set
}

/// Redact sensitive values in a JSON map.
pub fn redact_map(
    data: &serde_json::Map<String, Value>,
    sensitive_keys: &HashSet<String>,
) -> serde_json::Map<String, Value> {
    redact_inner(data, sensitive_keys, "")
}

fn redact_inner(
    data: &serde_json::Map<String, Value>,
    sensitive_keys: &HashSet<String>,
    prefix: &str,
) -> serde_json::Map<String, Value> {
    let mut result = serde_json::Map::new();
    for (k, v) in data {
        let full_key = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{prefix}.{k}")
        };

        if sensitive_keys.contains(&full_key) {
            result.insert(k.clone(), Value::String(REDACTED.to_string()));
        } else if let Value::Object(ref map) = v {
            result.insert(k.clone(), Value::Object(redact_inner(map, sensitive_keys, &full_key)));
        } else {
            result.insert(k.clone(), v.clone());
        }
    }
    result
}

/// Partially show a value: first 2 chars visible, rest masked.
pub fn format_redacted(value: &str) -> String {
    if value.len() <= 4 {
        "*".repeat(value.len())
    } else {
        format!("{}{}", &value[..2], "*".repeat(value.len() - 2))
    }
}

fn flatten_keys(data: &serde_json::Map<String, Value>, prefix: &str) -> Vec<String> {
    let mut keys = Vec::new();
    for (k, v) in data {
        let full_key = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{prefix}.{k}")
        };
        if let Value::Object(ref map) = v {
            keys.extend(flatten_keys(map, &full_key));
        } else {
            keys.push(full_key);
        }
    }
    keys
}
