using System.Text.RegularExpressions;

namespace Dotlyte;

/// <summary>
/// Sensitive value masking for DOTLYTE v2.
/// </summary>
public static class Masking
{
    /// <summary>The replacement string for redacted values.</summary>
    public const string Redacted = "[REDACTED]";

    private static readonly Regex[] SensitivePatterns =
    [
        new(@"password", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"secret", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"token", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"api[_\-]?key", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"private[_\-]?key", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"access[_\-]?key", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"auth", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"credential", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"connection[_\-]?string", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"dsn", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"encryption[_\-]?key", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"signing[_\-]?key", RegexOptions.IgnoreCase | RegexOptions.Compiled),
        new(@"certificate", RegexOptions.IgnoreCase | RegexOptions.Compiled),
    ];

    /// <summary>
    /// Build the set of sensitive keys (auto-detected + schema).
    /// </summary>
    public static List<string> BuildSensitiveSet(
        Dictionary<string, object?> data,
        IEnumerable<string>? schemaKeys = null)
    {
        var set = new HashSet<string>(schemaKeys ?? Enumerable.Empty<string>());

        foreach (var key in FlattenKeys(data))
        {
            foreach (var pattern in SensitivePatterns)
            {
                if (pattern.IsMatch(key))
                {
                    set.Add(key);
                    break;
                }
            }
        }

        return set.ToList();
    }

    /// <summary>
    /// Redact sensitive values in a deep dictionary.
    /// </summary>
    public static Dictionary<string, object?> RedactDictionary(
        Dictionary<string, object?> data,
        IReadOnlyCollection<string> sensitiveKeys,
        string prefix = "")
    {
        var result = new Dictionary<string, object?>();
        foreach (var (key, value) in data)
        {
            var fullKey = string.IsNullOrEmpty(prefix) ? key : $"{prefix}.{key}";

            if (sensitiveKeys.Contains(fullKey))
                result[key] = Redacted;
            else if (value is Dictionary<string, object?> nested)
                result[key] = RedactDictionary(nested, sensitiveKeys, fullKey);
            else
                result[key] = value;
        }
        return result;
    }

    /// <summary>
    /// Partially show a value: first 2 chars visible, rest masked.
    /// </summary>
    public static string FormatRedacted(string? value)
    {
        if (value is null)
            return Redacted;
        if (value.Length <= 4)
            return new string('*', value.Length);
        return value[..2] + new string('*', value.Length - 2);
    }

    private static List<string> FlattenKeys(
        Dictionary<string, object?> data, string prefix = "")
    {
        var result = new List<string>();
        foreach (var (key, value) in data)
        {
            var fullKey = string.IsNullOrEmpty(prefix) ? key : $"{prefix}.{key}";
            if (value is Dictionary<string, object?> nested)
                result.AddRange(FlattenKeys(nested, fullKey));
            else
                result.Add(fullKey);
        }
        return result;
    }

    /// <summary>
    /// Compile an array of regex pattern strings into <see cref="Regex"/> objects.
    /// </summary>
    /// <param name="patterns">Array of regex pattern strings.</param>
    /// <returns>Array of compiled <see cref="Regex"/> instances.</returns>
    public static Regex[] CompilePatterns(string[] patterns)
    {
        return patterns
            .Select(p => new Regex(p, RegexOptions.IgnoreCase | RegexOptions.Compiled))
            .ToArray();
    }

    /// <summary>
    /// Build a set of sensitive keys by combining explicit keys, regex patterns, and schema-defined sensitive keys.
    /// </summary>
    /// <param name="keys">Explicit key names of configuration entries to check against patterns.</param>
    /// <param name="patterns">Optional regex patterns to match against key names.</param>
    /// <param name="schemaSensitive">Optional set of keys marked sensitive in a schema.</param>
    /// <returns>A <see cref="HashSet{T}"/> of all keys determined to be sensitive.</returns>
    public static HashSet<string> BuildSensitiveSetWithPatterns(
        string[] keys,
        string[]? patterns = null,
        HashSet<string>? schemaSensitive = null)
    {
        var result = new HashSet<string>(schemaSensitive ?? Enumerable.Empty<string>());

        var compiledPatterns = patterns is not null
            ? CompilePatterns(patterns)
            : SensitivePatterns;

        foreach (var key in keys)
        {
            foreach (var pattern in compiledPatterns)
            {
                if (pattern.IsMatch(key))
                {
                    result.Add(key);
                    break;
                }
            }
        }

        return result;
    }
}

/// <summary>
/// An audit proxy that wraps a configuration dictionary and invokes a callback
/// whenever a sensitive key is accessed through the indexer.
/// </summary>
public sealed class ConfigAuditProxy
{
    private readonly Dictionary<string, object?> _data;
    private readonly HashSet<string> _sensitiveKeys;
    private readonly Action<string> _onAccess;

    /// <summary>
    /// Initializes a new <see cref="ConfigAuditProxy"/>.
    /// </summary>
    /// <param name="data">The backing configuration data.</param>
    /// <param name="sensitiveKeys">Set of keys considered sensitive.</param>
    /// <param name="onAccess">Callback invoked with the key name when a sensitive key is accessed.</param>
    public ConfigAuditProxy(
        Dictionary<string, object?> data,
        HashSet<string> sensitiveKeys,
        Action<string> onAccess)
    {
        _data = data ?? throw new ArgumentNullException(nameof(data));
        _sensitiveKeys = sensitiveKeys ?? throw new ArgumentNullException(nameof(sensitiveKeys));
        _onAccess = onAccess ?? throw new ArgumentNullException(nameof(onAccess));
    }

    /// <summary>
    /// Access a configuration value by key. Triggers the audit callback for sensitive keys.
    /// </summary>
    /// <param name="key">The configuration key.</param>
    /// <returns>The configuration value, or <c>null</c> if not found.</returns>
    public object? this[string key]
    {
        get
        {
            if (_sensitiveKeys.Contains(key))
            {
                _onAccess(key);
            }

            _data.TryGetValue(key, out var value);
            return value;
        }
    }

    /// <summary>
    /// Get all keys in the backing dictionary.
    /// </summary>
    public IReadOnlyCollection<string> Keys => _data.Keys;
}
