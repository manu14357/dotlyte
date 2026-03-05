package dev.dotlyte;

import org.junit.jupiter.api.Test;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Tests for {@link BoundaryConfig}.
 */
class BoundaryConfigTest {

    private static BoundaryConfig makeBoundary() {
        final Map<String, Object> data = new LinkedHashMap<>();
        data.put("DB_PASSWORD", "secret123");
        data.put("API_SECRET", "key456");
        data.put("APP_NAME", "myapp");
        data.put("THEME", "dark");
        data.put("LOG_LEVEL", "info");

        final Set<String> server = new LinkedHashSet<>(Arrays.asList("DB_PASSWORD", "API_SECRET"));
        final Set<String> client = new LinkedHashSet<>(Arrays.asList("APP_NAME", "THEME"));
        final Set<String> shared = new LinkedHashSet<>(Collections.singletonList("LOG_LEVEL"));

        return new BoundaryConfig(data, server, client, shared);
    }

    // ── Context ────────────────────────────────────────────────

    @Test
    void isServerContextReturnsTrue() {
        assertTrue(BoundaryConfig.isServerContext());
    }

    @Test
    void isClientContextReturnsFalse() {
        assertFalse(BoundaryConfig.isClientContext());
    }

    // ── get() ──────────────────────────────────────────────────

    @Test
    void getReturnsServerKey() {
        final BoundaryConfig bc = makeBoundary();
        assertEquals("secret123", bc.get("DB_PASSWORD"));
    }

    @Test
    void getReturnsClientKey() {
        final BoundaryConfig bc = makeBoundary();
        assertEquals("myapp", bc.get("APP_NAME"));
    }

    @Test
    void getReturnsSharedKey() {
        final BoundaryConfig bc = makeBoundary();
        assertEquals("info", bc.get("LOG_LEVEL"));
    }

    @Test
    void getThrowsForUnknownKey() {
        final BoundaryConfig bc = makeBoundary();
        assertThrows(DotlyteException.class, () -> bc.get("UNKNOWN_KEY"));
    }

    // ── Filtered views ─────────────────────────────────────────

    @Test
    void serverOnlyContainsServerAndShared() {
        final BoundaryConfig bc = makeBoundary();
        final Map<String, Object> server = bc.serverOnly();

        assertTrue(server.containsKey("DB_PASSWORD"));
        assertTrue(server.containsKey("API_SECRET"));
        assertTrue(server.containsKey("LOG_LEVEL"));
        assertFalse(server.containsKey("APP_NAME"));
        assertFalse(server.containsKey("THEME"));
    }

    @Test
    void clientOnlyContainsClientAndShared() {
        final BoundaryConfig bc = makeBoundary();
        final Map<String, Object> client = bc.clientOnly();

        assertTrue(client.containsKey("APP_NAME"));
        assertTrue(client.containsKey("THEME"));
        assertTrue(client.containsKey("LOG_LEVEL"));
        assertFalse(client.containsKey("DB_PASSWORD"));
        assertFalse(client.containsKey("API_SECRET"));
    }

    @Test
    void serverOnlyIsImmutable() {
        final BoundaryConfig bc = makeBoundary();
        final Map<String, Object> server = bc.serverOnly();
        assertThrows(UnsupportedOperationException.class, () ->
                server.put("HACK", "value"));
    }

    @Test
    void clientOnlyIsImmutable() {
        final BoundaryConfig bc = makeBoundary();
        final Map<String, Object> client = bc.clientOnly();
        assertThrows(UnsupportedOperationException.class, () ->
                client.put("HACK", "value"));
    }

    // ── Immutability ───────────────────────────────────────────

    @Test
    void putThrowsUnsupported() {
        final BoundaryConfig bc = makeBoundary();
        assertThrows(UnsupportedOperationException.class, () ->
                bc.put("KEY", "val"));
    }

    @Test
    void removeThrowsUnsupported() {
        final BoundaryConfig bc = makeBoundary();
        assertThrows(UnsupportedOperationException.class, () ->
                bc.remove("DB_PASSWORD"));
    }

    // ── Secret access callback ─────────────────────────────────

    @Test
    void onSecretAccessInvokedForServerKey() {
        final BoundaryConfig bc = makeBoundary();
        final List<String> accessed = new ArrayList<>();
        bc.setOnSecretAccess((k, v) -> accessed.add(k));

        bc.get("DB_PASSWORD");

        assertEquals(1, accessed.size());
        assertEquals("DB_PASSWORD", accessed.get(0));
    }

    @Test
    void onSecretAccessNotInvokedForClientKey() {
        final BoundaryConfig bc = makeBoundary();
        final List<String> accessed = new ArrayList<>();
        bc.setOnSecretAccess((k, v) -> accessed.add(k));

        bc.get("APP_NAME");

        assertTrue(accessed.isEmpty());
    }

    // ── Null arguments ─────────────────────────────────────────

    @Test
    void nullDataThrows() {
        assertThrows(NullPointerException.class, () ->
                new BoundaryConfig(null,
                        Collections.emptySet(),
                        Collections.emptySet(),
                        Collections.emptySet()));
    }
}
