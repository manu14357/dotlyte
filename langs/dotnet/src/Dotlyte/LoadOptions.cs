namespace Dotlyte;

/// <summary>
/// Load options for DotlyteLoader.Load() (v2).
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

    /// <summary>Schema rules for validation.</summary>
    public Dictionary<string, SchemaRule>? Schema { get; init; }

    /// <summary>Enable strict mode (reject unknown keys).</summary>
    public bool Strict { get; init; }

    /// <summary>Enable variable interpolation (default: true).</summary>
    public bool InterpolateVars { get; init; } = true;

    /// <summary>Override values (highest priority).</summary>
    public Dictionary<string, object?> Overrides { get; init; } = new();

    /// <summary>Enable debug logging.</summary>
    public bool Debug { get; init; }

    /// <summary>Walk up directories to find root marker.</summary>
    public bool FindUp { get; init; }

    /// <summary>Root marker files/dirs for FindUp.</summary>
    public string[] RootMarkers { get; init; } = [".git", "package.json", "go.mod", "Cargo.toml", ".dotlyte"];

    /// <summary>Working directory override.</summary>
    public string? Cwd { get; init; }

    /// <summary>Allow all environment variables (bypass system blocklist).</summary>
    public bool AllowAllEnvVars { get; init; }
}
