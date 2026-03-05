using Xunit;

namespace Dotlyte.Tests;

public class TypedConfigTests : IDisposable
{
    private readonly List<string> _envVarsSet = new();

    private void SetEnv(string key, string value)
    {
        Environment.SetEnvironmentVariable(key, value);
        _envVarsSet.Add(key);
    }

    public void Dispose()
    {
        foreach (var key in _envVarsSet)
            Environment.SetEnvironmentVariable(key, null);
    }

    [Fact]
    public void CreateWithStringType()
    {
        SetEnv("APP_NAME", "my-app");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["APP_NAME"] = new() { Type = "string", Required = true },
        };

        var result = TypedConfig.Create(schema);
        Assert.Equal("my-app", result["APP_NAME"]);
    }

    [Fact]
    public void CreateWithBooleanType()
    {
        SetEnv("DEBUG", "true");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["DEBUG"] = new() { Type = "boolean" },
        };

        var result = TypedConfig.Create(schema);
        Assert.Equal(true, result["DEBUG"]);
    }

    [Fact]
    public void CreateWithBooleanFalseVariants()
    {
        SetEnv("VERBOSE", "no");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["VERBOSE"] = new() { Type = "boolean" },
        };

        var result = TypedConfig.Create(schema);
        Assert.Equal(false, result["VERBOSE"]);
    }

    [Fact]
    public void CreateWithIntegerType()
    {
        SetEnv("PORT", "8080");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["PORT"] = new() { Type = "integer" },
        };

        var result = TypedConfig.Create(schema);
        Assert.Equal(8080L, result["PORT"]);
    }

    [Fact]
    public void CreateWithNumberType()
    {
        SetEnv("RATE", "3.14");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["RATE"] = new() { Type = "number" },
        };

        var result = TypedConfig.Create(schema);
        Assert.Equal(3.14, result["RATE"]);
    }

    [Fact]
    public void CreateWithArrayType()
    {
        SetEnv("HOSTS", "a,b,c");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["HOSTS"] = new() { Type = "array" },
        };

        var result = TypedConfig.Create(schema);
        var list = Assert.IsType<List<object?>>(result["HOSTS"]);
        Assert.Equal(3, list.Count);
        Assert.Equal("a", list[0]);
        Assert.Equal("b", list[1]);
        Assert.Equal("c", list[2]);
    }

    [Fact]
    public void CreateUsesDefaultWhenEnvMissing()
    {
        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["MISSING_KEY"] = new() { Type = "string", Default = "fallback" },
        };

        var result = TypedConfig.Create(schema);
        Assert.Equal("fallback", result["MISSING_KEY"]);
    }

    [Fact]
    public void CreateThrowsOnMissingRequired()
    {
        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["REQUIRED_KEY"] = new() { Type = "string", Required = true },
        };

        var ex = Assert.Throws<DotlyteException>(() => TypedConfig.Create(schema));
        Assert.Contains("REQUIRED_KEY", ex.Message);
    }

    [Fact]
    public void CreateValidatesEnumValues()
    {
        SetEnv("LOG_LEVEL", "invalid");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["LOG_LEVEL"] = new()
            {
                Type = "string",
                Enum = ["debug", "info", "warn", "error"],
            },
        };

        var ex = Assert.Throws<DotlyteException>(() => TypedConfig.Create(schema));
        Assert.Contains("not in allowed values", ex.Message);
    }

    [Fact]
    public void CreateValidatesEnumPasses()
    {
        SetEnv("LOG_LEVEL", "info");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["LOG_LEVEL"] = new()
            {
                Type = "string",
                Enum = ["debug", "info", "warn", "error"],
            },
        };

        var result = TypedConfig.Create(schema);
        Assert.Equal("info", result["LOG_LEVEL"]);
    }

    [Fact]
    public void CreateValidatesMinimum()
    {
        SetEnv("PORT", "0");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["PORT"] = new() { Type = "integer", Min = 1 },
        };

        var ex = Assert.Throws<DotlyteException>(() => TypedConfig.Create(schema));
        Assert.Contains("below minimum", ex.Message);
    }

    [Fact]
    public void CreateValidatesMaximum()
    {
        SetEnv("PORT", "70000");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["PORT"] = new() { Type = "integer", Max = 65535 },
        };

        var ex = Assert.Throws<DotlyteException>(() => TypedConfig.Create(schema));
        Assert.Contains("exceeds maximum", ex.Message);
    }

    [Fact]
    public void CreateSkipsValidationWhenRequested()
    {
        SetEnv("PORT", "99999");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["PORT"] = new() { Type = "integer", Max = 65535 },
        };

        var result = TypedConfig.Create(schema, skipValidation: true);
        Assert.Equal(99999L, result["PORT"]);
    }

    [Fact]
    public void CreateCallsSecretAccessCallback()
    {
        SetEnv("DB_PASSWORD", "secret123");
        var accessed = new List<string>();

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["DB_PASSWORD"] = new() { Type = "string", Sensitive = true },
        };

        TypedConfig.Create(schema, onSecretAccess: key => accessed.Add(key));
        Assert.Contains("DB_PASSWORD", accessed);
    }

    [Fact]
    public void CreateNullCoercion()
    {
        SetEnv("NULLABLE", "null");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["NULLABLE"] = new() { Type = "string" },
        };

        var result = TypedConfig.Create(schema);
        Assert.Null(result["NULLABLE"]);
    }

    [Fact]
    public void CreateWithDotNotationKey()
    {
        SetEnv("DB_HOST", "localhost");

        var schema = new Dictionary<string, FieldDescriptor>
        {
            ["db.host"] = new() { Type = "string" },
        };

        var result = TypedConfig.Create(schema);
        Assert.Equal("localhost", result["db.host"]);
    }
}
