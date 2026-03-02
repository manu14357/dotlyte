namespace Dotlyte;

/// <summary>
/// Load options for DotlyteLoader.Load().
/// </summary>
public sealed class LoadOptions
{
    /// <summary>Explicit files to load.</summary>
    public string[]? Files { get; init; }

    /// <summary>Environment variable prefix to strip.</summary>
    public string? Prefix { get; init; }

    /// <summary>Default values (lowest priority).</summary>
    public Dictionary<string, object?> Defaults { get; init; } = new();

    /// <summary>Custom source order.</summary>
    public string[]? Sources { get; init; }

    /// <summary>Environment name (e.g., "production").</summary>
    public string? Env { get; init; }
}
