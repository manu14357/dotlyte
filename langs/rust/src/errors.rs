//! Error types for DOTLYTE.

use thiserror::Error;

/// All possible DOTLYTE errors.
#[derive(Error, Debug)]
pub enum DotlyteError {
    /// A required key was not found.
    #[error("Required config key '{key}' is missing. Set it in your .env file or as an environment variable.")]
    MissingKey { key: String },

    /// A config file has invalid syntax.
    #[error("Parse error in {file}: {message}")]
    ParseError { file: String, message: String },

    /// An I/O error occurred.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

/// Result alias for DOTLYTE operations.
pub type Result<T> = std::result::Result<T, DotlyteError>;
