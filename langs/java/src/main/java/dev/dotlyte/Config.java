package dev.dotlyte;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Configuration object with dot-notation access.
 *
 * <pre>{@code
 * config.get("database.host");              // dot-notation
 * config.get("port", "3000");               // safe access with fallback
 * config.require("DATABASE_URL");           // throws if missing
 * config.getInt("port", 3000);              // typed access
 * }</pre>
 */
public class Config {

    private final Map<String, Object> data;

    public Config(Map<String, Object> data) {
        this.data = Collections.unmodifiableMap(new LinkedHashMap<>(data));
    }

    /**
     * Safe access with dot-notation. Returns null if missing.
     */
    public Object get(String key) {
        return get(key, null);
    }

    /**
     * Safe access with dot-notation and a default fallback.
     */
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

    /**
     * Get a string value.
     */
    public String getString(String key, String defaultValue) {
        Object val = get(key);
        return val != null ? val.toString() : defaultValue;
    }

    /**
     * Get an integer value.
     */
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

    /**
     * Get a boolean value.
     */
    public boolean getBoolean(String key, boolean defaultValue) {
        Object val = get(key);
        if (val instanceof Boolean) {
            return (Boolean) val;
        }
        return defaultValue;
    }

    /**
     * Require a key — throws DotlyteException if missing.
     */
    public Object require(String key) {
        Object val = get(key);
        if (val == null) {
            throw new DotlyteException(
                "Required config key '" + key + "' is missing. " +
                "Set it in your .env file or as an environment variable.",
                key
            );
        }
        return val;
    }

    /**
     * Check whether a key exists.
     */
    public boolean has(String key) {
        return get(key) != null;
    }

    /**
     * Convert to a plain Map.
     */
    public Map<String, Object> toMap() {
        return data;
    }

    @Override
    public String toString() {
        return "Config(" + data + ")";
    }
}
