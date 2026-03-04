package dev.dotlyte;

import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for v2 schema validation.
 */
class ValidatorTest {

    @Test
    void requiredKeyMissing() {
        Map<String, Object> data = new LinkedHashMap<>();
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("db.host", new SchemaRule().required(true));

        List<SchemaViolation> violations = Validator.validate(data, schema, false);
        assertEquals(1, violations.size());
        assertEquals("required", violations.get(0).getRule());
    }

    @Test
    void typeCheckString() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("port", 8080);
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("port", new SchemaRule().type("string"));

        List<SchemaViolation> violations = Validator.validate(data, schema, false);
        assertEquals(1, violations.size());
        assertEquals("type", violations.get(0).getRule());
    }

    @Test
    void typeCheckNumber() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("port", 8080);
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("port", new SchemaRule().type("number"));

        List<SchemaViolation> violations = Validator.validate(data, schema, false);
        assertTrue(violations.isEmpty());
    }

    @Test
    void formatEmail() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("email", "not-an-email");
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("email", new SchemaRule().format("email"));

        List<SchemaViolation> violations = Validator.validate(data, schema, false);
        assertEquals(1, violations.size());
        assertEquals("format", violations.get(0).getRule());
    }

    @Test
    void formatEmailValid() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("email", "user@example.com");
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("email", new SchemaRule().format("email"));

        assertTrue(Validator.validate(data, schema, false).isEmpty());
    }

    @Test
    void enumCheck() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("env", "staging");
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("env", new SchemaRule().enumValues(Arrays.asList("dev", "prod")));

        List<SchemaViolation> violations = Validator.validate(data, schema, false);
        assertEquals(1, violations.size());
        assertEquals("enum", violations.get(0).getRule());
    }

    @Test
    void minMaxValidation() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("port", 100);
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("port", new SchemaRule().min(1024.0).max(65535.0));

        List<SchemaViolation> violations = Validator.validate(data, schema, false);
        assertEquals(1, violations.size());
        assertEquals("min", violations.get(0).getRule());
    }

    @Test
    void strictModeRejectsUnknown() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("port", 8080);
        data.put("extra", "value");
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("port", new SchemaRule().type("number"));

        List<SchemaViolation> violations = Validator.validate(data, schema, true);
        assertEquals(1, violations.size());
        assertEquals("strict", violations.get(0).getRule());
    }

    @Test
    void applyDefaults() {
        Map<String, Object> data = new LinkedHashMap<>();
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("port", new SchemaRule().defaultValue(3000));

        Validator.applyDefaults(data, schema);
        assertEquals(3000, data.get("port"));
    }

    @Test
    void assertValidThrows() {
        Map<String, Object> data = new LinkedHashMap<>();
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("required_key", new SchemaRule().required(true));

        assertThrows(DotlyteException.class, () ->
                Validator.assertValid(data, schema, false));
    }

    @Test
    void sensitiveKeysExtraction() {
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("db.password", new SchemaRule().sensitive(true));
        schema.put("db.host", new SchemaRule());

        List<String> sensitive = Validator.getSensitiveKeys(schema);
        assertEquals(1, sensitive.size());
        assertEquals("db.password", sensitive.get(0));
    }

    @Test
    void patternValidation() {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("code", "ABC");
        Map<String, SchemaRule> schema = new LinkedHashMap<>();
        schema.put("code", new SchemaRule().pattern("^[0-9]+$"));

        List<SchemaViolation> violations = Validator.validate(data, schema, false);
        assertEquals(1, violations.size());
        assertEquals("pattern", violations.get(0).getRule());
    }
}
