using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace Dotlyte;

/// <summary>
/// AES-256-GCM encryption/decryption for DOTLYTE v2 (SOPS-style).
/// Format: ENC[aes-256-gcm,iv:base64,data:base64,tag:base64]
/// </summary>
public static class Encryption
{
    private const string Prefix = "ENC[";
    private const int KeyBytes = 32;
    private const int IvBytes = 12;
    private const int TagBytes = 16;

    /// <summary>
    /// Check whether a value is an encrypted SOPS-style string.
    /// </summary>
    public static bool IsEncrypted(object? value)
    {
        return value is string s
            && s.StartsWith(Prefix, StringComparison.Ordinal)
            && s.EndsWith(']');
    }

    /// <summary>
    /// Generate a random 32-byte key as a hex string.
    /// </summary>
    public static string GenerateKey()
    {
        var bytes = RandomNumberGenerator.GetBytes(KeyBytes);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }

    /// <summary>
    /// Encrypt a plaintext string with a hex-encoded 256-bit key.
    /// </summary>
    /// <exception cref="DotlyteException">Thrown on encryption failure.</exception>
    public static string EncryptValue(string plaintext, string keyHex)
    {
        var keyBytes = Convert.FromHexString(keyHex);
        if (keyBytes.Length != KeyBytes)
            throw new DotlyteException("Encryption key must be 32 bytes (64 hex chars)");

        var iv = RandomNumberGenerator.GetBytes(IvBytes);
        var plaintextBytes = Encoding.UTF8.GetBytes(plaintext);
        var ciphertext = new byte[plaintextBytes.Length];
        var tag = new byte[TagBytes];

        using var aes = new AesGcm(keyBytes, TagBytes);
        aes.Encrypt(iv, plaintextBytes, ciphertext, tag);

        var ivB64 = Convert.ToBase64String(iv);
        var dataB64 = Convert.ToBase64String(ciphertext);
        var tagB64 = Convert.ToBase64String(tag);

        return $"ENC[aes-256-gcm,iv:{ivB64},data:{dataB64},tag:{tagB64}]";
    }

    /// <summary>
    /// Decrypt a SOPS-style encrypted value.
    /// </summary>
    /// <exception cref="DecryptionException">Thrown on decryption failure.</exception>
    public static string DecryptValue(string encrypted, string keyHex)
    {
        var keyBytes = Convert.FromHexString(keyHex);
        if (keyBytes.Length != KeyBytes)
            throw new DecryptionException("Encryption key must be 32 bytes (64 hex chars)");

        var inner = encrypted;
        if (inner.StartsWith("ENC[", StringComparison.Ordinal) && inner.EndsWith(']'))
            inner = inner[4..^1];

        string? ivB64 = null, dataB64 = null, tagB64 = null;
        foreach (var part in inner.Split(','))
        {
            var trimmed = part.Trim();
            if (trimmed.StartsWith("iv:", StringComparison.Ordinal))
                ivB64 = trimmed[3..];
            else if (trimmed.StartsWith("data:", StringComparison.Ordinal))
                dataB64 = trimmed[5..];
            else if (trimmed.StartsWith("tag:", StringComparison.Ordinal))
                tagB64 = trimmed[4..];
        }

        if (ivB64 is null || dataB64 is null || tagB64 is null)
            throw new DecryptionException("Decryption failed: malformed ENC[] value");

        try
        {
            var iv = Convert.FromBase64String(ivB64);
            var ciphertext = Convert.FromBase64String(dataB64);
            var tag = Convert.FromBase64String(tagB64);
            var plaintext = new byte[ciphertext.Length];

            using var aes = new AesGcm(keyBytes, TagBytes);
            aes.Decrypt(iv, ciphertext, tag, plaintext);

            return Encoding.UTF8.GetString(plaintext);
        }
        catch (CryptographicException ex)
        {
            throw new DecryptionException(
                "Decryption failed: invalid key or corrupted data", null, ex);
        }
    }

    /// <summary>
    /// Decrypt all ENC[...] values in a dictionary (recursive).
    /// </summary>
    public static Dictionary<string, object?> DecryptDictionary(
        Dictionary<string, object?> data, string keyHex)
    {
        var result = new Dictionary<string, object?>();
        foreach (var (k, v) in data)
        {
            if (v is Dictionary<string, object?> nested)
                result[k] = DecryptDictionary(nested, keyHex);
            else if (IsEncrypted(v))
                result[k] = Coercion.Coerce(DecryptValue((string)v!, keyHex));
            else
                result[k] = v;
        }
        return result;
    }

    /// <summary>
    /// Resolve encryption key from environment / key file.
    /// </summary>
    public static string? ResolveEncryptionKey(string? envName = null)
    {
        if (!string.IsNullOrEmpty(envName))
        {
            var envSpecific = Environment.GetEnvironmentVariable(
                $"DOTLYTE_KEY_{envName.ToUpperInvariant()}");
            if (!string.IsNullOrEmpty(envSpecific))
                return envSpecific;
        }

        var globalKey = Environment.GetEnvironmentVariable("DOTLYTE_KEY");
        if (!string.IsNullOrEmpty(globalKey))
            return globalKey;

        const string keyFile = ".dotlyte-keys";
        if (File.Exists(keyFile))
        {
            var lines = File.ReadAllLines(keyFile);
            var first = lines.FirstOrDefault(l => !string.IsNullOrWhiteSpace(l));
            if (!string.IsNullOrEmpty(first))
                return first.Trim();
        }

        return null;
    }

    /// <summary>
    /// Re-encrypt all values from an old key to a new key.
    /// Only values matching the ENC[...] format are re-encrypted.
    /// </summary>
    /// <param name="data">Dictionary of potentially encrypted string values.</param>
    /// <param name="oldKey">The current encryption key (hex).</param>
    /// <param name="newKey">The new encryption key (hex).</param>
    /// <returns>A new dictionary with values re-encrypted under the new key.</returns>
    /// <exception cref="DotlyteException">Thrown on decryption or encryption failure.</exception>
    public static Dictionary<string, string> RotateKeys(
        Dictionary<string, string> data, string oldKey, string newKey)
    {
        var result = new Dictionary<string, string>();
        foreach (var (k, v) in data)
        {
            if (IsEncrypted(v))
            {
                var plaintext = DecryptValue(v, oldKey);
                result[k] = EncryptValue(plaintext, newKey);
            }
            else
            {
                result[k] = v;
            }
        }
        return result;
    }

    /// <summary>
    /// Attempt to decrypt a value using a list of candidate keys.
    /// Returns the decrypted value from the first key that succeeds, or <c>null</c> if none work.
    /// </summary>
    /// <param name="keys">Array of hex-encoded encryption keys to try.</param>
    /// <param name="encryptedValue">The ENC[...] encrypted value.</param>
    /// <returns>The decrypted plaintext, or <c>null</c> if no key succeeded.</returns>
    public static string? ResolveKeyWithFallback(string[] keys, string encryptedValue)
    {
        foreach (var key in keys)
        {
            try
            {
                return DecryptValue(encryptedValue, key);
            }
            catch (DotlyteException)
            {
                // Try next key
            }
        }
        return null;
    }

    /// <summary>
    /// Encrypt all values in a dictionary, optionally limited to sensitive keys only.
    /// </summary>
    /// <param name="data">The plaintext key-value pairs.</param>
    /// <param name="key">The hex-encoded encryption key.</param>
    /// <param name="sensitiveKeys">If provided, only these keys are encrypted; others pass through.</param>
    /// <returns>A new dictionary with encrypted values.</returns>
    public static Dictionary<string, string> EncryptVault(
        Dictionary<string, string> data, string key, HashSet<string>? sensitiveKeys = null)
    {
        var result = new Dictionary<string, string>();
        foreach (var (k, v) in data)
        {
            if (sensitiveKeys is null || sensitiveKeys.Contains(k))
            {
                result[k] = EncryptValue(v, key);
            }
            else
            {
                result[k] = v;
            }
        }
        return result;
    }

    /// <summary>
    /// Decrypt all ENC[...] values in a string dictionary.
    /// Non-encrypted values pass through unchanged.
    /// </summary>
    /// <param name="data">The dictionary with potentially encrypted values.</param>
    /// <param name="key">The hex-encoded encryption key.</param>
    /// <returns>A new dictionary with all values decrypted.</returns>
    /// <exception cref="DecryptionException">Thrown when a value cannot be decrypted.</exception>
    public static Dictionary<string, string> DecryptVault(
        Dictionary<string, string> data, string key)
    {
        var result = new Dictionary<string, string>();
        foreach (var (k, v) in data)
        {
            if (IsEncrypted(v))
            {
                result[k] = DecryptValue(v, key);
            }
            else
            {
                result[k] = v;
            }
        }
        return result;
    }
}
