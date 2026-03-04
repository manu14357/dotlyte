package dev.dotlyte;

import java.util.*;

/**
 * Variable interpolation engine for DOTLYTE v2.
 * <p>
 * Supports {@code ${VAR}}, {@code ${VAR:-default}}, {@code ${VAR:?error}},
 * and {@code $$} escape.
 */
public final class Interpolation {

    private Interpolation() {}

    /**
     * Interpolate ${VAR} references in a flat string map.
     * Resolution order: same-file → context → System.getenv().
     */
    public static Map<String, String> interpolate(
            Map<String, String> data,
            Map<String, String> context) {

        Map<String, String> resolved = new LinkedHashMap<>();
        Set<String> resolving = new HashSet<>();

        for (String key : data.keySet()) {
            resolve(key, data, context, resolved, resolving);
        }
        return resolved;
    }

    /**
     * Interpolate ${VAR} references in a deep Object map.
     * Converts string values, recurses into nested maps.
     */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> interpolateDeep(
            Map<String, Object> data,
            Map<String, Object> context) {

        // Flatten to string map for resolution
        Map<String, String> flat = new LinkedHashMap<>();
        flattenToStringMap(data, "", flat);
        Map<String, String> ctxFlat = new LinkedHashMap<>();
        flattenToStringMap(context, "", ctxFlat);

        Map<String, String> resolved = interpolate(flat, ctxFlat);

        // Apply resolved values back to deep map
        Map<String, Object> result = deepCopy(data);
        for (Map.Entry<String, String> e : resolved.entrySet()) {
            Validator.setNestedValue(result, e.getKey(), Coercion.coerce(e.getValue()));
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private static void flattenToStringMap(Map<String, Object> map, String prefix, Map<String, String> out) {
        for (Map.Entry<String, Object> e : map.entrySet()) {
            String key = prefix.isEmpty() ? e.getKey() : prefix + "." + e.getKey();
            if (e.getValue() instanceof Map) {
                flattenToStringMap((Map<String, Object>) e.getValue(), key, out);
            } else if (e.getValue() != null) {
                out.put(key, e.getValue().toString());
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> deepCopy(Map<String, Object> map) {
        Map<String, Object> copy = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (e.getValue() instanceof Map) {
                copy.put(e.getKey(), deepCopy((Map<String, Object>) e.getValue()));
            } else {
                copy.put(e.getKey(), e.getValue());
            }
        }
        return copy;
    }

    private static String resolve(
            String key,
            Map<String, String> data,
            Map<String, String> context,
            Map<String, String> resolved,
            Set<String> resolving) {

        if (resolved.containsKey(key)) return resolved.get(key);

        if (resolving.contains(key)) {
            throw new DotlyteException(
                    "Circular reference detected for variable: " + key, key);
        }

        String raw = data.get(key);
        if (raw == null) {
            String ctx = context.get(key);
            if (ctx != null) return ctx;
            String env = System.getenv(key.toUpperCase());
            return env != null ? env : "";
        }

        resolving.add(key);
        String val = resolveString(raw, data, context, resolved, resolving);
        resolving.remove(key);
        resolved.put(key, val);
        return val;
    }

    private static String resolveString(
            String s,
            Map<String, String> data,
            Map<String, String> context,
            Map<String, String> resolved,
            Set<String> resolving) {

        s = s.replace("$$", "\u0000DOLLAR\u0000");
        StringBuilder result = new StringBuilder();
        int i = 0;

        while (i < s.length()) {
            if (i + 1 < s.length() && s.charAt(i) == '$' && s.charAt(i + 1) == '{') {
                i += 2; // skip ${
                int depth = 1;
                StringBuilder inner = new StringBuilder();
                while (i < s.length() && depth > 0) {
                    char ch = s.charAt(i);
                    if (ch == '{') depth++;
                    else if (ch == '}') {
                        depth--;
                        if (depth == 0) { i++; break; }
                    }
                    inner.append(ch);
                    i++;
                }
                result.append(resolveReference(inner.toString(), data, context, resolved, resolving));
            } else {
                result.append(s.charAt(i));
                i++;
            }
        }

        return result.toString().replace("\u0000DOLLAR\u0000", "$");
    }

    private static String resolveReference(
            String inner,
            Map<String, String> data,
            Map<String, String> context,
            Map<String, String> resolved,
            Set<String> resolving) {

        String varName;
        String fallback = null;
        String errorMsg = null;

        int errIdx = inner.indexOf(":?");
        int defIdx = inner.indexOf(":-");

        if (errIdx >= 0) {
            varName = inner.substring(0, errIdx).trim();
            errorMsg = inner.substring(errIdx + 2);
        } else if (defIdx >= 0) {
            varName = inner.substring(0, defIdx).trim();
            fallback = inner.substring(defIdx + 2);
        } else {
            varName = inner.trim();
        }

        String lower = varName.toLowerCase();

        // Same-file
        if (data.containsKey(lower)) {
            String val = resolve(lower, data, context, resolved, resolving);
            if (!val.isEmpty()) return val;
        }

        // Context
        if (context.containsKey(lower)) {
            String val = context.get(lower);
            if (val != null && !val.isEmpty()) return val;
        }

        // Env
        String env = System.getenv(varName);
        if (env != null && !env.isEmpty()) return env;
        env = System.getenv(varName.toUpperCase());
        if (env != null && !env.isEmpty()) return env;

        // Not found
        if (errorMsg != null) {
            throw new DotlyteException(
                    "Required variable '" + varName + "': " + errorMsg, varName);
        }
        if (fallback != null) return fallback;

        return "";
    }
}
