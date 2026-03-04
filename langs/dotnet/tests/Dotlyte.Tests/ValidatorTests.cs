using Xunit;

namespace Dotlyte.Tests;

public class ValidatorTests
{
    [Fact]
    public void ValidDataNoViolations()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["port"] = new() { Type = "integer", Required = true },
        };
        var data = new Dictionary<string, object?>
        {
            ["port"] = 8080,
        };
        var violations = Validator.Validate(data, schema);
        Assert.Empty(violations);
    }

    [Fact]
    public void MissingRequired()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["host"] = new() { Type = "string", Required = true },
        };
        var data = new Dictionary<string, object?>();
        var violations = Validator.Validate(data, schema);
        Assert.Single(violations);
        Assert.Contains("Required", violations[0].Message);
    }

    [Fact]
    public void TypeMismatchString()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["port"] = new() { Type = "string" },
        };
        var data = new Dictionary<string, object?>
        {
            ["port"] = 8080,
        };
        var violations = Validator.Validate(data, schema);
        Assert.Single(violations);
        Assert.Contains("type", violations[0].Message.ToLowerInvariant());
    }

    [Fact]
    public void TypeMatchInteger()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["port"] = new() { Type = "integer" },
        };
        var data = new Dictionary<string, object?>
        {
            ["port"] = 8080,
        };
        Assert.Empty(Validator.Validate(data, schema));
    }

    [Fact]
    public void TypeMatchBoolean()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["debug"] = new() { Type = "boolean" },
        };
        var data = new Dictionary<string, object?>
        {
            ["debug"] = true,
        };
        Assert.Empty(Validator.Validate(data, schema));
    }

    [Fact]
    public void FormatEmail()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["email"] = new() { Type = "string", Format = "email" },
        };
        var valid = new Dictionary<string, object?> { ["email"] = "test@example.com" };
        Assert.Empty(Validator.Validate(valid, schema));

        var invalid = new Dictionary<string, object?> { ["email"] = "not-an-email" };
        Assert.Single(Validator.Validate(invalid, schema));
    }

    [Fact]
    public void FormatUuid()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["id"] = new() { Type = "string", Format = "uuid" },
        };
        var valid = new Dictionary<string, object?> { ["id"] = "550e8400-e29b-41d4-a716-446655440000" };
        Assert.Empty(Validator.Validate(valid, schema));

        var invalid = new Dictionary<string, object?> { ["id"] = "not-a-uuid" };
        Assert.Single(Validator.Validate(invalid, schema));
    }

    [Fact]
    public void EnumValues()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["env"] = new() { Type = "string", EnumValues = new[] { "dev", "staging", "prod" } },
        };

        var valid = new Dictionary<string, object?> { ["env"] = "dev" };
        Assert.Empty(Validator.Validate(valid, schema));

        var invalid = new Dictionary<string, object?> { ["env"] = "test" };
        Assert.Single(Validator.Validate(invalid, schema));
    }

    [Fact]
    public void MinMax()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["port"] = new() { Type = "integer", Min = 1024, Max = 65535 },
        };

        var valid = new Dictionary<string, object?> { ["port"] = 8080 };
        Assert.Empty(Validator.Validate(valid, schema));

        var tooLow = new Dictionary<string, object?> { ["port"] = 80 };
        Assert.Single(Validator.Validate(tooLow, schema));

        var tooHigh = new Dictionary<string, object?> { ["port"] = 70000 };
        Assert.Single(Validator.Validate(tooHigh, schema));
    }

    [Fact]
    public void Pattern()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["version"] = new() { Type = "string", Pattern = @"^\d+\.\d+\.\d+$" },
        };

        var valid = new Dictionary<string, object?> { ["version"] = "1.2.3" };
        Assert.Empty(Validator.Validate(valid, schema));

        var invalid = new Dictionary<string, object?> { ["version"] = "abc" };
        Assert.Single(Validator.Validate(invalid, schema));
    }

    [Fact]
    public void StrictModeRejectsUnknownKeys()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["host"] = new() { Type = "string" },
        };
        var data = new Dictionary<string, object?>
        {
            ["host"] = "localhost",
            ["extra"] = "not allowed",
        };
        var violations = Validator.Validate(data, schema, strict: true);
        Assert.Single(violations);
        Assert.Contains("unknown", violations[0].Message.ToLowerInvariant());
    }

    [Fact]
    public void ApplyDefaults()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["port"] = new() { Type = "integer", DefaultValue = 3000 },
            ["host"] = new() { Type = "string", DefaultValue = "localhost" },
        };
        var data = new Dictionary<string, object?>
        {
            ["port"] = 8080,
        };
        Validator.ApplyDefaults(data, schema);
        Assert.Equal(8080, data["port"]);
        Assert.Equal("localhost", data["host"]);
    }

    [Fact]
    public void SensitiveKeys()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["password"] = new() { Type = "string", Sensitive = true },
            ["host"] = new() { Type = "string" },
        };
        var keys = Validator.SensitiveKeys(schema);
        Assert.Single(keys);
        Assert.Contains("password", keys);
    }

    [Fact]
    public void AssertValidThrowsOnViolations()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["port"] = new() { Type = "integer", Required = true },
        };
        var data = new Dictionary<string, object?>();
        var ex = Assert.Throws<ValidationException>(() => Validator.AssertValid(data, schema));
        Assert.Single(ex.Violations);
    }

    [Fact]
    public void NestedKeyValidation()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["db.host"] = new() { Type = "string", Required = true },
        };
        var data = new Dictionary<string, object?>
        {
            ["db"] = new Dictionary<string, object?>
            {
                ["host"] = "localhost",
            },
        };
        Assert.Empty(Validator.Validate(data, schema));
    }

    [Fact]
    public void FormatUrl()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["endpoint"] = new() { Type = "string", Format = "url" },
        };
        var valid = new Dictionary<string, object?> { ["endpoint"] = "https://example.com" };
        Assert.Empty(Validator.Validate(valid, schema));

        var invalid = new Dictionary<string, object?> { ["endpoint"] = "not a url" };
        Assert.Single(Validator.Validate(invalid, schema));
    }

    [Fact]
    public void FormatPort()
    {
        var schema = new Dictionary<string, SchemaRule>
        {
            ["port"] = new() { Type = "string", Format = "port" },
        };
        var valid = new Dictionary<string, object?> { ["port"] = "8080" };
        Assert.Empty(Validator.Validate(valid, schema));

        var invalid = new Dictionary<string, object?> { ["port"] = "99999" };
        Assert.Single(Validator.Validate(invalid, schema));
    }
}
