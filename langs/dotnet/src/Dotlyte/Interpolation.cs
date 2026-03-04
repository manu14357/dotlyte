using System.Text;
using System.Text.RegularExpressions;

namespace Dotlyte;

/// <summary>
/// Variable interpolation engine for DOTLYTE v2.
/// Supports ${VAR}, ${VAR:-default}, ${VAR:?error}, and $$ escape.
/// </summary>
public static class Interpolation
{
    /// <summary>
    /// Interpolate ${VAR} references in a flat string dictionary.
    /// </summary>
    public static Dictionary<string, string> Interpolate(
        Dictionary<string, string> data,
        Dictionary<string, string>? context = null)
    {
        context ??= new Dictionary<string, string>();
        var resolved = new Dictionary<string, string>();
        var resolving = new HashSet<string>();

        foreach (var key in data.Keys)
        {
            Resolve(key, data, context, resolved, resolving);
        }

        return resolved;
    }

    /// <summary>
    /// Interpolate a deep (nested) dictionary.
    /// Only string values containing ${...} are interpolated.
    /// </summary>
    public static Dictionary<string, object?> InterpolateDeep(
        Dictionary<string, object?> data,
        Dictionary<string, object?>? context = null)
    {
        var flat = FlattenToStrings(data);
        var ctxFlat = context is not null ? FlattenToStrings(context) : new Dictionary<string, string>();

        var needsInterpolation = flat
            .Where(kvp => kvp.Value.Contains("${"))
            .ToDictionary(kvp => kvp.Key, kvp => kvp.Value);

        if (needsInterpolation.Count == 0)
            return DeepCopy(data);

        var resolved = Interpolate(flat, ctxFlat);
        var result = DeepCopy(data);

        foreach (var key in needsInterpolation.Keys)
        {
            if (resolved.TryGetValue(key, out var val))
            {
                SetNested(result, key, Coercion.Coerce(val));
            }
        }

        return result;
    }

    private static string Resolve(
        string key,
        Dictionary<string, string> data,
        Dictionary<string, string> context,
        Dictionary<string, string> resolved,
        HashSet<string> resolving)
    {
        if (resolved.TryGetValue(key, out var cached))
            return cached;

        if (resolving.Contains(key))
            throw new InterpolationException(
                $"Circular reference detected for variable: {key}", key);

        if (!data.TryGetValue(key, out var rawValue))
        {
            if (context.TryGetValue(key, out var ctxVal))
                return ctxVal;
            var env = Environment.GetEnvironmentVariable(key.ToUpperInvariant());
            return env ?? string.Empty;
        }

        resolving.Add(key);
        var val2 = ResolveString(rawValue, data, context, resolved, resolving);
        resolving.Remove(key);
        resolved[key] = val2;
        return val2;
    }

    private static string ResolveString(
        string s,
        Dictionary<string, string> data,
        Dictionary<string, string> context,
        Dictionary<string, string> resolved,
        HashSet<string> resolving)
    {
        const string placeholder = "\x00DOLLAR\x00";
        s = s.Replace("$$", placeholder);

        var sb = new StringBuilder();
        var i = 0;

        while (i < s.Length)
        {
            if (i + 1 < s.Length && s[i] == '$' && s[i + 1] == '{')
            {
                i += 2;
                var depth = 1;
                var inner = new StringBuilder();
                while (i < s.Length && depth > 0)
                {
                    if (s[i] == '{') depth++;
                    else if (s[i] == '}')
                    {
                        depth--;
                        if (depth == 0) { i++; break; }
                    }
                    inner.Append(s[i]);
                    i++;
                }
                sb.Append(ResolveReference(inner.ToString(), data, context, resolved, resolving));
            }
            else
            {
                sb.Append(s[i]);
                i++;
            }
        }

        return sb.ToString().Replace(placeholder, "$");
    }

    private static string ResolveReference(
        string inner,
        Dictionary<string, string> data,
        Dictionary<string, string> context,
        Dictionary<string, string> resolved,
        HashSet<string> resolving)
    {
        string varName;
        string? errorMsg = null;
        string? fallback = null;

        var errIdx = inner.IndexOf(":?", StringComparison.Ordinal);
        var defIdx = inner.IndexOf(":-", StringComparison.Ordinal);

        if (errIdx >= 0)
        {
            varName = inner[..errIdx].Trim();
            errorMsg = inner[(errIdx + 2)..];
        }
        else if (defIdx >= 0)
        {
            varName = inner[..defIdx].Trim();
            fallback = inner[(defIdx + 2)..];
        }
        else
        {
            varName = inner.Trim();
        }

        var lower = varName.ToLowerInvariant();

        // Same-file
        if (data.ContainsKey(lower))
        {
            var val = Resolve(lower, data, context, resolved, resolving);
            if (!string.IsNullOrEmpty(val))
                return val;
        }

        // Context
        if (context.TryGetValue(lower, out var ctxVal) && !string.IsNullOrEmpty(ctxVal))
            return ctxVal;

        // Environment
        var env = Environment.GetEnvironmentVariable(varName)
            ?? Environment.GetEnvironmentVariable(varName.ToUpperInvariant());
        if (!string.IsNullOrEmpty(env))
            return env;

        // Not found
        if (errorMsg is not null)
            throw new InterpolationException(
                $"Required variable '{varName}': {errorMsg}", varName);

        return fallback ?? string.Empty;
    }

    private static Dictionary<string, string> FlattenToStrings(
        Dictionary<string, object?> data, string prefix = "")
    {
        var result = new Dictionary<string, string>();
        foreach (var (key, value) in data)
        {
            var fullKey = string.IsNullOrEmpty(prefix) ? key : $"{prefix}.{key}";
            if (value is Dictionary<string, object?> nested)
            {
                foreach (var (k, v) in FlattenToStrings(nested, fullKey))
                    result[k] = v;
            }
            else if (value is not null)
            {
                result[fullKey] = value.ToString()!;
            }
        }
        return result;
    }

    private static Dictionary<string, object?> DeepCopy(Dictionary<string, object?> data)
    {
        var result = new Dictionary<string, object?>();
        foreach (var (k, v) in data)
        {
            result[k] = v is Dictionary<string, object?> nested
                ? DeepCopy(nested)
                : v;
        }
        return result;
    }

    private static void SetNested(Dictionary<string, object?> data, string key, object? value)
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
}
