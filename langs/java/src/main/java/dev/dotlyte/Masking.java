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

    // ── Pattern-based sensitivity ──────────────────────────────

    /**
     * Compile a list of glob patterns into regex {@link Pattern}s.
     *
     * <p>Glob wildcards are translated as follows:
     * <ul>
     *   <li>{@code *} → {@code .*}</li>
     *   <li>{@code ?} → {@code .}</li>
     * </ul>
     *
     * @param patterns glob patterns (e.g. {@code "DB_*"}, {@code "*_SECRET"})
     * @return compiled regex patterns (case-insensitive)
     */
    public static List<Pattern> compilePatterns(final List<String> patterns) {
        final List<Pattern> compiled = new ArrayList<>();
        for (final String glob : patterns) {
            final StringBuilder regex = new StringBuilder("^");
            for (int i = 0; i < glob.length(); i++) {
                final char ch = glob.charAt(i);
                switch (ch) {
                    case '*':
                        regex.append(".*");
                        break;
                    case '?':
                        regex.append('.');
                        break;
                    case '.':
                        regex.append("\\.");
                        break;
                    default:
                        regex.append(ch);
                        break;
                }
            }
            regex.append('$');
            compiled.add(Pattern.compile(regex.toString(), Pattern.CASE_INSENSITIVE));
        }
        return compiled;
    }

    /**
     * Build a set of sensitive keys by combining explicit keys, glob patterns,
     * and schema-declared sensitive keys.
     *
     * @param keys             all available config key names
     * @param patterns         glob patterns to match against keys
     * @param schemaSensitive  keys declared sensitive in the schema
     * @return merged set of sensitive key names
     */
    public static Set<String> buildSensitiveSetWithPatterns(
            final Collection<String> keys,
            final List<String> patterns,
            final Set<String> schemaSensitive) {

        final Set<String> result = new LinkedHashSet<>(schemaSensitive);
        final List<Pattern> compiled = compilePatterns(patterns);

        for (final String key : keys) {
            for (final Pattern pat : compiled) {
                if (pat.matcher(key).matches()) {
                    result.add(key);
                    break;
                }
            }
            // Also check built-in patterns
            for (final Pattern pat : SENSITIVE_PATTERNS) {
                if (pat.matcher(key).find()) {
                    result.add(key);
                    break;
                }
            }
        }
        return result;
    }

    /**
     * Create a wrapper map that triggers a callback whenever a key in
     * {@code sensitiveKeys} is accessed via {@link Map#get}.
     *
     * <p>The returned map is unmodifiable. The callback receives
     * {@code (key, value)} for every sensitive key access.
     *
     * @param data          the underlying configuration data
     * @param sensitiveKeys keys that trigger the callback
     * @param onAccess      callback invoked on sensitive key access
     * @return an audit-aware unmodifiable map
     */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> createAuditWrapper(
            final Map<String, Object> data,
            final Set<String> sensitiveKeys,
            final java.util.function.BiConsumer<String, String> onAccess) {

        // Return a delegating AbstractMap that intercepts get()
        return new java.util.AbstractMap<String, Object>() {

            private final Map<String, Object> delegate =
                    Collections.unmodifiableMap(new LinkedHashMap<>(data));

            @Override
            public Object get(final Object key) {
                final Object value = delegate.get(key);
                if (key instanceof String && sensitiveKeys.contains(key) && onAccess != null) {
                    onAccess.accept((String) key, value != null ? value.toString() : null);
                }
                return value;
            }

            @Override
            public boolean containsKey(final Object key) {
                return delegate.containsKey(key);
            }

            @Override
            public Set<Entry<String, Object>> entrySet() {
                return delegate.entrySet();
            }

            @Override
            public int size() {
                return delegate.size();
            }
        };
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
