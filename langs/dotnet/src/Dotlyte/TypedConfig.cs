using System.Globalization;

namespace Dotlyte;

/// <summary>
/// Describes a single configuration field's type, constraints, and metadata.
/// </summary>
public sealed class FieldDescriptor
{
    /// <summary>Expected type: "string", "integer", "boolean", "number", "array".</summary>
    public string Type { get; init; } = "string";

    /// <summary>Whether the field is required.</summary>
    public bool Required { get; init; }

    /// <summary>Default value applied when the field is missing.</summary>
    public object? Default { get; init; }

    /// <summary>Allowed values for the field.</summary>
    public string[]? Enum { get; init; }

    /// <summary>Minimum numeric value.</summary>
    public double? Min { get; init; }

    /// <summary>Maximum numeric value.</summary>
    public double? Max { get; init; }

    /// <summary>Whether the field contains sensitive data.</summary>
    public bool Sensitive { get; init; }

    /// <summary>Documentation string for the field.</summary>
    public string? Doc { get; init; }
}

/// <summary>
/// Creates a strongly-typed configuration dictionary from a schema of <see cref="FieldDescriptor"/>
/// entries, reading values from environment variables with automatic type coercion and validation.
/// </summary>
public static class TypedConfig
{
    private static readonly HashSet<string> TrueValues = new(StringComparer.OrdinalIgnoreCase)
        { "true", "yes", "1", "on" };

    private static readonly HashSet<string> FalseValues = new(StringComparer.OrdinalIgnoreCase)
        { "false", "no", "0", "off" };

    private static readonly HashSet<string> NullValues = new(StringComparer.OrdinalIgnoreCase)
        { "null", "none", "nil", "" };

    /// <summary>
    /// Create a typed configuration dictionary from a schema of field descriptors.
    /// Values are read from <see cref="Environment.GetEnvironmentVariable(string)"/>
    /// and coerced to the declared type.
    /// </summary>
    /// <param name="schema">Map of key names to their field descriptors.</param>
    /// <param name="skipValidation">When <c>true</c>, skip enum/min/max validation.</param>
    /// <param name="onSecretAccess">Optional callback invoked when a sensitive field is accessed.</param>
    /// <returns>A dictionary of coerced, validated configuration values.</returns>
    /// <exception cref="DotlyteException">Thrown when a required key is missing or validation fails.</exception>
    public static Dictionary<string, object?> Create(
        Dictionary<string, FieldDescriptor> schema,
        bool skipValidation = false,
        Action<string>? onSecretAccess = null)
    {
        var result = new Dictionary<string, object?>();

        foreach (var (key, descriptor) in schema)
        {
            var envKey = key.Replace(".", "_").Replace("-", "_").ToUpperInvariant();
            var raw = Environment.GetEnvironmentVariable(envKey);

            object? value;
            if (raw is not null)
            {
                value = CoerceToType(raw, descriptor.Type, key);
            }
            else if (descriptor.Default is not null)
            {
                value = descriptor.Default;
            }
            else
            {
                value = null;
            }

            // Required check
            if (descriptor.Required && value is null)
            {
                throw new DotlyteException(
                    $"Required configuration key '{key}' is missing. " +
                    $"Set environment variable '{envKey}' or provide a default.", key);
            }

            // Validation (unless skipped)
            if (!skipValidation && value is not null)
            {
                ValidateField(key, value, descriptor);
            }

            // Notify on sensitive access
            if (descriptor.Sensitive && onSecretAccess is not null && value is not null)
            {
                onSecretAccess(key);
            }

            result[key] = value;
        }

        return result;
    }

    private static object? CoerceToType(string raw, string type, string key)
    {
        var trimmed = raw.Trim();

        if (NullValues.Contains(trimmed))
            return null;

        return type.ToLowerInvariant() switch
        {
            "string" => trimmed,
            "boolean" or "bool" => CoerceBoolean(trimmed, key),
            "integer" or "int" => CoerceInteger(trimmed, key),
            "number" or "float" or "double" => CoerceNumber(trimmed, key),
            "array" or "list" => CoerceArray(trimmed),
            _ => Coercion.Coerce(trimmed),
        };
    }

    private static bool CoerceBoolean(string value, string key)
    {
        if (TrueValues.Contains(value)) return true;
        if (FalseValues.Contains(value)) return false;
        throw new DotlyteException(
            $"Cannot coerce '{value}' to boolean for key '{key}'", key);
    }

    private static long CoerceInteger(string value, string key)
    {
        if (long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var result))
            return result;
        throw new DotlyteException(
            $"Cannot coerce '{value}' to integer for key '{key}'", key);
    }

    private static double CoerceNumber(string value, string key)
    {
        if (double.TryParse(value, NumberStyles.Float | NumberStyles.AllowThousands,
            CultureInfo.InvariantCulture, out var result))
            return result;
        throw new DotlyteException(
            $"Cannot coerce '{value}' to number for key '{key}'", key);
    }

    private static List<object?> CoerceArray(string value)
    {
        return value.Split(',')
            .Select(item => Coercion.Coerce(item.Trim()))
            .ToList();
    }

    private static void ValidateField(string key, object value, FieldDescriptor descriptor)
    {
        // Enum validation
        if (descriptor.Enum is not null)
        {
            var strValue = value.ToString();
            if (!descriptor.Enum.Contains(strValue))
            {
                throw new DotlyteException(
                    $"Value '{strValue}' for key '{key}' is not in allowed values: [{string.Join(", ", descriptor.Enum)}]",
                    key);
            }
        }

        // Min/Max validation
        if (descriptor.Min is not null || descriptor.Max is not null)
        {
            if (TryGetNumeric(value, out var num))
            {
                if (descriptor.Min is not null && num < descriptor.Min.Value)
                {
                    throw new DotlyteException(
                        $"Value {num} for key '{key}' is below minimum {descriptor.Min.Value}",
                        key);
                }

                if (descriptor.Max is not null && num > descriptor.Max.Value)
                {
                    throw new DotlyteException(
                        $"Value {num} for key '{key}' exceeds maximum {descriptor.Max.Value}",
                        key);
                }
            }
        }
    }

    private static bool TryGetNumeric(object value, out double result)
    {
        result = 0;
        try
        {
            result = Convert.ToDouble(value, CultureInfo.InvariantCulture);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
