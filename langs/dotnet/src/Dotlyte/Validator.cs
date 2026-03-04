using System.Text.RegularExpressions;

namespace Dotlyte;

/// <summary>
/// Schema validation engine for DOTLYTE v2.
/// </summary>
public static class Validator
{
    private static readonly Dictionary<string, string> FormatPatterns = new()
    {
        ["email"] = @"^[^@\s]+@[^@\s]+\.[^@\s]+$",
        ["uuid"] = @"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
        ["date"] = @"^\d{4}-\d{2}-\d{2}$",
        ["ipv4"] = @"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$",
    };

    /// <summary>
    /// Validate data against a schema. Returns a list of violations.
    /// </summary>
    public static List<SchemaViolation> Validate(
        Dictionary<string, object?> data,
        Dictionary<string, SchemaRule> schema,
        bool strict = false)
    {
        var violations = new List<SchemaViolation>();

        foreach (var (key, rule) in schema)
        {
            var value = GetNested(data, key);

            if (value is null)
            {
                if (rule.Required)
                    violations.Add(new SchemaViolation(key, $"Required key '{key}' is missing", rule));
                continue;
            }

            if (rule.Type is not null && !CheckType(value, rule.Type))
                violations.Add(new SchemaViolation(key,
                    $"Expected type '{rule.Type}' but got '{value.GetType().Name}'", rule));

            if (rule.Format is not null && value is string strVal && !CheckFormat(strVal, rule.Format))
                violations.Add(new SchemaViolation(key,
                    $"Value does not match format '{rule.Format}'", rule));

            if (rule.Pattern is not null && value is string patVal && !Regex.IsMatch(patVal, rule.Pattern))
                violations.Add(new SchemaViolation(key,
                    $"Value does not match pattern '{rule.Pattern}'", rule));

            if (rule.EnumValues is not null)
            {
                var strValue = value.ToString();
                if (!rule.EnumValues.Contains(strValue))
                    violations.Add(new SchemaViolation(key,
                        $"Value '{strValue}' not in allowed values: [{string.Join(", ", rule.EnumValues)}]", rule));
            }

            if (rule.Min is not null || rule.Max is not null)
            {
                if (TryGetNumeric(value, out var num))
                {
                    if (rule.Min is not null && num < rule.Min.Value)
                        violations.Add(new SchemaViolation(key,
                            $"Value {num} is below minimum {rule.Min.Value}", rule));
                    if (rule.Max is not null && num > rule.Max.Value)
                        violations.Add(new SchemaViolation(key,
                            $"Value {num} exceeds maximum {rule.Max.Value}", rule));
                }
            }
        }

        if (strict)
        {
            var schemaKeys = new HashSet<string>(schema.Keys);
            foreach (var flatKey in FlattenKeys(data))
            {
                if (!schemaKeys.Contains(flatKey))
                    violations.Add(new SchemaViolation(flatKey,
                        $"Unknown key '{flatKey}' not defined in schema",
                        new SchemaRule()));
            }
        }

        return violations;
    }

    /// <summary>
    /// Apply default values from schema to data (mutates data).
    /// </summary>
    public static void ApplyDefaults(
        Dictionary<string, object?> data,
        Dictionary<string, SchemaRule> schema)
    {
        foreach (var (key, rule) in schema)
        {
            if (rule.DefaultValue is not null && GetNested(data, key) is null)
            {
                SetNested(data, key, rule.DefaultValue);
            }
        }
    }

    /// <summary>
    /// Get the list of keys marked as sensitive in the schema.
    /// </summary>
    public static List<string> SensitiveKeys(Dictionary<string, SchemaRule> schema)
    {
        return schema
            .Where(kvp => kvp.Value.Sensitive)
            .Select(kvp => kvp.Key)
            .ToList();
    }

    /// <summary>
    /// Assert valid — throws <see cref="ValidationException"/> on failure.
    /// </summary>
    /// <exception cref="ValidationException">Thrown when validation fails.</exception>
    public static void AssertValid(
        Dictionary<string, object?> data,
        Dictionary<string, SchemaRule> schema,
        bool strict = false)
    {
        var violations = Validate(data, schema, strict);
        if (violations.Count > 0)
        {
            var messages = string.Join("; ", violations.Select(v => v.ToString()));
            throw new ValidationException(
                $"Schema validation failed: {messages}", violations);
        }
    }

    /// <summary>
    /// Get a nested value using dot-notation key.
    /// </summary>
    public static object? GetNested(Dictionary<string, object?> data, string key)
    {
        var parts = key.Split('.');
        object? current = data;

        foreach (var part in parts)
        {
            if (current is Dictionary<string, object?> dict && dict.TryGetValue(part, out var val))
                current = val;
            else
                return null;
        }

        return current;
    }

    /// <summary>
    /// Set a nested value using dot-notation key.
    /// </summary>
    public static void SetNested(Dictionary<string, object?> data, string key, object? value)
    {
        var parts = key.Split('.');
        var current = data;

        for (var i = 0; i < parts.Length - 1; i++)
        {
            if (!current.TryGetValue(parts[i], out var existing) ||
                existing is not Dictionary<string, object?> dict)
            {
                dict = new Dictionary<string, object?>();
                current[parts[i]] = dict;
            }
            current = dict;
        }

        current[parts[^1]] = value;
    }

    private static bool CheckType(object value, string type)
    {
        return type switch
        {
            "string" => value is string,
            "integer" => value is int or long or short or byte,
            "boolean" => value is bool,
            "number" => value is int or long or float or double or decimal or short or byte,
            "array" => value is System.Collections.IList,
            _ => true,
        };
    }

    private static bool CheckFormat(string value, string format)
    {
        if (FormatPatterns.TryGetValue(format, out var pattern))
            return Regex.IsMatch(value, pattern);

        return format switch
        {
            "url" => Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
                     (uri.Scheme == "http" || uri.Scheme == "https"),
            "ip" => System.Net.IPAddress.TryParse(value, out _),
            "port" => int.TryParse(value, out var p) && p is >= 1 and <= 65535,
            _ => true,
        };
    }

    private static bool TryGetNumeric(object value, out double result)
    {
        result = 0;
        if (value is int i) { result = i; return true; }
        if (value is long l) { result = l; return true; }
        if (value is float f) { result = f; return true; }
        if (value is double d) { result = d; return true; }
        if (value is decimal dec) { result = (double)dec; return true; }
        return false;
    }

    private static List<string> FlattenKeys(Dictionary<string, object?> data, string prefix = "")
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
