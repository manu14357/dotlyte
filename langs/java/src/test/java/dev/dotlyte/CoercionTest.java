package dev.dotlyte;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CoercionTest {

    @Test
    void coerceNull() {
        assertNull(Coercion.coerce("null"));
        assertNull(Coercion.coerce("none"));
        assertNull(Coercion.coerce("nil"));
        assertNull(Coercion.coerce(""));
    }

    @Test
    void coerceBoolTrue() {
        assertEquals(true, Coercion.coerce("true"));
        assertEquals(true, Coercion.coerce("TRUE"));
        assertEquals(true, Coercion.coerce("yes"));
        assertEquals(true, Coercion.coerce("1"));
        assertEquals(true, Coercion.coerce("on"));
    }

    @Test
    void coerceBoolFalse() {
        assertEquals(false, Coercion.coerce("false"));
        assertEquals(false, Coercion.coerce("no"));
        assertEquals(false, Coercion.coerce("0"));
        assertEquals(false, Coercion.coerce("off"));
    }

    @Test
    void coerceInteger() {
        assertEquals(8080, Coercion.coerce("8080"));
        assertEquals(-42, Coercion.coerce("-42"));
    }

    @Test
    void coerceFloat() {
        assertEquals(3.14, Coercion.coerce("3.14"));
    }

    @Test
    void coerceString() {
        assertEquals("hello world", Coercion.coerce("hello world"));
        assertEquals("https://example.com", Coercion.coerce("https://example.com"));
    }
}
