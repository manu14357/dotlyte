package dev.dotlyte;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Main loader orchestrator.
 */
class Loader {

    private final LoadOptions options;

    Loader(LoadOptions options) {
        this.options = options;
    }

    Config load() {
        List<Map<String, Object>> layers = new ArrayList<>();

        if (options.getSources() != null) {
            for (String source : options.getSources()) {
                Map<String, Object> data = loadSource(source);
                if (data != null && !data.isEmpty()) {
                    layers.add(data);
                }
            }
        } else {
            addIfNonEmpty(layers, options.getDefaults());
            addIfNonEmpty(layers, loadYamlFiles());
            addIfNonEmpty(layers, loadJsonFiles());
            addIfNonEmpty(layers, loadDotenvFiles());
            addIfNonEmpty(layers, loadEnvVars());
        }

        Map<String, Object> merged = new LinkedHashMap<>();
        for (Map<String, Object> layer : layers) {
            merged = Merger.deepMerge(merged, layer);
        }

        return new Config(merged);
    }

    private void addIfNonEmpty(List<Map<String, Object>> layers, Map<String, Object> data) {
        if (data != null && !data.isEmpty()) {
            layers.add(data);
        }
    }

    private Map<String, Object> loadSource(String name) {
        switch (name) {
            case "defaults": return options.getDefaults();
            case "yaml": return loadYamlFiles();
            case "json": return loadJsonFiles();
            case "dotenv": return loadDotenvFiles();
            case "env": return loadEnvVars();
            default: return Collections.emptyMap();
        }
    }

    private Map<String, Object> loadDotenvFiles() {
        List<String> candidates = new ArrayList<>();
        candidates.add(".env");
        if (options.getEnv() != null) {
            candidates.add(".env." + options.getEnv());
        }
        candidates.add(".env.local");

        Map<String, Object> merged = new LinkedHashMap<>();
        for (String filename : candidates) {
            Path path = Path.of(filename);
            if (Files.exists(path)) {
                merged = Merger.deepMerge(merged, parseDotenvFile(path));
            }
        }
        return merged;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> loadYamlFiles() {
        try {
            List<String> candidates = new ArrayList<>(Arrays.asList("config.yaml", "config.yml"));
            if (options.getEnv() != null) {
                candidates.add("config." + options.getEnv() + ".yaml");
                candidates.add("config." + options.getEnv() + ".yml");
            }

            Map<String, Object> merged = new LinkedHashMap<>();
            org.yaml.snakeyaml.Yaml yaml = new org.yaml.snakeyaml.Yaml();

            for (String filename : candidates) {
                Path path = Path.of(filename);
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

    @SuppressWarnings("unchecked")
    private Map<String, Object> loadJsonFiles() {
        try {
            List<String> candidates = new ArrayList<>();
            candidates.add("config.json");
            if (options.getEnv() != null) {
                candidates.add("config." + options.getEnv() + ".json");
            }

            com.google.gson.Gson gson = new com.google.gson.Gson();
            Map<String, Object> merged = new LinkedHashMap<>();

            for (String filename : candidates) {
                Path path = Path.of(filename);
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
            } else {
                result.put(key.toLowerCase(), Coercion.coerce(value));
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private static void setNested(Map<String, Object> data, String key, Object value) {
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

    private Map<String, Object> parseDotenvFile(Path path) {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            List<String> lines = Files.readAllLines(path);
            for (int i = 0; i < lines.size(); i++) {
                String line = lines.get(i).trim();
                if (line.isEmpty() || line.startsWith("#")) continue;
                if (line.startsWith("export ")) line = line.substring(7).trim();

                int eqIdx = line.indexOf('=');
                if (eqIdx == -1) {
                    throw new DotlyteException(
                        "Invalid syntax in " + path + ":" + (i + 1) +
                        ": expected KEY=VALUE, got: \"" + line + "\""
                    );
                }

                String key = line.substring(0, eqIdx).trim();
                String value = line.substring(eqIdx + 1).trim();

                // Remove surrounding quotes
                if (value.length() >= 2
                    && (value.charAt(0) == '"' || value.charAt(0) == '\'')
                    && value.charAt(0) == value.charAt(value.length() - 1)) {
                    value = value.substring(1, value.length() - 1);
                }

                result.put(key.toLowerCase(), Coercion.coerce(value));
            }
        } catch (IOException e) {
            // Ignore unreadable .env files
        }
        return result;
    }
}
