//! Environment variables parser.

use serde_json::Value;

use crate::coercion::coerce_str;

/// Load environment variables into a config map.
pub fn load_vars(prefix: Option<&str>) -> serde_json::Map<String, Value> {
    let mut result = serde_json::Map::new();
    let pfx = prefix.map(|p| format!("{}_", p.to_uppercase()));

    for (key, value) in std::env::vars() {
        if let Some(ref pfx) = pfx {
            if !key.starts_with(pfx.as_str()) {
                continue;
            }
            let clean_key = key[pfx.len()..].to_lowercase();
            set_nested(&mut result, &clean_key, coerce_str(&value));
        } else {
            result.insert(key.to_lowercase(), coerce_str(&value));
        }
    }

    result
}

fn set_nested(data: &mut serde_json::Map<String, Value>, key: &str, value: Value) {
    let parts: Vec<&str> = key.split('_').collect();

    if parts.len() == 1 {
        data.insert(parts[0].to_string(), value);
        return;
    }

    let first = parts[0];
    let rest = parts[1..].join("_");

    let entry = data
        .entry(first.to_string())
        .or_insert_with(|| Value::Object(serde_json::Map::new()));

    if let Value::Object(ref mut map) = entry {
        set_nested(map, &rest, value);
    }
}
