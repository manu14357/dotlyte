//! AES-256-GCM encryption/decryption for DOTLYTE v2 (SOPS-style).
//!
//! Format: `ENC[aes-256-gcm,iv:<base64>,data:<base64>,tag:<base64>]`

use std::collections::HashMap;
use std::env;
use std::fs;

use crate::errors::DotlyteError;

/// Prefix for encrypted values.
pub const ENCRYPTED_PREFIX: &str = "ENC[";

/// Check whether a string looks like an encrypted SOPS-style value.
pub fn is_encrypted(value: &str) -> bool {
    value.starts_with(ENCRYPTED_PREFIX) && value.ends_with(']')
}

/// Generate a random 32-byte key, returned as hex.
#[cfg(feature = "encryption")]
pub fn generate_key() -> String {
    use aes_gcm::aead::OsRng;
    use aes_gcm::aead::rand_core::RngCore;
    let mut key = [0u8; 32];
    OsRng.fill_bytes(&mut key);
    hex::encode(key)
}

/// Encrypt a plaintext string.
#[cfg(feature = "encryption")]
pub fn encrypt_value(plaintext: &str, key_hex: &str) -> crate::Result<String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    use aes_gcm::aead::{Aead, OsRng};
    use aes_gcm::aead::rand_core::RngCore;
    use base64::{Engine, engine::general_purpose::STANDARD};

    let key_bytes = hex::decode(key_hex).map_err(|e| DotlyteError::DecryptionError {
        message: format!("invalid hex key: {e}"),
    })?;
    if key_bytes.len() != 32 {
        return Err(DotlyteError::DecryptionError {
            message: format!("key must be 32 bytes, got {}", key_bytes.len()),
        });
    }

    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| {
        DotlyteError::DecryptionError {
            message: format!("failed to create cipher: {e}"),
        }
    })?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).map_err(|e| {
        DotlyteError::DecryptionError {
            message: format!("encryption failed: {e}"),
        }
    })?;

    // ciphertext includes the tag appended by aes-gcm
    let data_len = ciphertext.len() - 16;
    let data = &ciphertext[..data_len];
    let tag = &ciphertext[data_len..];

    Ok(format!(
        "ENC[aes-256-gcm,iv:{},data:{},tag:{}]",
        STANDARD.encode(nonce_bytes),
        STANDARD.encode(data),
        STANDARD.encode(tag),
    ))
}

/// Decrypt an encrypted value string.
#[cfg(feature = "encryption")]
pub fn decrypt_value(encrypted: &str, key_hex: &str) -> crate::Result<String> {
    use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
    use aes_gcm::aead::Aead;
    use base64::{Engine, engine::general_purpose::STANDARD};

    let key_bytes = hex::decode(key_hex).map_err(|e| DotlyteError::DecryptionError {
        message: format!("invalid hex key: {e}"),
    })?;
    if key_bytes.len() != 32 {
        return Err(DotlyteError::DecryptionError {
            message: format!("key must be 32 bytes, got {}", key_bytes.len()),
        });
    }

    let inner = encrypted
        .strip_prefix("ENC[")
        .and_then(|s| s.strip_suffix(']'))
        .ok_or_else(|| DotlyteError::DecryptionError {
            message: "invalid encrypted format".to_string(),
        })?;

    let mut iv_b64 = None;
    let mut data_b64 = None;
    let mut tag_b64 = None;

    for part in inner.split(',') {
        let part = part.trim();
        if part.starts_with("iv:") {
            iv_b64 = Some(&part[3..]);
        } else if part.starts_with("data:") {
            data_b64 = Some(&part[5..]);
        } else if part.starts_with("tag:") {
            tag_b64 = Some(&part[4..]);
        }
    }

    let iv = STANDARD
        .decode(iv_b64.unwrap_or(""))
        .map_err(|e| DotlyteError::DecryptionError {
            message: format!("invalid IV base64: {e}"),
        })?;
    let data = STANDARD
        .decode(data_b64.unwrap_or(""))
        .map_err(|e| DotlyteError::DecryptionError {
            message: format!("invalid data base64: {e}"),
        })?;
    let tag = STANDARD
        .decode(tag_b64.unwrap_or(""))
        .map_err(|e| DotlyteError::DecryptionError {
            message: format!("invalid tag base64: {e}"),
        })?;

    if iv.len() != 12 {
        return Err(DotlyteError::DecryptionError {
            message: format!("IV must be 12 bytes, got {}", iv.len()),
        });
    }

    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| {
        DotlyteError::DecryptionError {
            message: format!("failed to create cipher: {e}"),
        }
    })?;

    let nonce = Nonce::from_slice(&iv);
    let mut combined = data;
    combined.extend_from_slice(&tag);

    let plaintext = cipher.decrypt(nonce, combined.as_ref()).map_err(|e| {
        DotlyteError::DecryptionError {
            message: format!("decryption failed: {e}"),
        }
    })?;

    String::from_utf8(plaintext).map_err(|e| DotlyteError::DecryptionError {
        message: format!("decrypted data is not valid UTF-8: {e}"),
    })
}

/// Decrypt all `ENC[...]` values in a map (recursively).
#[cfg(feature = "encryption")]
pub fn decrypt_map(
    data: &mut HashMap<String, String>,
    key_hex: &str,
) -> crate::Result<()> {
    for val in data.values_mut() {
        if is_encrypted(val) {
            *val = decrypt_value(val, key_hex)?;
        }
    }
    Ok(())
}

/// Resolve the encryption key from environment or key files.
///
/// Search order:
/// 1. `DOTLYTE_KEY_{ENV}` env var
/// 2. `DOTLYTE_KEY` env var
/// 3. `.dotlyte-keys` file in working directory (or root)
pub fn resolve_encryption_key(env_name: &str) -> Option<String> {
    // 1. DOTLYTE_KEY_{ENV}
    if !env_name.is_empty() {
        let var_name = format!("DOTLYTE_KEY_{}", env_name.to_uppercase());
        if let Ok(key) = env::var(&var_name) {
            if !key.is_empty() {
                return Some(key);
            }
        }
    }

    // 2. DOTLYTE_KEY
    if let Ok(key) = env::var("DOTLYTE_KEY") {
        if !key.is_empty() {
            return Some(key);
        }
    }

    // 3. .dotlyte-keys file
    if let Ok(content) = fs::read_to_string(".dotlyte-keys") {
        let line = content.lines().next().unwrap_or("").trim().to_string();
        if !line.is_empty() {
            return Some(line);
        }
    }

    None
}

/// Check if any value in a dotenv raw map is encrypted.
pub fn has_encrypted_values(data: &HashMap<String, String>) -> bool {
    data.values().any(|v| is_encrypted(v))
}

/// Derive a 32-byte AES key from a passphrase using scrypt.
#[cfg(feature = "encryption")]
pub fn derive_key(passphrase: &str, salt: &[u8]) -> crate::Result<Vec<u8>> {
    use scrypt::{scrypt, Params};
    let params = Params::new(15, 8, 1, 32).map_err(|e| DotlyteError::DecryptionError {
        message: format!("scrypt params error: {e}"),
    })?;
    let mut output = vec![0u8; 32];
    scrypt(passphrase.as_bytes(), salt, &params, &mut output).map_err(|e| {
        DotlyteError::DecryptionError {
            message: format!("scrypt derivation failed: {e}"),
        }
    })?;
    Ok(output)
}

// Stub implementations when encryption feature is disabled
#[cfg(not(feature = "encryption"))]
pub fn generate_key() -> String {
    panic!("dotlyte: encryption feature not enabled. Add `features = [\"encryption\"]` to Cargo.toml");
}

#[cfg(not(feature = "encryption"))]
pub fn encrypt_value(_plaintext: &str, _key_hex: &str) -> crate::Result<String> {
    Err(DotlyteError::DecryptionError {
        message: "encryption feature not enabled".to_string(),
    })
}

#[cfg(not(feature = "encryption"))]
pub fn decrypt_value(_encrypted: &str, _key_hex: &str) -> crate::Result<String> {
    Err(DotlyteError::DecryptionError {
        message: "encryption feature not enabled".to_string(),
    })
}

#[cfg(not(feature = "encryption"))]
pub fn decrypt_map(
    _data: &mut HashMap<String, String>,
    _key_hex: &str,
) -> crate::Result<()> {
    Err(DotlyteError::DecryptionError {
        message: "encryption feature not enabled".to_string(),
    })
}

#[cfg(not(feature = "encryption"))]
pub fn derive_key(_passphrase: &str, _salt: &[u8]) -> crate::Result<Vec<u8>> {
    Err(DotlyteError::DecryptionError {
        message: "encryption feature not enabled".to_string(),
    })
}
