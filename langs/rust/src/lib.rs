//! # DOTLYTE — The universal configuration library for Rust.
//!
//! One function call to load `.env`, YAML, JSON, TOML, environment variables,
//! and defaults with automatic type coercion and layered priority.
//!
//! ## v2 Features
//!
//! - **Schema validation** with type, required, format, enum, min/max, sensitive
//! - **Variable interpolation** (`${VAR}`, `${VAR:-default}`, `${VAR:?error}`)
//! - **AES-256-GCM encryption** (SOPS-style `ENC[aes-256-gcm,...]`)
//! - **Sensitive value masking** / auto-redaction
//! - **File watching** with polling-based change detection
//! - **Sub-config scoping**, batch require, flat map export
//! - **System env var blocklist** (skip PATH, HOME, etc.)
//!
//! ```no_run
//! use dotlyte::load;
//!
//! let config = load(None).unwrap();
//! let port: i64 = config.get("port").unwrap_or(3000);
//! let host: &str = config.get_str("database.host").unwrap_or("localhost");
//! ```

mod coercion;
mod config;
pub mod encryption;
mod errors;
pub mod interpolation;
mod loader;
pub mod masking;
mod merger;
mod parsers;
pub mod validator;
pub mod watcher;

pub use crate::coercion::{coerce, coerce_object};
pub use crate::config::{Config, FromValue};
pub use crate::encryption::{
    decrypt_value, encrypt_value, generate_key, is_encrypted, resolve_encryption_key,
};
pub use crate::errors::{DotlyteError, Result, SchemaViolation};
pub use crate::interpolation::interpolate;
pub use crate::loader::{load, LoadOptions, Source};
pub use crate::masking::{build_sensitive_set, format_redacted, redact_map, REDACTED};
pub use crate::validator::{
    apply_schema_defaults, assert_valid, get_sensitive_keys, validate_schema, DotlyteSchema,
    SchemaRule,
};
pub use crate::watcher::{ChangeEvent, ConfigWatcher};
