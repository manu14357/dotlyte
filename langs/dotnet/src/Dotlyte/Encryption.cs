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
}
