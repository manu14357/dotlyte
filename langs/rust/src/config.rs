//! Config object with typed access methods — DOTLYTE v2.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::errors::DotlyteError;
use crate::masking;
use crate::validator::{self, DotlyteSchema};

/// Immutable configuration object with dot-notation access.
#[derive(Debug, Clone)]
pub struct Config {
    data: serde_json::Map<String, Value>,
    sensitive_keys: HashSet<String>,
    schema: Option<DotlyteSchema>,
}

impl Config {
    /// Create a new Config from a JSON object map.
    pub fn new(data: serde_json::Map<String, Value>) -> Self {
        Self {
            data,
            sensitive_keys: HashSet::new(),
            schema: None,
        }
    }

    /// Set the schema on this config.
    pub fn with_schema(mut self, schema: DotlyteSchema) -> Self {
        let schema_sensitive = validator::get_sensitive_keys(&schema);
        for k in schema_sensitive {
            self.sensitive_keys.insert(k);
        }
        self.schema = Some(schema);
        self
    }

    /// Set explicit sensitive keys.
    pub fn with_sensitive_keys(mut self, keys: Vec<String>) -> Self {
        for k in keys {
            self.sensitive_keys.insert(k);
        }
        self
    }

    // ── Access methods ──────────────────────────────────────────

    /// Safe access with typed conversion.
    /// Supports dot-notation keys (e.g., "database.host").
    pub fn get<T: FromValue>(&self, key: &str) -> Option<T> {
        let value = self.get_value(key)?;
        T::from_value(value)
    }

    /// Get the raw JSON value for a key.
    pub fn get_value(&self, key: &str) -> Option<&Value> {
        let mut parts = key.split('.');
        let first = parts.next()?;
        let mut current = self.data.get(first)?;
        for part in parts {
            match current {
                Value::Object(map) => {
                    current = map.get(part)?;
                }
                _ => return None,
            }
        }
        Some(current)
    }

    /// Get a string value.
    pub fn get_str(&self, key: &str) -> Option<&str> {
        self.get_value(key).and_then(|v| v.as_str())
    }

    /// Require a single key — returns an error if missing.
    pub fn require(&self, key: &str) -> crate::Result<&Value> {
        self.get_value(key).ok_or_else(|| DotlyteError::MissingKey {
            key: key.to_string(),
            sources_checked: vec![],
        })
    }

    /// Require multiple keys at once. Returns all missing keys in one error.
    pub fn require_keys(&self, keys: &[&str]) -> crate::Result<()> {
        let missing: Vec<String> = keys
            .iter()
            .filter(|k| self.get_value(k).is_none())
            .map(|k| k.to_string())
            .collect();

        if missing.is_empty() {
            Ok(())
        } else {
            Err(DotlyteError::MissingKey {
                key: missing.join(", "),
                sources_checked: vec![],
            })
        }
    }

    /// Check if a key exists.
    pub fn has(&self, key: &str) -> bool {
        self.get_value(key).is_some()
    }

    // ── Introspection ───────────────────────────────────────────

    /// Get all keys as flat dot-notation paths.
    pub fn keys(&self) -> Vec<String> {
        flatten_keys(&self.data, "")
    }

    /// Convert to a serde_json Map (reference).
    pub fn to_map(&self) -> &serde_json::Map<String, Value> {
        &self.data
    }

    /// Convert to a JSON Value.
    pub fn to_value(&self) -> Value {
        Value::Object(self.data.clone())
    }

    /// Convert to flat `HashMap<String, String>`.
    pub fn to_flat_map(&self) -> std::collections::HashMap<String, String> {
        let mut out = std::collections::HashMap::new();
        flatten_to_string_map(&self.data, "", &mut out);
        out
    }

    /// Convert to JSON map with sensitive values redacted.
    pub fn to_map_redacted(&self) -> serde_json::Map<String, Value> {
        let all_sensitive = masking::build_sensitive_set(&self.data, &self.sensitive_keys.iter().cloned().collect::<Vec<_>>());
        masking::redact_map(&self.data, &all_sensitive)
    }

    /// Serialize to JSON string.
    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(&self.data).unwrap_or_default()
    }

    /// Write config to a file (json, yaml, toml).
    pub fn write_to(&self, filepath: &str) -> crate::Result<()> {
        let ext = Path::new(filepath)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("json");

        let content = match ext {
            "json" => serde_json::to_string_pretty(&self.data)
                .map_err(|e| DotlyteError::FileError {
                    file: filepath.to_string(),
                    message: format!("JSON serialization failed: {e}"),
                })?,
            #[cfg(feature = "yaml")]
            "yaml" | "yml" => serde_yaml::to_string(&self.data)
                .map_err(|e| DotlyteError::FileError {
                    file: filepath.to_string(),
                    message: format!("YAML serialization failed: {e}"),
                })?,
            #[cfg(feature = "toml-support")]
            "toml" => {
                let val = toml::Value::try_from(&self.data).map_err(|e| DotlyteError::FileError {
                    file: filepath.to_string(),
                    message: format!("TOML serialization failed: {e}"),
                })?;
                toml::to_string_pretty(&val).map_err(|e| DotlyteError::FileError {
                    file: filepath.to_string(),
                    message: format!("TOML serialization failed: {e}"),
                })?
            }
            _ => serde_json::to_string_pretty(&self.data)
                .map_err(|e| DotlyteError::FileError {
                    file: filepath.to_string(),
                    message: format!("JSON serialization failed: {e}"),
                })?,
        };

        fs::write(filepath, content)?;
        Ok(())
    }

    // ── Scoping ─────────────────────────────────────────────────

    /// Return a sub-Config scoped to a nested prefix.
    /// e.g., `config.scope("database")` returns just the database subtree.
    pub fn scope(&self, prefix: &str) -> Config {
        let val = self.get_value(prefix);
        match val {
            Some(Value::Object(map)) => Config {
                data: map.clone(),
                sensitive_keys: self
                    .sensitive_keys
                    .iter()
                    .filter_map(|k| k.strip_prefix(&format!("{prefix}.")))
                    .map(|k| k.to_string())
                    .collect(),
                schema: None,
            },
            _ => Config::new(serde_json::Map::new()),
        }
    }

    // ── Validation ──────────────────────────────────────────────

    /// Validate against attached schema. Returns violations (empty = valid).
    pub fn validate(&self) -> Vec<crate::errors::SchemaViolation> {
        match &self.schema {
            Some(schema) => validator::validate_schema(&self.data, schema, false),
            None => vec![],
        }
    }

    /// Assert config is valid — returns error if any violations.
    pub fn assert_valid(&self) -> crate::Result<()> {
        match &self.schema {
            Some(schema) => validator::assert_valid(&self.data, schema, false),
            None => Ok(()),
        }
    }
}

/// Trait for converting JSON values to Rust types.
pub trait FromValue: Sized {
    fn from_value(value: &Value) -> Option<Self>;
}

impl FromValue for i64 {
    fn from_value(value: &Value) -> Option<Self> {
        value.as_i64()
    }
}

impl FromValue for f64 {
    fn from_value(value: &Value) -> Option<Self> {
        value.as_f64()
    }
}

impl FromValue for bool {
    fn from_value(value: &Value) -> Option<Self> {
        value.as_bool()
    }
}

impl FromValue for String {
    fn from_value(value: &Value) -> Option<Self> {
        value.as_str().map(String::from)
    }
}

// ── Helpers ─────────────────────────────────────────────────────

fn flatten_keys(data: &serde_json::Map<String, Value>, prefix: &str) -> Vec<String> {
    let mut keys = Vec::new();
    for (k, v) in data {
        let full = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{prefix}.{k}")
        };
        if let Value::Object(ref map) = v {
            keys.extend(flatten_keys(map, &full));
        } else {
            keys.push(full);
        }
    }
    keys
}

fn flatten_to_string_map(
    data: &serde_json::Map<String, Value>,
    prefix: &str,
    out: &mut std::collections::HashMap<String, String>,
) {
    for (k, v) in data {
        let full = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{prefix}.{k}")
        };
        match v {
            Value::Object(ref map) => flatten_to_string_map(map, &full, out),
            Value::String(s) => {
                out.insert(full, s.clone());
            }
            Value::Null => {
                out.insert(full, String::new());
            }
            other => {
                out.insert(full, other.to_string());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> Config {
        let mut map = serde_json::Map::new();
        map.insert("port".into(), Value::Number(8080.into()));

        let mut db = serde_json::Map::new();
        db.insert("host".into(), Value::String("localhost".into()));
        db.insert("port".into(), Value::Number(5432.into()));
        map.insert("database".into(), Value::Object(db));

        Config::new(map)
    }

    #[test]
    fn test_get() {
        let config = test_config();
        assert_eq!(config.get::<i64>("port"), Some(8080));
    }

    #[test]
    fn test_get_nested() {
        let config = test_config();
        assert_eq!(config.get_str("database.host"), Some("localhost"));
    }

    #[test]
    fn test_get_missing() {
        let config = test_config();
        assert_eq!(config.get::<String>("missing"), None);
    }

    #[test]
    fn test_require_missing() {
        let config = test_config();
        assert!(config.require("missing").is_err());
    }

    #[test]
    fn test_has() {
        let config = test_config();
        assert!(config.has("port"));
        assert!(!config.has("missing"));
    }

    #[test]
    fn test_scope() {
        let config = test_config();
        let db = config.scope("database");
        assert_eq!(db.get_str("host"), Some("localhost"));
        assert_eq!(db.get::<i64>("port"), Some(5432));
    }

    #[test]
    fn test_keys() {
        let config = test_config();
        let keys = config.keys();
        assert!(keys.contains(&"port".to_string()));
        assert!(keys.contains(&"database.host".to_string()));
    }

    #[test]
    fn test_require_keys() {
        let config = test_config();
        assert!(config.require_keys(&["port", "database.host"]).is_ok());
        assert!(config.require_keys(&["port", "missing"]).is_err());
    }

    #[test]
    fn test_to_flat_map() {
        let config = test_config();
        let flat = config.to_flat_map();
        assert_eq!(flat.get("port"), Some(&"8080".to_string()));
        assert_eq!(flat.get("database.host"), Some(&"localhost".to_string()));
    }
}
