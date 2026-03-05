package dev.dotlyte;

import java.util.*;
import java.util.function.BiConsumer;

/**
 * Typed configuration loader that reads environment variables, validates them
 * against a schema of {@link FieldDescriptor}s, applies type coercion, and
 * returns an immutable {@code Map<String, Object>}.
 *
 * <pre>{@code
 * Map<String, FieldDescriptor> schema = new LinkedHashMap<>();
 * schema.put("PORT", new FieldDescriptor().type("integer").required(true));
 * schema.put("DEBUG", new FieldDescriptor().type("boolean").defaultValue(false));
 *
 * Map<String, Object> config = TypedConfig.create(schema);
 * int port = (int) config.get("PORT");
 * }</pre>
 */
public final class TypedConfig {

    private TypedConfig() {}

    // ── FieldDescriptor ────────────────────────────────────────

    /**
     * Describes a single configuration field including its expected type,
     * constraints, and documentation.
     */
    public static class FieldDescriptor {

        private String type;
        private boolean required = true;
        private Object defaultValue;
        private List<Object> enumValues;
        private Double min;
        private Double max;
        private boolean sensitive;
        private String doc;

        /** Create a new field descriptor with default settings. */
        public FieldDescriptor() {}

        /** Set the expected type ({@code "string"}, {@code "boolean"}, {@code "integer"}, {@code "number"}). */
        public FieldDescriptor type(final String type) { this.type = type; return this; }

        /** Whether this field is required (default {@code true}). */
        public FieldDescriptor required(final boolean required) { this.required = required; return this; }

        /** The default value when not present in the environment. */
        public FieldDescriptor defaultValue(final Object defaultValue) { this.defaultValue = defaultValue; return this; }

        /** Restrict values to an explicit set. */
        public FieldDescriptor enumValues(final List<Object> enumValues) { this.enumValues = enumValues; return this; }

        /** Minimum value for numeric fields (inclusive). */
        public FieldDescriptor min(final double min) { this.min = min; return this; }

        /** Maximum value for numeric fields (inclusive). */
        public FieldDescriptor max(final double max) { this.max = max; return this; }

        /** Mark the field as sensitive (e.g. passwords, tokens). */
        public FieldDescriptor sensitive(final boolean sensitive) { this.sensitive = sensitive; return this; }

        /** Documentation string for the field. */
        public FieldDescriptor doc(final String doc) { this.doc = doc; return this; }

        /** @return the expected type */
        public String getType() { return type; }

        /** @return whether the field is required */
        public boolean isRequired() { return required; }

        /** @return the default value, or {@code null} */
        public Object getDefaultValue() { return defaultValue; }

        /** @return the allowed values, or {@code null} */
        public List<Object> getEnumValues() { return enumValues; }

        /** @return the minimum, or {@code null} */
        public Double getMin() { return min; }

        /** @return the maximum, or {@code null} */
        public Double getMax() { return max; }

        /** @return whether the field is sensitive */
        public boolean isSensitive() { return sensitive; }

        /** @return the documentation string */
        public String getDoc() { return doc; }
    }

    // ── TypedConfigOptions ─────────────────────────────────────

    /**
     * Options that control the behaviour of {@link TypedConfig#create}.
     */
    public static class TypedConfigOptions {

        private boolean skipValidation;
        private BiConsumer<String, String> onSecretAccess;

        /** Create default options. */
        public TypedConfigOptions() {}

        /** When {@code true}, skip validation entirely and return raw coerced values. */
        public TypedConfigOptions skipValidation(final boolean skipValidation) {
            this.skipValidation = skipValidation;
            return this;
        }

        /** Callback invoked when a sensitive field is accessed: {@code (key, value) -> ...}. */
        public TypedConfigOptions onSecretAccess(final BiConsumer<String, String> onSecretAccess) {
            this.onSecretAccess = onSecretAccess;
            return this;
        }

        /** @return whether validation is skipped */
        public boolean isSkipValidation() { return skipValidation; }

        /** @return the secret-access callback, or {@code null} */
        public BiConsumer<String, String> getOnSecretAccess() { return onSecretAccess; }
    }

    // ── Factory methods ────────────────────────────────────────

    /**
     * Create a typed configuration from environment variables using the given schema.
     *
     * @param schema field descriptors keyed by environment variable name
     * @return an unmodifiable map of coerced configuration values
     * @throws DotlyteException if validation fails
     */
    public static Map<String, Object> create(final Map<String, FieldDescriptor> schema) {
        return create(schema, new TypedConfigOptions());
    }

    /**
     * Create a typed configuration from environment variables using the given
     * schema and options.
     *
     * @param schema  field descriptors keyed by environment variable name
     * @param options creation options
     * @return an unmodifiable map of coerced configuration values
     * @throws DotlyteException if validation fails
     */
    public static Map<String, Object> create(
            final Map<String, FieldDescriptor> schema,
            final TypedConfigOptions options) {

        return createFromSource(schema, options, System.getenv());
    }

    /**
     * Create a typed configuration from an explicit source map (package-private,
     * used for testing without polluting the real environment).
     */
    static Map<String, Object> createFromSource(
            final Map<String, FieldDescriptor> schema,
            final TypedConfigOptions options,
            final Map<String, String> source) {

        final Map<String, Object> result = new LinkedHashMap<>();
        final List<String> errors = new ArrayList<>();

        for (final Map.Entry<String, FieldDescriptor> entry : schema.entrySet()) {
            final String key = entry.getKey();
            final FieldDescriptor field = entry.getValue();
            final String raw = source.get(key);

            // ── Resolve value ──────────────────────────────────
            Object value;
            if (raw != null) {
                value = coerceForType(raw, field.getType());
            } else if (field.getDefaultValue() != null) {
                value = field.getDefaultValue();
            } else {
                value = null;
            }

            // ── Validation (unless skipped) ────────────────────
            if (!options.isSkipValidation()) {

                // Required check
                if (value == null && field.isRequired()) {
                    errors.add("Required field '" + key + "' is missing");
                    continue;
                }

                if (value != null) {
                    // Type check
                    if (field.getType() != null && !matchesType(value, field.getType())) {
                        errors.add("Field '" + key + "' expected type '"
                                + field.getType() + "', got " + value.getClass().getSimpleName());
                    }

                    // Enum check
                    if (field.getEnumValues() != null && !field.getEnumValues().contains(value)) {
                        errors.add("Field '" + key + "' value " + value
                                + " not in allowed values: " + field.getEnumValues());
                    }

                    // Min/Max
                    if (value instanceof Number) {
                        final double num = ((Number) value).doubleValue();
                        if (field.getMin() != null && num < field.getMin()) {
                            errors.add("Field '" + key + "' value " + num
                                    + " is less than minimum " + field.getMin());
                        }
                        if (field.getMax() != null && num > field.getMax()) {
                            errors.add("Field '" + key + "' value " + num
                                    + " is greater than maximum " + field.getMax());
                        }
                    }
                }
            }

            // ── Secret access callback ─────────────────────────
            if (field.isSensitive() && value != null && options.getOnSecretAccess() != null) {
                options.getOnSecretAccess().accept(key, String.valueOf(value));
            }

            if (value != null) {
                result.put(key, value);
            }
        }

        if (!errors.isEmpty()) {
            throw new DotlyteException("TypedConfig validation failed:\n  - "
                    + String.join("\n  - ", errors));
        }

        return Collections.unmodifiableMap(result);
    }

    // ── Coercion helpers ───────────────────────────────────────

    private static Object coerceForType(final String raw, final String type) {
        if (type == null) {
            return Coercion.coerce(raw);
        }
        switch (type) {
            case "boolean":
                return coerceBoolean(raw);
            case "integer":
                return coerceInteger(raw);
            case "number":
                return coerceNumber(raw);
            case "string":
                return raw;
            default:
                return Coercion.coerce(raw);
        }
    }

    private static Object coerceBoolean(final String raw) {
        final String lower = raw.trim().toLowerCase();
        if ("true".equals(lower) || "yes".equals(lower)
                || "1".equals(lower) || "on".equals(lower)) {
            return true;
        }
        if ("false".equals(lower) || "no".equals(lower)
                || "0".equals(lower) || "off".equals(lower)) {
            return false;
        }
        return raw; // leave as-is for validation to catch
    }

    private static Object coerceInteger(final String raw) {
        try {
            return Integer.parseInt(raw.trim());
        } catch (final NumberFormatException e) {
            try {
                return Long.parseLong(raw.trim());
            } catch (final NumberFormatException e2) {
                return raw; // leave as-is for validation to catch
            }
        }
    }

    private static Object coerceNumber(final String raw) {
        try {
            final double d = Double.parseDouble(raw.trim());
            if (d == Math.floor(d) && !Double.isInfinite(d)) {
                if (d >= Integer.MIN_VALUE && d <= Integer.MAX_VALUE) {
                    return (int) d;
                }
                return (long) d;
            }
            return d;
        } catch (final NumberFormatException e) {
            return raw;
        }
    }

    private static boolean matchesType(final Object value, final String type) {
        switch (type) {
            case "string":
                return value instanceof String;
            case "boolean":
                return value instanceof Boolean;
            case "integer":
                return value instanceof Integer || value instanceof Long;
            case "number":
                return value instanceof Number;
            default:
                return true;
        }
    }
}
