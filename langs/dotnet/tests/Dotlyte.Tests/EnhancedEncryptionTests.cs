using Xunit;

namespace Dotlyte.Tests;

public class EnhancedEncryptionTests
{
    [Fact]
    public void RotateKeysReEncryptsValues()
    {
        var oldKey = Encryption.GenerateKey();
        var newKey = Encryption.GenerateKey();

        var data = new Dictionary<string, string>
        {
            ["secret"] = Encryption.EncryptValue("my-password", oldKey),
            ["plain"] = "not-encrypted",
        };

        var rotated = Encryption.RotateKeys(data, oldKey, newKey);

        // Encrypted value should be re-encrypted
        Assert.True(Encryption.IsEncrypted(rotated["secret"]));
        Assert.Equal("my-password", Encryption.DecryptValue(rotated["secret"], newKey));

        // Old key should not decrypt new value
        Assert.Throws<DecryptionException>(() =>
            Encryption.DecryptValue(rotated["secret"], oldKey));

        // Plain value passes through
        Assert.Equal("not-encrypted", rotated["plain"]);
    }

    [Fact]
    public void RotateKeysPreservesAllKeys()
    {
        var oldKey = Encryption.GenerateKey();
        var newKey = Encryption.GenerateKey();

        var data = new Dictionary<string, string>
        {
            ["a"] = Encryption.EncryptValue("val-a", oldKey),
            ["b"] = "plain-b",
            ["c"] = Encryption.EncryptValue("val-c", oldKey),
        };

        var rotated = Encryption.RotateKeys(data, oldKey, newKey);
        Assert.Equal(3, rotated.Count);
        Assert.Equal("val-a", Encryption.DecryptValue(rotated["a"], newKey));
        Assert.Equal("plain-b", rotated["b"]);
        Assert.Equal("val-c", Encryption.DecryptValue(rotated["c"], newKey));
    }

    [Fact]
    public void ResolveKeyWithFallbackFindsCorrectKey()
    {
        var key1 = Encryption.GenerateKey();
        var key2 = Encryption.GenerateKey();
        var key3 = Encryption.GenerateKey();

        var encrypted = Encryption.EncryptValue("secret-value", key2);

        var result = Encryption.ResolveKeyWithFallback(
            [key1, key2, key3], encrypted);

        Assert.Equal("secret-value", result);
    }

    [Fact]
    public void ResolveKeyWithFallbackReturnsNullWhenNoKeyWorks()
    {
        var key1 = Encryption.GenerateKey();
        var key2 = Encryption.GenerateKey();
        var encryptKey = Encryption.GenerateKey();

        var encrypted = Encryption.EncryptValue("secret", encryptKey);

        var result = Encryption.ResolveKeyWithFallback(
            [key1, key2], encrypted);

        Assert.Null(result);
    }

    [Fact]
    public void ResolveKeyWithFallbackFirstKeyWins()
    {
        var key = Encryption.GenerateKey();
        var encrypted = Encryption.EncryptValue("hello", key);

        // Same key appears twice — first should win
        var result = Encryption.ResolveKeyWithFallback(
            [key, key], encrypted);

        Assert.Equal("hello", result);
    }

    [Fact]
    public void EncryptVaultEncryptsAllValues()
    {
        var key = Encryption.GenerateKey();
        var data = new Dictionary<string, string>
        {
            ["password"] = "secret123",
            ["token"] = "tok-abc",
        };

        var vault = Encryption.EncryptVault(data, key);

        Assert.True(Encryption.IsEncrypted(vault["password"]));
        Assert.True(Encryption.IsEncrypted(vault["token"]));
        Assert.Equal("secret123", Encryption.DecryptValue(vault["password"], key));
        Assert.Equal("tok-abc", Encryption.DecryptValue(vault["token"], key));
    }

    [Fact]
    public void EncryptVaultSelectiveEncryption()
    {
        var key = Encryption.GenerateKey();
        var data = new Dictionary<string, string>
        {
            ["password"] = "secret123",
            ["host"] = "localhost",
            ["token"] = "tok-abc",
        };

        var sensitiveKeys = new HashSet<string> { "password", "token" };
        var vault = Encryption.EncryptVault(data, key, sensitiveKeys);

        Assert.True(Encryption.IsEncrypted(vault["password"]));
        Assert.True(Encryption.IsEncrypted(vault["token"]));
        Assert.Equal("localhost", vault["host"]); // not encrypted
    }

    [Fact]
    public void DecryptVaultDecryptsAllEncryptedValues()
    {
        var key = Encryption.GenerateKey();
        var data = new Dictionary<string, string>
        {
            ["password"] = Encryption.EncryptValue("secret123", key),
            ["host"] = "localhost",
            ["token"] = Encryption.EncryptValue("tok-abc", key),
        };

        var decrypted = Encryption.DecryptVault(data, key);

        Assert.Equal("secret123", decrypted["password"]);
        Assert.Equal("localhost", decrypted["host"]);
        Assert.Equal("tok-abc", decrypted["token"]);
    }

    [Fact]
    public void EncryptVaultThenDecryptVaultRoundTrip()
    {
        var key = Encryption.GenerateKey();
        var original = new Dictionary<string, string>
        {
            ["db_password"] = "super-secret",
            ["api_key"] = "sk-12345",
            ["app_name"] = "my-app",
        };

        var encrypted = Encryption.EncryptVault(original, key);
        var decrypted = Encryption.DecryptVault(encrypted, key);

        Assert.Equal(original["db_password"], decrypted["db_password"]);
        Assert.Equal(original["api_key"], decrypted["api_key"]);
        Assert.Equal(original["app_name"], decrypted["app_name"]);
    }

    [Fact]
    public void DecryptVaultWithWrongKeyThrows()
    {
        var key1 = Encryption.GenerateKey();
        var key2 = Encryption.GenerateKey();

        var data = new Dictionary<string, string>
        {
            ["secret"] = Encryption.EncryptValue("value", key1),
        };

        Assert.Throws<DecryptionException>(() => Encryption.DecryptVault(data, key2));
    }
}
