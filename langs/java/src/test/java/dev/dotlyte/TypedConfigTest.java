package dev.dotlyte;

import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for {@link TypedConfig}.
 */
class TypedConfigTest {

    // ── Helper ─────────────────────────────────────────────────

    private static Map<String, Object> createFromSource(
            final Map<String, TypedConfig.FieldDescriptor> schema,
            final TypedConfig.TypedConfigOptions options,
            final Map<String, String> source) {
        return TypedConfig.createFromSource(schema, options, source);
    }

    // ── Basic coercion ─────────────────────────────────────────

    @Test
    void coercesBooleanValues() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("DEBUG", new TypedConfig.FieldDescriptor().type("boolean").required(true));

        final Map<String, String> env = new LinkedHashMap<>();
        env.put("DEBUG", "true");

        final Map<String, Object> config = createFromSource(schema,
                new TypedConfig.TypedConfigOptions(), env);

        assertEquals(true, config.get("DEBUG"));
    }

    @Test
    void coercesBooleanYes() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("ENABLED", new TypedConfig.FieldDescriptor().type("boolean"));

        final Map<String, String> env = Map.of("ENABLED", "yes");
        final Map<String, Object> config = createFromSource(schema,
                new TypedConfig.TypedConfigOptions(), env);

        assertEquals(true, config.get("ENABLED"));
    }

    @Test
    void coercesBooleanOff() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("ENABLED", new TypedConfig.FieldDescriptor().type("boolean"));

        final Map<String, String> env = Map.of("ENABLED", "off");
        final Map<String, Object> config = createFromSource(schema,
                new TypedConfig.TypedConfigOptions(), env);

        assertEquals(false, config.get("ENABLED"));
    }

    @Test
    void coercesIntegerValues() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("PORT", new TypedConfig.FieldDescriptor().type("integer").required(true));

        final Map<String, String> env = Map.of("PORT", "8080");
        final Map<String, Object> config = createFromSource(schema,
                new TypedConfig.TypedConfigOptions(), env);

        assertEquals(8080, config.get("PORT"));
    }

    @Test
    void coercesNumberValues() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("RATE", new TypedConfig.FieldDescriptor().type("number"));

        final Map<String, String> env = Map.of("RATE", "3.14");
        final Map<String, Object> config = createFromSource(schema,
                new TypedConfig.TypedConfigOptions(), env);

        assertEquals(3.14, config.get("RATE"));
    }

    @Test
    void stringTypePassesThrough() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("HOST", new TypedConfig.FieldDescriptor().type("string"));

        final Map<String, String> env = Map.of("HOST", "localhost");
        final Map<String, Object> config = createFromSource(schema,
                new TypedConfig.TypedConfigOptions(), env);

        assertEquals("localhost", config.get("HOST"));
    }

    // ── Defaults ───────────────────────────────────────────────

    @Test
    void usesDefaultValue() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("PORT", new TypedConfig.FieldDescriptor()
                .type("integer").required(false).defaultValue(3000));

        final Map<String, String> env = Collections.emptyMap();
        final Map<String, Object> config = createFromSource(schema,
                new TypedConfig.TypedConfigOptions(), env);

        assertEquals(3000, config.get("PORT"));
    }

    // ── Required validation ────────────────────────────────────

    @Test
    void throwsOnMissingRequired() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("SECRET", new TypedConfig.FieldDescriptor().type("string").required(true));

        final Map<String, String> env = Collections.emptyMap();

        final DotlyteException ex = assertThrows(DotlyteException.class, () ->
                createFromSource(schema, new TypedConfig.TypedConfigOptions(), env));
        assertTrue(ex.getMessage().contains("SECRET"));
    }

    // ── Enum validation ────────────────────────────────────────

    @Test
    void validatesEnumValues() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("ENV", new TypedConfig.FieldDescriptor()
                .type("string")
                .enumValues(Arrays.asList("dev", "staging", "prod")));

        final Map<String, String> env = Map.of("ENV", "invalid");

        assertThrows(DotlyteException.class, () ->
                createFromSource(schema, new TypedConfig.TypedConfigOptions(), env));
    }

    @Test
    void acceptsValidEnumValue() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("ENV", new TypedConfig.FieldDescriptor()
                .type("string")
                .enumValues(Arrays.asList("dev", "staging", "prod")));

        final Map<String, String> env = Map.of("ENV", "prod");
        final Map<String, Object> config = createFromSource(schema,
                new TypedConfig.TypedConfigOptions(), env);

        assertEquals("prod", config.get("ENV"));
    }

    // ── Min/Max validation ─────────────────────────────────────

    @Test
    void validatesMinMax() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("PORT", new TypedConfig.FieldDescriptor()
                .type("integer").min(1024).max(65535));

        final Map<String, String> env = Map.of("PORT", "80");

        final DotlyteException ex = assertThrows(DotlyteException.class, () ->
                createFromSource(schema, new TypedConfig.TypedConfigOptions(), env));
        assertTrue(ex.getMessage().contains("minimum"));
    }

    @Test
    void acceptsValueInRange() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("PORT", new TypedConfig.FieldDescriptor()
                .type("integer").min(1024).max(65535));

        final Map<String, String> env = Map.of("PORT", "8080");
        final Map<String, Object> config = createFromSource(schema,
                new TypedConfig.TypedConfigOptions(), env);

        assertEquals(8080, config.get("PORT"));
    }

    // ── Skip validation ────────────────────────────────────────

    @Test
    void skipValidationReturnsWithoutErrors() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("PORT", new TypedConfig.FieldDescriptor()
                .type("integer").min(1024));

        final Map<String, String> env = Map.of("PORT", "80");

        // Should NOT throw even though 80 < 1024
        final Map<String, Object> config = createFromSource(schema,
                new TypedConfig.TypedConfigOptions().skipValidation(true), env);

        assertEquals(80, config.get("PORT"));
    }

    // ── Secret access callback ─────────────────────────────────

    @Test
    void secretAccessCallbackInvoked() {
        final List<String> accessed = new ArrayList<>();

        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("API_KEY", new TypedConfig.FieldDescriptor()
                .type("string").sensitive(true));

        final Map<String, String> env = Map.of("API_KEY", "my-secret");

        createFromSource(schema,
                new TypedConfig.TypedConfigOptions()
                        .onSecretAccess((k, v) -> accessed.add(k)),
                env);

        assertEquals(1, accessed.size());
        assertEquals("API_KEY", accessed.get(0));
    }

    // ── Immutability ───────────────────────────────────────────

    @Test
    void resultIsImmutable() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("KEY", new TypedConfig.FieldDescriptor().type("string"));

        final Map<String, String> env = Map.of("KEY", "value");
        final Map<String, Object> config = createFromSource(schema,
                new TypedConfig.TypedConfigOptions(), env);

        assertThrows(UnsupportedOperationException.class, () ->
                config.put("NEW_KEY", "nope"));
    }

    // ── Multiple errors collected ──────────────────────────────

    @Test
    void collectsMultipleErrors() {
        final Map<String, TypedConfig.FieldDescriptor> schema = new LinkedHashMap<>();
        schema.put("A", new TypedConfig.FieldDescriptor().type("string").required(true));
        schema.put("B", new TypedConfig.FieldDescriptor().type("string").required(true));

        final Map<String, String> env = Collections.emptyMap();

        final DotlyteException ex = assertThrows(DotlyteException.class, () ->
                createFromSource(schema, new TypedConfig.TypedConfigOptions(), env));
        assertTrue(ex.getMessage().contains("A"));
        assertTrue(ex.getMessage().contains("B"));
    }
}
