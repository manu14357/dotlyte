using Xunit;

namespace Dotlyte.Tests;

public class BoundaryConfigTests
{
    private static Dictionary<string, object?> SampleData() => new()
    {
        ["DB_PASSWORD"] = "secret",
        ["DB_HOST"] = "localhost",
        ["API_URL"] = "https://api.example.com",
        ["APP_NAME"] = "my-app",
        ["LOG_LEVEL"] = "info",
    };

    [Fact]
    public void GetServerKeySucceeds()
    {
        var boundary = new BoundaryConfig(
            SampleData(),
            serverKeys: new HashSet<string> { "DB_PASSWORD", "DB_HOST" },
            clientKeys: new HashSet<string> { "API_URL" },
            sharedKeys: new HashSet<string> { "APP_NAME", "LOG_LEVEL" });

        // .NET is always server context
        Assert.Equal("secret", boundary.Get("DB_PASSWORD"));
    }

    [Fact]
    public void GetClientKeySucceeds()
    {
        var boundary = new BoundaryConfig(
            SampleData(),
            serverKeys: new HashSet<string> { "DB_PASSWORD" },
            clientKeys: new HashSet<string> { "API_URL" },
            sharedKeys: new HashSet<string> { "APP_NAME" });

        Assert.Equal("https://api.example.com", boundary.Get("API_URL"));
    }

    [Fact]
    public void GetSharedKeySucceeds()
    {
        var boundary = new BoundaryConfig(
            SampleData(),
            serverKeys: new HashSet<string> { "DB_PASSWORD" },
            clientKeys: new HashSet<string> { "API_URL" },
            sharedKeys: new HashSet<string> { "APP_NAME" });

        Assert.Equal("my-app", boundary.Get("APP_NAME"));
    }

    [Fact]
    public void GetUnregisteredKeyThrows()
    {
        var boundary = new BoundaryConfig(
            SampleData(),
            serverKeys: new HashSet<string> { "DB_PASSWORD" },
            clientKeys: new HashSet<string> { "API_URL" },
            sharedKeys: new HashSet<string> { "APP_NAME" });

        var ex = Assert.Throws<DotlyteException>(() => boundary.Get("UNKNOWN_KEY"));
        Assert.Contains("not registered in any boundary set", ex.Message);
    }

    [Fact]
    public void IsServerContextAlwaysTrue()
    {
        var boundary = new BoundaryConfig(
            new Dictionary<string, object?>(),
            serverKeys: new HashSet<string>(),
            clientKeys: new HashSet<string>(),
            sharedKeys: new HashSet<string>());

        Assert.True(boundary.IsServerContext);
    }

    [Fact]
    public void ServerOnlyFiltersCorrectly()
    {
        var boundary = new BoundaryConfig(
            SampleData(),
            serverKeys: new HashSet<string> { "DB_PASSWORD", "DB_HOST" },
            clientKeys: new HashSet<string> { "API_URL" },
            sharedKeys: new HashSet<string> { "APP_NAME" });

        var serverOnly = boundary.ServerOnly();
        Assert.Contains("DB_PASSWORD", serverOnly.Keys);
        Assert.Contains("DB_HOST", serverOnly.Keys);
        Assert.Contains("APP_NAME", serverOnly.Keys); // shared included
        Assert.DoesNotContain("API_URL", serverOnly.Keys);
    }

    [Fact]
    public void ClientOnlyFiltersCorrectly()
    {
        var boundary = new BoundaryConfig(
            SampleData(),
            serverKeys: new HashSet<string> { "DB_PASSWORD", "DB_HOST" },
            clientKeys: new HashSet<string> { "API_URL" },
            sharedKeys: new HashSet<string> { "APP_NAME" });

        var clientOnly = boundary.ClientOnly();
        Assert.Contains("API_URL", clientOnly.Keys);
        Assert.Contains("APP_NAME", clientOnly.Keys); // shared included
        Assert.DoesNotContain("DB_PASSWORD", clientOnly.Keys);
        Assert.DoesNotContain("DB_HOST", clientOnly.Keys);
    }

    [Fact]
    public void SecretAccessCallbackInvoked()
    {
        var accessed = new List<string>();
        var boundary = new BoundaryConfig(
            SampleData(),
            serverKeys: new HashSet<string> { "DB_PASSWORD" },
            clientKeys: new HashSet<string> { "API_URL" },
            sharedKeys: new HashSet<string> { "APP_NAME" },
            onSecretAccess: key => accessed.Add(key));

        boundary.Get("DB_PASSWORD");
        Assert.Contains("DB_PASSWORD", accessed);
    }

    [Fact]
    public void GetMissingKeyReturnsNull()
    {
        var data = new Dictionary<string, object?>
        {
            ["HOST"] = "localhost",
        };
        var boundary = new BoundaryConfig(
            data,
            serverKeys: new HashSet<string> { "HOST", "PORT" },
            clientKeys: new HashSet<string>(),
            sharedKeys: new HashSet<string>());

        // Key is registered but not in data
        Assert.Null(boundary.Get("PORT"));
    }

    [Fact]
    public void ServerOnlyReturnsEmptyWhenNoMatch()
    {
        var data = new Dictionary<string, object?>
        {
            ["CLIENT_KEY"] = "value",
        };
        var boundary = new BoundaryConfig(
            data,
            serverKeys: new HashSet<string>(),
            clientKeys: new HashSet<string> { "CLIENT_KEY" },
            sharedKeys: new HashSet<string>());

        var serverOnly = boundary.ServerOnly();
        Assert.Empty(serverOnly);
    }
}
