package dev.dotlyte;

/**
 * Entry point for the DOTLYTE configuration library.
 *
 * <pre>{@code
 * Config config = Dotlyte.load();
 * int port = config.getInt("port", 3000);
 * String host = config.get("database.host", "localhost");
 * }</pre>
 */
public final class Dotlyte {

    private Dotlyte() {
        // Utility class
    }

    /**
     * Load configuration with default options.
     *
     * @return a Config object with merged configuration
     */
    public static Config load() {
        return load(LoadOptions.builder().build());
    }

    /**
     * Load configuration with custom options.
     *
     * @param options the loading options
     * @return a Config object with merged configuration
     */
    public static Config load(LoadOptions options) {
        return new Loader(options).load();
    }
}
