using Xunit;

namespace Dotlyte.Tests;

public class DotlyteLoaderTests
{
    [Fact]
    public void Load_ReturnsConfig()
    {
        var config = DotlyteLoader.Load(new LoadOptions
        {
            Defaults = new Dictionary<string, object?> { ["port"] = 3000 }
        });

        Assert.NotNull(config);
    }

    [Fact]
    public void Load_UsesDefaults()
    {
        var config = DotlyteLoader.Load(new LoadOptions
        {
            Defaults = new Dictionary<string, object?>
            {
                ["port"] = 3000,
                ["debug"] = false,
            }
        });

        Assert.Equal(3000, config.Get("port"));
        Assert.Equal(false, config.Get("debug"));
    }

    [Fact]
    public void Config_DotNotation()
    {
        var config = new Config(new Dictionary<string, object?>
        {
            ["port"] = 8080,
            ["database"] = new Dictionary<string, object?>
            {
                ["host"] = "localhost",
                ["port"] = 5432,
            },
        });

        Assert.Equal(8080, config["port"]);
        var db = config["database"] as Config;
        Assert.NotNull(db);
        Assert.Equal("localhost", db!["host"]);
    }

    [Fact]
    public void Config_GetWithDefault()
    {
        var config = new Config(new Dictionary<string, object?>());
        Assert.Equal("fallback", config.Get("missing", "fallback"));
    }

    [Fact]
    public void Config_RequireThrowsOnMissing()
    {
        var config = new Config(new Dictionary<string, object?>());
        Assert.Throws<DotlyteException>(() => config.Require("MISSING"));
    }

    [Fact]
    public void Config_NestedGet()
    {
        var config = new Config(new Dictionary<string, object?>
        {
            ["database"] = new Dictionary<string, object?> { ["host"] = "localhost" }
        });

        Assert.Equal("localhost", config.Get("database.host"));
    }

    [Fact]
    public void Config_Has()
    {
        var config = new Config(new Dictionary<string, object?> { ["port"] = 8080 });
        Assert.True(config.Has("port"));
        Assert.False(config.Has("missing"));
    }
}
