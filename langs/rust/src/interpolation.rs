//! Variable interpolation engine for DOTLYTE v2.
//!
//! Supports `${VAR}`, `${VAR:-default}`, `${VAR:?error}`, and `$$` escape.

use std::collections::{HashMap, HashSet};
use std::env;

use crate::errors::DotlyteError;

/// Interpolate `${VAR}` references in a flat string map.
///
/// Resolution order: same-file values → context → `std::env::var`.
/// Circular references produce an `InterpolationError`.
pub fn interpolate(
    data: &HashMap<String, String>,
    context: &HashMap<String, String>,
) -> crate::Result<HashMap<String, String>> {
    let mut resolved: HashMap<String, String> = HashMap::new();
    let mut resolving: HashSet<String> = HashSet::new();

    fn resolve(
        key: &str,
        data: &HashMap<String, String>,
        context: &HashMap<String, String>,
        resolved: &mut HashMap<String, String>,
        resolving: &mut HashSet<String>,
    ) -> crate::Result<String> {
        if let Some(val) = resolved.get(key) {
            return Ok(val.clone());
        }
        if resolving.contains(key) {
            return Err(DotlyteError::InterpolationError {
                variable: key.to_string(),
                message: format!("circular reference detected: {key}"),
            });
        }

        let raw = match data.get(key) {
            Some(r) => r.clone(),
            None => {
                if let Some(v) = context.get(key) {
                    return Ok(v.clone());
                }
                return Ok(env::var(key.to_uppercase()).unwrap_or_default());
            }
        };

        resolving.insert(key.to_string());
        let val = resolve_string(&raw, data, context, resolved, resolving)?;
        resolving.remove(key);
        resolved.insert(key.to_string(), val.clone());
        Ok(val)
    }

    let keys: Vec<String> = data.keys().cloned().collect();
    for key in &keys {
        resolve(key, data, context, &mut resolved, &mut resolving)?;
    }

    Ok(resolved)
}

fn resolve_string(
    s: &str,
    data: &HashMap<String, String>,
    context: &HashMap<String, String>,
    resolved: &mut HashMap<String, String>,
    resolving: &mut HashSet<String>,
) -> crate::Result<String> {
    let s = s.replace("$$", "\x00DOLLAR\x00");
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '$' && chars.peek() == Some(&'{') {
            chars.next(); // consume '{'
            let mut inner = String::new();
            let mut depth = 1;
            for ch in chars.by_ref() {
                if ch == '{' {
                    depth += 1;
                } else if ch == '}' {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
                inner.push(ch);
            }

            let replacement = resolve_reference(&inner, data, context, resolved, resolving)?;
            result.push_str(&replacement);
        } else {
            result.push(ch);
        }
    }

    Ok(result.replace("\x00DOLLAR\x00", "$"))
}

fn resolve_reference(
    inner: &str,
    data: &HashMap<String, String>,
    context: &HashMap<String, String>,
    resolved: &mut HashMap<String, String>,
    resolving: &mut HashSet<String>,
) -> crate::Result<String> {
    let (var_name, fallback, err_msg) = if let Some(idx) = inner.find(":?") {
        (&inner[..idx], None, Some(&inner[idx + 2..]))
    } else if let Some(idx) = inner.find(":-") {
        (&inner[..idx], Some(&inner[idx + 2..]), None)
    } else {
        (inner, None, None)
    };

    let var_name = var_name.trim();
    let lower = var_name.to_lowercase();

    // Try same-file
    if data.contains_key(&lower) {
        let val = resolve(var_name, data, context, resolved, resolving)?;
        if !val.is_empty() {
            return Ok(val);
        }
    }

    // Try context
    if let Some(v) = context.get(&lower) {
        if !v.is_empty() {
            return Ok(v.clone());
        }
    }

    // Try env
    if let Ok(v) = env::var(var_name) {
        if !v.is_empty() {
            return Ok(v);
        }
    }
    if let Ok(v) = env::var(var_name.to_uppercase()) {
        if !v.is_empty() {
            return Ok(v);
        }
    }

    // Not found
    if let Some(msg) = err_msg {
        return Err(DotlyteError::InterpolationError {
            variable: var_name.to_string(),
            message: format!("required variable '{var_name}': {msg}"),
        });
    }

    if let Some(fb) = fallback {
        return Ok(fb.to_string());
    }

    Ok(String::new())
}

fn resolve(
    key: &str,
    data: &HashMap<String, String>,
    context: &HashMap<String, String>,
    resolved: &mut HashMap<String, String>,
    resolving: &mut HashSet<String>,
) -> crate::Result<String> {
    let lower = key.to_lowercase();
    if let Some(val) = resolved.get(&lower) {
        return Ok(val.clone());
    }
    if resolving.contains(&lower) {
        return Err(DotlyteError::InterpolationError {
            variable: key.to_string(),
            message: format!("circular reference detected: {key}"),
        });
    }
    let raw = match data.get(&lower) {
        Some(r) => r.clone(),
        None => {
            if let Some(v) = context.get(&lower) {
                return Ok(v.clone());
            }
            return Ok(env::var(key.to_uppercase()).unwrap_or_default());
        }
    };
    resolving.insert(lower.clone());
    let val = resolve_string(&raw, data, context, resolved, resolving)?;
    resolving.remove(&lower);
    resolved.insert(lower, val.clone());
    Ok(val)
}
