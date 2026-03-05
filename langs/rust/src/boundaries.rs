//! Server/client boundary enforcement for DOTLYTE v0.1.2.
//!
//! Provides structured access control so server-only secrets are never
//! accidentally exposed to client bundles.

use std::collections::{HashMap, HashSet};

use serde_json::Value;

use crate::errors::DotlyteError;

/// Configuration with server/client/shared boundary enforcement.
///
/// In Rust (always server-side), server keys are always accessible. This type
/// provides structured access control and boundary checking for configuration
/// values that should be segregated between server and client contexts.
#[derive(Debug, Clone)]
pub struct BoundaryConfig {
    data: HashMap<String, Value>,
    server_keys: HashSet<String>,
    client_keys: HashSet<String>,
    shared_keys: HashSet<String>,
}

impl BoundaryConfig {
    /// Create a new `BoundaryConfig` with the given data and key boundary sets.
    pub fn new(
        data: HashMap<String, Value>,
        server_keys: HashSet<String>,
        client_keys: HashSet<String>,
        shared_keys: HashSet<String>,
    ) -> Self {
        Self {
            data,
            server_keys,
            client_keys,
            shared_keys,
        }
    }

    /// Retrieve a configuration value by key, enforcing boundary checks.
    ///
    /// Returns `Err` if the key is not defined in any boundary section.
    /// Returns `Ok(None)` if the key is declared but has no value.
    pub fn get(&self, key: &str) -> crate::Result<Option<&Value>> {
        if !self.server_keys.contains(key)
            && !self.client_keys.contains(key)
            && !self.shared_keys.contains(key)
        {
            return Err(DotlyteError::MissingKey {
                key: key.to_string(),
                sources_checked: vec![
                    "server".to_string(),
                    "client".to_string(),
                    "shared".to_string(),
                ],
            });
        }
        Ok(self.data.get(key))
    }

    /// Return a map containing only server-designated and shared keys.
    pub fn server_only(&self) -> HashMap<String, Value> {
        let mut result = HashMap::new();
        for k in self.server_keys.iter().chain(self.shared_keys.iter()) {
            if let Some(v) = self.data.get(k) {
                result.insert(k.clone(), v.clone());
            }
        }
        result
    }

    /// Return a map containing only client-designated and shared keys.
    pub fn client_only(&self) -> HashMap<String, Value> {
        let mut result = HashMap::new();
        for k in self.client_keys.iter().chain(self.shared_keys.iter()) {
            if let Some(v) = self.data.get(k) {
                result.insert(k.clone(), v.clone());
            }
        }
        result
    }

    /// Returns `true` because Rust always runs on the server.
    pub fn is_server_context() -> bool {
        true
    }

    /// Returns `false` because Rust never runs in the browser.
    pub fn is_client_context() -> bool {
        false
    }

    /// Return all keys across all boundary sections.
    pub fn all_keys(&self) -> Vec<String> {
        let mut seen = HashSet::new();
        let mut keys = Vec::new();
        for k in self
            .server_keys
            .iter()
            .chain(self.client_keys.iter())
            .chain(self.shared_keys.iter())
        {
            if seen.insert(k.clone()) {
                keys.push(k.clone());
            }
        }
        keys
    }

    /// Check if a key belongs to the server boundary.
    pub fn is_server_key(&self, key: &str) -> bool {
        self.server_keys.contains(key)
    }

    /// Check if a key belongs to the client boundary.
    pub fn is_client_key(&self, key: &str) -> bool {
        self.client_keys.contains(key)
    }

    /// Check if a key belongs to the shared boundary.
    pub fn is_shared_key(&self, key: &str) -> bool {
        self.shared_keys.contains(key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_boundary() -> BoundaryConfig {
        let mut data = HashMap::new();
        data.insert(
            "DATABASE_URL".to_string(),
            Value::String("postgres://localhost/db".to_string()),
        );
        data.insert(
            "API_KEY".to_string(),
            Value::String("secret-key".to_string()),
        );
        data.insert(
            "APP_NAME".to_string(),
            Value::String("my-app".to_string()),
        );
        data.insert(
            "NEXT_PUBLIC_URL".to_string(),
            Value::String("https://example.com".to_string()),
        );

        let server_keys: HashSet<String> =
            ["DATABASE_URL", "API_KEY"].iter().map(|s| s.to_string()).collect();
        let client_keys: HashSet<String> =
            ["NEXT_PUBLIC_URL"].iter().map(|s| s.to_string()).collect();
        let shared_keys: HashSet<String> =
            ["APP_NAME"].iter().map(|s| s.to_string()).collect();

        BoundaryConfig::new(data, server_keys, client_keys, shared_keys)
    }

    #[test]
    fn test_get_server_key() {
        let bc = sample_boundary();
        let val = bc.get("DATABASE_URL").unwrap();
        assert_eq!(val.unwrap().as_str(), Some("postgres://localhost/db"));
    }

    #[test]
    fn test_get_unknown_key_error() {
        let bc = sample_boundary();
        assert!(bc.get("UNKNOWN_KEY").is_err());
    }

    #[test]
    fn test_server_only() {
        let bc = sample_boundary();
        let server = bc.server_only();
        assert!(server.contains_key("DATABASE_URL"));
        assert!(server.contains_key("API_KEY"));
        assert!(server.contains_key("APP_NAME")); // shared included
        assert!(!server.contains_key("NEXT_PUBLIC_URL"));
    }

    #[test]
    fn test_client_only() {
        let bc = sample_boundary();
        let client = bc.client_only();
        assert!(client.contains_key("NEXT_PUBLIC_URL"));
        assert!(client.contains_key("APP_NAME")); // shared included
        assert!(!client.contains_key("DATABASE_URL"));
    }

    #[test]
    fn test_is_server_context() {
        assert!(BoundaryConfig::is_server_context());
        assert!(!BoundaryConfig::is_client_context());
    }

    #[test]
    fn test_all_keys() {
        let bc = sample_boundary();
        let keys = bc.all_keys();
        assert_eq!(keys.len(), 4);
    }

    #[test]
    fn test_boundary_checks() {
        let bc = sample_boundary();
        assert!(bc.is_server_key("DATABASE_URL"));
        assert!(bc.is_client_key("NEXT_PUBLIC_URL"));
        assert!(bc.is_shared_key("APP_NAME"));
        assert!(!bc.is_server_key("NEXT_PUBLIC_URL"));
    }
}
