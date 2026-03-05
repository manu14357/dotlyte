//! Integration tests for the boundary config system.

use std::collections::{HashMap, HashSet};

use dotlyte::boundaries::BoundaryConfig;
use serde_json::Value;

fn sample_boundary() -> BoundaryConfig {
    let mut data = HashMap::new();
    data.insert(
        "DATABASE_URL".to_string(),
        Value::String("postgres://localhost/db".to_string()),
    );
    data.insert(
        "API_KEY".to_string(),
        Value::String("sk-secret".to_string()),
    );
    data.insert(
        "APP_NAME".to_string(),
        Value::String("my-app".to_string()),
    );
    data.insert(
        "NEXT_PUBLIC_URL".to_string(),
        Value::String("https://example.com".to_string()),
    );

    let server_keys: HashSet<String> = ["DATABASE_URL", "API_KEY"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let client_keys: HashSet<String> = ["NEXT_PUBLIC_URL"]
        .iter()
        .map(|s| s.to_string())
        .collect();
    let shared_keys: HashSet<String> = ["APP_NAME"]
        .iter()
        .map(|s| s.to_string())
        .collect();

    BoundaryConfig::new(data, server_keys, client_keys, shared_keys)
}

#[test]
fn test_get_valid_key() {
    let bc = sample_boundary();
    let val = bc.get("DATABASE_URL").unwrap();
    assert_eq!(
        val.unwrap().as_str(),
        Some("postgres://localhost/db")
    );
}

#[test]
fn test_get_client_key() {
    let bc = sample_boundary();
    let val = bc.get("NEXT_PUBLIC_URL").unwrap();
    assert_eq!(
        val.unwrap().as_str(),
        Some("https://example.com")
    );
}

#[test]
fn test_get_shared_key() {
    let bc = sample_boundary();
    let val = bc.get("APP_NAME").unwrap();
    assert_eq!(val.unwrap().as_str(), Some("my-app"));
}

#[test]
fn test_get_unknown_key_returns_error() {
    let bc = sample_boundary();
    assert!(bc.get("UNKNOWN_KEY").is_err());
}

#[test]
fn test_server_only_includes_server_and_shared() {
    let bc = sample_boundary();
    let server = bc.server_only();
    assert!(server.contains_key("DATABASE_URL"));
    assert!(server.contains_key("API_KEY"));
    assert!(server.contains_key("APP_NAME")); // shared
    assert!(!server.contains_key("NEXT_PUBLIC_URL"));
}

#[test]
fn test_client_only_includes_client_and_shared() {
    let bc = sample_boundary();
    let client = bc.client_only();
    assert!(client.contains_key("NEXT_PUBLIC_URL"));
    assert!(client.contains_key("APP_NAME")); // shared
    assert!(!client.contains_key("DATABASE_URL"));
    assert!(!client.contains_key("API_KEY"));
}

#[test]
fn test_is_server_context() {
    assert!(BoundaryConfig::is_server_context());
}

#[test]
fn test_is_client_context() {
    assert!(!BoundaryConfig::is_client_context());
}

#[test]
fn test_all_keys_count() {
    let bc = sample_boundary();
    let keys = bc.all_keys();
    assert_eq!(keys.len(), 4);
}

#[test]
fn test_boundary_key_classification() {
    let bc = sample_boundary();
    assert!(bc.is_server_key("DATABASE_URL"));
    assert!(bc.is_client_key("NEXT_PUBLIC_URL"));
    assert!(bc.is_shared_key("APP_NAME"));
    assert!(!bc.is_server_key("NEXT_PUBLIC_URL"));
    assert!(!bc.is_client_key("DATABASE_URL"));
}

#[test]
fn test_empty_boundary_config() {
    let bc = BoundaryConfig::new(
        HashMap::new(),
        HashSet::new(),
        HashSet::new(),
        HashSet::new(),
    );
    assert!(bc.all_keys().is_empty());
    assert!(bc.server_only().is_empty());
    assert!(bc.client_only().is_empty());
}
