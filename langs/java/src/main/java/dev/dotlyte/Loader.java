package dev.dotlyte;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Main loader orchestrator — v2.
 *
 * <p>Supports explicit file lists, upward directory walking, variable
 * interpolation, schema defaults/validation, overrides layer, and
 * system env-var blocklisting.</p>
 */
class Loader {

    // ── Source interface ────────────────────────────────────────

    /** A pluggable configuration source. */
    interface Source {
        String name();
        Map<String, Object> load(LoadOptions options);
    }

    // ── System env blocklist ───────────────────────────────────

    private static final Set<String> SYSTEM_ENV_BLOCKLIST;
    static {
        Set<String> s = new HashSet<>(Arrays.asList(
                "PATH", "HOME", "USER", "SHELL", "TERM", "LANG", "LOGNAME",
                "DISPLAY", "HOSTNAME", "EDITOR", "VISUAL", "PAGER", "SHLVL",
                "PWD", "OLDPWD", "TMPDIR", "COLORTERM", "TERM_PROGRAM",
                "_", "LS_COLORS", "XPC_SERVICE_NAME", "XPC_FLAGS",
                "MANPATH", "SSH_AUTH_SOCK", "ANDROID_HOME", "JAVA_HOME",
                "GOPATH", "GOROOT", "CARGO_HOME", "RUSTUP_HOME", "NVM_DIR",
                "PYENV_ROOT", "RBENV_ROOT", "GEM_HOME", "GEM_PATH"));
        SYSTEM_ENV_BLOCKLIST = Collections.unmodifiableSet(s);
    }

    private static final String[] SYSTEM_PREFIXES = {
            "npm_", "VSCODE_", "TERM_", "XDG_", "LC_", "LESS", "SSH_",
            "GPG_", "DBUS_", "DESKTOP_", "GDM_", "GNOME_", "GTK_",
            "WINDOWMANAGER", "SWAYSOCK"
    };

    private static boolean isSystemVar(String key) {
        if (SYSTEM_ENV_BLOCKLIST.contains(key)) return true;
        String upper = key.toUpperCase();
        for (String pfx : SYSTEM_PREFIXES) {
            if (upper.startsWith(pfx.toUpperCase())) return true;
        }
        return false;
    }

    // ── Root markers (findUp) ──────────────────────────────────

    private static final List<String> DEFAULT_ROOT_MARKERS = Arrays.asList(
            ".git", "package.json", "go.mod", "Cargo.toml", "pom.xml",
            "build.gradle", "build.gradle.kts", "pyproject.toml",
            "Gemfile", "composer.json", ".dotlyte"
    );

    // ── Fields ─────────────────────────────────────────────────

    private final LoadOptions options;

    Loader(LoadOptions options) {
        this.options = options;
    }

    // ── Main load ──────────────────────────────────────────────

    Config load() {
        Path baseDir = resolveBaseDir();
        List<Map<String, Object>> layers = new ArrayList<>();

        // 1 — Defaults (lowest priority)
        addIfPresent(layers, options.getDefaults());

        // 2 — Explicit files or auto-discovery
        if (options.getFiles() != null && !options.getFiles().isEmpty()) {
            for (String file : options.getFiles()) {
                Path path = baseDir.resolve(file);
                if (!Files.exists(path)) {
                    throw new DotlyteException.FileException(
                            path.toString(), "File not found");
                }
                addIfPresent(layers, parseFileByExtension(path));
            }
        } else if (options.getSources() != null) {
            for (String source : options.getSources()) {
                addIfPresent(layers, loadSource(source, baseDir));
            }
        } else {
            addIfPresent(layers, loadYamlFiles(baseDir));
            addIfPresent(layers, loadJsonFiles(baseDir));
            addIfPresent(layers, loadDotenvFiles(baseDir));
            addIfPresent(layers, loadEnvVars());
        }

        // 3 — Overrides (highest priority)
        addIfPresent(layers, options.getOverrides());

        // Merge
        Map<String, Object> merged = new LinkedHashMap<>();
        for (Map<String, Object> layer : layers) {
            merged = Merger.deepMerge(merged, layer);
        }

        // 4 — schema defaults
        Map<String, SchemaRule> schema = options.getSchema();
        if (schema != null) {
            Validator.applyDefaults(merged, schema);
        }

        // 5 — interpolation
        if (options.isInterpolateVars()) {
            merged = Interpolation.interpolateDeep(merged, merged);
        }

        // 6 — schema validation
        if (schema != null) {
            List<SchemaViolation> violations = Validator.validate(
                    merged, schema, options.isStrict());
            if (!violations.isEmpty()) {
                throw new DotlyteException.ValidationException(violations);
            }
        }

        // Build sensitive keys set
        Set<String> sensitiveKeys = new LinkedHashSet<>();
        if (schema != null) {
            sensitiveKeys.addAll(Validator.getSensitiveKeys(schema));
        }
        sensitiveKeys.addAll(Masking.buildSensitiveSet(merged, sensitiveKeys));

        return new Config(merged, schema, sensitiveKeys);
    }

    // ── Directory resolution ───────────────────────────────────

    private Path resolveBaseDir() {
        Path start;
        if (options.getCwd() != null) {
            start = Path.of(options.getCwd());
        } else {
            start = Path.of(System.getProperty("user.dir"));
        }

        if (!options.isFindUp()) return start;

        List<String> markers = options.getRootMarkers() != null
                ? options.getRootMarkers() : DEFAULT_ROOT_MARKERS;

        Path dir = start;
        while (dir != null) {
            for (String marker : markers) {
                if (Files.exists(dir.resolve(marker))) {
                    return dir;
                }
            }
            dir = dir.getParent();
        }
        return start;
    }

    // ── Source routing ──────────────────────────────────────────

    private Map<String, Object> loadSource(String name, Path baseDir) {
        switch (name) {
            case "defaults": return options.getDefaults();
            case "yaml":     return loadYamlFiles(baseDir);
            case "json":     return loadJsonFiles(baseDir);
            case "dotenv":   return loadDotenvFiles(baseDir);
            case "env":      return loadEnvVars();
            default:         return Collections.emptyMap();
        }
    }

    // ── Dotenv files ───────────────────────────────────────────

    private Map<String, Object> loadDotenvFiles(Path baseDir) {
        List<String> candidates = new ArrayList<>();
        candidates.add(".env");
        if (options.getEnv() != null) {
            candidates.add(".env." + options.getEnv());
        }
        candidates.add(".env.local");

        Map<String, Object> merged = new LinkedHashMap<>();
        for (String filename : candidates) {
            Path path = baseDir.resolve(filename);
            if (Files.exists(path)) {
                merged = Merger.deepMerge(merged, parseDotenvFile(path));
            }
        }
        return merged;
    }

    // ── Enhanced dotenv parser ──────────────────────────────────

    /**
     * Parse a .env file — supports multiline double-quoted values,
     * inline comments, escape sequences, and `export` prefix.
     */
    static Map<String, Object> parseDotenvFile(Path path) {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            String content = Files.readString(path);
            parseDotenvContent(content, result, path.toString());
        } catch (IOException e) {
            // Ignore unreadable .env files
        }
        return result;
    }

    /**
     * Parse raw dotenv content — used for tests and encryption decryption.
     */
    static Map<String, Object> parseDotenvContent(String content) {
        Map<String, Object> result = new LinkedHashMap<>();
        parseDotenvContent(content, result, "<raw>");
        return result;
    }

    @SuppressWarnings("unchecked")
    private static void parseDotenvContent(String content,
                                           Map<String, Object> result,
                                           String source) {
        String[] lines = content.split("\n", -1);
        int i = 0;
        while (i < lines.length) {
            String line = lines[i].trim();
            i++;

            if (line.isEmpty() || line.startsWith("#")) continue;
            if (line.startsWith("export ")) line = line.substring(7).trim();

            int eqIdx = line.indexOf('=');
            if (eqIdx == -1) continue;

            String key = line.substring(0, eqIdx).trim();
            String rawVal = line.substring(eqIdx + 1).trim();

            String value;
            if (rawVal.startsWith("\"")) {
                // Possibly multiline double-quoted
                StringBuilder sb = new StringBuilder();
                String rest = rawVal.substring(1);
                while (true) {
                    int closeIdx = findUnescapedQuote(rest);
                    if (closeIdx >= 0) {
                        sb.append(rest, 0, closeIdx);
                        break;
                    }
                    sb.append(rest).append("\n");
                    if (i >= lines.length) break;
                    rest = lines[i];
                    i++;
                }
                value = processEscapes(sb.toString());
            } else if (rawVal.startsWith("'")) {
                // Single-quoted: literal
                if (rawVal.length() >= 2 && rawVal.endsWith("'")) {
                    value = rawVal.substring(1, rawVal.length() - 1);
                } else {
                    value = rawVal.substring(1);
                }
            } else {
                // Unquoted — strip inline comment
                int hashIdx = rawVal.indexOf(" #");
                if (hashIdx >= 0) {
                    rawVal = rawVal.substring(0, hashIdx);
                }
                value = rawVal.trim();
            }

            result.put(key.toLowerCase(), Coercion.coerce(value));
        }
    }

    private static int findUnescapedQuote(String s) {
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\') { i++; continue; }
            if (c == '"') return i;
        }
        return -1;
    }

    private static String processEscapes(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) == '\\' && i + 1 < s.length()) {
                char next = s.charAt(i + 1);
                switch (next) {
                    case 'n':  sb.append('\n'); i++; break;
                    case 'r':  sb.append('\r'); i++; break;
                    case 't':  sb.append('\t'); i++; break;
                    case '"':  sb.append('"');  i++; break;
                    case '\\': sb.append('\\'); i++; break;
                    default:   sb.append('\\');      break;
                }
            } else {
                sb.append(s.charAt(i));
            }
        }
        return sb.toString();
    }

    // ── YAML files ─────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> loadYamlFiles(Path baseDir) {
        try {
            List<String> candidates = new ArrayList<>(Arrays.asList("config.yaml", "config.yml"));
            if (options.getEnv() != null) {
                candidates.add("config." + options.getEnv() + ".yaml");
                candidates.add("config." + options.getEnv() + ".yml");
            }

            Map<String, Object> merged = new LinkedHashMap<>();
            org.yaml.snakeyaml.Yaml yaml = new org.yaml.snakeyaml.Yaml();

            for (String filename : candidates) {
                Path path = baseDir.resolve(filename);
                if (Files.exists(path)) {
                    String content = Files.readString(path);
                    Object data = yaml.load(content);
                    if (data instanceof Map) {
                        merged = Merger.deepMerge(merged, (Map<String, Object>) data);
                    }
                }
            }
            return merged;
        } catch (IOException e) {
            return Collections.emptyMap();
        }
    }

    // ── JSON files ─────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> loadJsonFiles(Path baseDir) {
        try {
            List<String> candidates = new ArrayList<>();
            candidates.add("config.json");
            if (options.getEnv() != null) {
                candidates.add("config." + options.getEnv() + ".json");
            }

            com.google.gson.Gson gson = new com.google.gson.Gson();
            Map<String, Object> merged = new LinkedHashMap<>();

            for (String filename : candidates) {
                Path path = baseDir.resolve(filename);
                if (Files.exists(path)) {
                    String content = Files.readString(path);
                    Map<String, Object> data = gson.fromJson(content, LinkedHashMap.class);
                    if (data != null) {
                        merged = Merger.deepMerge(merged, data);
                    }
                }
            }
            return merged;
        } catch (IOException e) {
            return Collections.emptyMap();
        }
    }

    // ── Environment variables ──────────────────────────────────

    private Map<String, Object> loadEnvVars() {
        Map<String, Object> result = new LinkedHashMap<>();
        String prefix = options.getPrefix();
        String pfx = prefix != null ? prefix.toUpperCase() + "_" : null;

        for (Map.Entry<String, String> entry : System.getenv().entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();

            if (pfx != null) {
                if (!key.startsWith(pfx)) continue;
                String cleanKey = key.substring(pfx.length()).toLowerCase();
                setNested(result, cleanKey, Coercion.coerce(value));
            } else if (options.isAllowAllEnvVars()) {
                result.put(key.toLowerCase(), Coercion.coerce(value));
            } else {
                // Filter system vars
                if (!isSystemVar(key)) {
                    result.put(key.toLowerCase(), Coercion.coerce(value));
                }
            }
        }
        return result;
    }

    // ── Generic file parser ────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseFileByExtension(Path path) {
        String name = path.getFileName().toString().toLowerCase();
        try {
            if (name.endsWith(".yaml") || name.endsWith(".yml")) {
                String content = Files.readString(path);
                Object data = new org.yaml.snakeyaml.Yaml().load(content);
                return data instanceof Map ? (Map<String, Object>) data : Collections.emptyMap();
            } else if (name.endsWith(".json")) {
                String content = Files.readString(path);
                Map<String, Object> data = new com.google.gson.Gson()
                        .fromJson(content, LinkedHashMap.class);
                return data != null ? data : Collections.emptyMap();
            } else if (name.endsWith(".env") || name.startsWith(".env")) {
                return parseDotenvFile(path);
            } else {
                // Try dotenv by default
                return parseDotenvFile(path);
            }
        } catch (IOException e) {
            throw new DotlyteException.FileException(
                    path.toString(), e.getMessage(), e);
        }
    }

    // ── Helpers ─────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    static void setNested(Map<String, Object> data, String key, Object value) {
        String[] parts = key.split("_");
        Map<String, Object> current = data;

        for (int i = 0; i < parts.length - 1; i++) {
            current.putIfAbsent(parts[i], new LinkedHashMap<>());
            Object next = current.get(parts[i]);
            if (next instanceof Map) {
                current = (Map<String, Object>) next;
            } else {
                Map<String, Object> newMap = new LinkedHashMap<>();
                current.put(parts[i], newMap);
                current = newMap;
            }
        }
        current.put(parts[parts.length - 1], value);
    }

    private void addIfPresent(List<Map<String, Object>> layers,
                              Map<String, Object> data) {
        if (data != null && !data.isEmpty()) {
            layers.add(data);
        }
    }
}
