//! .env file parser — DOTLYTE v2.
//!
//! Supports multiline double-quoted values, inline comments,
//! escape sequences (\n, \t, \\), `export` prefix, and raw mode.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::coercion::coerce_str;
use crate::errors::Result;
use crate::merger::deep_merge;

/// Load .env files in priority order (coerced values).
pub fn load_files(env: Option<&str>) -> Result<serde_json::Map<String, Value>> {
    let mut candidates = vec![".env".to_string()];
    if let Some(e) = env {
        candidates.push(format!(".env.{e}"));
    }
    candidates.push(".env.local".to_string());

    let mut merged = serde_json::Map::new();
    for filename in &candidates {
        if Path::new(filename).exists() {
            let data = parse_file_coerced(filename)?;
            merged = deep_merge(merged, data);
        }
    }
    Ok(merged)
}

/// Public helper for the loader to parse a single dotenv file.
pub fn parse_file_pub(filepath: &str) -> Result<serde_json::Map<String, Value>> {
    parse_file_coerced(filepath)
}

/// Parse a dotenv file returning raw string key/value pairs (no coercion).
pub fn parse_raw(filepath: &str) -> Result<HashMap<String, String>> {
    let content = fs::read_to_string(filepath)?;
    parse_raw_content(&content, filepath)
}

/// Parse raw dotenv content from a string.
pub fn parse_raw_content(content: &str, _source: &str) -> Result<HashMap<String, String>> {
    let mut result = HashMap::new();
    let lines: Vec<&str> = content.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim();

        // Skip empty lines and comments
        if line.is_empty() || line.starts_with('#') {
            i += 1;
            continue;
        }

        // Strip optional "export " prefix
        let line = if let Some(rest) = line.strip_prefix("export ") {
            rest.trim()
        } else {
            line
        };

        // Find the = sign
        let eq_idx = match line.find('=') {
            Some(idx) => idx,
            None => {
                i += 1;
                continue;
            }
        };

        let key = line[..eq_idx].trim().to_string();
        let mut value = line[eq_idx + 1..].trim().to_string();

        // Handle quoted values
        if value.starts_with('"') {
            // Double-quoted: support multiline and escape sequences
            value = value[1..].to_string(); // strip opening quote

            // Check for closing quote on same line
            if let Some(end_idx) = find_unescaped_quote(&value) {
                let raw = value[..end_idx].to_string();
                value = process_escapes(&raw);
            } else {
                // Multiline: collect until closing quote
                let mut multi = value.clone();
                i += 1;
                while i < lines.len() {
                    let next = lines[i];
                    if let Some(end_idx) = find_unescaped_quote(next) {
                        multi.push('\n');
                        multi.push_str(&next[..end_idx]);
                        break;
                    }
                    multi.push('\n');
                    multi.push_str(next);
                    i += 1;
                }
                value = process_escapes(&multi);
            }
        } else if value.starts_with('\'') {
            // Single-quoted: literal, no escape processing
            if value.len() >= 2 && value.ends_with('\'') {
                value = value[1..value.len() - 1].to_string();
            } else {
                value = value[1..].to_string();
            }
        } else {
            // Unquoted: strip inline comments
            if let Some(comment_idx) = find_inline_comment(&value) {
                value = value[..comment_idx].trim_end().to_string();
            }
        }

        result.insert(key.to_lowercase(), value);
        i += 1;
    }

    Ok(result)
}

fn parse_file_coerced(filepath: &str) -> Result<serde_json::Map<String, Value>> {
    let raw = parse_raw(filepath)?;
    let mut map = serde_json::Map::new();
    for (key, value) in raw {
        map.insert(key, coerce_str(&value));
    }
    Ok(map)
}

fn find_unescaped_quote(s: &str) -> Option<usize> {
    let mut escaped = false;
    for (i, ch) in s.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == '"' {
            return Some(i);
        }
    }
    None
}

fn find_inline_comment(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'#' && (i == 0 || bytes[i - 1] == b' ') {
            return Some(i);
        }
        i += 1;
    }
    None
}

fn process_escapes(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            match chars.next() {
                Some('n') => result.push('\n'),
                Some('t') => result.push('\t'),
                Some('\\') => result.push('\\'),
                Some('"') => result.push('"'),
                Some('r') => result.push('\r'),
                Some(other) => {
                    result.push('\\');
                    result.push(other);
                }
                None => result.push('\\'),
            }
        } else {
            result.push(ch);
        }
    }
    result
}
