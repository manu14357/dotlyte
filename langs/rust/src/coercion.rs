//! Type coercion engine for DOTLYTE.

use serde_json::Value;

/// Auto-convert a JSON string value to the correct type.
///
/// Non-string values pass through unchanged.
pub fn coerce(value: Value) -> Value {
    match &value {
        Value::String(s) => coerce_str(s),
        _ => value,
    }
}

/// Coerce a string to the best-fit JSON value type.
pub fn coerce_str(s: &str) -> Value {
    let stripped = s.trim();
    let lower = stripped.to_lowercase();

    // Null
    match lower.as_str() {
        "null" | "none" | "nil" | "" => return Value::Null,
        _ => {}
    }

    // Boolean true
    match lower.as_str() {
        "true" | "yes" | "1" | "on" => return Value::Bool(true),
        _ => {}
    }

    // Boolean false
    match lower.as_str() {
        "false" | "no" | "0" | "off" => return Value::Bool(false),
        _ => {}
    }

    // Integer
    if let Ok(i) = stripped.parse::<i64>() {
        return Value::Number(i.into());
    }

    // Float (only if contains a dot)
    if stripped.contains('.') {
        if let Ok(f) = stripped.parse::<f64>() {
            if let Some(n) = serde_json::Number::from_f64(f) {
                return Value::Number(n);
            }
        }
    }

    // List (comma-separated)
    if stripped.contains(',') {
        let items: Vec<Value> = stripped
            .split(',')
            .map(|item| coerce_str(item.trim()))
            .collect();
        return Value::Array(items);
    }

    // String — return as-is
    Value::String(stripped.to_string())
}

/// Recursively coerce all string values in a JSON object.
pub fn coerce_object(data: Value) -> Value {
    match data {
        Value::Object(map) => {
            let coerced = map
                .into_iter()
                .map(|(k, v)| (k, coerce_object(v)))
                .collect();
            Value::Object(coerced)
        }
        Value::String(_) => coerce(data),
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_coerce_null() {
        assert_eq!(coerce_str("null"), Value::Null);
        assert_eq!(coerce_str("none"), Value::Null);
        assert_eq!(coerce_str("nil"), Value::Null);
        assert_eq!(coerce_str(""), Value::Null);
    }

    #[test]
    fn test_coerce_bool_true() {
        assert_eq!(coerce_str("true"), Value::Bool(true));
        assert_eq!(coerce_str("TRUE"), Value::Bool(true));
        assert_eq!(coerce_str("yes"), Value::Bool(true));
        assert_eq!(coerce_str("1"), Value::Bool(true));
        assert_eq!(coerce_str("on"), Value::Bool(true));
    }

    #[test]
    fn test_coerce_bool_false() {
        assert_eq!(coerce_str("false"), Value::Bool(false));
        assert_eq!(coerce_str("no"), Value::Bool(false));
        assert_eq!(coerce_str("0"), Value::Bool(false));
        assert_eq!(coerce_str("off"), Value::Bool(false));
    }

    #[test]
    fn test_coerce_int() {
        assert_eq!(coerce_str("8080"), json_num(8080));
    }

    #[test]
    fn test_coerce_float() {
        assert_eq!(coerce_str("3.14"), json_float(3.14));
    }

    #[test]
    fn test_coerce_list() {
        let result = coerce_str("a,b,c");
        assert_eq!(
            result,
            Value::Array(vec![
                Value::String("a".into()),
                Value::String("b".into()),
                Value::String("c".into()),
            ])
        );
    }

    #[test]
    fn test_coerce_passthrough() {
        assert_eq!(coerce(Value::Bool(true)), Value::Bool(true));
        assert_eq!(coerce(json_num(42)), json_num(42));
    }

    fn json_num(n: i64) -> Value {
        Value::Number(n.into())
    }

    fn json_float(f: f64) -> Value {
        Value::Number(serde_json::Number::from_f64(f).unwrap())
    }
}
