using Xunit;

namespace Dotlyte.Tests;

public class MaskingTests
{
    [Fact]
    public void AutoDetectSensitiveKeys()
    {
        var data = new Dictionary<string, object?>
        {
            ["database_password"] = "secret",
            ["api_key"] = "abc123",
            ["host"] = "localhost",
            ["aws_secret_access_key"] = "xxx",
        };
        var sensitive = Masking.BuildSensitiveSet(data);
        Assert.Contains("database_password", sensitive);
        Assert.Contains("api_key", sensitive);
        Assert.Contains("aws_secret_access_key", sensitive);
        Assert.DoesNotContain("host", sensitive);
    }

    [Fact]
    public void SchemaKeysIncluded()
    {
        var data = new Dictionary<string, object?>
        {
            ["custom_field"] = "value",
        };
        var schemaKeys = new List<string> { "custom_field" };
        var sensitive = Masking.BuildSensitiveSet(data, schemaKeys);
        Assert.Contains("custom_field", sensitive);
    }

    [Fact]
    public void RedactDictionary()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["password"] = "super-secret",
        };
        var sensitiveKeys = new List<string> { "password" };
        var redacted = Masking.RedactDictionary(data, sensitiveKeys);
        Assert.Equal("localhost", redacted["host"]);
        Assert.Equal(Masking.Redacted, redacted["password"]);
    }

    [Fact]
    public void NestedRedaction()
    {
        var data = new Dictionary<string, object?>
        {
            ["db"] = new Dictionary<string, object?>
            {
                ["host"] = "localhost",
                ["password"] = "secret",
            },
        };
        var sensitiveKeys = new List<string> { "db.password" };
        var redacted = Masking.RedactDictionary(data, sensitiveKeys);
        var db = Assert.IsType<Dictionary<string, object?>>(redacted["db"]);
        Assert.Equal("localhost", db["host"]);
        Assert.Equal(Masking.Redacted, db["password"]);
    }

    [Fact]
    public void FormatRedactedPartialMask()
    {
        var result = Masking.FormatRedacted("my-secret-key");
        Assert.StartsWith("my", result);
        Assert.Contains("*", result);
    }

    [Fact]
    public void FormatRedactedShortValue()
    {
        var result = Masking.FormatRedacted("ab");
        Assert.Equal("**", result);
    }

    [Fact]
    public void AutoDetectNestedSensitiveKeys()
    {
        var data = new Dictionary<string, object?>
        {
            ["db"] = new Dictionary<string, object?>
            {
                ["password"] = "secret",
                ["host"] = "localhost",
            },
            ["api_token"] = "tok123",
        };
        var sensitive = Masking.BuildSensitiveSet(data);
        Assert.Contains("db.password", sensitive);
        Assert.Contains("api_token", sensitive);
        Assert.DoesNotContain("db.host", sensitive);
    }
}
