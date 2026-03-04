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
}
