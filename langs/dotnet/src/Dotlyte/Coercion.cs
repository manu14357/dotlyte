using System.Globalization;
using System.Text.RegularExpressions;

namespace Dotlyte;

/// <summary>
/// Type coercion engine.
/// </summary>
public static partial class Coercion
{
    private static readonly HashSet<string> NullValues = new(StringComparer.OrdinalIgnoreCase)
        { "null", "none", "nil", "" };

    private static readonly HashSet<string> TrueValues = new(StringComparer.OrdinalIgnoreCase)
        { "true", "yes", "1", "on" };

    private static readonly HashSet<string> FalseValues = new(StringComparer.OrdinalIgnoreCase)
        { "false", "no", "0", "off" };

    /// <summary>
    /// Coerce a string value to its proper .NET type.
    /// </summary>
    public static object? Coerce(object? value)
    {
        if (value is not string str)
            return value;

        var trimmed = str.Trim();
        var lower = trimmed.ToLowerInvariant();

        // Null
        if (NullValues.Contains(lower))
            return null;

        // Boolean true
        if (TrueValues.Contains(lower))
            return true;

        // Boolean false
        if (FalseValues.Contains(lower))
            return false;

        // Integer
        if (Regex.IsMatch(trimmed, @"^-?\d+$"))
        {
            if (long.TryParse(trimmed, NumberStyles.Integer, CultureInfo.InvariantCulture, out var intVal))
                return intVal;
        }

        // Float
        if (trimmed.Contains('.') && Regex.IsMatch(trimmed, @"^-?\d+\.\d+$"))
        {
            if (double.TryParse(trimmed, NumberStyles.Float, CultureInfo.InvariantCulture, out var floatVal))
                return floatVal;
        }

        // List (comma-separated)
        if (trimmed.Contains(','))
        {
            return trimmed.Split(',')
                .Select(item => Coerce(item.Trim()))
                .ToList();
        }

        return trimmed;
    }

    /// <summary>
    /// Recursively coerce all string values in a dictionary.
    /// </summary>
    public static Dictionary<string, object?> CoerceDictionary(Dictionary<string, object?> data)
    {
        var result = new Dictionary<string, object?>();

        foreach (var (key, value) in data)
        {
            result[key] = value switch
            {
                Dictionary<string, object?> dict => CoerceDictionary(dict),
                string s => Coerce(s),
                _ => value,
            };
        }

        return result;
    }
}
