package dev.dotlyte;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Deep merge utility.
 */
final class Merger {

    private Merger() {}

    @SuppressWarnings("unchecked")
    static Map<String, Object> deepMerge(Map<String, Object> base, Map<String, Object> override) {
        Map<String, Object> result = new LinkedHashMap<>(base);

        for (Map.Entry<String, Object> entry : override.entrySet()) {
            String key = entry.getKey();
            Object value = entry.getValue();

            if (result.containsKey(key)
                && result.get(key) instanceof Map
                && value instanceof Map) {
                result.put(key, deepMerge(
                    (Map<String, Object>) result.get(key),
                    (Map<String, Object>) value
                ));
            } else {
                result.put(key, value);
            }
        }

        return result;
    }
}
