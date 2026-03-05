//! Typed configuration with schema validation — DOTLYTE v0.1.2.
//!
//! Define field schemas with types, constraints, and defaults, then validate
//! environment variables and loaded config against that schema.

use std::collections::HashMap;
use std::fmt;

use serde_json::Value;

use crate::coercion::coerce_str;
use crate::errors::DotlyteError;

/// Field types supported by the typed config system.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FieldType {
    /// A UTF-8 string value.
    String,
    /// An integer value (i64).
    Integer,
    /// A floating-point number (f64).
    Number,
    /// A boolean value.
    Boolean,
    /// A URL string (must contain `://`).
    Url,
}

impl fmt::Display for FieldType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FieldType::String => write!(f, "string"),
            FieldType::Integer => write!(f, "integer"),
            FieldType::Number => write!(f, "number"),
            FieldType::Boolean => write!(f, "boolean"),
            FieldType::Url => write!(f, "url"),
        }
    }
}

/// A single field descriptor defining type, constraints, and metadata.
#[derive(Debug, Clone)]
pub struct FieldDescriptor {
    /// The expected field type.
    pub field_type: FieldType,
    /// Whether the field is required (default: `true`).
    pub required: bool,
    /// Fallback value when the field is missing.
    pub default_value: Option<Value>,
    /// Restrict values to this set.
    pub allowed_values: Option<Vec<Value>>,
    /// Minimum value (numbers) or minimum length (strings).
    pub min: Option<f64>,
    /// Maximum value (numbers) or maximum length (strings).
    pub max: Option<f64>,
    /// Marks the field as containing secret data.
    pub sensitive: bool,
    /// Human-readable description of the field.
    pub doc: Option<String>,
}

impl Default for FieldDescriptor {
    fn default() -> Self {
        Self {
            field_type: FieldType::String,
            required: true,
            default_value: None,
            allowed_values: None,
            min: None,
            max: None,
            sensitive: false,
            doc: None,
        }
    }
}

/// Options controlling `create_typed_config` behaviour.
#[derive(Debug, Clone, Default)]
pub struct TypedConfigOptions {
    /// When `true`, skip validation and return raw values.
    pub skip_validation: bool,
}

/// Create a validated, typed configuration map from environment variables and
/// loaded config, validated against `schema`.
///
/// Values are read from `std::env::var` (case-sensitive key first, then
/// upper-cased), then coerced to the declared [`FieldType`]. Constraints
/// (`required`, `allowed_values`, `min`, `max`) are checked unless
/// [`TypedConfigOptions::skip_validation`] is set.
///
/// # Errors
///
/// Returns [`DotlyteError::ValidationError`] when one or more fields fail
/// validation.
pub fn create_typed_config(
    schema: &HashMap<String, FieldDescriptor>,
    options: Option<TypedConfigOptions>,
) -> crate::Result<HashMap<String, Value>> {
    let opts = options.unwrap_or_default();

    let mut result = HashMap::with_capacity(schema.len());
    let mut errors: Vec<crate::errors::SchemaViolation> = Vec::new();

    for (key, desc) in schema {
        let raw = lookup_env_value(key);

        match validate_typed_field(key, raw.as_ref(), desc) {
            Ok(Some(val)) => {
                result.insert(key.clone(), val);
            }
            Ok(None) => {
                // optional and absent — skip
            }
            Err(e) => {
                if opts.skip_validation {
                    if let Some(r) = raw {
                        result.insert(key.clone(), r);
                    }
                } else {
                    errors.push(crate::errors::SchemaViolation {
                        key: key.clone(),
                        message: e.to_string(),
                        rule: "typed".to_string(),
                    });
                }
            }
        }
    }

    if !errors.is_empty() {
        return Err(DotlyteError::ValidationError { violations: errors });
    }

    Ok(result)
}

// ── Internal helpers ────────────────────────────────────────────

/// Look up a value from environment variables.
fn lookup_env_value(key: &str) -> Option<Value> {
    // Try exact key first
    if let Ok(v) = std::env::var(key) {
        if !v.is_empty() {
            return Some(coerce_str(&v));
        }
    }
    // Try upper-cased key
    let upper = key.to_uppercase();
    if upper != key {
        if let Ok(v) = std::env::var(&upper) {
            if !v.is_empty() {
                return Some(coerce_str(&v));
            }
        }
    }
    // Try lower-cased key
    let lower = key.to_lowercase();
    if lower != key && lower != upper {
        if let Ok(v) = std::env::var(&lower) {
            if !v.is_empty() {
                return Some(coerce_str(&v));
            }
        }
    }
    None
}

/// Validate and coerce a single field value.
fn validate_typed_field(
    key: &str,
    raw: Option<&Value>,
    desc: &FieldDescriptor,
) -> Result<Option<Value>, DotlyteError> {
    // Determine effective value
    let value = match raw {
        Some(v) if !is_empty_value(v) => v.clone(),
        _ => {
            if let Some(ref def) = desc.default_value {
                def.clone()
            } else if desc.required {
                let mut msg = format!("missing required config key '{key}'");
                if let Some(ref doc) = desc.doc {
                    msg.push_str(&format!(" ({doc})"));
                }
                msg.push_str(
                    ". Set it in your .env file, config file, or as an environment variable.",
                );
                return Err(DotlyteError::MissingKey {
                    key: key.to_string(),
                    sources_checked: vec!["env".to_string()],
                });
            } else {
                return Ok(None);
            }
        }
    };

    // Coerce to target type
    let coerced = coerce_to_type(key, &value, &desc.field_type)?;

    // Enum validation
    if let Some(ref allowed) = desc.allowed_values {
        let coerced_str = value_to_string(&coerced);
        let found = allowed.iter().any(|a| value_to_string(a) == coerced_str);
        if !found {
            return Err(DotlyteError::ValidationError {
                violations: vec![crate::errors::SchemaViolation {
                    key: key.to_string(),
                    message: format!(
                        "value {coerced} not in allowed values: {allowed:?}"
                    ),
                    rule: "enum".to_string(),
                }],
            });
        }
    }

    // Min/Max for numbers
    if let Some(num) = coerced.as_f64() {
        if let Some(min) = desc.min {
            if num < min {
                return Err(DotlyteError::ValidationError {
                    violations: vec![crate::errors::SchemaViolation {
                        key: key.to_string(),
                        message: format!("value {num} is below minimum {min}"),
                        rule: "min".to_string(),
                    }],
                });
            }
        }
        if let Some(max) = desc.max {
            if num > max {
                return Err(DotlyteError::ValidationError {
                    violations: vec![crate::errors::SchemaViolation {
                        key: key.to_string(),
                        message: format!("value {num} exceeds maximum {max}"),
                        rule: "max".to_string(),
                    }],
                });
            }
        }
    }

    // Min/Max for strings (length)
    if let Some(s) = coerced.as_str() {
        let len = s.len() as f64;
        if let Some(min) = desc.min {
            if len < min {
                return Err(DotlyteError::ValidationError {
                    violations: vec![crate::errors::SchemaViolation {
                        key: key.to_string(),
                        message: format!(
                            "string length {len} is below minimum {min}"
                        ),
                        rule: "min".to_string(),
                    }],
                });
            }
        }
        if let Some(max) = desc.max {
            if len > max {
                return Err(DotlyteError::ValidationError {
                    violations: vec![crate::errors::SchemaViolation {
                        key: key.to_string(),
                        message: format!(
                            "string length {len} exceeds maximum {max}"
                        ),
                        rule: "max".to_string(),
                    }],
                });
            }
        }
    }

    Ok(Some(coerced))
}

/// Coerce a `Value` to the target [`FieldType`].
fn coerce_to_type(key: &str, value: &Value, field_type: &FieldType) -> crate::Result<Value> {
    let str_value = value_to_string(value);

    match field_type {
        FieldType::Boolean => {
            if let Some(b) = value.as_bool() {
                return Ok(Value::Bool(b));
            }
            match str_value.to_lowercase().as_str() {
                "true" | "yes" | "1" | "on" => Ok(Value::Bool(true)),
                "false" | "no" | "0" | "off" => Ok(Value::Bool(false)),
                _ => Err(DotlyteError::ValidationError {
                    violations: vec![crate::errors::SchemaViolation {
                        key: key.to_string(),
                        message: format!("expected boolean, got '{str_value}'"),
                        rule: "type".to_string(),
                    }],
                }),
            }
        }
        FieldType::Integer => {
            if let Some(i) = value.as_i64() {
                return Ok(Value::Number(i.into()));
            }
            if let Some(f) = value.as_f64() {
                let i = f as i64;
                if (f - i as f64).abs() < f64::EPSILON {
                    return Ok(Value::Number(i.into()));
                }
            }
            match str_value.parse::<i64>() {
                Ok(i) => Ok(Value::Number(i.into())),
                Err(_) => Err(DotlyteError::ValidationError {
                    violations: vec![crate::errors::SchemaViolation {
                        key: key.to_string(),
                        message: format!("expected integer, got '{str_value}'"),
                        rule: "type".to_string(),
                    }],
                }),
            }
        }
        FieldType::Number => {
            if value.as_f64().is_some() {
                return Ok(value.clone());
            }
            if let Some(i) = value.as_i64() {
                if let Some(n) = serde_json::Number::from_f64(i as f64) {
                    return Ok(Value::Number(n));
                }
            }
            match str_value.parse::<f64>() {
                Ok(f) => match serde_json::Number::from_f64(f) {
                    Some(n) => Ok(Value::Number(n)),
                    None => Err(DotlyteError::ValidationError {
                        violations: vec![crate::errors::SchemaViolation {
                            key: key.to_string(),
                            message: format!("expected number, got '{str_value}'"),
                            rule: "type".to_string(),
                        }],
                    }),
                },
                Err(_) => Err(DotlyteError::ValidationError {
                    violations: vec![crate::errors::SchemaViolation {
                        key: key.to_string(),
                        message: format!("expected number, got '{str_value}'"),
                        rule: "type".to_string(),
                    }],
                }),
            }
        }
        FieldType::String => Ok(Value::String(str_value)),
        FieldType::Url => {
            if !str_value.contains("://") {
                return Err(DotlyteError::ValidationError {
                    violations: vec![crate::errors::SchemaViolation {
                        key: key.to_string(),
                        message: format!("'{str_value}' is not a valid URL"),
                        rule: "format".to_string(),
                    }],
                });
            }
            Ok(Value::String(str_value))
        }
    }
}

/// Convert a `Value` to its string representation.
fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

/// Check whether a value is considered empty.
fn is_empty_value(v: &Value) -> bool {
    match v {
        Value::Null => true,
        Value::String(s) => s.is_empty(),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_field_type_display() {
        assert_eq!(FieldType::String.to_string(), "string");
        assert_eq!(FieldType::Integer.to_string(), "integer");
        assert_eq!(FieldType::Boolean.to_string(), "boolean");
        assert_eq!(FieldType::Url.to_string(), "url");
    }

    #[test]
    fn test_coerce_boolean() {
        let val = Value::String("yes".to_string());
        let result = coerce_to_type("test", &val, &FieldType::Boolean).unwrap();
        assert_eq!(result, Value::Bool(true));

        let val = Value::String("off".to_string());
        let result = coerce_to_type("test", &val, &FieldType::Boolean).unwrap();
        assert_eq!(result, Value::Bool(false));
    }

    #[test]
    fn test_coerce_integer() {
        let val = Value::String("42".to_string());
        let result = coerce_to_type("test", &val, &FieldType::Integer).unwrap();
        assert_eq!(result, Value::Number(42.into()));
    }

    #[test]
    fn test_coerce_number() {
        let val = Value::String("3.14".to_string());
        let result = coerce_to_type("test", &val, &FieldType::Number).unwrap();
        assert_eq!(result.as_f64().unwrap(), 3.14);
    }

    #[test]
    fn test_coerce_url_valid() {
        let val = Value::String("https://example.com".to_string());
        let result = coerce_to_type("test", &val, &FieldType::Url).unwrap();
        assert_eq!(result, Value::String("https://example.com".to_string()));
    }

    #[test]
    fn test_coerce_url_invalid() {
        let val = Value::String("not-a-url".to_string());
        assert!(coerce_to_type("test", &val, &FieldType::Url).is_err());
    }

    #[test]
    fn test_validate_default_applied() {
        let desc = FieldDescriptor {
            field_type: FieldType::Integer,
            required: true,
            default_value: Some(Value::Number(3000.into())),
            ..Default::default()
        };
        let result = validate_typed_field("port", None, &desc).unwrap();
        assert_eq!(result, Some(Value::Number(3000.into())));
    }

    #[test]
    fn test_validate_required_missing() {
        let desc = FieldDescriptor {
            field_type: FieldType::String,
            required: true,
            ..Default::default()
        };
        assert!(validate_typed_field("missing", None, &desc).is_err());
    }

    #[test]
    fn test_validate_optional_missing() {
        let desc = FieldDescriptor {
            field_type: FieldType::String,
            required: false,
            ..Default::default()
        };
        let result = validate_typed_field("opt", None, &desc).unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn test_validate_enum() {
        let desc = FieldDescriptor {
            field_type: FieldType::String,
            required: true,
            allowed_values: Some(vec![
                Value::String("dev".to_string()),
                Value::String("prod".to_string()),
            ]),
            ..Default::default()
        };
        let val = Value::String("dev".to_string());
        assert!(validate_typed_field("env", Some(&val), &desc).is_ok());

        let val = Value::String("staging".to_string());
        assert!(validate_typed_field("env", Some(&val), &desc).is_err());
    }

    #[test]
    fn test_validate_min_max_number() {
        let desc = FieldDescriptor {
            field_type: FieldType::Integer,
            required: true,
            min: Some(1.0),
            max: Some(65535.0),
            ..Default::default()
        };
        let val = Value::Number(8080.into());
        assert!(validate_typed_field("port", Some(&val), &desc).is_ok());

        let val = Value::Number(0.into());
        assert!(validate_typed_field("port", Some(&val), &desc).is_err());

        let val = Value::Number(70000.into());
        assert!(validate_typed_field("port", Some(&val), &desc).is_err());
    }

    #[test]
    fn test_validate_min_max_string_length() {
        let desc = FieldDescriptor {
            field_type: FieldType::String,
            required: true,
            min: Some(3.0),
            max: Some(10.0),
            ..Default::default()
        };
        let val = Value::String("hello".to_string());
        assert!(validate_typed_field("name", Some(&val), &desc).is_ok());

        let val = Value::String("hi".to_string());
        assert!(validate_typed_field("name", Some(&val), &desc).is_err());
    }
}
