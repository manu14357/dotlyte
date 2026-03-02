package dev.dotlyte;

import java.util.Arrays;
import java.util.List;

/**
 * Type coercion engine for DOTLYTE.
 */
final class Coercion {

    private static final List<String> NULL_VALUES =
        Arrays.asList("null", "none", "nil", "");
    private static final List<String> TRUE_VALUES =
        Arrays.asList("true", "yes", "1", "on");
    private static final List<String> FALSE_VALUES =
        Arrays.asList("false", "no", "0", "off");

    private Coercion() {}

    /**
     * Auto-convert a string value to the correct Java type.
     */
    static Object coerce(String value) {
        if (value == null) return null;

        String stripped = value.trim();
        String lower = stripped.toLowerCase();

        // Null
        if (NULL_VALUES.contains(lower)) return null;

        // Boolean
        if (TRUE_VALUES.contains(lower)) return true;
        if (FALSE_VALUES.contains(lower)) return false;

        // Integer
        try {
            return Integer.parseInt(stripped);
        } catch (NumberFormatException ignored) {}

        // Long
        try {
            return Long.parseLong(stripped);
        } catch (NumberFormatException ignored) {}

        // Float
        if (stripped.contains(".")) {
            try {
                return Double.parseDouble(stripped);
            } catch (NumberFormatException ignored) {}
        }

        // List (comma-separated)
        if (stripped.contains(",")) {
            String[] parts = stripped.split(",");
            Object[] result = new Object[parts.length];
            for (int i = 0; i < parts.length; i++) {
                result[i] = coerce(parts[i].trim());
            }
            return Arrays.asList(result);
        }

        return stripped;
    }
}
