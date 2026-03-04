package dev.dotlyte;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Immutable configuration object with dot-notation access, scoping,
 * schema validation, and sensitive value redaction.
 *
 * <pre>{@code
 * config.get("database.host");              // dot-notation
 * config.get("port", "3000");               // safe access with fallback
 * config.require("DATABASE_URL");           // throws if missing
 * config.getInt("port", 3000);              // typed access
 * config.scope("database");                 // scoped sub-config
 * config.requireKeys("DB_HOST", "DB_PORT"); // batch require
 * }</pre>
 */
public class Config {

    private final Map<String, Object> data;
    private final Map<String, SchemaRule> schema;
    private final Set<String> sensitiveKeys;

    public Config(Map<String, Object> data) {
        this(data, null, null);
    }

    public Config(Map<String, Object> data,
                  Map<String, SchemaRule> schema,
                  Set<String> sensitiveKeys) {
        this.data = Collections.unmodifiableMap(new LinkedHashMap<>(data));
        this.schema = schema;
        this.sensitiveKeys = sensitiveKeys != null ? sensitiveKeys : Collections.emptySet();
    }

    // ── Core access ────────────────────────────────────────────

    /** Safe access with dot-notation. Returns null if missing. */
    public Object get(String key) {
        return get(key, null);
    }

    /** Safe access with dot-notation and a default fallback. */
    @SuppressWarnings("unchecked")
    public Object get(String key, Object defaultValue) {
        String[] parts = key.split("\\.");
        Object current = data;

        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
                if (current == null) {
                    return defaultValue;
                }
            } else {
                return defaultValue;
            }
        }

        return current;
    }

    /** Get a string value. */
    public String getString(String key, String defaultValue) {
        Object val = get(key);
        return val != null ? val.toString() : defaultValue;
    }

    /** Get an integer value. */
    public int getInt(String key, int defaultValue) {
        Object val = get(key);
        if (val instanceof Number) {
            return ((Number) val).intValue();
        }
        if (val instanceof String) {
            try {
                return Integer.parseInt((String) val);
            } catch (NumberFormatException e) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    /** Get a boolean value. */
    public boolean getBoolean(String key, boolean defaultValue) {
        Object val = get(key);
        if (val instanceof Boolean) {
            return (Boolean) val;
        }
        return defaultValue;
    }

    /** Require a key — throws MissingKeyException if missing. */
    public Object require(String key) {
        Object val = get(key);
        if (val == null) {
            throw new DotlyteException.MissingKeyException(key,
                    Arrays.asList(".env", "config.yaml", "env vars"));
        }
        return val;
    }

    /** Batch require — throws on the first missing key. */
    public void requireKeys(String... keys) {
        for (String key : keys) {
            require(key);
        }
    }

    /** Check whether a key exists. */
    public boolean has(String key) {
        return get(key) != null;
    }

    // ── Scoping ────────────────────────────────────────────────

    /** Return a sub-Config at the given prefix. */
    @SuppressWarnings("unchecked")
    public Config scope(String prefix) {
        Object val = get(prefix);
        if (val instanceof Map) {
            return new Config((Map<String, Object>) val);
        }
        return new Config(Collections.emptyMap());
    }

    // ── Keys / flattening ──────────────────────────────────────

    /** All top-level keys. */
    public Set<String> keys() {
        return data.keySet();
    }

    /** All keys flattened with dot-notation. */
    @SuppressWarnings("unchecked")
    public Set<String> toFlatKeys() {
        return flattenKeys(data, "");
    }

    /** Flatten entire config to a one-level String→String map. */
    @SuppressWarnings("unchecked")
    public Map<String, String> toFlatMap() {
        Map<String, String> result = new LinkedHashMap<>();
        flattenToStringMap(data, "", result);
        return result;
    }

    // ── Serialisation ──────────────────────────────────────────

    /** Convert to a plain Map. */
    public Map<String, Object> toMap() {
        return data;
    }

    /** Convert to a map with sensitive values redacted. */
    public Map<String, Object> toMapRedacted() {
        Set<String> allSensitive = new LinkedHashSet<>(sensitiveKeys);
        if (schema != null) {
            allSensitive.addAll(Validator.getSensitiveKeys(schema));
        }
        allSensitive.addAll(Masking.buildSensitiveSet(data, allSensitive));
        return Masking.redactMap(data, allSensitive);
    }

    /** Serialise to JSON string. */
    public String toJson() {
        return new com.google.gson.GsonBuilder()
                .setPrettyPrinting()
                .create()
                .toJson(data);
    }

    /** Write to a dotenv-format file. */
    public void writeTo(Path path) throws IOException {
        Map<String, String> flat = toFlatMap();
        StringBuilder sb = new StringBuilder();
        sb.append("# Generated by DOTLYTE v2\n");
        for (Map.Entry<String, String> entry : flat.entrySet()) {
            String key = entry.getKey().toUpperCase().replace('.', '_');
            String val = entry.getValue();
            if (val.contains(" ") || val.contains("\"") || val.contains("#")) {
                val = "\"" + val.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
            }
            sb.append(key).append("=").append(val).append("\n");
        }
        Files.writeString(path, sb.toString());
    }

    // ── Schema / validation ────────────────────────────────────

    /** Validate this config against its schema. Returns violations. */
    public List<SchemaViolation> validate() {
        if (schema == null) return Collections.emptyList();
        return Validator.validate(new LinkedHashMap<>(data), schema, false);
    }

    /** Assert valid — throw ValidationException on failure. */
    public void assertValid() {
        if (schema == null) return;
        List<SchemaViolation> violations = Validator.validate(
                new LinkedHashMap<>(data), schema, false);
        if (!violations.isEmpty()) {
            throw new DotlyteException.ValidationException(violations);
        }
    }

    @Override
    public String toString() {
        return "Config(" + toMapRedacted() + ")";
    }

    // ── Helpers ─────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private static Set<String> flattenKeys(Map<String, Object> map, String prefix) {
        Set<String> result = new LinkedHashSet<>();
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            String fullKey = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            if (entry.getValue() instanceof Map) {
                result.addAll(flattenKeys((Map<String, Object>) entry.getValue(), fullKey));
            } else {
                result.add(fullKey);
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private static void flattenToStringMap(Map<String, Object> map, String prefix,
                                           Map<String, String> out) {
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            String fullKey = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            if (entry.getValue() instanceof Map) {
                flattenToStringMap((Map<String, Object>) entry.getValue(), fullKey, out);
            } else {
                out.put(fullKey, entry.getValue() != null ? entry.getValue().toString() : "");
            }
        }
    }
}
