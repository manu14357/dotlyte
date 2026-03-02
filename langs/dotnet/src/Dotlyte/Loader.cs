using System.Text.Json;

namespace Dotlyte;

/// <summary>
/// Main loader orchestrator.
/// </summary>
internal sealed class Loader
{
    private readonly LoadOptions _options;

    public Loader(LoadOptions options)
    {
        _options = options;
    }

    public Config Load()
    {
        var layers = new List<Dictionary<string, object?>>();

        if (_options.Sources is not null)
        {
            foreach (var source in _options.Sources)
            {
                var data = LoadSource(source);
                if (data.Count > 0) layers.Add(data);
            }
        }
        else
        {
            AppendIf(layers, _options.Defaults);
            AppendIf(layers, LoadJsonFiles());
            AppendIf(layers, LoadDotenvFiles());
            AppendIf(layers, LoadEnvVars());
        }

        var merged = new Dictionary<string, object?>();
        foreach (var layer in layers)
        {
            merged = Merger.DeepMerge(merged, layer);
        }

        return new Config(merged);
    }

    private static void AppendIf(List<Dictionary<string, object?>> layers, Dictionary<string, object?> data)
    {
        if (data.Count > 0) layers.Add(data);
    }

    private Dictionary<string, object?> LoadSource(string name)
    {
        return name switch
        {
            "defaults" => _options.Defaults,
            "json" => LoadJsonFiles(),
            "dotenv" => LoadDotenvFiles(),
            "env" => LoadEnvVars(),
            _ => new Dictionary<string, object?>(),
        };
    }

    private Dictionary<string, object?> LoadDotenvFiles()
    {
        var candidates = new List<string> { ".env" };
        if (_options.Env is not null)
            candidates.Add($".env.{_options.Env}");
        candidates.Add(".env.local");

        var merged = new Dictionary<string, object?>();
        foreach (var filename in candidates)
        {
            if (!File.Exists(filename)) continue;
            var data = ParseDotenv(filename);
            merged = Merger.DeepMerge(merged, data);
        }

        return merged;
    }

    private static Dictionary<string, object?> ParseDotenv(string filepath)
    {
        var result = new Dictionary<string, object?>();
        foreach (var rawLine in File.ReadLines(filepath))
        {
            var line = rawLine.Trim();
            if (string.IsNullOrEmpty(line) || line.StartsWith('#'))
                continue;

            if (line.StartsWith("export ", StringComparison.Ordinal))
                line = line[7..];

            var eqIndex = line.IndexOf('=');
            if (eqIndex < 0) continue;

            var key = line[..eqIndex].Trim();
            var value = line[(eqIndex + 1)..].Trim();

            // Remove surrounding quotes
            if (value.Length >= 2)
            {
                var first = value[0];
                var last = value[^1];
                if (first == last && (first == '"' || first == '\''))
                    value = value[1..^1];
            }

            result[key.ToLowerInvariant()] = Coercion.Coerce(value);
        }

        return result;
    }

    private Dictionary<string, object?> LoadJsonFiles()
    {
        var candidates = new List<string> { "config.json" };
        if (_options.Env is not null)
            candidates.Add($"config.{_options.Env}.json");

        var merged = new Dictionary<string, object?>();
        foreach (var filename in candidates)
        {
            if (!File.Exists(filename)) continue;

            var json = File.ReadAllText(filename);
            var doc = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json);
            if (doc is null) continue;

            var data = ConvertJsonDict(doc);
            merged = Merger.DeepMerge(merged, data);
        }

        return merged;
    }

    private static Dictionary<string, object?> ConvertJsonDict(Dictionary<string, JsonElement> source)
    {
        var result = new Dictionary<string, object?>();
        foreach (var (key, element) in source)
        {
            result[key] = ConvertJsonElement(element);
        }
        return result;
    }

    private static object? ConvertJsonElement(JsonElement element)
    {
        return element.ValueKind switch
        {
            JsonValueKind.Object => element.EnumerateObject()
                .ToDictionary(
                    p => p.Name,
                    p => ConvertJsonElement(p.Value)),
            JsonValueKind.Array => element.EnumerateArray()
                .Select(ConvertJsonElement)
                .ToList(),
            JsonValueKind.String => element.GetString(),
            JsonValueKind.Number => element.TryGetInt64(out var l) ? l : element.GetDouble(),
            JsonValueKind.True => (object?)true,
            JsonValueKind.False => false,
            _ => null,
        };
    }

    private Dictionary<string, object?> LoadEnvVars()
    {
        var result = new Dictionary<string, object?>();
        var prefix = _options.Prefix?.ToUpperInvariant() + "_";

        foreach (var entry in Environment.GetEnvironmentVariables())
        {
            if (entry is not System.Collections.DictionaryEntry de) continue;
            var key = de.Key?.ToString();
            var value = de.Value?.ToString();
            if (key is null || value is null) continue;

            if (_options.Prefix is not null)
            {
                if (!key.StartsWith(prefix!, StringComparison.Ordinal)) continue;
                var cleanKey = key[prefix!.Length..].ToLowerInvariant();
                SetNested(result, cleanKey, Coercion.Coerce(value));
            }
            else
            {
                result[key.ToLowerInvariant()] = Coercion.Coerce(value);
            }
        }

        return result;
    }

    private static void SetNested(Dictionary<string, object?> data, string key, object? value)
    {
        var parts = key.Split('_');
        var current = data;

        for (var i = 0; i < parts.Length - 1; i++)
        {
            if (!current.TryGetValue(parts[i], out var existing) || existing is not Dictionary<string, object?> dict)
            {
                dict = new Dictionary<string, object?>();
                current[parts[i]] = dict;
            }
            current = dict;
        }

        current[parts[^1]] = value;
    }
}
