namespace Dotlyte;

/// <summary>
/// A schema rule defining constraints for a configuration key.
/// </summary>
public sealed record SchemaRule
{
    /// <summary>Expected type: "string", "integer", "boolean", "number", "array".</summary>
    public string? Type { get; init; }

    /// <summary>Whether the key is required.</summary>
    public bool Required { get; init; }

    /// <summary>Named format: "email", "url", "uuid", "date", "ipv4", "ip", "port".</summary>
    public string? Format { get; init; }

    /// <summary>Regex pattern the value must match.</summary>
    public string? Pattern { get; init; }

    /// <summary>Allowed values.</summary>
    public string[]? EnumValues { get; init; }

    /// <summary>Minimum value (for numbers).</summary>
    public double? Min { get; init; }

    /// <summary>Maximum value (for numbers).</summary>
    public double? Max { get; init; }

    /// <summary>Default value applied if key is missing.</summary>
    public object? DefaultValue { get; init; }

    /// <summary>Whether the value is sensitive (should be masked in logs).</summary>
    public bool Sensitive { get; init; }

    /// <summary>Documentation string for the key.</summary>
    public string? Doc { get; init; }
}
