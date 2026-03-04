package dev.dotlyte;

import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for v2 interpolation engine.
 */
class InterpolationTest {

    @Test
    void simpleVariableReference() {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("host", "localhost");
        data.put("url", "http://${HOST}:8080");

        Map<String, String> result = Interpolation.interpolate(data, data);
        assertEquals("http://localhost:8080", result.get("url"));
    }

    @Test
    void defaultValue() {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("port", "${MISSING_PORT:-3000}");

        Map<String, String> result = Interpolation.interpolate(data, data);
        assertEquals("3000", result.get("port"));
    }

    @Test
    void errorOnMissing() {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("secret", "${API_KEY:?API_KEY is required}");

        DotlyteException ex = assertThrows(DotlyteException.class, () ->
                Interpolation.interpolate(data, data));
        assertTrue(ex.getMessage().contains("API_KEY is required"));
    }

    @Test
    void dollarEscape() {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("price", "$$100");

        Map<String, String> result = Interpolation.interpolate(data, data);
        assertEquals("$100", result.get("price"));
    }

    @Test
    void circularReferenceDetection() {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("a", "${B}");
        data.put("b", "${A}");

        assertThrows(DotlyteException.class, () ->
                Interpolation.interpolate(data, data));
    }

    @Test
    void chainedReferences() {
        Map<String, String> data = new LinkedHashMap<>();
        data.put("host", "db.example.com");
        data.put("port", "5432");
        data.put("url", "postgres://${HOST}:${PORT}/mydb");

        Map<String, String> result = Interpolation.interpolate(data, data);
        assertEquals("postgres://db.example.com:5432/mydb", result.get("url"));
    }
}
