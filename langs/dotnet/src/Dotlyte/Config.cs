using System.Text.Json;

namespace Dotlyte;

/// <summary>
/// Immutable configuration object with dot-notation access (v2).
/// </summary>
public sealed class Config
{
    private readonly Dictionary<string, object?> _data;
    private readonly Dictionary<string, SchemaRule>? _schema;
    private readonly List<string> _sensitiveKeys;

    /// <summary>
    /// Initializes a new <see cref="Config"/> from a dictionary.
    /// </summary>
    public Config(
        Dictionary<string, object?> data,
        Dictionary<string, SchemaRule>? schema = null,
        List<string>? sensitiveKeys = null)
    {
        _data = data;
        _schema = schema;
        _sensitiveKeys = sensitiveKeys ?? new List<string>();
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
    /// <exception cref="MissingKeyException">Thrown when the key is missing.</exception>
    public object Require(string key)
    {
        var value = Get(key);
        if (value is null)
        {
            throw new MissingKeyException(
                $"Required config key '{key}' is missing. " +
                "Set it in your .env file or as an environment variable.",
                key
            );
        }

        return value;
    }

    /// <summary>
    /// Require multiple keys at once.
    /// </summary>
    /// <exception cref="MissingKeyException">Thrown when any key is missing.</exception>
    public object[] RequireKeys(params string[] keys)
    {
        return keys.Select(Require).ToArray();
    }

    /// <summary>
    /// Check if a key exists.
    /// </summary>
    public bool Has(string key) => Get(key) is not null;

    /// <summary>
    /// Get a scoped sub-config.
    /// </summary>
    /// <exception cref="DotlyteException">Thrown when the prefix section is not found.</exception>
    public Config Scope(string prefix)
    {
        var sub = Get(prefix);
        if (sub is not Dictionary<string, object?> dict)
            throw new DotlyteException($"No config section found for '{prefix}'", prefix);

        var pfx = prefix + ".";
        var scopedSensitive = _sensitiveKeys
            .Where(sk => sk.StartsWith(pfx, StringComparison.Ordinal))
            .Select(sk => sk[pfx.Length..])
            .ToList();

        return new Config(dict, null, scopedSensitive);
    }

    /// <summary>
    /// All top-level keys.
    /// </summary>
    public List<string> Keys() => _data.Keys.ToList();

    /// <summary>
    /// All keys flattened via dot-notation.
    /// </summary>
    public List<string> ToFlatKeys() => FlatKeys(_data);

    /// <summary>
    /// Flatten the config to a single-level dictionary.
    /// </summary>
    public Dictionary<string, object?> ToFlatDictionary() => Flatten(_data);

    /// <summary>
    /// Access a top-level key. Returns a nested Config for dictionaries.
    /// </summary>
    public object? this[string key]
    {
        get
        {
            if (!_data.TryGetValue(key, out var value))
                return null;

            if (value is Dictionary<string, object?> dict)
            {
                var pfx = key + ".";
                var scopedSensitive = _sensitiveKeys
                    .Where(sk => sk.StartsWith(pfx, StringComparison.Ordinal))
                    .Select(sk => sk[pfx.Length..])
                    .ToList();
                return new Config(dict, null, scopedSensitive);
            }

            return value;
        }
    }

    /// <summary>
    /// Convert to a plain dictionary.
    /// </summary>
    public Dictionary<string, object?> ToDictionary() => new(_data);

    /// <summary>
    /// Return a redacted dictionary with sensitive values masked.
    /// </summary>
    public Dictionary<string, object?> ToDictionaryRedacted()
    {
        return Masking.RedactDictionary(_data, _sensitiveKeys);
    }

    /// <summary>
    /// Serialize to JSON string.
    /// </summary>
    public string ToJson(JsonSerializerOptions? options = null)
    {
        options ??= new JsonSerializerOptions { WriteIndented = true };
        return JsonSerializer.Serialize(_data, options);
    }

    /// <summary>
    /// Write config to a file (JSON).
    /// </summary>
    /// <exception cref="DotlyteException">Thrown on unsupported format.</exception>
    public void WriteTo(string path)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();
        var content = ext switch
        {
            ".json" => ToJson(),
            _ => throw new DotlyteException($"Unsupported output format: {ext}"),
        };
        File.WriteAllText(path, content);
    }

    /// <summary>
    /// Validate against schema.
    /// </summary>
    public List<SchemaViolation> Validate(Dictionary<string, SchemaRule>? schema = null)
    {
        var s = schema ?? _schema;
        if (s is null) return new List<SchemaViolation>();
        return Validator.Validate(_data, s);
    }

    /// <summary>
    /// Assert valid — throws on failure.
    /// </summary>
    /// <exception cref="ValidationException">Thrown when validation fails.</exception>
    public void AssertValid(Dictionary<string, SchemaRule>? schema = null)
    {
        var s = schema ?? _schema;
        if (s is null) return;
        Validator.AssertValid(_data, s);
    }

    private static List<string> FlatKeys(Dictionary<string, object?> data, string prefix = "")
    {
        var result = new List<string>();
        foreach (var (key, value) in data)
        {
            var fullKey = string.IsNullOrEmpty(prefix) ? key : $"{prefix}.{key}";
            if (value is Dictionary<string, object?> nested)
                result.AddRange(FlatKeys(nested, fullKey));
            else
                result.Add(fullKey);
        }
        return result;
    }

    private static Dictionary<string, object?> Flatten(Dictionary<string, object?> data, string prefix = "")
    {
        var result = new Dictionary<string, object?>();
        foreach (var (key, value) in data)
        {
            var fullKey = string.IsNullOrEmpty(prefix) ? key : $"{prefix}.{key}";
            if (value is Dictionary<string, object?> nested)
            {
                foreach (var (k, v) in Flatten(nested, fullKey))
                    result[k] = v;
            }
            else
            {
                result[fullKey] = value;
            }
        }
        return result;
    }
}
