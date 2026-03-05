//! Integration tests for the typed config system.

use std::collections::HashMap;

use dotlyte::typed::{create_typed_config, FieldDescriptor, FieldType, TypedConfigOptions};
use serde_json::Value;

#[test]
fn test_create_typed_config_with_defaults() {
    let mut schema = HashMap::new();
    schema.insert(
        "PORT".to_string(),
        FieldDescriptor {
            field_type: FieldType::Integer,
            required: true,
            default_value: Some(Value::Number(3000.into())),
            ..Default::default()
        },
    );
    schema.insert(
        "APP_NAME".to_string(),
        FieldDescriptor {
            field_type: FieldType::String,
            required: true,
            default_value: Some(Value::String("my-app".to_string())),
            ..Default::default()
        },
    );

    let result = create_typed_config(&schema, None).unwrap();
    assert_eq!(result.get("PORT"), Some(&Value::Number(3000.into())));
    assert_eq!(
        result.get("APP_NAME"),
        Some(&Value::String("my-app".to_string()))
    );
}

#[test]
fn test_create_typed_config_missing_required() {
    let mut schema = HashMap::new();
    schema.insert(
        "REQUIRED_MISSING_VAR_XYZ".to_string(),
        FieldDescriptor {
            field_type: FieldType::String,
            required: true,
            ..Default::default()
        },
    );

    let result = create_typed_config(&schema, None);
    assert!(result.is_err());
}

#[test]
fn test_create_typed_config_optional_missing() {
    let mut schema = HashMap::new();
    schema.insert(
        "OPTIONAL_MISSING_VAR_XYZ".to_string(),
        FieldDescriptor {
            field_type: FieldType::String,
            required: false,
            ..Default::default()
        },
    );

    let result = create_typed_config(&schema, None).unwrap();
    // Optional missing key should not be present in results
    assert!(result.get("OPTIONAL_MISSING_VAR_XYZ").is_none());
}

#[test]
fn test_create_typed_config_skip_validation() {
    let mut schema = HashMap::new();
    schema.insert(
        "SKIP_VAL_MISSING_XYZ".to_string(),
        FieldDescriptor {
            field_type: FieldType::Integer,
            required: true,
            ..Default::default()
        },
    );

    let opts = TypedConfigOptions {
        skip_validation: true,
    };
    let result = create_typed_config(&schema, Some(opts)).unwrap();
    // Should not error even though required key is missing
    assert!(result.get("SKIP_VAL_MISSING_XYZ").is_none());
}

#[test]
fn test_create_typed_config_enum_validation() {
    // Set an env var for enum validation testing
    std::env::set_var("DOTLYTE_TEST_NODE_ENV", "production");

    let mut schema = HashMap::new();
    schema.insert(
        "DOTLYTE_TEST_NODE_ENV".to_string(),
        FieldDescriptor {
            field_type: FieldType::String,
            required: true,
            allowed_values: Some(vec![
                Value::String("development".to_string()),
                Value::String("production".to_string()),
                Value::String("test".to_string()),
            ]),
            ..Default::default()
        },
    );

    let result = create_typed_config(&schema, None).unwrap();
    assert_eq!(
        result.get("DOTLYTE_TEST_NODE_ENV"),
        Some(&Value::String("production".to_string()))
    );

    std::env::remove_var("DOTLYTE_TEST_NODE_ENV");
}

#[test]
fn test_create_typed_config_enum_invalid() {
    std::env::set_var("DOTLYTE_TEST_BAD_ENV", "staging");

    let mut schema = HashMap::new();
    schema.insert(
        "DOTLYTE_TEST_BAD_ENV".to_string(),
        FieldDescriptor {
            field_type: FieldType::String,
            required: true,
            allowed_values: Some(vec![
                Value::String("dev".to_string()),
                Value::String("prod".to_string()),
            ]),
            ..Default::default()
        },
    );

    let result = create_typed_config(&schema, None);
    assert!(result.is_err());

    std::env::remove_var("DOTLYTE_TEST_BAD_ENV");
}

#[test]
fn test_create_typed_config_boolean_from_env() {
    std::env::set_var("DOTLYTE_TEST_DEBUG", "yes");

    let mut schema = HashMap::new();
    schema.insert(
        "DOTLYTE_TEST_DEBUG".to_string(),
        FieldDescriptor {
            field_type: FieldType::Boolean,
            required: true,
            ..Default::default()
        },
    );

    let result = create_typed_config(&schema, None).unwrap();
    assert_eq!(
        result.get("DOTLYTE_TEST_DEBUG"),
        Some(&Value::Bool(true))
    );

    std::env::remove_var("DOTLYTE_TEST_DEBUG");
}

#[test]
fn test_create_typed_config_url_validation() {
    std::env::set_var("DOTLYTE_TEST_HOMEPAGE", "https://dotlyte.dev");

    let mut schema = HashMap::new();
    schema.insert(
        "DOTLYTE_TEST_HOMEPAGE".to_string(),
        FieldDescriptor {
            field_type: FieldType::Url,
            required: true,
            ..Default::default()
        },
    );

    let result = create_typed_config(&schema, None).unwrap();
    assert_eq!(
        result.get("DOTLYTE_TEST_HOMEPAGE"),
        Some(&Value::String("https://dotlyte.dev".to_string()))
    );

    std::env::remove_var("DOTLYTE_TEST_HOMEPAGE");
}

#[test]
fn test_create_typed_config_url_invalid() {
    std::env::set_var("DOTLYTE_TEST_BAD_URL", "not-a-url");

    let mut schema = HashMap::new();
    schema.insert(
        "DOTLYTE_TEST_BAD_URL".to_string(),
        FieldDescriptor {
            field_type: FieldType::Url,
            required: true,
            ..Default::default()
        },
    );

    let result = create_typed_config(&schema, None);
    assert!(result.is_err());

    std::env::remove_var("DOTLYTE_TEST_BAD_URL");
}

#[test]
fn test_create_typed_config_min_max_number() {
    std::env::set_var("DOTLYTE_TEST_PORT_RANGE", "8080");

    let mut schema = HashMap::new();
    schema.insert(
        "DOTLYTE_TEST_PORT_RANGE".to_string(),
        FieldDescriptor {
            field_type: FieldType::Integer,
            required: true,
            min: Some(1.0),
            max: Some(65535.0),
            ..Default::default()
        },
    );

    let result = create_typed_config(&schema, None).unwrap();
    assert_eq!(
        result.get("DOTLYTE_TEST_PORT_RANGE"),
        Some(&Value::Number(8080.into()))
    );

    std::env::remove_var("DOTLYTE_TEST_PORT_RANGE");
}
