using Xunit;

namespace Dotlyte.Tests;

public class CoercionTests
{
    [Theory]
    [InlineData("null", null)]
    [InlineData("none", null)]
    [InlineData("nil", null)]
    [InlineData("", null)]
    public void Coerce_NullValues(string input, object? expected)
    {
        Assert.Equal(expected, Coercion.Coerce(input));
    }

    [Theory]
    [InlineData("true")]
    [InlineData("TRUE")]
    [InlineData("yes")]
    [InlineData("1")]
    [InlineData("on")]
    public void Coerce_BooleanTrue(string input)
    {
        Assert.Equal(true, Coercion.Coerce(input));
    }

    [Theory]
    [InlineData("false")]
    [InlineData("no")]
    [InlineData("0")]
    [InlineData("off")]
    public void Coerce_BooleanFalse(string input)
    {
        Assert.Equal(false, Coercion.Coerce(input));
    }

    [Fact]
    public void Coerce_Integer()
    {
        Assert.Equal(8080L, Coercion.Coerce("8080"));
        Assert.Equal(-42L, Coercion.Coerce("-42"));
    }

    [Fact]
    public void Coerce_Float()
    {
        Assert.Equal(3.14, Coercion.Coerce("3.14"));
    }

    [Fact]
    public void Coerce_List()
    {
        var result = Coercion.Coerce("a,b,c") as List<object?>;
        Assert.NotNull(result);
        Assert.Equal(new List<object?> { "a", "b", "c" }, result);
    }

    [Fact]
    public void Coerce_PassThrough()
    {
        Assert.Equal(42, Coercion.Coerce(42));
        Assert.Equal(true, Coercion.Coerce(true));
    }

    [Fact]
    public void Coerce_PlainString()
    {
        Assert.Equal("hello", Coercion.Coerce("hello"));
    }
}
