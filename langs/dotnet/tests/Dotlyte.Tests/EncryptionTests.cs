using Xunit;

namespace Dotlyte.Tests;

public class EncryptionTests
{
    [Fact]
    public void GenerateKeyProducesValidHex()
    {
        var key = Encryption.GenerateKey();
        Assert.Equal(64, key.Length); // 32 bytes = 64 hex chars
        Assert.Matches("^[0-9a-f]+$", key);
    }

    [Fact]
    public void RoundTrip()
    {
        var key = Encryption.GenerateKey();
        var plaintext = "super-secret-value";
        var encrypted = Encryption.EncryptValue(plaintext, key);

        Assert.StartsWith("ENC[aes-256-gcm,", encrypted);
        Assert.EndsWith("]", encrypted);

        var decrypted = Encryption.DecryptValue(encrypted, key);
        Assert.Equal(plaintext, decrypted);
    }

    [Fact]
    public void DifferentCiphertextEachTime()
    {
        var key = Encryption.GenerateKey();
        var plaintext = "same-value";
        var a = Encryption.EncryptValue(plaintext, key);
        var b = Encryption.EncryptValue(plaintext, key);
        Assert.NotEqual(a, b); // random IV
    }

    [Fact]
    public void WrongKeyFails()
    {
        var key1 = Encryption.GenerateKey();
        var key2 = Encryption.GenerateKey();
        var encrypted = Encryption.EncryptValue("secret", key1);
        Assert.Throws<DecryptionException>(() => Encryption.DecryptValue(encrypted, key2));
    }

    [Fact]
    public void IsEncryptedDetectsFormat()
    {
        var key = Encryption.GenerateKey();
        var encrypted = Encryption.EncryptValue("test", key);
        Assert.True(Encryption.IsEncrypted(encrypted));
        Assert.False(Encryption.IsEncrypted("plain text"));
        Assert.False(Encryption.IsEncrypted(null));
        Assert.False(Encryption.IsEncrypted(42));
    }

    [Fact]
    public void DecryptDictionary()
    {
        var key = Encryption.GenerateKey();
        var data = new Dictionary<string, object?>
        {
            ["plain"] = "hello",
            ["secret"] = Encryption.EncryptValue("my-password", key),
            ["nested"] = new Dictionary<string, object?>
            {
                ["deep_secret"] = Encryption.EncryptValue("deep-value", key),
                ["normal"] = 42,
            },
        };
        var result = Encryption.DecryptDictionary(data, key);
        Assert.Equal("hello", result["plain"]);
        Assert.Equal("my-password", result["secret"]);
        var nested = Assert.IsType<Dictionary<string, object?>>(result["nested"]);
        Assert.Equal("deep-value", nested["deep_secret"]);
        Assert.Equal(42, nested["normal"]);
    }

    [Fact]
    public void EncryptDecryptEmptyString()
    {
        var key = Encryption.GenerateKey();
        var encrypted = Encryption.EncryptValue("", key);
        var decrypted = Encryption.DecryptValue(encrypted, key);
        Assert.Equal("", decrypted);
    }

    [Fact]
    public void EncryptDecryptUnicode()
    {
        var key = Encryption.GenerateKey();
        var original = "こんにちは世界 🌍";
        var encrypted = Encryption.EncryptValue(original, key);
        var decrypted = Encryption.DecryptValue(encrypted, key);
        Assert.Equal(original, decrypted);
    }
}
