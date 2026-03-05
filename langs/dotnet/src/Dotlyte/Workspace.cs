namespace Dotlyte;

/// <summary>
/// Monorepo workspace discovery and configuration loading for multi-package projects.
/// </summary>
public static class Workspace
{
    private static readonly string[] PnpmMarker = ["pnpm-workspace.yaml"];
    private static readonly string[] NpmMarker = ["package.json"];
    private static readonly string[] CargoMarker = ["Cargo.toml"];
    private static readonly string[] GoWorkMarker = ["go.work"];

    /// <summary>
    /// Information about a discovered monorepo root.
    /// </summary>
    /// <param name="Root">Absolute path to the monorepo root directory.</param>
    /// <param name="Type">Detected monorepo type (e.g., "pnpm", "npm", "cargo", "go").</param>
    /// <param name="Packages">Discovered package directories within the monorepo.</param>
    public sealed record MonorepoInfo(string Root, string Type, string[] Packages);

    /// <summary>
    /// Options for loading workspace configuration.
    /// </summary>
    public sealed class WorkspaceOptions
    {
        /// <summary>Explicit root directory override.</summary>
        public string? Root { get; init; }

        /// <summary>Explicit list of package directories.</summary>
        public string[]? Packages { get; init; }

        /// <summary>Path to shared environment file (relative to root).</summary>
        public string? SharedEnvFile { get; init; }

        /// <summary>Environment variable prefix to strip.</summary>
        public string? Prefix { get; init; }

        /// <summary>Environment name (e.g., "production").</summary>
        public string? Env { get; init; }
    }

    /// <summary>
    /// Walk up from <paramref name="cwd"/> to find a monorepo root directory.
    /// </summary>
    /// <param name="cwd">Starting directory. Defaults to <see cref="Directory.GetCurrentDirectory()"/>.</param>
    /// <returns>A <see cref="MonorepoInfo"/> if found, or <c>null</c> if no monorepo root is detected.</returns>
    public static MonorepoInfo? FindMonorepoRoot(string? cwd = null)
    {
        var dir = cwd ?? Directory.GetCurrentDirectory();

        while (!string.IsNullOrEmpty(dir))
        {
            // pnpm workspace
            if (File.Exists(Path.Combine(dir, "pnpm-workspace.yaml")))
            {
                var packages = DiscoverPackages(dir, "pnpm");
                return new MonorepoInfo(dir, "pnpm", packages);
            }

            // Go workspace
            if (File.Exists(Path.Combine(dir, "go.work")))
            {
                var packages = DiscoverPackages(dir, "go");
                return new MonorepoInfo(dir, "go", packages);
            }

            // Cargo workspace
            var cargoToml = Path.Combine(dir, "Cargo.toml");
            if (File.Exists(cargoToml))
            {
                try
                {
                    var content = File.ReadAllText(cargoToml);
                    if (content.Contains("[workspace]"))
                    {
                        var packages = DiscoverPackages(dir, "cargo");
                        return new MonorepoInfo(dir, "cargo", packages);
                    }
                }
                catch
                {
                    // Ignore read errors
                }
            }

            // npm/yarn workspace (package.json with "workspaces")
            var packageJson = Path.Combine(dir, "package.json");
            if (File.Exists(packageJson))
            {
                try
                {
                    var content = File.ReadAllText(packageJson);
                    if (content.Contains("\"workspaces\""))
                    {
                        var packages = DiscoverPackages(dir, "npm");
                        return new MonorepoInfo(dir, "npm", packages);
                    }
                }
                catch
                {
                    // Ignore read errors
                }
            }

            var parent = Directory.GetParent(dir)?.FullName;
            if (parent == dir) break;
            dir = parent;
        }

        return null;
    }

    /// <summary>
    /// Load environment configuration for each package in a workspace.
    /// </summary>
    /// <param name="options">Workspace loading options.</param>
    /// <returns>A dictionary mapping package names to their configuration dictionaries.</returns>
    /// <exception cref="DotlyteException">Thrown when no monorepo root can be found.</exception>
    public static Dictionary<string, Dictionary<string, object?>> LoadWorkspace(WorkspaceOptions? options = null)
    {
        options ??= new WorkspaceOptions();

        var root = options.Root;
        string[]? packages = options.Packages;
        string type = "unknown";

        if (root is null)
        {
            var info = FindMonorepoRoot();
            if (info is null)
                throw new DotlyteException("No monorepo root found. Specify 'Root' in WorkspaceOptions.");
            root = info.Root;
            type = info.Type;
            packages ??= info.Packages;
        }

        packages ??= [];

        var result = new Dictionary<string, Dictionary<string, object?>>();

        // Load shared env if specified
        var sharedData = new Dictionary<string, object?>();
        if (options.SharedEnvFile is not null)
        {
            var sharedPath = Path.Combine(root, options.SharedEnvFile);
            if (File.Exists(sharedPath))
            {
                var lines = File.ReadAllLines(sharedPath);
                foreach (var line in lines)
                {
                    var parsed = ParseEnvLine(line, options.Prefix);
                    if (parsed is not null)
                    {
                        sharedData[parsed.Value.Key] = Coercion.Coerce(parsed.Value.Value);
                    }
                }
            }
        }

        foreach (var pkg in packages)
        {
            var pkgPath = Path.IsPathRooted(pkg) ? pkg : Path.Combine(root, pkg);
            var pkgName = Path.GetFileName(pkg);
            var pkgData = new Dictionary<string, object?>(sharedData);

            // Load package-level .env
            var envFile = Path.Combine(pkgPath, ".env");
            if (File.Exists(envFile))
            {
                var lines = File.ReadAllLines(envFile);
                foreach (var line in lines)
                {
                    var parsed = ParseEnvLine(line, options.Prefix);
                    if (parsed is not null)
                    {
                        pkgData[parsed.Value.Key] = Coercion.Coerce(parsed.Value.Value);
                    }
                }
            }

            result[pkgName] = pkgData;
        }

        return result;
    }

    /// <summary>
    /// Load shared environment variables from a file at the monorepo root.
    /// </summary>
    /// <param name="root">The monorepo root directory.</param>
    /// <param name="prefix">Optional prefix to strip from variable names.</param>
    /// <returns>A dictionary of key-value pairs from the shared env file.</returns>
    public static Dictionary<string, string> GetSharedEnv(string root, string? prefix = null)
    {
        var result = new Dictionary<string, string>();
        var envFile = Path.Combine(root, ".env");

        if (!File.Exists(envFile))
            return result;

        var lines = File.ReadAllLines(envFile);
        foreach (var line in lines)
        {
            var parsed = ParseEnvLine(line, prefix);
            if (parsed is not null)
            {
                result[parsed.Value.Key] = parsed.Value.Value;
            }
        }

        return result;
    }

    private static string[] DiscoverPackages(string root, string type)
    {
        var packages = new List<string>();

        switch (type)
        {
            case "pnpm":
            case "npm":
                // Look for packages/ and apps/ directories
                foreach (var dir in new[] { "packages", "apps", "libs" })
                {
                    var fullDir = Path.Combine(root, dir);
                    if (Directory.Exists(fullDir))
                    {
                        foreach (var sub in Directory.GetDirectories(fullDir))
                        {
                            if (File.Exists(Path.Combine(sub, "package.json")))
                                packages.Add(sub);
                        }
                    }
                }
                break;

            case "cargo":
                // Look for member crates
                foreach (var dir in new[] { "crates", "packages", "libs" })
                {
                    var fullDir = Path.Combine(root, dir);
                    if (Directory.Exists(fullDir))
                    {
                        foreach (var sub in Directory.GetDirectories(fullDir))
                        {
                            if (File.Exists(Path.Combine(sub, "Cargo.toml")))
                                packages.Add(sub);
                        }
                    }
                }
                break;

            case "go":
                // Look for go.mod files in subdirectories
                foreach (var sub in Directory.GetDirectories(root))
                {
                    if (File.Exists(Path.Combine(sub, "go.mod")))
                        packages.Add(sub);
                }
                break;
        }

        return packages.ToArray();
    }

    private static (string Key, string Value)? ParseEnvLine(string line, string? prefix)
    {
        var trimmed = line.Trim();
        if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#'))
            return null;

        var eqIndex = trimmed.IndexOf('=');
        if (eqIndex < 0)
            return null;

        var key = trimmed[..eqIndex].Trim();
        var value = trimmed[(eqIndex + 1)..].Trim();

        // Strip surrounding quotes
        if (value.Length >= 2 &&
            ((value.StartsWith('"') && value.EndsWith('"')) ||
             (value.StartsWith('\'') && value.EndsWith('\''))))
        {
            value = value[1..^1];
        }

        // Strip prefix
        if (prefix is not null && key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            key = key[prefix.Length..].TrimStart('_');
        }

        // Normalize key to lowercase dot-notation
        key = key.ToLowerInvariant().Replace("__", ".").Replace("_", ".");

        return (key, value);
    }
}
