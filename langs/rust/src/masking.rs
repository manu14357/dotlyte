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

// ── v0.1.2 additions ────────────────────────────────────────────

/// Compile a list of glob/regex pattern strings into [`Regex`] objects.
///
/// # Errors
///
/// Returns [`DotlyteError::ValidationError`] if any pattern fails to compile.
pub fn compile_patterns(patterns: &[String]) -> Result<Vec<Regex>, crate::errors::DotlyteError> {
    let mut compiled = Vec::with_capacity(patterns.len());
    for pattern in patterns {
        let re = Regex::new(pattern).map_err(|e| crate::errors::DotlyteError::ValidationError {
            violations: vec![crate::errors::SchemaViolation {
                key: pattern.clone(),
                message: format!("invalid regex pattern: {e}"),
                rule: "pattern".to_string(),
            }],
        })?;
        compiled.push(re);
    }
    Ok(compiled)
}

/// Build a set of sensitive key names by combining explicit keys, pattern
/// matches against all available keys, and schema-declared sensitive keys.
///
/// # Errors
///
/// Returns an error if any pattern in `patterns` fails to compile.
pub fn build_sensitive_set_with_patterns(
    keys: &[String],
    patterns: &[String],
    schema_sensitive: &HashSet<String>,
) -> Result<HashSet<String>, crate::errors::DotlyteError> {
    let mut set: HashSet<String> = schema_sensitive.clone();

    let compiled = compile_patterns(patterns)?;
    for key in keys {
        for re in &compiled {
            if re.is_match(key) {
                set.insert(key.clone());
                break;
            }
        }
    }

    Ok(set)
}

/// Check whether a key is in the sensitive set.
///
/// This is a simple lookup utility — Rust does not have runtime proxies,
/// so callers can use this to implement their own access tracking.
pub fn check_sensitive_access(key: &str, sensitive_keys: &HashSet<String>) -> bool {
    sensitive_keys.contains(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compile_patterns() {
        let patterns = vec!["(?i)password".to_string(), "(?i)secret".to_string()];
        let compiled = compile_patterns(&patterns).unwrap();
        assert_eq!(compiled.len(), 2);
        assert!(compiled[0].is_match("my_password"));
        assert!(compiled[1].is_match("SECRET_TOKEN"));
    }

    #[test]
    fn test_compile_invalid_pattern() {
        let patterns = vec!["[invalid".to_string()];
        assert!(compile_patterns(&patterns).is_err());
    }

    #[test]
    fn test_build_sensitive_set_with_patterns() {
        let keys = vec![
            "database_password".to_string(),
            "api_key".to_string(),
            "port".to_string(),
            "host".to_string(),
        ];
        let patterns = vec!["(?i)password".to_string(), "(?i)key".to_string()];
        let schema: HashSet<String> = HashSet::new();

        let result = build_sensitive_set_with_patterns(&keys, &patterns, &schema).unwrap();
        assert!(result.contains("database_password"));
        assert!(result.contains("api_key"));
        assert!(!result.contains("port"));
    }

    #[test]
    fn test_check_sensitive_access() {
        let mut set = HashSet::new();
        set.insert("secret".to_string());
        assert!(check_sensitive_access("secret", &set));
        assert!(!check_sensitive_access("public", &set));
    }
}
