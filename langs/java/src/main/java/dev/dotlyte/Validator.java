package dev.dotlyte;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Schema validation engine for DOTLYTE v2.
 */
public final class Validator {

    private static final Map<String, Pattern> FORMAT_PATTERNS = new LinkedHashMap<>();
    static {
        FORMAT_PATTERNS.put("email",
                Pattern.compile("^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$"));
        FORMAT_PATTERNS.put("uuid",
                Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"));
        FORMAT_PATTERNS.put("date",
                Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$"));
        FORMAT_PATTERNS.put("ipv4",
                Pattern.compile("^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$"));
    }

    private Validator() {}

    /**
     * Validate config data against a schema.
     */
    @SuppressWarnings("unchecked")
    public static List<SchemaViolation> validate(
            Map<String, Object> data,
            Map<String, SchemaRule> schema,
            boolean strict) {

        List<SchemaViolation> violations = new ArrayList<>();

        for (Map.Entry<String, SchemaRule> entry : schema.entrySet()) {
            String key = entry.getKey();
            SchemaRule rule = entry.getValue();
            Object val = getNestedValue(data, key);

            if (val == null) {
                if (rule.isRequired()) {
                    violations.add(new SchemaViolation(key,
                            "required key '" + key + "' is missing", "required"));
                }
                continue;
            }

            // Type check
            if (rule.getType() != null && !checkType(val, rule.getType())) {
                violations.add(new SchemaViolation(key,
                        "expected type '" + rule.getType() + "', got " + val.getClass().getSimpleName(),
                        "type"));
            }

            // Format check
            if (rule.getFormat() != null && val instanceof String) {
                if (!checkFormat((String) val, rule.getFormat())) {
                    violations.add(new SchemaViolation(key,
                            "value '" + val + "' does not match format '" + rule.getFormat() + "'",
                            "format"));
                }
            }

            // Pattern check
            if (rule.getPattern() != null && val instanceof String) {
                if (!Pattern.matches(rule.getPattern(), (String) val)) {
                    violations.add(new SchemaViolation(key,
                            "value '" + val + "' does not match pattern '" + rule.getPattern() + "'",
                            "pattern"));
                }
            }

            // Enum check
            if (rule.getEnumValues() != null && !rule.getEnumValues().contains(val)) {
                violations.add(new SchemaViolation(key,
                        "value " + val + " not in allowed values: " + rule.getEnumValues(),
                        "enum"));
            }

            // Min/Max
            if (val instanceof Number) {
                double num = ((Number) val).doubleValue();
                if (rule.getMin() != null && num < rule.getMin()) {
                    violations.add(new SchemaViolation(key,
                            "value " + num + " is less than minimum " + rule.getMin(),
                            "min"));
                }
                if (rule.getMax() != null && num > rule.getMax()) {
                    violations.add(new SchemaViolation(key,
                            "value " + num + " is greater than maximum " + rule.getMax(),
                            "max"));
                }
            }
        }

        // Strict mode
        if (strict) {
            Set<String> flatKeys = flattenKeys(data, "");
            for (String k : flatKeys) {
                if (!schema.containsKey(k)) {
                    violations.add(new SchemaViolation(k,
                            "unknown key '" + k + "' (strict mode)", "strict"));
                }
            }
        }

        return violations;
    }

    /**
     * Apply schema defaults.
     */
    public static void applyDefaults(
            Map<String, Object> data,
            Map<String, SchemaRule> schema) {
        for (Map.Entry<String, SchemaRule> entry : schema.entrySet()) {
            if (entry.getValue().getDefaultValue() != null) {
                if (getNestedValue(data, entry.getKey()) == null) {
                    setNestedValue(data, entry.getKey(), entry.getValue().getDefaultValue());
                }
            }
        }
    }

    /**
     * Get all sensitive keys from schema.
     */
    public static List<String> getSensitiveKeys(Map<String, SchemaRule> schema) {
        List<String> keys = new ArrayList<>();
        for (Map.Entry<String, SchemaRule> entry : schema.entrySet()) {
            if (entry.getValue().isSensitive()) {
                keys.add(entry.getKey());
            }
        }
        return keys;
    }

    /**
     * Assert valid — throws if violations exist.
     */
    public static void assertValid(
            Map<String, Object> data,
            Map<String, SchemaRule> schema,
            boolean strict) {
        List<SchemaViolation> violations = validate(data, schema, strict);
        if (!violations.isEmpty()) {
            StringBuilder sb = new StringBuilder("Schema validation failed:\n");
            for (SchemaViolation v : violations) {
                sb.append("  - ").append(v).append("\n");
            }
            throw new DotlyteException.ValidationException(violations);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    static Object getNestedValue(Map<String, Object> data, String key) {
        String[] parts = key.split("\\.");
        Object current = data;
        for (String part : parts) {
            if (current instanceof Map) {
                current = ((Map<String, Object>) current).get(part);
                if (current == null) return null;
            } else {
                return null;
            }
        }
        return current;
    }

    @SuppressWarnings("unchecked")
    static void setNestedValue(Map<String, Object> data, String key, Object value) {
        String[] parts = key.split("\\.");
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

    private static boolean checkType(Object val, String expected) {
        switch (expected) {
            case "string": return val instanceof String;
            case "number": return val instanceof Number;
            case "boolean": return val instanceof Boolean;
            case "array": return val instanceof List || val instanceof Object[];
            case "object": return val instanceof Map;
            default: return true;
        }
    }

    private static boolean checkFormat(String val, String format) {
        switch (format) {
            case "url":
                return val.startsWith("http://") || val.startsWith("https://");
            case "ip":
            case "ipv4":
                return FORMAT_PATTERNS.get("ipv4").matcher(val).matches();
            case "ipv6":
                return val.contains(":") && val.length() > 2;
            case "port":
                try {
                    int p = Integer.parseInt(val);
                    return p >= 1 && p <= 65535;
                } catch (NumberFormatException e) { return false; }
            case "email":
                return FORMAT_PATTERNS.get("email").matcher(val).matches();
            case "uuid":
                return FORMAT_PATTERNS.get("uuid").matcher(val).matches();
            case "date":
                return FORMAT_PATTERNS.get("date").matcher(val).matches();
            default:
                return Pattern.matches(format, val);
        }
    }
}
