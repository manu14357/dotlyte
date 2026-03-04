package dev.dotlyte;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Sensitive value masking for DOTLYTE v2.
 */
public final class Masking {

    /** The redaction replacement string. */
    public static final String REDACTED = "[REDACTED]";

    private static final List<Pattern> SENSITIVE_PATTERNS = Arrays.asList(
            Pattern.compile("(?i)password"),
            Pattern.compile("(?i)secret"),
            Pattern.compile("(?i)token"),
            Pattern.compile("(?i)api[_\\-]?key"),
            Pattern.compile("(?i)private[_\\-]?key"),
            Pattern.compile("(?i)access[_\\-]?key"),
            Pattern.compile("(?i)auth"),
            Pattern.compile("(?i)credential"),
            Pattern.compile("(?i)connection[_\\-]?string"),
            Pattern.compile("(?i)dsn"),
            Pattern.compile("(?i)encryption[_\\-]?key"),
            Pattern.compile("(?i)signing[_\\-]?key"),
            Pattern.compile("(?i)certificate")
    );

    private Masking() {}

    /**
     * Build the set of sensitive keys (auto-detected + schema).
     */
    @SuppressWarnings("unchecked")
    public static Set<String> buildSensitiveSet(
            Map<String, Object> data,
            Collection<String> schemaKeys) {

        Set<String> set = new LinkedHashSet<>(schemaKeys);
        Set<String> flatKeys = flattenKeys(data, "");

        for (String key : flatKeys) {
            for (Pattern pat : SENSITIVE_PATTERNS) {
                if (pat.matcher(key).find()) {
                    set.add(key);
                    break;
                }
            }
        }
        return set;
    }

    /**
     * Redact sensitive values in a deep map.
     */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> redactMap(
            Map<String, Object> data,
            Set<String> sensitiveKeys) {
        return redactInner(data, sensitiveKeys, "");
    }

    /**
     * Partially show a value: first 2 chars visible, rest masked.
     */
    public static String formatRedacted(String value) {
        if (value == null || value.length() <= 4) {
            return value == null ? REDACTED : "*".repeat(value.length());
        }
        return value.substring(0, 2) + "*".repeat(value.length() - 2);
    }

    // ── Internals ───────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private static Map<String, Object> redactInner(
            Map<String, Object> data,
            Set<String> sensitiveKeys,
            String prefix) {

        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : data.entrySet()) {
            String fullKey = prefix.isEmpty()
                    ? entry.getKey()
                    : prefix + "." + entry.getKey();

            if (sensitiveKeys.contains(fullKey)) {
                result.put(entry.getKey(), REDACTED);
            } else if (entry.getValue() instanceof Map) {
                result.put(entry.getKey(),
                        redactInner((Map<String, Object>) entry.getValue(), sensitiveKeys, fullKey));
            } else {
                result.put(entry.getKey(), entry.getValue());
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private static Set<String> flattenKeys(Map<String, Object> data, String prefix) {
        Set<String> keys = new LinkedHashSet<>();
        for (Map.Entry<String, Object> entry : data.entrySet()) {
            String fullKey = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            if (entry.getValue() instanceof Map) {
                keys.addAll(flattenKeys((Map<String, Object>) entry.getValue(), fullKey));
            } else {
                keys.add(fullKey);
            }
        }
        return keys;
    }
}
