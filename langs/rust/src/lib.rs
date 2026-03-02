//! # DOTLYTE — The universal configuration library for Rust.
//!
//! One function call to load `.env`, YAML, JSON, TOML, environment variables,
//! and defaults with automatic type coercion and layered priority.
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
mod errors;
mod loader;
mod merger;
mod parsers;

pub use crate::coercion::{coerce, coerce_object};
pub use crate::config::Config;
pub use crate::errors::{DotlyteError, Result};
pub use crate::loader::{load, LoadOptions};
