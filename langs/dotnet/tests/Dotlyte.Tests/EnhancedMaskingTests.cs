using System.Text.RegularExpressions;
using Xunit;

namespace Dotlyte.Tests;

public class EnhancedMaskingTests
{
    [Fact]
    public void CompilePatternsReturnsRegexArray()
    {
        var patterns = Masking.CompilePatterns(["password", "secret", @"api[_\-]?key"]);
        Assert.Equal(3, patterns.Length);
        Assert.All(patterns, p => Assert.IsType<Regex>(p));
    }

    [Fact]
    public void CompilePatternsAreIgnoreCase()
    {
        var patterns = Masking.CompilePatterns(["password"]);
        Assert.Matches(patterns[0], "MY_PASSWORD");
        Assert.Matches(patterns[0], "password");
    }

    [Fact]
    public void CompilePatternsMatchCorrectly()
    {
        var patterns = Masking.CompilePatterns([@"api[_\-]?key"]);
        Assert.Matches(patterns[0], "api_key");
        Assert.Matches(patterns[0], "apikey");
        Assert.Matches(patterns[0], "api-key");
        Assert.DoesNotMatch(patterns[0], "hostname");
    }

    [Fact]
    public void BuildSensitiveSetWithPatternsDefaultPatterns()
    {
        var keys = new[] { "database_password", "api_key", "host", "port" };
        var sensitive = Masking.BuildSensitiveSetWithPatterns(keys);

        Assert.Contains("database_password", sensitive);
        Assert.Contains("api_key", sensitive);
        Assert.DoesNotContain("host", sensitive);
        Assert.DoesNotContain("port", sensitive);
    }

    [Fact]
    public void BuildSensitiveSetWithPatternsCustomPatterns()
    {
        var keys = new[] { "my_custom_field", "other_field", "normal" };
        var sensitive = Masking.BuildSensitiveSetWithPatterns(
            keys,
            patterns: ["custom"]);

        Assert.Contains("my_custom_field", sensitive);
        Assert.DoesNotContain("other_field", sensitive);
        Assert.DoesNotContain("normal", sensitive);
    }

    [Fact]
    public void BuildSensitiveSetWithPatternsIncludesSchemaSensitive()
    {
        var keys = new[] { "host", "port" };
        var schemaSensitive = new HashSet<string> { "extra_secret" };

        var sensitive = Masking.BuildSensitiveSetWithPatterns(
            keys,
            schemaSensitive: schemaSensitive);

        Assert.Contains("extra_secret", sensitive);
        Assert.DoesNotContain("host", sensitive);
    }

    [Fact]
    public void BuildSensitiveSetWithPatternsAllSourcesCombined()
    {
        var keys = new[] { "my_password", "host", "custom_field" };
        var schemaSensitive = new HashSet<string> { "schema_key" };
        var patterns = new[] { "custom" };

        var sensitive = Masking.BuildSensitiveSetWithPatterns(
            keys,
            patterns: patterns,
            schemaSensitive: schemaSensitive);

        Assert.Contains("custom_field", sensitive); // matched by custom pattern
        Assert.Contains("schema_key", sensitive);   // from schema
        Assert.DoesNotContain("host", sensitive);    // "custom" pattern doesn't match
        // "my_password" won't match "custom" pattern either
        Assert.DoesNotContain("my_password", sensitive);
    }

    [Fact]
    public void ConfigAuditProxyReturnsValues()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["password"] = "secret",
        };

        var proxy = new ConfigAuditProxy(
            data,
            new HashSet<string> { "password" },
            _ => { });

        Assert.Equal("localhost", proxy["host"]);
        Assert.Equal("secret", proxy["password"]);
    }

    [Fact]
    public void ConfigAuditProxyCallsCallbackOnSensitiveAccess()
    {
        var accessed = new List<string>();
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["password"] = "secret",
            ["token"] = "tok-123",
        };

        var proxy = new ConfigAuditProxy(
            data,
            new HashSet<string> { "password", "token" },
            key => accessed.Add(key));

        _ = proxy["host"];
        _ = proxy["password"];
        _ = proxy["token"];

        Assert.DoesNotContain("host", accessed);
        Assert.Contains("password", accessed);
        Assert.Contains("token", accessed);
    }

    [Fact]
    public void ConfigAuditProxyReturnsNullForMissingKey()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
        };

        var proxy = new ConfigAuditProxy(
            data,
            new HashSet<string>(),
            _ => { });

        Assert.Null(proxy["missing"]);
    }

    [Fact]
    public void ConfigAuditProxyExposesKeys()
    {
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["port"] = 8080,
        };

        var proxy = new ConfigAuditProxy(
            data,
            new HashSet<string>(),
            _ => { });

        Assert.Equal(2, proxy.Keys.Count);
        Assert.Contains("host", proxy.Keys);
        Assert.Contains("port", proxy.Keys);
    }

    [Fact]
    public void ConfigAuditProxyMultipleAccessesTriggerMultipleCallbacks()
    {
        var count = 0;
        var data = new Dictionary<string, object?>
        {
            ["password"] = "secret",
        };

        var proxy = new ConfigAuditProxy(
            data,
            new HashSet<string> { "password" },
            _ => count++);

        _ = proxy["password"];
        _ = proxy["password"];
        _ = proxy["password"];

        Assert.Equal(3, count);
    }
}
