//! Deep merge utility.

use serde_json::Value;

/// Deep merge two JSON object maps. Values in `override_map` take precedence.
pub fn deep_merge(
    base: serde_json::Map<String, Value>,
    override_map: serde_json::Map<String, Value>,
) -> serde_json::Map<String, Value> {
    let mut result = base;

    for (key, value) in override_map {
        if let Some(existing) = result.get(&key) {
            if let (Value::Object(base_obj), Value::Object(over_obj)) = (existing, &value) {
                let merged = deep_merge(base_obj.clone(), over_obj.clone());
                result.insert(key, Value::Object(merged));
                continue;
            }
        }
        result.insert(key, value);
    }

    result
}
