namespace Dotlyte;

/// <summary>
/// Main entry point for DOTLYTE configuration loading.
/// </summary>
public static class DotlyteLoader
{
    /// <summary>
    /// Load configuration from all available sources.
    /// </summary>
    /// <param name="options">Load options (optional).</param>
    /// <returns>A merged Config object.</returns>
    public static Config Load(LoadOptions? options = null)
    {
        options ??= new LoadOptions();
        var loader = new Loader(options);
        return loader.Load();
    }
}
