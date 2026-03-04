using System.Text.Json;
using Xunit;

namespace Dotlyte.Tests;

public class ConfigV2Tests
{
    private static Config MakeConfig(
        Dictionary<string, object?> data,
        Dictionary<string, SchemaRule>? schema = null,
        List<string>? sensitive = null)
    {
        return new Config(data, schema, sensitive ?? new List<string>());
    }

    [Fact]
    public void ScopeReturnsSubConfig()
    {
        var data = new Dictionary<string, object?>
        {
            ["db"] = new Dictionary<string, object?>
            {
                ["host"] = "localhost",
                ["port"] = 5432,
            },
        };
        var config = MakeConfig(data);
        var scoped = config.Scope("db");
        Assert.Equal("localhost", scoped.Get("host"));
        Assert.Equal(5432, scoped.Get("port"));
    }

    [Fact]
    public void ScopePropagatesSensitiveKeys()
    {
        var data = new Dictionary<string, object?>
        {
            ["db"] = new Dictionary<string, object?>
            {
                ["host"] = "localhost",
                ["password"] = "secret",
            },
        };
        var config = MakeConfig(data, sensitive: new List<string> { "db.password" });
        var scoped = config.Scope("db");
        var redacted = scoped.ToDictionaryRedacted();
        Assert.Equal(Masking.Redacted, redacted["password"]);
    }

    [Fact]
    public void KeysReturnsTopLevelKeys()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["port"] = 8080,
            ["db"] = new Dictionary<string, object?> { ["name"] = "mydb" },
        };
        var config = MakeConfig(data);
        var keys = config.Keys();
        Assert.Contains("host", keys);
        Assert.Contains("port", keys);
        Assert.Contains("db", keys);
    }

    [Fact]
    public void ToFlatKeysFlattensNested()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["db"] = new Dictionary<string, object?>
            {
                ["name"] = "mydb",
                ["port"] = 5432,
            },
        };
        var config = MakeConfig(data);
        var flatKeys = config.ToFlatKeys();
        Assert.Contains("host", flatKeys);
        Assert.Contains("db.name", flatKeys);
        Assert.Contains("db.port", flatKeys);
    }

    [Fact]
    public void ToFlatDictionary()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["db"] = new Dictionary<string, object?>
            {
                ["name"] = "mydb",
            },
        };
        var config = MakeConfig(data);
        var flat = config.ToFlatDictionary();
        Assert.Equal("localhost", flat["host"]);
        Assert.Equal("mydb", flat["db.name"]);
    }

    [Fact]
    public void RequireKeysAllPresent()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["port"] = 8080,
        };
        var config = MakeConfig(data);
        var result = config.RequireKeys("host", "port");
        Assert.Equal("localhost", result[0]);
        Assert.Equal(8080, result[1]);
    }

    [Fact]
    public void RequireKeysThrowsOnMissing()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
        };
        var config = MakeConfig(data);
        Assert.Throws<MissingKeyException>(() => config.RequireKeys("host", "port"));
    }

    [Fact]
    public void ToDictionaryRedactedMasksSensitive()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["secret"] = "my-password",
        };
        var config = MakeConfig(data, sensitive: new List<string> { "secret" });
        var redacted = config.ToDictionaryRedacted();
        Assert.Equal("localhost", redacted["host"]);
        Assert.Equal(Masking.Redacted, redacted["secret"]);
    }

    [Fact]
    public void ToJsonProducesValidJson()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["port"] = 8080,
        };
        var config = MakeConfig(data);
        var json = config.ToJson();
        var parsed = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json);
        Assert.NotNull(parsed);
        Assert.Equal("localhost", parsed!["host"].GetString());
    }

    [Fact]
    public void WriteToCreatesFile()
    {
        var tmpDir = Path.Combine(Path.GetTempPath(), "dotlyte_test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tmpDir);
        try
        {
            var filePath = Path.Combine(tmpDir, "output.json");
            var data = new Dictionary<string, object?>
            {
                ["key"] = "value",
            };
            var config = MakeConfig(data);
            config.WriteTo(filePath);
            Assert.True(File.Exists(filePath));
            var contents = File.ReadAllText(filePath);
            Assert.Contains("key", contents);
            Assert.Contains("value", contents);
        }
        finally
        {
            Directory.Delete(tmpDir, true);
        }
    }

    [Fact]
    public void ValidateReturnsViolations()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["port"] = new() { Type = "integer", Required = true },
        };
        var data = new Dictionary<string, object?>();
        var config = MakeConfig(data, schema: schema);
        var violations = config.Validate();
        Assert.Single(violations);
    }

    [Fact]
    public void AssertValidThrowsOnInvalid()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["port"] = new() { Type = "integer", Required = true },
        };
        var data = new Dictionary<string, object?>();
        var config = MakeConfig(data, schema: schema);
        Assert.Throws<ValidationException>(() => config.AssertValid());
    }

    [Fact]
    public void AssertValidPassesOnValidData()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["port"] = new() { Type = "integer", Required = true },
        };
        var data = new Dictionary<string, object?>
        {
            ["port"] = 8080,
        };
        var config = MakeConfig(data, schema: schema);
        config.AssertValid(); // should not throw
    }

    [Fact]
    public void IndexerReturnsNestedConfig()
    {
        var data = new Dictionary<string, object?>
        {
            ["db"] = new Dictionary<string, object?>
            {
                ["host"] = "localhost",
            },
        };
        var config = MakeConfig(data);
        var dbConfig = (Config)config["db"]!;
        Assert.Equal("localhost", dbConfig.Get("host"));
    }

    [Fact]
    public void HasReturnsTrueForExistingKey()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
        };
        var config = MakeConfig(data);
        Assert.True(config.Has("host"));
        Assert.False(config.Has("missing"));
    }

    [Fact]
    public void GetWithDefault()
    {
        var data = new Dictionary<string, object?>();
        var config = MakeConfig(data);
        Assert.Equal("fallback", config.Get("missing", "fallback"));
    }

    [Fact]
    public void GetDotNotation()
    {
        var data = new Dictionary<string, object?>
        {
            ["db"] = new Dictionary<string, object?>
            {
                ["host"] = "localhost",
            },
        };
        var config = MakeConfig(data);
        Assert.Equal("localhost", config.Get("db.host"));
    }

    [Fact]
    public void RequireThrowsOnMissing()
    {
        var data = new Dictionary<string, object?>();
        var config = MakeConfig(data);
        Assert.Throws<MissingKeyException>(() => config.Require("missing"));
    }
}
