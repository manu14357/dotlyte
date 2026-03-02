//! Config object with typed access methods.

use serde_json::Value;

use crate::errors::DotlyteError;

/// Configuration object with dot-notation access.
#[derive(Debug, Clone)]
pub struct Config {
    data: serde_json::Map<String, Value>,
}

impl Config {
    /// Create a new Config from a JSON object map.
    pub fn new(data: serde_json::Map<String, Value>) -> Self {
        Self { data }
    }

    /// Safe access with an optional default.
    /// Supports dot-notation keys (e.g., "database.host").
    pub fn get<T: FromValue>(&self, key: &str) -> Option<T> {
        let value = self.get_value(key)?;
        T::from_value(value)
    }

    /// Get the raw JSON value for a key.
    /// Supports dot-notation (e.g., "database.host").
    pub fn get_value(&self, key: &str) -> Option<&Value> {
        let mut parts = key.split('.');

        // First part: look up directly in self.data
        let first = parts.next()?;
        let mut current = self.data.get(first)?;

        // Remaining parts: navigate nested objects
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

    /// Require a key — returns an error if missing.
    pub fn require(&self, key: &str) -> crate::Result<&Value> {
        self.get_value(key).ok_or_else(|| DotlyteError::MissingKey {
            key: key.to_string(),
        })
    }

    /// Check if a key exists.
    pub fn has(&self, key: &str) -> bool {
        self.get_value(key).is_some()
    }

    /// Convert to a serde_json Map.
    pub fn to_map(&self) -> &serde_json::Map<String, Value> {
        &self.data
    }

    /// Convert to a JSON Value.
    pub fn to_value(&self) -> Value {
        Value::Object(self.data.clone())
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
}
