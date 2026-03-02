package dev.dotlyte;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class DotlyteTest {

    @Test
    void loadWithDefaults() {
        Map<String, Object> defaults = new HashMap<>();
        defaults.put("port", 3000);
        defaults.put("debug", false);

        Config config = Dotlyte.load(
            LoadOptions.builder().defaults(defaults).build()
        );

        assertEquals(3000, config.get("port"));
        assertEquals(false, config.get("debug"));
    }

    @Test
    void loadEmpty() {
        Config config = Dotlyte.load(LoadOptions.builder().build());
        assertNotNull(config);
    }

    @Test
    void configGetNested() {
        Map<String, Object> db = new HashMap<>();
        db.put("host", "localhost");
        db.put("port", 5432);
        Map<String, Object> data = new HashMap<>();
        data.put("database", db);

        Config config = new Config(data);
        assertEquals("localhost", config.get("database.host"));
        assertEquals(5432, config.get("database.port"));
    }

    @Test
    void configGetDefault() {
        Config config = new Config(Map.of("existing", "value"));
        assertEquals("fallback", config.get("missing", "fallback"));
    }

    @Test
    void configRequireMissing() {
        Config config = new Config(Map.of());
        assertThrows(DotlyteException.class, () -> config.require("MISSING"));
    }

    @Test
    void configHas() {
        Config config = new Config(Map.of("port", 8080));
        assertTrue(config.has("port"));
        assertFalse(config.has("missing"));
    }
}
