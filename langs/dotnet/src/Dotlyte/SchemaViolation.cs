namespace Dotlyte;

/// <summary>
/// Represents a single schema validation violation.
/// </summary>
/// <param name="Key">The config key that violated the rule.</param>
/// <param name="Message">Human-readable description of the violation.</param>
/// <param name="Rule">The schema rule that was violated.</param>
public sealed record SchemaViolation(string Key, string Message, SchemaRule Rule)
{
    /// <summary>String representation.</summary>
    public override string ToString() => $"{Key}: {Message}";
}
