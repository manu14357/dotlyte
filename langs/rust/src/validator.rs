//! Schema validation for DOTLYTE v2.

use std::collections::HashMap;

use regex::Regex;
use serde_json::Value;

use crate::errors::{SchemaViolation, DotlyteError};

/// A single schema rule for one config key.
#[derive(Debug, Clone, Default)]
pub struct SchemaRule {
    /// Expected type: "string", "number", "boolean", "array", "object"
    pub value_type: Option<String>,
    /// Whether the key must exist.
    pub required: bool,
    /// Built-in format: "url", "email", "ip", "ipv4", "ipv6", "port", "uuid", "date"
    pub format: Option<String>,
    /// Regex pattern for string values.
    pub pattern: Option<String>,
    /// Allowed values.
    pub enum_values: Option<Vec<Value>>,
    /// Minimum (for numbers).
    pub min: Option<f64>,
    /// Maximum (for numbers).
    pub max: Option<f64>,
    /// Default value if missing.
    pub default: Option<Value>,
    /// Marks key as containing secrets.
    pub sensitive: bool,
    /// Documentation string.
    pub doc: Option<String>,
}

/// Schema mapping keys to rules.
pub type DotlyteSchema = HashMap<String, SchemaRule>;

/// Validate config data against a schema.
pub fn validate_schema(
    data: &serde_json::Map<String, Value>,
    schema: &DotlyteSchema,
    strict: bool,
) -> Vec<SchemaViolation> {
    let mut violations = Vec::new();

    for (key, rule) in schema {
        let val = get_nested(data, key);

        if val.is_none() || val == Some(&Value::Null) {
            if rule.required {
                violations.push(SchemaViolation {
                    key: key.clone(),
                    message: format!("required key '{key}' is missing"),
                    rule: "required".to_string(),
                });
            }
            continue;
        }
        let val = val.unwrap();

        // Type check
        if let Some(ref expected) = rule.value_type {
            if !check_type(val, expected) {
                violations.push(SchemaViolation {
                    key: key.clone(),
                    message: format!("expected type '{expected}', got {}", value_type_name(val)),
                    rule: "type".to_string(),
                });
            }
        }

        // Format check
        if let Some(ref format) = rule.format {
            if let Some(s) = val.as_str() {
                if !check_format(s, format) {
                    violations.push(SchemaViolation {
                        key: key.clone(),
                        message: format!("value '{s}' does not match format '{format}'"),
                        rule: "format".to_string(),
                    });
                }
            }
        }

        // Pattern check
        if let Some(ref pattern) = rule.pattern {
            if let Some(s) = val.as_str() {
                if let Ok(re) = Regex::new(pattern) {
                    if !re.is_match(s) {
                        violations.push(SchemaViolation {
                            key: key.clone(),
                            message: format!("value '{s}' does not match pattern '{pattern}'"),
                            rule: "pattern".to_string(),
                        });
                    }
                }
            }
        }

        // Enum check
        if let Some(ref allowed) = rule.enum_values {
            if !allowed.contains(val) {
                violations.push(SchemaViolation {
                    key: key.clone(),
                    message: format!("value {val} not in allowed values: {allowed:?}"),
                    rule: "enum".to_string(),
                });
            }
        }

        // Min/Max checks
        if let Some(num) = val.as_f64() {
            if let Some(min) = rule.min {
                if num < min {
                    violations.push(SchemaViolation {
                        key: key.clone(),
                        message: format!("value {num} is less than minimum {min}"),
                        rule: "min".to_string(),
                    });
                }
            }
            if let Some(max) = rule.max {
                if num > max {
                    violations.push(SchemaViolation {
                        key: key.clone(),
                        message: format!("value {num} is greater than maximum {max}"),
                        rule: "max".to_string(),
                    });
                }
            }
        }
    }

    // Strict mode
    if strict {
        let flat = flatten_keys_json(data, "");
        for k in flat {
            if !schema.contains_key(&k) {
                violations.push(SchemaViolation {
                    key: k.clone(),
                    message: format!("unknown key '{k}' (strict mode)"),
                    rule: "strict".to_string(),
                });
            }
        }
    }

    violations
}

/// Apply schema defaults: fill in missing keys with defaults.
pub fn apply_schema_defaults(
    data: &mut serde_json::Map<String, Value>,
    schema: &DotlyteSchema,
) {
    for (key, rule) in schema {
        if let Some(ref default) = rule.default {
            if get_nested(data, key).is_none() {
                set_nested(data, key, default.clone());
            }
        }
    }
}

/// Get sensitive keys from schema.
pub fn get_sensitive_keys(schema: &DotlyteSchema) -> Vec<String> {
    schema
        .iter()
        .filter(|(_, rule)| rule.sensitive)
        .map(|(key, _)| key.clone())
        .collect()
}

/// Assert valid — returns error if violations exist.
pub fn assert_valid(
    data: &serde_json::Map<String, Value>,
    schema: &DotlyteSchema,
    strict: bool,
) -> crate::Result<()> {
    let violations = validate_schema(data, schema, strict);
    if violations.is_empty() {
        Ok(())
    } else {
        Err(DotlyteError::ValidationError { violations })
    }
}

fn get_nested<'a>(data: &'a serde_json::Map<String, Value>, key: &str) -> Option<&'a Value> {
    let parts: Vec<&str> = key.split('.').collect();
    if parts.is_empty() {
        return None;
    }
    let mut current: &Value = data.get(parts[0])?;
    for part in &parts[1..] {
        match current {
            Value::Object(map) => {
                current = map.get(*part)?;
            }
            _ => return None,
        }
    }
    Some(current)
}

fn set_nested(data: &mut serde_json::Map<String, Value>, key: &str, value: Value) {
    let parts: Vec<&str> = key.split('.').collect();
    if parts.len() == 1 {
        data.insert(parts[0].to_string(), value);
        return;
    }

    // Navigate/create intermediate objects as a Value tree
    let mut root = Value::Object(data.clone());
    {
        let mut current = &mut root;
        for part in &parts[..parts.len() - 1] {
            if !current.is_object() {
                *current = Value::Object(serde_json::Map::new());
            }
            let map = current.as_object_mut().unwrap();
            if !map.contains_key(*part) {
                map.insert(part.to_string(), Value::Object(serde_json::Map::new()));
            }
            current = map.get_mut(*part).unwrap();
        }
        if let Some(map) = current.as_object_mut() {
            map.insert(parts.last().unwrap().to_string(), value);
        }
    }
    if let Value::Object(map) = root {
        *data = map;
    }
}

fn flatten_keys_json(data: &serde_json::Map<String, Value>, prefix: &str) -> Vec<String> {
    let mut keys = Vec::new();
    for (k, v) in data {
        let full_key = if prefix.is_empty() {
            k.clone()
        } else {
            format!("{prefix}.{k}")
        };
        if let Value::Object(ref map) = v {
            keys.extend(flatten_keys_json(map, &full_key));
        } else {
            keys.push(full_key);
        }
    }
    keys
}

fn check_type(val: &Value, expected: &str) -> bool {
    match expected {
        "string" => val.is_string(),
        "number" => val.is_number(),
        "boolean" => val.is_boolean(),
        "array" => val.is_array(),
        "object" => val.is_object(),
        _ => true,
    }
}

fn value_type_name(val: &Value) -> &'static str {
    match val {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn check_format(val: &str, format: &str) -> bool {
    match format {
        "email" => {
            let re = Regex::new(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$").unwrap();
            re.is_match(val)
        }
        "url" => val.starts_with("http://") || val.starts_with("https://"),
        "ip" | "ipv4" => {
            val.split('.')
                .filter_map(|s| s.parse::<u8>().ok())
                .count()
                == 4
        }
        "ipv6" => val.contains(':') && val.len() > 2,
        "port" => val.parse::<u16>().map_or(false, |p| p >= 1),
        "uuid" => {
            let re =
                Regex::new(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
                    .unwrap();
            re.is_match(val)
        }
        "date" => {
            let re = Regex::new(r"^\d{4}-\d{2}-\d{2}$").unwrap();
            re.is_match(val)
        }
        _ => {
            // Treat as regex
            Regex::new(format).map_or(true, |re| re.is_match(val))
        }
    }
}
