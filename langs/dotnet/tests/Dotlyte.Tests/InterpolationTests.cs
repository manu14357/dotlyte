using Xunit;

namespace Dotlyte.Tests;

public class InterpolationTests
{
    [Fact]
    public void SimpleReference()
    {
        var input = new Dictionary<string, string>
        {
            ["host"] = "localhost",
            ["url"] = "${host}:8080",
        };
        var result = Interpolation.Interpolate(input);
        Assert.Equal("localhost:8080", result["url"]);
    }

    [Fact]
    public void DefaultValue()
    {
        var input = new Dictionary<string, string>
        {
            ["url"] = "${host:-fallback.com}:8080",
        };
        var result = Interpolation.Interpolate(input);
        Assert.Equal("fallback.com:8080", result["url"]);
    }

    [Fact]
    public void ErrorOnMissingWithBang()
    {
        var input = new Dictionary<string, string>
        {
            ["url"] = "${host:?host is required}",
        };
        var ex = Assert.Throws<InterpolationException>(() => Interpolation.Interpolate(input));
        Assert.Contains("host is required", ex.Message);
    }

    [Fact]
    public void DollarEscape()
    {
        var input = new Dictionary<string, string>
        {
            ["literal"] = "$${not_a_var}",
        };
        var result = Interpolation.Interpolate(input);
        Assert.Equal("${not_a_var}", result["literal"]);
    }

    [Fact]
    public void CircularReferenceDetection()
    {
        var input = new Dictionary<string, string>
        {
            ["a"] = "${b}",
            ["b"] = "${a}",
        };
        Assert.Throws<InterpolationException>(() => Interpolation.Interpolate(input));
    }

    [Fact]
    public void ChainedReferences()
    {
        var input = new Dictionary<string, string>
        {
            ["host"] = "db.local",
            ["port"] = "5432",
            ["url"] = "${host}:${port}",
        };
        var result = Interpolation.Interpolate(input);
        Assert.Equal("db.local:5432", result["url"]);
    }

    [Fact]
    public void TransitiveChain()
    {
        var input = new Dictionary<string, string>
        {
            ["a"] = "hello",
            ["b"] = "${a}",
            ["c"] = "${b} world",
        };
        var result = Interpolation.Interpolate(input);
        Assert.Equal("hello world", result["c"]);
    }

    [Fact]
    public void DeepInterpolation()
    {
        var input = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["db"] = new Dictionary<string, object?>
            {
                ["url"] = "${host}:5432",
                ["port"] = 5432,
            },
        };
        var result = Interpolation.InterpolateDeep(input);
        var db = Assert.IsType<Dictionary<string, object?>>(result["db"]);
        Assert.Equal("localhost:5432", db["url"]);
        Assert.Equal(5432, db["port"]); // non-string preserved
    }

    [Fact]
    public void DeepPreservesNonStringTypes()
    {
        var input = new Dictionary<string, object?>
        {
            ["flag"] = false,
            ["count"] = 42,
            ["items"] = new List<object?> { "a", "b" },
        };
        var result = Interpolation.InterpolateDeep(input);
        Assert.Equal(false, result["flag"]);
        Assert.Equal(42, result["count"]);
        Assert.IsType<List<object?>>(result["items"]);
    }

    [Fact]
    public void DeepCircularDetection()
    {
        var input = new Dictionary<string, object?>
        {
            ["x"] = "${y}",
            ["y"] = "${x}",
        };
        Assert.Throws<InterpolationException>(() => Interpolation.InterpolateDeep(input));
    }
}
