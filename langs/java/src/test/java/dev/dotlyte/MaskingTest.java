package dev.dotlyte;

import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for v2 masking / redaction.
 */
class MaskingTest {

    @Test
    void autoDetectSensitiveKeys() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("db_password", "secret123");
        data.put("api_key", "key-abc");
        data.put("host", "localhost");

        Set<String> sensitive = Masking.buildSensitiveSet(data, Collections.emptySet());
        assertTrue(sensitive.contains("db_password"));
        assertTrue(sensitive.contains("api_key"));
        assertFalse(sensitive.contains("host"));
    }

    @Test
    void redactMap() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("host", "localhost");
        data.put("password", "secret123");

        Set<String> sensitive = new HashSet<>(Arrays.asList("password"));
        Map<String, Object> redacted = Masking.redactMap(data, sensitive);

        assertEquals("localhost", redacted.get("host"));
        assertEquals(Masking.REDACTED, redacted.get("password"));
    }

    @Test
    void redactNestedMap() {
        Map<String, Object> inner = new LinkedHashMap<>();
        inner.put("host", "localhost");
        inner.put("password", "secret");

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("db", inner);

        Set<String> sensitive = new HashSet<>(Arrays.asList("db.password"));
        Map<String, Object> redacted = Masking.redactMap(data, sensitive);

        @SuppressWarnings("unchecked")
        Map<String, Object> redactedDb = (Map<String, Object>) redacted.get("db");
        assertEquals("localhost", redactedDb.get("host"));
        assertEquals(Masking.REDACTED, redactedDb.get("password"));
    }

    @Test
    void formatRedacted() {
        assertEquals("se*********", Masking.formatRedacted("secret12345"));
        assertEquals("***", Masking.formatRedacted("abc"));
    }

    @Test
    void schemaKeysIncluded() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("custom_field", "value");

        Set<String> schemaKeys = new HashSet<>(Arrays.asList("custom_field"));
        Set<String> sensitive = Masking.buildSensitiveSet(data, schemaKeys);
        assertTrue(sensitive.contains("custom_field"));
    }
}
