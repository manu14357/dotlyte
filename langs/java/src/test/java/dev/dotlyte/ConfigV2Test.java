package dev.dotlyte;

import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for v2 Config features (scope, requireKeys, redaction, etc.).
 */
class ConfigV2Test {

    private Config makeConfig() {
        Map<String, Object> db = new LinkedHashMap<>();
        db.put("host", "localhost");
        db.put("port", 5432);
        db.put("password", "secret");

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("app_name", "myapp");
        data.put("debug", true);
        data.put("db", db);

        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("db.password", new SchemaRule().sensitive(true));

        return new Config(data, schema, null);
    }

    @Test
    void scopeReturnsSubConfig() {
        Config config = makeConfig();
        Config dbConfig = config.scope("db");

        assertEquals("localhost", dbConfig.get("host"));
        assertEquals(5432, dbConfig.get("port"));
    }

    @Test
    void scopeMissingReturnsEmpty() {
        Config config = makeConfig();
        Config empty = config.scope("nonexistent");
        assertTrue(empty.keys().isEmpty());
    }

    @Test
    void keysReturnsTopLevel() {
        Config config = makeConfig();
        Set<String> keys = config.keys();
        assertTrue(keys.contains("app_name"));
        assertTrue(keys.contains("db"));
    }

    @Test
    void toFlatKeysFlattens() {
        Config config = makeConfig();
        Set<String> flat = config.toFlatKeys();
        assertTrue(flat.contains("db.host"));
        assertTrue(flat.contains("db.port"));
        assertTrue(flat.contains("app_name"));
    }

    @Test
    void toFlatMapStringValues() {
        Config config = makeConfig();
        Map<String, String> flat = config.toFlatMap();
        assertEquals("localhost", flat.get("db.host"));
        assertEquals("5432", flat.get("db.port"));
    }

    @Test
    void requireKeysSuccess() {
        Config config = makeConfig();
        assertDoesNotThrow(() -> config.requireKeys("app_name", "db.host"));
    }

    @Test
    void requireKeysFailure() {
        Config config = makeConfig();
        assertThrows(DotlyteException.MissingKeyException.class, () ->
                config.requireKeys("app_name", "missing_key"));
    }

    @Test
    void toMapRedactedHidesSensitive() {
        Config config = makeConfig();
        Map<String, Object> redacted = config.toMapRedacted();

        @SuppressWarnings("unchecked")
        Map<String, Object> db = (Map<String, Object>) redacted.get("db");
        assertEquals(Masking.REDACTED, db.get("password"));
        assertEquals("localhost", db.get("host"));
    }

    @Test
    void toJsonProducesValidJson() {
        Config config = makeConfig();
        String json = config.toJson();
        assertTrue(json.contains("\"app_name\""));
        assertTrue(json.contains("\"db\""));
    }

    @Test
    void validateWithSchema() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("port", "not-a-number");

        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("port", new SchemaRule().type("number"));

        Config config = new Config(data, schema, null);
        List<SchemaViolation> violations = config.validate();
        assertEquals(1, violations.size());
    }

    @Test
    void toStringDoesNotLeakSecrets() {
        Config config = makeConfig();
        String str = config.toString();
        assertFalse(str.contains("secret"));
        assertTrue(str.contains("[REDACTED]"));
    }
}
