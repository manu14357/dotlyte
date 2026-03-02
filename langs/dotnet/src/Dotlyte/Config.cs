namespace Dotlyte;

/// <summary>
/// Configuration object with dot-notation access.
/// </summary>
public sealed class Config
{
    private readonly Dictionary<string, object?> _data;

    /// <summary>
    /// Initializes a new <see cref="Config"/> from a dictionary.
    /// </summary>
    public Config(Dictionary<string, object?> data)
    {
        _data = data;
    }

    /// <summary>
    /// Get a value by dot-notation key with optional default.
    /// </summary>
    public object? Get(string key, object? defaultValue = null)
    {
        var parts = key.Split('.');
        object? current = _data;

        foreach (var part in parts)
        {
            if (current is Dictionary<string, object?> dict && dict.TryGetValue(part, out var val))
            {
                current = val;
            }
            else
            {
                return defaultValue;
            }
        }

        return current;
    }

    /// <summary>
    /// Get a typed value by dot-notation key with optional default.
    /// </summary>
    public T? Get<T>(string key, T? defaultValue = default)
    {
        var value = Get(key);
        if (value is null)
            return defaultValue;

        try
        {
            return (T)Convert.ChangeType(value, typeof(T));
        }
        catch
        {
            return defaultValue;
        }
    }

    /// <summary>
    /// Require a key — throws if missing.
    /// </summary>
    /// <exception cref="DotlyteException">Thrown when the key is missing.</exception>
    public object Require(string key)
    {
        var value = Get(key);
        if (value is null)
        {
            throw new DotlyteException(
                $"Required config key '{key}' is missing. " +
                "Set it in your .env file or as an environment variable.",
                key
            );
        }

        return value;
    }

    /// <summary>
    /// Check if a key exists.
    /// </summary>
    public bool Has(string key) => Get(key) is not null;

    /// <summary>
    /// Access a top-level key. Returns a nested Config for dictionaries.
    /// </summary>
    public object? this[string key]
    {
        get
        {
            if (!_data.TryGetValue(key, out var value))
                return null;

            return value is Dictionary<string, object?> dict
                ? new Config(dict)
                : value;
        }
    }

    /// <summary>
    /// Convert to a plain dictionary.
    /// </summary>
    public Dictionary<string, object?> ToDictionary() => new(_data);
}
