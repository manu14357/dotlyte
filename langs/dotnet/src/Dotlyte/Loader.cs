using System.Text;
using System.Text.Json;

namespace Dotlyte;

/// <summary>
/// Main loader orchestrator (v2).
/// </summary>
internal sealed class Loader
{
    private static readonly HashSet<string> SystemEnvBlocklist = new(StringComparer.Ordinal)
    {
        "PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LC_ALL",
        "LOGNAME", "HOSTNAME", "PWD", "OLDPWD", "SHLVL", "TMPDIR",
        "EDITOR", "VISUAL", "PAGER", "DISPLAY",
        "SSH_AUTH_SOCK", "SSH_AGENT_PID", "GPG_AGENT_INFO",
        "COLORTERM", "TERM_PROGRAM", "TERM_PROGRAM_VERSION",
        "XPC_FLAGS", "XPC_SERVICE_NAME", "COMMAND_MODE",
        "LS_COLORS", "LSCOLORS", "CLICOLOR", "GREP_OPTIONS",
        "COMP_WORDBREAKS", "HISTSIZE", "HISTFILESIZE", "HISTCONTROL",
    };

    private static readonly string[] SystemPrefixes =
    [
        "npm_", "VSCODE_", "ELECTRON_", "CHROME_", "GITHUB_", "CI_",
        "GITLAB_", "JENKINS_", "TRAVIS_", "CIRCLECI_", "HOMEBREW_",
        "JAVA_HOME", "GOPATH", "NVM_", "RVM_", "RBENV_", "PYENV_",
        "CONDA_", "VIRTUAL_ENV", "CARGO_HOME",
    ];

    private readonly LoadOptions _options;

    public Loader(LoadOptions options)
    {
        _options = options;
    }

    public Config Load()
    {
        var baseDir = _options.FindUp ? FindBaseDir() : (_options.Cwd ?? Directory.GetCurrentDirectory());
        var layers = new List<Dictionary<string, object?>>();

        if (_options.Files is { Length: > 0 })
        {
            foreach (var f in _options.Files)
            {
                var full = ResolvePath(f, baseDir);
                if (!File.Exists(full))
                    throw new FileException($"Config file not found: {full}", full);
                var data = ParseFileByExtension(full);
                AppendIf(layers, data);
            }
        }
        else if (_options.Sources is not null)
        {
            foreach (var source in _options.Sources)
            {
                var data = LoadSource(source, baseDir);
                AppendIf(layers, data);
            }
        }
        else
        {
            AppendIf(layers, _options.Defaults);
            AppendIf(layers, LoadJsonFiles(baseDir));
            AppendIf(layers, LoadDotenvFiles(baseDir));
            AppendIf(layers, LoadEnvVars());
        }

        // Overrides (highest priority)
        AppendIf(layers, _options.Overrides);

        var merged = new Dictionary<string, object?>();
        foreach (var layer in layers)
        {
            merged = Merger.DeepMerge(merged, layer);
        }

        // Interpolation
        if (_options.InterpolateVars)
        {
            merged = Interpolation.InterpolateDeep(merged);
        }

        // Schema defaults
        if (_options.Schema is not null)
        {
            Validator.ApplyDefaults(merged, _options.Schema);
        }

        // Decryption
        var encKey = Encryption.ResolveEncryptionKey(_options.Env);
        if (encKey is not null)
        {
            merged = DecryptRecursive(merged, encKey);
        }

        // Schema validation
        if (_options.Schema is not null && _options.Strict)
        {
            Validator.AssertValid(merged, _options.Schema, _options.Strict);
        }

        // Build sensitive keys
        var sensitive = new List<string>();
        if (_options.Schema is not null)
        {
            sensitive.AddRange(Validator.SensitiveKeys(_options.Schema));
        }
        sensitive.AddRange(Masking.BuildSensitiveSet(merged));
        sensitive = sensitive.Distinct().ToList();

        return new Config(merged, _options.Schema, sensitive);
    }

    private static void AppendIf(List<Dictionary<string, object?>> layers, Dictionary<string, object?> data)
    {
        if (data.Count > 0) layers.Add(data);
    }

    private string FindBaseDir()
    {
        var dir = Path.GetFullPath(_options.Cwd ?? Directory.GetCurrentDirectory());

        while (true)
        {
            foreach (var marker in _options.RootMarkers)
            {
                if (File.Exists(Path.Combine(dir, marker)) || Directory.Exists(Path.Combine(dir, marker)))
                    return dir;
            }
            var parent = Directory.GetParent(dir);
            if (parent is null || parent.FullName == dir)
                return _options.Cwd ?? Directory.GetCurrentDirectory();
            dir = parent.FullName;
        }
    }

    private static string ResolvePath(string file, string baseDir)
    {
        if (Path.IsPathRooted(file))
            return file;
        return Path.Combine(baseDir, file);
    }

    private Dictionary<string, object?> LoadSource(string name, string baseDir)
    {
        return name switch
        {
            "defaults" => _options.Defaults,
            "json" => LoadJsonFiles(baseDir),
            "dotenv" => LoadDotenvFiles(baseDir),
            "env" => LoadEnvVars(),
            _ => new Dictionary<string, object?>(),
        };
    }

    private Dictionary<string, object?> LoadDotenvFiles(string baseDir)
    {
        var candidates = new List<string> { ".env" };
        if (_options.Env is not null)
            candidates.Add($".env.{_options.Env}");
        candidates.Add(".env.local");

        var merged = new Dictionary<string, object?>();
        foreach (var filename in candidates)
        {
            var full = Path.Combine(baseDir, filename);
            if (!File.Exists(full)) continue;
            var data = ParseDotenv(full);
            merged = Merger.DeepMerge(merged, data);
        }

        return merged;
    }

    private static Dictionary<string, object?> ParseDotenv(string filepath)
    {
        var result = new Dictionary<string, object?>();
        var lines = File.ReadAllLines(filepath);
        var i = 0;

        while (i < lines.Length)
        {
            var line = lines[i].Trim();
            i++;

            if (string.IsNullOrEmpty(line) || line.StartsWith('#'))
                continue;

            if (line.StartsWith("export ", StringComparison.Ordinal))
                line = line[7..];

            var eqIndex = line.IndexOf('=');
            if (eqIndex < 0) continue;

            var key = line[..eqIndex].Trim();
            var value = line[(eqIndex + 1)..].Trim();

            // Quoted values
            if (value.Length >= 1 && (value[0] == '"' || value[0] == '\'' || value[0] == '`'))
            {
                var quote = value[0];
                if (quote is '\'' or '`')
                {
                    var endIdx = value.IndexOf(quote, 1);
                    value = endIdx >= 0 ? value[1..endIdx] : value[1..];
                }
                else
                {
                    // Double-quoted, may be multiline
                    var stripped = value[1..];
                    var closingIdx = stripped.IndexOf('"');
                    if (closingIdx >= 0)
                    {
                        value = ProcessEscapes(stripped[..closingIdx]);
                    }
                    else
                    {
                        var sb = new StringBuilder(stripped);
                        while (i < lines.Length)
                        {
                            sb.Append('\n').Append(lines[i]);
                            i++;
                            var bufStr = sb.ToString();
                            var ci = bufStr.LastIndexOf('"');
                            if (ci >= 0)
                            {
                                value = ProcessEscapes(bufStr[..ci]);
                                break;
                            }
                        }
                    }
                }
            }
            else
            {
                // Unquoted: strip inline comment
                var commentIdx = value.IndexOf(" #", StringComparison.Ordinal);
                if (commentIdx >= 0)
                    value = value[..commentIdx].TrimEnd();
            }

            result[key.ToLowerInvariant()] = Coercion.Coerce(value);
        }

        return result;
    }

    private static string ProcessEscapes(string s)
    {
        return s.Replace("\\n", "\n")
                .Replace("\\t", "\t")
                .Replace("\\r", "\r")
                .Replace("\\\"", "\"")
                .Replace("\\\\", "\\");
    }

    private Dictionary<string, object?> LoadJsonFiles(string baseDir)
    {
        var candidates = new List<string> { "config.json" };
        if (_options.Env is not null)
            candidates.Add($"config.{_options.Env}.json");

        var merged = new Dictionary<string, object?>();
        foreach (var filename in candidates)
        {
            var full = Path.Combine(baseDir, filename);
            if (!File.Exists(full)) continue;

            var json = File.ReadAllText(full);
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
                var coerced = Coercion.Coerce(value);
                if (coerced is not null)
                    SetNested(result, cleanKey, coerced);
            }
            else if (_options.AllowAllEnvVars)
            {
                var coerced = Coercion.Coerce(value);
                if (coerced is not null)
                    result[key.ToLowerInvariant()] = coerced;
            }
            else
            {
                if (SystemEnvBlocklist.Contains(key))
                    continue;

                var skip = false;
                foreach (var pfx in SystemPrefixes)
                {
                    if (key.StartsWith(pfx, StringComparison.Ordinal))
                    {
                        skip = true;
                        break;
                    }
                }

                if (!skip)
                {
                    var coerced = Coercion.Coerce(value);
                    if (coerced is not null)
                        result[key.ToLowerInvariant()] = coerced;
                }
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

    private Dictionary<string, object?> ParseFileByExtension(string fullPath)
    {
        var ext = Path.GetExtension(fullPath).ToLowerInvariant();
        return ext switch
        {
            ".env" => ParseDotenv(fullPath),
            ".json" => ParseJsonFile(fullPath),
            _ => ParseDotenv(fullPath), // fallback
        };
    }

    private static Dictionary<string, object?> ParseJsonFile(string fullPath)
    {
        var json = File.ReadAllText(fullPath);
        var doc = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json);
        return doc is not null ? ConvertJsonDict(doc) : new Dictionary<string, object?>();
    }

    private static Dictionary<string, object?> DecryptRecursive(Dictionary<string, object?> data, string keyHex)
    {
        var result = new Dictionary<string, object?>();
        foreach (var (k, v) in data)
        {
            if (v is Dictionary<string, object?> nested)
                result[k] = DecryptRecursive(nested, keyHex);
            else if (Encryption.IsEncrypted(v))
                result[k] = Coercion.Coerce(Encryption.DecryptValue((string)v!, keyHex));
            else
                result[k] = v;
        }
        return result;
    }
}
