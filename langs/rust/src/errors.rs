//! Error types for DOTLYTE v2.

use std::fmt;
use thiserror::Error;

/// All possible DOTLYTE errors.
#[derive(Error, Debug)]
pub enum DotlyteError {
    /// A required key was not found.
    #[error("Required config key '{key}' is missing.{}", format_sources(.sources_checked))]
    MissingKey {
        key: String,
        sources_checked: Vec<String>,
    },

    /// A config file has invalid syntax.
    #[error("Parse error in {file}: {message}")]
    ParseError { file: String, message: String },

    /// An explicitly specified file was not found or unreadable.
    #[error("File error for '{file}': {message}")]
    FileError { file: String, message: String },

    /// Schema validation failed.
    #[error("Schema validation failed with {} violation(s): {}", .violations.len(), format_violations(.violations))]
    ValidationError { violations: Vec<SchemaViolation> },

    /// Variable interpolation error.
    #[error("Interpolation error for '${{{{{}}}}}': {message}", .variable)]
    InterpolationError { variable: String, message: String },

    /// Decryption error.
    #[error("Decryption error: {message}")]
    DecryptionError { message: String },

    /// An I/O error occurred.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

/// A single schema validation failure.
#[derive(Debug, Clone)]
pub struct SchemaViolation {
    pub key: String,
    pub message: String,
    pub rule: String,
}

impl fmt::Display for SchemaViolation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {} ({})", self.key, self.message, self.rule)
    }
}

/// Result alias for DOTLYTE operations.
pub type Result<T> = std::result::Result<T, DotlyteError>;

fn format_sources(sources: &[String]) -> String {
    if sources.is_empty() {
        String::new()
    } else {
        format!(" Sources checked: {}", sources.join(", "))
    }
}

fn format_violations(violations: &[SchemaViolation]) -> String {
    violations
        .iter()
        .map(|v| v.to_string())
        .collect::<Vec<_>>()
        .join("; ")
}
